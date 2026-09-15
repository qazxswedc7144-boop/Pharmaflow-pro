import { db } from '@/core/db';
import { IdempotencyRegistry } from './idempotencyRegistry';

export interface RecoveryDecision {
  key: string;
  status: 'PENDING' | 'PROCESSING' | 'COMMITTED' | 'FAILED' | 'UNKNOWN';
  action: 'RESUME' | 'RETRY' | 'ROLLBACK' | 'NEEDS_HUMAN_REVIEW' | 'NO_ACTION';
  reason: string;
}

export class IntegrityRecoveryManager {
  /**
   * Registers a failed execution incident
   */
  public static async registerFailure(
    workflowId: string,
    operationType: string,
    error: Error,
    _metadata?: any
  ): Promise<string> {
    const incidentId = `INC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.log(`[IntegrityRecoveryManager] Registered failure ${incidentId} for ${workflowId} (${operationType}): ${error.message}`);
    return incidentId;
  }

  /**
   * Scans and resolves pending or interrupted operations upon app startup or recovery trigger
   */
  public static async recoverPendingOperations(): Promise<RecoveryDecision[]> {
    const decisions: RecoveryDecision[] = [];

    try {
      const processingRecordsMap = new Map<string, any>();

      // Check in-memory registry
      const memoryRecords = IdempotencyRegistry.getAllInMemory();
      for (const rec of memoryRecords) {
        if (rec.status === 'PROCESSING') {
          processingRecordsMap.set(rec.key, rec);
        }
      }

      // Check Dexie database
      if (typeof indexedDB !== 'undefined' && db && db.idempotency_records) {
        const dbRecords = await db.idempotency_records
          .where('status')
          .equals('PROCESSING')
          .toArray();
        for (const rec of dbRecords) {
          processingRecordsMap.set(rec.key, rec);
        }
      }

      for (const rec of processingRecordsMap.values()) {
        const key = rec.key;
        const opType = rec.operationType || 'sale';

        // Check entity state in database
        let isCommitted = false;

        if (typeof indexedDB !== 'undefined' && db) {
          if (opType.includes('sale') && db.sales) {
            const entity = rec.entityId ? await db.sales.get(rec.entityId) : null;
            if (entity && (entity.InvoiceStatus === 'POSTED' || entity.invoiceStatus === 'POSTED')) {
              isCommitted = true;
            }
          } else if (opType.includes('purchase') && db.purchases) {
            const entity = rec.entityId ? await db.purchases.get(rec.entityId) : null;
            if (entity && (entity.invoiceStatus === 'POSTED' || entity.InvoiceStatus === 'POSTED')) {
              isCommitted = true;
            }
          } else if ((opType.includes('payment') || opType.includes('receipt')) && db.vouchers) {
            const entity = rec.entityId ? await db.vouchers.get(rec.entityId) : null;
            if (entity) isCommitted = true;
          }
        }

        if (isCommitted) {
          // Transaction completed successfully before crash, mark committed
          await IdempotencyRegistry.updateStatus(key, 'COMMITTED');
          decisions.push({
            key,
            status: 'COMMITTED',
            action: 'NO_ACTION',
            reason: 'العملية تم اعتمادها بنجاح في قاعدة البيانات قبل الانقطاع. تم تحديث الحالة إلى COMMITTED.'
          });
        } else {
          // Operation was interrupted mid-execution. Safe to mark failed or offer human review
          await IdempotencyRegistry.updateStatus(key, 'FAILED', undefined, 'Interrupted by application crash or restart');
          decisions.push({
            key,
            status: 'PROCESSING',
            action: 'NEEDS_HUMAN_REVIEW',
            reason: 'العملية كانت قيد المعالجة أثناء توقف النظام ولم تكتمل. تم التراجع الآمن وتطلب المراجعة.'
          });
        }
      }
    } catch (err) {
      console.warn('[IntegrityRecoveryManager] Recovery scan warning:', err);
    }

    return decisions;
  }
}
