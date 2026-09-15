import {
  IdempotencyRegistry,
  IdempotencyKeyBuilder,
  IdempotencyKeyParams,
  IdempotencyRecord,
  ExecutionGuard
} from '@/core/integrity';

export interface ExecuteOnceOptions<T> {
  key?: string;
  operationType: string;
  entityType?: string;
  entityId?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  payload?: any;
  requestFingerprint?: string;
  execute: () => Promise<T>;
}

/**
 * IdempotencyService
 * Central Unified Idempotency Engine for PharmaFlow PRO ERP.
 * Prevents double execution, duplicate invoice posting, duplicate journals, and sync replays.
 */
export class IdempotencyService {
  /**
   * Executes a business operation exactly ONCE.
   * Checks idempotency registry and execution lock, records processing state, runs operation, and records committed result.
   */
  public static async executeOnce<T>(options: ExecuteOnceOptions<T>): Promise<T> {
    const tenantId = options.tenantId || 'default';
    const branchId = options.branchId || 'main';
    const opType = options.operationType;
    const entityType = options.entityType || 'transaction';
    const entityId = options.entityId || 'new';

    const fingerprint =
      options.requestFingerprint ||
      IdempotencyKeyBuilder.generateFingerprint(opType, options.payload || {});

    const keyParams: IdempotencyKeyParams = {
      tenantId,
      branchId,
      operationType: opType,
      entityType,
      entityId,
      requestFingerprint: fingerprint
    };

    const key = options.key || IdempotencyKeyBuilder.buildKey(keyParams);

    // 1. Check existing record
    const existing = await IdempotencyRegistry.get(key);
    if (existing) {
      if (existing.status === 'COMMITTED') {
        console.log(`[IdempotencyService] Returning previously committed idempotent result for key: ${key}`);
        return existing.result as T;
      }
      if (existing.status === 'PROCESSING') {
        throw new Error(`⚠️ تم رفض الطلب المكرر: العملية [${opType}] قيد المعالجة حالياً.`);
      }
    }

    // 2. Execute guarded operation
    return await ExecutionGuard.executeWithGuard(
      {
        tenantId,
        branchId,
        operation: opType,
        entityId: entityId !== 'new' ? entityId : fingerprint,
        ttlMs: 20000
      },
      async () => {
        // Re-check inside lock
        const doubleCheck = await IdempotencyRegistry.get(key);
        if (doubleCheck && doubleCheck.status === 'COMMITTED') {
          return doubleCheck.result as T;
        }

        // Store PROCESSING record
        const record: IdempotencyRecord = {
          key,
          status: 'PROCESSING',
          tenantId,
          branchId,
          operationType: opType,
          entityType,
          entityId,
          fingerprint,
          userId: options.userId || 'system',
          createdAt: new Date().toISOString()
        };
        await IdempotencyRegistry.save(record);

        try {
          const result = await options.execute();

          // Store COMMITTED result
          await IdempotencyRegistry.updateStatus(key, 'COMMITTED', result);
          return result;
        } catch (err: any) {
          // Store FAILED status
          await IdempotencyRegistry.updateStatus(key, 'FAILED', undefined, err.message || String(err));
          throw err;
        }
      }
    );
  }

  public static async getOrCreate(params: IdempotencyKeyParams): Promise<IdempotencyRecord> {
    const key = IdempotencyKeyBuilder.buildKey(params);
    let record = await IdempotencyRegistry.get(key);
    if (!record) {
      record = {
        key,
        status: 'PROCESSING',
        tenantId: params.tenantId,
        branchId: params.branchId,
        operationType: params.operationType,
        entityType: params.entityType,
        entityId: params.entityId,
        fingerprint: params.requestFingerprint,
        createdAt: new Date().toISOString()
      };
      await IdempotencyRegistry.save(record);
    }
    return record;
  }

  public static async checkExisting(key: string): Promise<IdempotencyRecord | null> {
    return await IdempotencyRegistry.get(key);
  }

  public static async storeResult(key: string, result: any): Promise<void> {
    await IdempotencyRegistry.updateStatus(key, 'COMMITTED', result);
  }

  public static async markFailed(key: string, error: string): Promise<void> {
    await IdempotencyRegistry.updateStatus(key, 'FAILED', undefined, error);
  }

  public static async recoverPending(key: string): Promise<void> {
    const rec = await IdempotencyRegistry.get(key);
    if (rec && rec.status === 'PROCESSING') {
      await IdempotencyRegistry.updateStatus(key, 'FAILED', undefined, 'Manual reset/recovery');
    }
  }
}
