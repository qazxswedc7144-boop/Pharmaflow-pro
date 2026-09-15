// src/services/config/configurationSyncService.ts
import { db } from '@/core/db';
import { ConfigurationRecord, ConfigSyncPolicy } from '@/core/config/types';
import { CONFIG_REGISTRY, normalizeConfigKey } from '@/core/config/configKeys';

export class ConfigurationSyncService {
  /**
   * Determines sync policy for a given key.
   */
  public getSyncPolicy(key: string): ConfigSyncPolicy {
    const canonicalKey = normalizeConfigKey(key);
    const def = CONFIG_REGISTRY[canonicalKey];
    return def ? def.syncPolicy : 'SYNCABLE';
  }

  /**
   * Evaluates and queues configuration changes for synchronization if syncable.
   */
  public async handleConfigMutation(record: ConfigurationRecord<any>): Promise<void> {
    const policy = this.getSyncPolicy(record.key);

    if (policy === 'LOCAL_ONLY') {
      // Local only settings are preserved locally without network queueing
      return;
    }

    if (policy === 'SERVER_AUTHORITATIVE') {
      // Server authoritative settings cannot be queued from local client changes
      return;
    }

    // SYNCABLE: Create mutation entry in outbox queue
    try {
      const mutationId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cfg-mut-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cfg-idempotent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      await db.outbox.add({
        mutationId,
        idempotencyKey,
        type: 'UPDATE_SETTING',
        payload: {
          key: record.key,
          value: record.value,
          scope: record.scope,
          context: record.context,
          version: record.version,
          updatedAt: record.updatedAt
        },
        status: 'pending',
        createdAt: new Date(),
        retryCount: 0
      });

      // Dispatch sync wakeup
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('SYNC_WAKEUP'));
      }
    } catch (err) {
      console.warn('[ConfigurationSyncService] Failed to queue config mutation:', err);
    }
  }
}

export const configurationSyncService = new ConfigurationSyncService();
