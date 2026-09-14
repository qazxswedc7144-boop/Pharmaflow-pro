// src/features/purchases/services/smartImport/aliasLearning/aliasAuditService.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Structured Alias Audit Service
 */

import { db } from '@/core/db';
import { AliasAuditLog, AliasAuditAction } from './aliasLearning.types';
import { auditLogService } from '@/services/audit/auditLog';

export class AliasAuditService {
  private static inMemoryLogs: AliasAuditLog[] = [];

  /**
   * Clears in-memory audit logs (for testing)
   */
  static clearMemory(): void {
    this.inMemoryLogs = [];
  }

  /**
   * Records an alias learning audit entry
   */
  static async log(entry: {
    tenantId: string;
    branchId?: string;
    userId?: string;
    action: AliasAuditAction;
    aliasType: 'SUPPLIER' | 'PRODUCT' | 'CATALOG_REF' | 'REJECTION';
    aliasId?: string;
    supplierId?: string;
    productId?: string;
    rawImportedValue: string;
    normalizedValue: string;
    decision: string;
    previousMapping?: string;
    newMapping?: string;
    confidence: number;
    sourceImportId?: string;
    details?: string;
  }): Promise<AliasAuditLog> {
    const id = `AUD-ALS-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const record: AliasAuditLog = {
      id,
      tenantId: entry.tenantId || 'default-tenant',
      branchId: entry.branchId,
      userId: entry.userId || 'SYSTEM',
      timestamp: now,
      action: entry.action,
      aliasType: entry.aliasType,
      aliasId: entry.aliasId,
      supplierId: entry.supplierId,
      productId: entry.productId,
      rawImportedValue: entry.rawImportedValue,
      normalizedValue: entry.normalizedValue,
      decision: entry.decision,
      previousMapping: entry.previousMapping,
      newMapping: entry.newMapping,
      confidence: entry.confidence,
      sourceImportId: entry.sourceImportId,
      details: entry.details
    };

    this.inMemoryLogs.push(record);

    // Save to Dexie
    try {
      if (db.aliasAuditLogs && typeof db.aliasAuditLogs.put === 'function') {
        await db.aliasAuditLogs.put(record);
      }
    } catch {
      // In-memory fallback
    }

    // Save to global auditLogService
    try {
      await auditLogService.log({
        user_id: record.userId,
        action: `ALIAS_${record.action}`,
        target_type: record.aliasType,
        target_id: record.aliasId || record.productId || record.supplierId || record.id,
        details: record.details || `Alias decision: ${record.action} on "${record.rawImportedValue}" -> ${record.newMapping || record.decision}`
      });
    } catch {
      // Non-blocking
    }

    return record;
  }

  /**
   * Retrieves audit logs for a tenant
   */
  static async getLogs(
    tenantId: string,
    filter?: {
      aliasType?: 'SUPPLIER' | 'PRODUCT' | 'CATALOG_REF' | 'REJECTION';
      action?: AliasAuditAction;
    }
  ): Promise<AliasAuditLog[]> {
    const safeTenant = tenantId || 'default-tenant';
    let logs = this.inMemoryLogs.filter(l => l.tenantId === safeTenant);

    try {
      if (db.aliasAuditLogs && typeof db.aliasAuditLogs.where === 'function') {
        const dbLogs = await db.aliasAuditLogs.where('tenantId').equals(safeTenant).toArray();
        logs = [...logs, ...dbLogs];
      }
    } catch {
      // In-memory fallback
    }

    if (filter?.aliasType) {
      logs = logs.filter(l => l.aliasType === filter.aliasType);
    }
    if (filter?.action) {
      logs = logs.filter(l => l.action === filter.action);
    }

    return logs;
  }
}
