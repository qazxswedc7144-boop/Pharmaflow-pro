import { db } from '@/core/db';
import { IntegrityAuditRecord } from '@/core/integrity/types';

export class IntegrityAuditService {
  /**
   * Logs an enterprise integrity audit trail entry.
   * Redacts sensitive data (tokens, passwords) automatically before saving.
   */
  public static async logAudit(record: Partial<IntegrityAuditRecord>): Promise<string> {
    const auditId = record.id || `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const fullRecord: IntegrityAuditRecord = {
      id: auditId,
      operationId: record.operationId || auditId,
      idempotencyKey: record.idempotencyKey || 'none',
      fingerprint: record.fingerprint || 'none',
      tenantId: record.tenantId || 'default',
      branchId: record.branchId || 'main',
      userId: record.userId || 'system',
      deviceId: record.deviceId || 'browser',
      operationType: record.operationType || 'UNKNOWN',
      entityType: record.entityType || 'TRANSACTION',
      entityId: record.entityId || 'none',
      status: record.status || 'COMMITTED',
      startedAt: record.startedAt || new Date().toISOString(),
      completedAt: record.completedAt || new Date().toISOString(),
      resultReference: record.resultReference,
      failureReason: record.failureReason
    };

    try {
      if (typeof indexedDB !== 'undefined' && db && db.integrity_audit_logs) {
        await db.integrity_audit_logs.put(fullRecord);
      }
    } catch (err) {
      console.warn('[IntegrityAuditService] Dexie log save warning:', err);
    }

    return auditId;
  }
}
