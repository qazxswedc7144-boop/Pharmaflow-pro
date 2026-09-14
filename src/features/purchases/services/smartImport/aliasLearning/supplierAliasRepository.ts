// src/features/purchases/services/smartImport/aliasLearning/supplierAliasRepository.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Multi-Tenant Supplier Alias Repository with High-Speed Batch Lookup
 */

import { db } from '@/core/db';
import { SupplierAlias, AliasSource } from './aliasLearning.types';
import { AliasNormalization } from './aliasNormalization';
import { AliasConfidencePolicy } from './aliasConfidencePolicy';

export class SupplierAliasRepository {
  // Resilient in-memory storage for high-speed lookups and offline/test environments
  private static memoryStore: Map<string, SupplierAlias> = new Map();

  private static buildKey(tenantId: string, supplierId: string, aliasNormalized: string): string {
    return `${tenantId || 'default-tenant'}::${supplierId}::${aliasNormalized}`;
  }

  /**
   * Clears the in-memory cache (primarily for automated test isolation)
   */
  static clearMemory(): void {
    this.memoryStore.clear();
  }

  /**
   * Preloads and returns all aliases for a specific tenant in a batch Map
   */
  static async findAliasesBatch(
    tenantId: string,
    rawNames: string[] = []
  ): Promise<Map<string, SupplierAlias>> {
    const resultMap = new Map<string, SupplierAlias>();
    const safeTenant = tenantId || 'default-tenant';
    const normalizedTargets = new Set(rawNames.map(n => AliasNormalization.normalize(n)).filter(Boolean));

    // 1. Check in-memory store first
    for (const alias of this.memoryStore.values()) {
      if (alias.tenantId === safeTenant) {
        if (normalizedTargets.size === 0 || normalizedTargets.has(alias.aliasNormalized)) {
          // If multiple suppliers have the same normalized alias, keep highest confidence
          const existing = resultMap.get(alias.aliasNormalized);
          if (!existing || alias.confidence > existing.confidence) {
            resultMap.set(alias.aliasNormalized, alias);
          }
        }
      }
    }

    // 2. Query Dexie if available
    try {
      if (db.supplierAliases && typeof db.supplierAliases.where === 'function') {
        const dbRecords: SupplierAlias[] = await db.supplierAliases.where('tenantId').equals(safeTenant).toArray();
        for (const alias of dbRecords) {
          this.memoryStore.set(this.buildKey(alias.tenantId, alias.supplierId, alias.aliasNormalized), alias);
          if (normalizedTargets.size === 0 || normalizedTargets.has(alias.aliasNormalized)) {
            const existing = resultMap.get(alias.aliasNormalized);
            if (!existing || alias.confidence > existing.confidence) {
              resultMap.set(alias.aliasNormalized, alias);
            }
          }
        }
      }
    } catch {
      // Graceful fallback to memory store
    }

    return resultMap;
  }

  /**
   * Finds an alias by raw or normalized name for a tenant
   */
  static async findBestMatch(
    tenantId: string,
    rawName: string
  ): Promise<SupplierAlias | null> {
    const norm = AliasNormalization.normalize(rawName);
    if (!norm) return null;

    const batch = await this.findAliasesBatch(tenantId, [rawName]);
    return batch.get(norm) || null;
  }

  /**
   * Saves or updates a supplier alias with deduplication and confidence recalculation
   */
  static async saveAlias(aliasInput: {
    tenantId: string;
    branchId?: string;
    supplierId: string;
    aliasRaw: string;
    source?: AliasSource;
    userId?: string;
  }): Promise<SupplierAlias> {
    const safeTenant = aliasInput.tenantId || 'default-tenant';
    const rawTrimmed = aliasInput.aliasRaw.trim();
    const aliasNormalized = AliasNormalization.normalize(rawTrimmed);

    if (!aliasNormalized) {
      throw new Error('[SupplierAliasRepository] Alias name cannot be empty after normalization');
    }

    const key = this.buildKey(safeTenant, aliasInput.supplierId, aliasNormalized);
    const now = new Date().toISOString();

    let existing = this.memoryStore.get(key);

    if (!existing) {
      try {
        if (db.supplierAliases && typeof db.supplierAliases.get === 'function') {
          const found = await db.supplierAliases
            .where('[tenantId+supplierId+aliasNormalized]')
            .equals([safeTenant, aliasInput.supplierId, aliasNormalized])
            .first();
          if (found) existing = found;
        }
      } catch {
        // Fallback
      }
    }

    let record: SupplierAlias;

    if (existing) {
      existing.confirmedCount = (existing.confirmedCount || 0) + 1;
      existing.usageCount = (existing.usageCount || 0) + 1;
      existing.lastUsedAt = now;
      existing.lastConfirmedAt = now;
      existing.updatedAt = now;
      existing.confidence = AliasConfidencePolicy.evaluateSupplierAlias(existing).finalScore;
      record = existing;
    } else {
      const id = `SUP-ALS-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      record = {
        id,
        tenantId: safeTenant,
        branchId: aliasInput.branchId,
        supplierId: aliasInput.supplierId,
        aliasRaw: rawTrimmed,
        aliasNormalized,
        source: aliasInput.source || AliasSource.MANUAL_DECISION,
        confidence: 0.95,
        usageCount: 1,
        confirmedCount: 1,
        rejectedCount: 0,
        lastUsedAt: now,
        lastConfirmedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: aliasInput.userId
      };
      record.confidence = AliasConfidencePolicy.evaluateSupplierAlias(record).finalScore;
    }

    // Save to in-memory store
    this.memoryStore.set(key, record);

    // Save to Dexie
    try {
      if (db.supplierAliases && typeof db.supplierAliases.put === 'function') {
        await db.supplierAliases.put(record);
      }
    } catch {
      // In-memory fallback
    }

    return record;
  }

  /**
   * Records a rejection for a supplier alias candidate
   */
  static async recordRejection(
    tenantId: string,
    supplierId: string,
    rawName: string
  ): Promise<void> {
    const safeTenant = tenantId || 'default-tenant';
    const norm = AliasNormalization.normalize(rawName);
    if (!norm) return;

    const key = this.buildKey(safeTenant, supplierId, norm);
    const existing = this.memoryStore.get(key);
    const now = new Date().toISOString();

    if (existing) {
      existing.rejectedCount = (existing.rejectedCount || 0) + 1;
      existing.updatedAt = now;
      existing.confidence = AliasConfidencePolicy.evaluateSupplierAlias(existing).finalScore;
      this.memoryStore.set(key, existing);

      try {
        if (db.supplierAliases && typeof db.supplierAliases.put === 'function') {
          await db.supplierAliases.put(existing);
        }
      } catch {
        // In-memory fallback
      }
    }
  }
}
