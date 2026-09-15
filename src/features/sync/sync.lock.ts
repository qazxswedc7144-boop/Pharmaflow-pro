// ==========================================
// FILE: src/features/sync/sync.lock.ts
// Phase 8.3 Safe Synchronization Lock Manager
// ==========================================

import { configurationService } from "@/services/config/configurationService";

const SYNC_LOCK_KEY = "pharmaflow_sync_lock";
const DEFAULT_LOCK_TTL_MS = 25000; // 25 seconds safety timeout

interface LockData {
  owner: string;
  acquiredAt: number;
  expiresAt: number;
}

export class SyncLockManager {
  private static lockOwnerId = `lock_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

  /**
   * Attempts to acquire the synchronization lock.
   */
  static acquireLock(ttlMs: number = DEFAULT_LOCK_TTL_MS): boolean {
    try {
      const now = Date.now();
      const lock = configurationService.getSync<LockData>(SYNC_LOCK_KEY);

      if (lock && lock.expiresAt) {
        if (now < lock.expiresAt && lock.owner !== this.lockOwnerId) {
          // Lock is still active and held by another process/tab
          return false;
        }
      }

      // Write new lock
      const newLock: LockData = {
        owner: this.lockOwnerId,
        acquiredAt: now,
        expiresAt: now + ttlMs
      };
      configurationService.set(SYNC_LOCK_KEY, newLock).catch(() => {});
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Releases the synchronization lock if owned by this instance.
   */
  static releaseLock(): void {
    try {
      const lock = configurationService.getSync<LockData>(SYNC_LOCK_KEY);
      if (lock && lock.owner === this.lockOwnerId) {
        configurationService.delete(SYNC_LOCK_KEY).catch(() => {});
      }
    } catch {
      configurationService.delete(SYNC_LOCK_KEY).catch(() => {});
    }
  }

  /**
   * Executes an async operation with synchronization lock protection.
   */
  static async withSyncLock<T>(
    operation: () => Promise<T>,
    ttlMs: number = DEFAULT_LOCK_TTL_MS
  ): Promise<T | null> {
    const acquired = this.acquireLock(ttlMs);
    if (!acquired) {
      console.warn("[SyncLock] Another sync operation is currently active. Skipping concurrent execution.");
      return null;
    }

    try {
      return await operation();
    } finally {
      this.releaseLock();
    }
  }
}
