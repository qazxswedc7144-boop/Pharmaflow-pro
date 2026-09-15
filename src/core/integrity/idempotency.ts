import { IdempotencyRegistry } from './idempotencyRegistry';
import { IdempotencyKeyBuilder } from './idempotencyKey';
import { IdempotencyKeyParams, IdempotencyRecord } from './types';

/**
 * Idempotency Helper Utilities
 */
export class IdempotencyEngine {
  /**
   * Constructs idempotency key and verifies if record already exists and its state.
   */
  public static async prepare(params: IdempotencyKeyParams): Promise<{
    key: string;
    existingRecord: IdempotencyRecord | null;
    isDuplicate: boolean;
    isCompleted: boolean;
    isProcessing: boolean;
  }> {
    const key = IdempotencyKeyBuilder.buildKey(params);
    const existingRecord = await IdempotencyRegistry.get(key);

    const isCompleted = existingRecord?.status === 'COMMITTED';
    const isProcessing = existingRecord?.status === 'PROCESSING';
    const isDuplicate = isCompleted || isProcessing;

    return {
      key,
      existingRecord,
      isDuplicate,
      isCompleted,
      isProcessing
    };
  }
}
