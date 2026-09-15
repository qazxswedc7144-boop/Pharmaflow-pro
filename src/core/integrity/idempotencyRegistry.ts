import { db } from '@/core/db';
import { IdempotencyRecord, IdempotencyStatus } from './types';

/**
 * Idempotency Registry
 * Handles persistent and in-memory storage of operation idempotency records.
 */
export class IdempotencyRegistry {
  private static inMemoryStore = new Map<string, IdempotencyRecord>();

  /**
   * Fetches an idempotency record by key
   */
  public static async get(key: string): Promise<IdempotencyRecord | null> {
    if (!key) return null;

    // 1. Check in-memory store
    if (this.inMemoryStore.has(key)) {
      return this.inMemoryStore.get(key)!;
    }

    // 2. Check Dexie database (idempotency_records table)
    try {
      if (typeof indexedDB !== 'undefined' && db && db.idempotency_records) {
        const record = await db.idempotency_records.get(key);
        if (record) {
          this.inMemoryStore.set(key, record);
          return record;
        }
      }

      // 3. Fallback check on legacy idempotencyKeys table
      if (typeof indexedDB !== 'undefined' && db && db.idempotencyKeys) {
        const legacyRec = await db.idempotencyKeys.get(key);
        if (legacyRec) {
          const rec: IdempotencyRecord = {
            key: legacyRec.id,
            status: legacyRec.status as IdempotencyStatus,
            tenantId: 'default',
            branchId: 'main',
            operationType: 'legacy',
            entityType: 'transaction',
            fingerprint: 'legacy',
            createdAt: legacyRec.createdAt || new Date().toISOString(),
            completedAt: legacyRec.completedAt
          };
          this.inMemoryStore.set(key, rec);
          return rec;
        }
      }
    } catch (err) {
      console.warn('[IdempotencyRegistry] Database read error, using fallback:', err);
    }

    return null;
  }

  /**
   * Saves or updates an idempotency record
   */
  public static async save(record: IdempotencyRecord): Promise<void> {
    if (!record || !record.key) return;

    this.inMemoryStore.set(record.key, record);

    try {
      if (typeof indexedDB !== 'undefined' && db) {
        if (db.idempotency_records) {
          await db.idempotency_records.put(record);
        }
        // Also write to legacy table for backward compatibility
        if (db.idempotencyKeys) {
          await db.idempotencyKeys.put({
            id: record.key,
            status: record.status,
            createdAt: record.createdAt,
            completedAt: record.completedAt
          });
        }
      }
    } catch (err) {
      console.warn('[IdempotencyRegistry] Failed to save idempotency record to Dexie:', err);
    }
  }

  /**
   * Updates status of an existing idempotency record
   */
  public static async updateStatus(
    key: string,
    status: IdempotencyStatus,
    result?: any,
    failureReason?: string
  ): Promise<void> {
    const existing = await this.get(key);
    const now = new Date().toISOString();

    if (existing) {
      existing.status = status;
      if (status === 'COMMITTED') existing.completedAt = now;
      if (result !== undefined) {
        existing.result = result;
        existing.responseData = result;
      }
      if (failureReason !== undefined) existing.failureReason = failureReason;

      await this.save(existing);
    } else {
      // Create new record if missing
      await this.save({
        key,
        status,
        tenantId: 'default',
        branchId: 'main',
        operationType: 'unknown',
        entityType: 'transaction',
        fingerprint: 'auto',
        createdAt: now,
        completedAt: status === 'COMMITTED' ? now : undefined,
        result,
        failureReason
      });
    }
  }

  /**
   * Deletes an idempotency record (e.g., on rollbacks if allowed)
   */
  public static async delete(key: string): Promise<void> {
    this.inMemoryStore.delete(key);
    try {
      if (typeof indexedDB !== 'undefined' && db) {
        if (db.idempotency_records) await db.idempotency_records.delete(key);
        if (db.idempotencyKeys) await db.idempotencyKeys.delete(key);
      }
    } catch (err) {
      console.warn('[IdempotencyRegistry] Failed to delete idempotency key:', err);
    }
  }

  /**
   * Clears in-memory cache (mainly for testing)
   */
  public static clearInMemory(): void {
    this.inMemoryStore.clear();
  }

  /**
   * Returns all in-memory records
   */
  public static getAllInMemory(): IdempotencyRecord[] {
    return Array.from(this.inMemoryStore.values());
  }
}
