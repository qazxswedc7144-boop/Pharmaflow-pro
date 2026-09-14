// src/features/purchases/services/smartImport/aliasLearning/productAliasRepository.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Multi-Tenant Product Alias & Supplier Catalog Reference Repository
 */

import { db } from '@/core/db';
import { 
  ProductAlias, 
  SupplierProductReference, 
  RejectedCandidate, 
  AliasSource 
} from './aliasLearning.types';
import { AliasNormalization } from './aliasNormalization';
import { AliasConfidencePolicy } from './aliasConfidencePolicy';

export interface ProductAliasBatchResult {
  supplierSpecificAliases: Map<string, ProductAlias>; // Key: aliasNormalized
  globalAliases: Map<string, ProductAlias>; // Key: aliasNormalized
  catalogReferences: Map<string, SupplierProductReference>; // Key: supplierProductCode
  rejections: Set<string>; // Set of `${aliasNormalized}::${productId}`
}

export class ProductAliasRepository {
  // In-memory memory caches for rapid 0(1) access and robust test/offline fallback
  private static productAliasStore: Map<string, ProductAlias> = new Map();
  private static catalogRefStore: Map<string, SupplierProductReference> = new Map();
  private static rejectionStore: Map<string, RejectedCandidate> = new Map();

  private static buildProductAliasKey(tenantId: string, supplierId: string | undefined, aliasNormalized: string): string {
    const scope = supplierId || 'GLOBAL';
    return `${tenantId || 'default-tenant'}::${scope}::${aliasNormalized}`;
  }

  private static buildCatalogKey(tenantId: string, supplierId: string, code: string): string {
    return `${tenantId || 'default-tenant'}::${supplierId}::${code.trim().toUpperCase()}`;
  }

  private static buildRejectionKey(tenantId: string, supplierId: string | undefined, aliasNormalized: string, productId: string): string {
    const scope = supplierId || 'GLOBAL';
    return `${tenantId || 'default-tenant'}::${scope}::${aliasNormalized}::${productId}`;
  }

  /**
   * Clears the in-memory cache (primarily for automated test isolation)
   */
  static clearMemory(): void {
    this.productAliasStore.clear();
    this.catalogRefStore.clear();
    this.rejectionStore.clear();
  }

  /**
   * High-Performance Batch Preloader: Preloads all product aliases, catalog references, and rejections
   * for a given tenant and supplier in a single operation.
   */
  static async preloadBatch(
    tenantId: string,
    supplierId?: string,
    rawNames: string[] = [],
    supplierCodes: string[] = []
  ): Promise<ProductAliasBatchResult> {
    const safeTenant = tenantId || 'default-tenant';
    const supplierSpecificAliases = new Map<string, ProductAlias>();
    const globalAliases = new Map<string, ProductAlias>();
    const catalogReferences = new Map<string, SupplierProductReference>();
    const rejections = new Set<string>();

    const targetNames = new Set(rawNames.map(n => AliasNormalization.normalize(n)).filter(Boolean));
    const targetCodes = new Set(supplierCodes.map(c => c.trim().toUpperCase()).filter(Boolean));

    // 1. Populate from In-Memory Stores
    // A. Product Aliases
    for (const alias of this.productAliasStore.values()) {
      if (alias.tenantId === safeTenant) {
        const matchesTarget = targetNames.size === 0 || targetNames.has(alias.aliasNormalized);
        if (matchesTarget) {
          if (supplierId && alias.supplierId === supplierId) {
            supplierSpecificAliases.set(alias.aliasNormalized, alias);
          } else if (alias.isGlobal || !alias.supplierId) {
            globalAliases.set(alias.aliasNormalized, alias);
          }
        }
      }
    }

    // B. Catalog References
    if (supplierId) {
      for (const ref of this.catalogRefStore.values()) {
        if (ref.tenantId === safeTenant && ref.supplierId === supplierId) {
          const matchesCode = targetCodes.size === 0 || targetCodes.has(ref.supplierProductCode.toUpperCase());
          if (matchesCode) {
            catalogReferences.set(ref.supplierProductCode.toUpperCase(), ref);
          }
        }
      }
    }

    // C. Rejections
    for (const rej of this.rejectionStore.values()) {
      if (rej.tenantId === safeTenant) {
        if (!rej.supplierId || rej.supplierId === supplierId) {
          if (targetNames.size === 0 || targetNames.has(rej.aliasNormalized)) {
            if (rej.rejectedProductId) {
              rejections.add(`${rej.aliasNormalized}::${rej.rejectedProductId}`);
            }
          }
        }
      }
    }

    // 2. Query Dexie if available
    try {
      if (db.productAliases && typeof db.productAliases.where === 'function') {
        const dbAliases: ProductAlias[] = await db.productAliases.where('tenantId').equals(safeTenant).toArray();
        for (const alias of dbAliases) {
          this.productAliasStore.set(this.buildProductAliasKey(alias.tenantId, alias.supplierId, alias.aliasNormalized), alias);
          const matchesTarget = targetNames.size === 0 || targetNames.has(alias.aliasNormalized);
          if (matchesTarget) {
            if (supplierId && alias.supplierId === supplierId) {
              supplierSpecificAliases.set(alias.aliasNormalized, alias);
            } else if (alias.isGlobal || !alias.supplierId) {
              globalAliases.set(alias.aliasNormalized, alias);
            }
          }
        }
      }

      if (supplierId && db.supplierProductReferences && typeof db.supplierProductReferences.where === 'function') {
        const dbRefs: SupplierProductReference[] = await db.supplierProductReferences
          .where('[tenantId+supplierId+supplierProductCode]')
          .between([safeTenant, supplierId, ''], [safeTenant, supplierId, '\uffff'])
          .toArray();
        for (const ref of dbRefs) {
          this.catalogRefStore.set(this.buildCatalogKey(ref.tenantId, ref.supplierId, ref.supplierProductCode), ref);
          catalogReferences.set(ref.supplierProductCode.toUpperCase(), ref);
        }
      }

      if (db.aliasRejections && typeof db.aliasRejections.where === 'function') {
        const dbRejections: RejectedCandidate[] = await db.aliasRejections.where('tenantId').equals(safeTenant).toArray();
        for (const rej of dbRejections) {
          this.rejectionStore.set(this.buildRejectionKey(rej.tenantId, rej.supplierId, rej.aliasNormalized, rej.rejectedProductId || ''), rej);
          if (!rej.supplierId || rej.supplierId === supplierId) {
            if (targetNames.size === 0 || targetNames.has(rej.aliasNormalized)) {
              if (rej.rejectedProductId) {
                rejections.add(`${rej.aliasNormalized}::${rej.rejectedProductId}`);
              }
            }
          }
        }
      }
    } catch {
      // In-memory fallback
    }

    return {
      supplierSpecificAliases,
      globalAliases,
      catalogReferences,
      rejections
    };
  }

