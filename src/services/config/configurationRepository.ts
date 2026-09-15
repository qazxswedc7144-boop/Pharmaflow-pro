// src/services/config/configurationRepository.ts
import { db } from '@/core/db';
import { ConfigurationRecord, ConfigurationContext, ConfigScope } from '@/core/config/types';
import { buildScopedStorageKey } from '@/core/config/configScopes';
import { normalizeConfigKey } from '@/core/config/configKeys';

export class ConfigurationRepository {
  /**
   * Retrieves all configuration records stored in Dexie.
   */
  async getAllRecords(): Promise<ConfigurationRecord<any>[]> {
    try {
      const rawRecords = await db.settings.toArray();
      const result: ConfigurationRecord<any>[] = [];

      for (const item of rawRecords) {
        if (!item || !item.key) continue;
        if (item.key.startsWith('__')) continue; // Skip internal system flags

        if (item.value && typeof item.value === 'object' && 'scope' in item.value && 'context' in item.value) {
          result.push(item.value as ConfigurationRecord<any>);
        } else if (item.value !== undefined) {
          // Wrap legacy raw value as a SYSTEM/TENANT record
          result.push({
            key: normalizeConfigKey(item.key),
            value: item.value,
            scope: 'TENANT',
            context: {},
            version: 1,
            updatedAt: new Date().toISOString()
          });
        }
      }

      return result;
    } catch (error) {
      console.warn('[ConfigurationRepository] Failed to read records from Dexie:', error);
      return [];
    }
  }

  /**
   * Retrieves a specific configuration record by key, scope, and context.
   */
  async getRecord(
    key: string,
    scope: ConfigScope,
    context: ConfigurationContext
  ): Promise<ConfigurationRecord<any> | null> {
    const canonicalKey = normalizeConfigKey(key);
    const storageKey = buildScopedStorageKey(canonicalKey, scope, context);

    try {
      const item = await db.settings.get(storageKey);
      if (item && item.value) {
        if (typeof item.value === 'object' && 'scope' in item.value) {
          return item.value as ConfigurationRecord<any>;
        }
        return {
          key: canonicalKey,
          value: item.value,
          scope,
          context,
          version: 1,
          updatedAt: new Date().toISOString()
        };
      }

      // Fallback: check raw canonical key
      const plainItem = await db.settings.get(canonicalKey);
      if (plainItem && plainItem.value !== undefined) {
        if (typeof plainItem.value === 'object' && 'scope' in plainItem.value) {
          return plainItem.value as ConfigurationRecord<any>;
        }
        return {
          key: canonicalKey,
          value: plainItem.value,
          scope: 'TENANT',
          context,
          version: 1,
          updatedAt: new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.warn(`[ConfigurationRepository] Error getting record for ${key}:`, error);
      return null;
    }
  }

  /**
   * Saves a configuration record atomically to Dexie.
   */
  async saveRecord(record: ConfigurationRecord<any>): Promise<void> {
    const canonicalKey = normalizeConfigKey(record.key);
    const storageKey = buildScopedStorageKey(canonicalKey, record.scope, record.context);

    const recordToSave: ConfigurationRecord<any> = {
      ...record,
      key: canonicalKey,
      version: (record.version || 0) + 1,
      updatedAt: new Date().toISOString()
    };

    await db.transaction('rw', 'settings', async () => {
      // 1. Save scoped record
      await db.settings.put({
        key: storageKey,
        value: recordToSave
      });

      // 2. Also save plain canonical key for backward compatibility
      await db.settings.put({
        key: canonicalKey,
        value: recordToSave.value
      });
    });
  }

  /**
   * Deletes a configuration record by key, scope, and context.
   */
  async deleteRecord(
    key: string,
    scope: ConfigScope,
    context: ConfigurationContext
  ): Promise<void> {
    const canonicalKey = normalizeConfigKey(key);
    const storageKey = buildScopedStorageKey(canonicalKey, scope, context);

    await db.transaction('rw', 'settings', async () => {
      await db.settings.delete(storageKey);
      await db.settings.delete(canonicalKey);
    });
  }
}

export const configurationRepository = new ConfigurationRepository();
