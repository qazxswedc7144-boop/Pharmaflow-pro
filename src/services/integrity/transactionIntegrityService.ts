import { IdempotencyService } from './idempotencyService';
import { IntegrityAuditService } from './integrityAuditService';
import { DataConsistencyService } from './dataConsistencyService';
import { TransactionBoundary } from '@/core/integrity/transactionBoundary';
import { InventoryConsistencyValidator } from '@/core/integrity/integrityValidator';

export interface ProtectedTransactionOptions<T> {
  operationType: string;
  entityType: string;
  entityId?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  payload?: any;
  key?: string;
  tables?: string[];
  execute: () => Promise<T>;
}

/**
 * TransactionIntegrityService
 * Master transaction boundary service that unifies Idempotency, Execution Guard,
 * Dexie Atomic Transaction Boundaries, Invariant Validation, and Audit Logging.
 */
export class TransactionIntegrityService {
  /**
   * Executes a critical ERP business operation inside a hardened integrity pipeline:
   * 1. Idempotency Check & Lock Acquisition
   * 2. Pre-Commit Invariant Validation
   * 3. Atomic Dexie Database Transaction
   * 4. Post-Commit Cross-Domain Consistency Verification
   * 5. Redacted Integrity Audit Logging
   */
  public static async execute<T>(options: ProtectedTransactionOptions<T>): Promise<T> {
    const tenantId = options.tenantId || 'default';
    const branchId = options.branchId || 'main';
    const opType = options.operationType;
    const entityType = options.entityType;
    const entityId = options.entityId || 'new';
    const userId = options.userId || 'system';
    const startedAt = new Date().toISOString();

    // 1. Idempotency & Execution Lock
    return await IdempotencyService.executeOnce({
      key: options.key,
      operationType: opType,
      entityType,
      entityId,
      tenantId,
      branchId,
      userId,
      payload: options.payload,
      execute: async () => {
        // 2. Pre-commit Validation (e.g. check negative stock if items provided)
        if (options.payload && Array.isArray(options.payload.items)) {
          await InventoryConsistencyValidator.validateBeforeCommit(options.payload.items);
        }

        // 3. Atomic Transaction Execution
        const tables = options.tables || [
          'invoices', 'products', 'inventoryTransactions', 'journalEntries',
          'journalLines', 'accounts', 'financialTransactions', 'vouchers',
          'suppliers', 'customers', 'idempotency_records', 'integrity_audit_logs'
        ];

        let result: T;
        try {
          result = await TransactionBoundary.executeAtomic(tables, async () => {
            return await options.execute();
          });
        } catch (err: any) {
          // Log failed transaction audit
          await IntegrityAuditService.logAudit({
            operationType: opType,
            entityType,
            entityId,
            tenantId,
            branchId,
            userId,
            status: 'FAILED',
            startedAt,
            completedAt: new Date().toISOString(),
            failureReason: err.message || String(err)
          });
          throw err;
        }

        const refId = (result as any)?.refId || (result as any)?.id || entityId;

        // 4. Post-commit Cross-Domain Verification (Asynchronous background check)
        if (refId && refId !== 'new') {
          if (opType.toLowerCase().includes('sale')) {
            DataConsistencyService.verifySaleConsistency(refId).catch(() => {});
          } else if (opType.toLowerCase().includes('purchase')) {
            DataConsistencyService.verifyPurchaseConsistency(refId).catch(() => {});
          }
        }

        // 5. Audit Logging
        await IntegrityAuditService.logAudit({
          operationType: opType,
          entityType,
          entityId: refId,
          tenantId,
          branchId,
          userId,
          status: 'COMMITTED',
          startedAt,
          completedAt: new Date().toISOString(),
          resultReference: refId
        });

        return result;
      }
    });
  }
}