  /**
   * Saves or updates a product alias with deduplication and conflict detection
   */
  static async saveProductAlias(input: {
    tenantId: string;
    branchId?: string;
    supplierId?: string;
    productId: string;
    aliasRaw: string;
    isGlobal?: boolean;
    source?: AliasSource;
    userId?: string;
  }): Promise<{ alias: ProductAlias; isConflict: boolean; previousProductId?: string }> {
    const safeTenant = input.tenantId || 'default-tenant';
    const rawTrimmed = input.aliasRaw.trim();
    const aliasNormalized = AliasNormalization.normalize(rawTrimmed);

    if (!aliasNormalized) {
      throw new Error('[ProductAliasRepository] Alias name cannot be empty after normalization');
    }

    const key = this.buildProductAliasKey(safeTenant, input.supplierId, aliasNormalized);
    const now = new Date().toISOString();

    let existing = this.productAliasStore.get(key);
    let isConflict = false;
    let previousProductId: string | undefined = undefined;

    if (existing && existing.productId !== input.productId) {
      // Conflict detected: the same alias is being pointed to a different product
      isConflict = true;
      previousProductId = existing.productId;
      existing.productId = input.productId; // Updated to authoritative user decision
      existing.confirmedCount = (existing.confirmedCount || 0) + 1;
      existing.updatedAt = now;
      existing.confidence = AliasConfidencePolicy.evaluateProductAlias(existing).finalScore;
    } else if (existing) {
      existing.confirmedCount = (existing.confirmedCount || 0) + 1;
      existing.usageCount = (existing.usageCount || 0) + 1;
      existing.lastUsedAt = now;
      existing.lastConfirmedAt = now;
      existing.updatedAt = now;
      existing.confidence = AliasConfidencePolicy.evaluateProductAlias(existing).finalScore;
    } else {
      const id = `PRD-ALS-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      existing = {
        id,
        tenantId: safeTenant,
        branchId: input.branchId,
        supplierId: input.supplierId,
        productId: input.productId,
        aliasRaw: rawTrimmed,
        aliasNormalized,
        isGlobal: !!input.isGlobal || !input.supplierId,
        source: input.source || AliasSource.MANUAL_DECISION,
        confidence: input.supplierId ? 0.95 : 0.92,
        usageCount: 1,
        confirmedCount: 1,
        rejectedCount: 0,
        lastUsedAt: now,
        lastConfirmedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: input.userId
      };
      existing.confidence = AliasConfidencePolicy.evaluateProductAlias(existing).finalScore;
    }

    this.productAliasStore.set(key, existing);

    // Save to Dexie
    try {
      if (db.productAliases && typeof db.productAliases.put === 'function') {
        await db.productAliases.put(existing);
      }
    } catch {
      // In-memory fallback
    }

    return {
      alias: existing,
      isConflict,
      previousProductId
    };
  }

  /**
   * Saves or updates a supplier catalog reference (SKU / Product Code)
   */
  static async saveCatalogReference(input: {
    tenantId: string;
    supplierId: string;
    productId: string;
    supplierProductCode: string;
    supplierProductName: string;
    barcode?: string;
    lastPurchasePrice?: number;
  }): Promise<SupplierProductReference> {
    const safeTenant = input.tenantId || 'default-tenant';
    const code = input.supplierProductCode.trim().toUpperCase();
    if (!code) {
      throw new Error('[ProductAliasRepository] Supplier product code cannot be empty');
    }

    const key = this.buildCatalogKey(safeTenant, input.supplierId, code);
    const now = new Date().toISOString();

    let existing = this.catalogRefStore.get(key);

    if (existing) {
      existing.productId = input.productId;
      existing.supplierProductName = input.supplierProductName;
      existing.normalizedName = AliasNormalization.normalize(input.supplierProductName);
      if (input.barcode) existing.barcode = input.barcode;
      if (input.lastPurchasePrice) existing.lastPurchasePrice = input.lastPurchasePrice;
      existing.usageCount = (existing.usageCount || 0) + 1;
      existing.lastSeenAt = now;
      existing.updatedAt = now;
    } else {
      const id = `CAT-REF-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      existing = {
        id,
        tenantId: safeTenant,
        supplierId: input.supplierId,
        productId: input.productId,
        supplierProductCode: code,
        supplierProductName: input.supplierProductName,
        normalizedName: AliasNormalization.normalize(input.supplierProductName),
        barcode: input.barcode,
        lastPurchasePrice: input.lastPurchasePrice,
        lastSeenAt: now,
        usageCount: 1,
        createdAt: now,
        updatedAt: now
      };
    }

    this.catalogRefStore.set(key, existing);

    try {
      if (db.supplierProductReferences && typeof db.supplierProductReferences.put === 'function') {
        await db.supplierProductReferences.put(existing);
      }
    } catch {
      // In-memory fallback
    }

    return existing;
  }

