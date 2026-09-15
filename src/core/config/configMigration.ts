// src/core/config/configMigration.ts
import { db } from '@/core/db';
import { CONFIG_REGISTRY } from './configKeys';
import { getCurrentContext, buildScopedStorageKey } from './configScopes';
import { ConfigurationRecord } from './types';

const MIGRATION_DONE_KEY = '__settings_migration_v1_done';

/**
 * Idempotently migrates legacy localStorage and db.settings records to canonical Configuration Records.
 */
export async function runLegacySettingsMigration(): Promise<boolean> {
  try {
    // Check if already migrated in Dexie
    const doneRecord = await db.settings.get(MIGRATION_DONE_KEY);
    if (doneRecord && doneRecord.value === true) {
      return true;
    }

    const context = getCurrentContext();
    const now = new Date().toISOString();

    // 1. Collect all legacy localStorage items
    if (typeof window !== 'undefined' && window.localStorage) {
      const legacyStorage = window.localStorage;
      for (const [canonicalKey, def] of Object.entries(CONFIG_REGISTRY)) {
        if (!def.legacyKeys) continue;

        for (const legacyKey of def.legacyKeys) {
          const val = legacyStorage.getItem(legacyKey);
          if (val !== null && val !== undefined && val !== '') {
            let parsedVal: any = val;
            if (val === 'true') parsedVal = true;
            else if (val === 'false') parsedVal = false;
            else if (!isNaN(Number(val)) && typeof def.defaultValue === 'number') parsedVal = Number(val);

            const storageKey = buildScopedStorageKey(canonicalKey, def.scope, context);
            const existingRecord = await db.settings.get(storageKey);

            if (!existingRecord) {
              const record: ConfigurationRecord<any> = {
                key: canonicalKey,
                value: parsedVal,
                scope: def.scope,
                context,
                version: 1,
                updatedAt: now,
                updatedBy: 'migration'
              };
              await db.settings.put({ key: storageKey, value: record });
              
              // Also update canonical plain key for backward compatibility
              const plainRecord = await db.settings.get(canonicalKey);
              if (!plainRecord) {
                await db.settings.put({ key: canonicalKey, value: record });
              }
            }
          }
        }
      }
    }

    // 2. Collect existing unscoped db.settings entries
    for (const [canonicalKey, def] of Object.entries(CONFIG_REGISTRY)) {
      if (!def.legacyKeys) continue;

      for (const legacyKey of def.legacyKeys) {
        const legacyDbItem = await db.settings.get(legacyKey);
        if (legacyDbItem && legacyDbItem.value !== undefined && legacyDbItem.value !== null) {
          const storageKey = buildScopedStorageKey(canonicalKey, def.scope, context);
          const existingRecord = await db.settings.get(storageKey);

          if (!existingRecord) {
            const record: ConfigurationRecord<any> = {
              key: canonicalKey,
              value: legacyDbItem.value,
              scope: def.scope,
              context,
              version: 1,
              updatedAt: now,
              updatedBy: 'migration'
            };
            await db.settings.put({ key: storageKey, value: record });
          }
        }
      }
    }

    // Mark migration as completed
    await db.settings.put({ key: MIGRATION_DONE_KEY, value: true });
    return true;
  } catch (error) {
    console.warn('[ConfigMigration] Migration encountered an issue (non-fatal):', error);
    return false;
  }
}