  /**
   * Registers a negative learning feedback when a candidate product is rejected by user
   */
  static async recordRejection(input: {
    tenantId: string;
    supplierId?: string;
    rawName: string;
    rejectedProductId: string;
    reason?: string;
    userId?: string;
  }): Promise<RejectedCandidate> {
    const safeTenant = input.tenantId || 'default-tenant';
    const norm = AliasNormalization.normalize(input.rawName);
    const key = this.buildRejectionKey(safeTenant, input.supplierId, norm, input.rejectedProductId);
    const now = new Date().toISOString();

    let existing = this.rejectionStore.get(key);

    if (existing) {
      existing.rejectionCount = (existing.rejectionCount || 0) + 1;
      existing.lastRejectedAt = now;
      if (input.reason) existing.reason = input.reason;
    } else {
      const id = `REJ-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      existing = {
        id,
        tenantId: safeTenant,
        supplierId: input.supplierId,
        aliasRaw: input.rawName.trim(),
        aliasNormalized: norm,
        rejectedProductId: input.rejectedProductId,
        rejectionCount: 1,
        lastRejectedAt: now,
        reason: input.reason,
        rejectedBy: input.userId
      };
    }

    this.rejectionStore.set(key, existing);

    // If there is an active product alias pointing to this rejected product, penalize it
    const aliasKey = this.buildProductAliasKey(safeTenant, input.supplierId, norm);
    const activeAlias = this.productAliasStore.get(aliasKey);
    if (activeAlias && activeAlias.productId === input.rejectedProductId) {
      activeAlias.rejectedCount = (activeAlias.rejectedCount || 0) + 1;
      activeAlias.confidence = AliasConfidencePolicy.evaluateProductAlias(activeAlias).finalScore;
      this.productAliasStore.set(aliasKey, activeAlias);
      try {
        if (db.productAliases && typeof db.productAliases.put === 'function') {
          await db.productAliases.put(activeAlias);
        }
      } catch {
        // Fallback
      }
    }

    try {
      if (db.aliasRejections && typeof db.aliasRejections.put === 'function') {
        await db.aliasRejections.put(existing);
      }
    } catch {
      // In-memory fallback
    }

    return existing;
  }
}
