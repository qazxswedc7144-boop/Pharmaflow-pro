// src/services/config/configurationService.ts
/**
 * PharmaFlow PRO ERP — Phase 3.4.5
 * Authoritative Single Source of Truth for Settings & Configuration
 */
import {
  ConfigScope,
  ConfigurationContext,
  ConfigurationRecord,
  ConfigChangeEvent
} from '@/core/config/types';
import { CONFIG_REGISTRY, normalizeConfigKey } from '@/core/config/configKeys';
import { getCurrentContext } from '@/core/config/configScopes';
import { validateConfigMutation } from '@/core/config/configValidation';
import { resolveConfigValue } from '@/core/config/configResolver';
import { runLegacySettingsMigration } from '@/core/config/configMigration';
import { configurationRepository } from './configurationRepository';
import { configurationSyncService } from './configurationSyncService';
import { configurationEvents } from './configurationEvents';

export class ConfigurationService {
  private cache: Map<string, ConfigurationRecord<any>> = new Map();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initializes Configuration Engine, executes legacy migrations, and populates reactive memory cache.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // 1. Run safe idempotent legacy storage migration with 1000ms timeout max
        await Promise.race([
          runLegacySettingsMigration(),
          new Promise((res) => setTimeout(res, 1000))
        ]);

        // 2. Load all records into reactive memory cache with 1000ms timeout max
        const allRecords = await Promise.race([
          configurationRepository.getAllRecords(),
          new Promise<ConfigurationRecord<any>[]>((res) => setTimeout(() => res([]), 1000))
        ]);

        this.cache.clear();
        if (Array.isArray(allRecords)) {
          for (const record of allRecords) {
            if (record && record.key) {
              this.cache.set(normalizeConfigKey(record.key), record);
            }
          }
        }

        this.isInitialized = true;
      } catch (err) {
        console.error('[ConfigurationService] Failed to initialize:', err);
        this.isInitialized = true;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Resolves a setting value asynchronously using scope precedence and current context.
   */
  public async get<T = unknown>(
    key: string,
    overrideContext?: ConfigurationContext
  ): Promise<T> {
    await this.initialize();
    const context = getCurrentContext(overrideContext);
    const canonicalKey = normalizeConfigKey(key);

    const allRecords = await configurationRepository.getAllRecords();
    return resolveConfigValue<T>(canonicalKey, allRecords, context);
  }

  /**
   * Synchronous getter backed by reactive in-memory cache with default fallback.
   */
  public getSync<T = unknown>(
    key: string,
    overrideContext?: ConfigurationContext
  ): T {
    const context = getCurrentContext(overrideContext);
    const canonicalKey = normalizeConfigKey(key);

    const cached = this.cache.get(canonicalKey);
    if (cached) {
      return cached.value as T;
    }

    const allRecords = Array.from(this.cache.values());
    return resolveConfigValue<T>(canonicalKey, allRecords, context);
  }

  /**
   * Sets or updates a configuration key value.
   */
  public async set<T = unknown>(
    key: string,
    value: T,
    overrideContext?: ConfigurationContext
  ): Promise<void> {
    await this.initialize();
    const context = getCurrentContext(overrideContext);
    const canonicalKey = normalizeConfigKey(key);

    const def = CONFIG_REGISTRY[canonicalKey];
    const scope: ConfigScope = def ? def.scope : 'TENANT';

    // 1. Validate mutation
    const validation = validateConfigMutation(canonicalKey, value, scope, context);
    if (!validation.valid) {
      throw new Error(`[ConfigurationService] Validation failed for '${canonicalKey}': ${validation.reason}`);
    }

    const sanitizedValue = validation.sanitizedValue !== undefined ? validation.sanitizedValue : value;
    const oldValue = this.getSync<T>(canonicalKey, context);

    // 2. Construct record
    const record: ConfigurationRecord<T> = {
      key: canonicalKey,
      value: sanitizedValue,
      scope,
      context,
      version: 1,
      updatedAt: new Date().toISOString()
    };

    // 3. Persist atomically
    await configurationRepository.saveRecord(record);

    // 4. Update memory cache
    this.cache.set(canonicalKey, record);

    // 5. Handle network synchronization if syncable
    await configurationSyncService.handleConfigMutation(record);

    // 6. Emit change event
    const event: ConfigChangeEvent<T> = {
      key: canonicalKey,
      value: sanitizedValue,
      oldValue,
      scope,
      context,
      source: 'ConfigurationService',
      timestamp: new Date().toISOString()
    };
    configurationEvents.emit(event);
  }

  /**
   * Saves multiple settings in a single batch transaction.
   */
  public async saveMultiple(
    settings: Record<string, any>,
    overrideContext?: ConfigurationContext
  ): Promise<void> {
    await this.initialize();
    for (const [k, v] of Object.entries(settings)) {
      await this.set(k, v, overrideContext);
    }
  }

  /**
   * Retrieves a dictionary of settings matching group keys.
   */
  public async getGroup(
    groupKeys: string[],
    overrideContext?: ConfigurationContext
  ): Promise<Record<string, any>> {
    await this.initialize();
    const result: Record<string, any> = {};
    for (const key of groupKeys) {
      result[key] = await this.get(key, overrideContext);
    }
    return result;
  }

  /**
   * Retrieves all configuration values for current context.
   */
  public async getAll(
    overrideContext?: ConfigurationContext
  ): Promise<Record<string, any>> {
    await this.initialize();
    const context = getCurrentContext(overrideContext);
    const allRecords = await configurationRepository.getAllRecords();

    const result: Record<string, any> = {};
    const knownKeys = Object.keys(CONFIG_REGISTRY);

    for (const k of knownKeys) {
      result[k] = resolveConfigValue(k, allRecords, context);
    }

    return result;
  }

  /**
   * Removes a configuration key.
   */
  public async remove(
    key: string,
    overrideContext?: ConfigurationContext
  ): Promise<void> {
    await this.initialize();
    const context = getCurrentContext(overrideContext);
    const canonicalKey = normalizeConfigKey(key);
    const def = CONFIG_REGISTRY[canonicalKey];
    const scope: ConfigScope = def ? def.scope : 'TENANT';

    await configurationRepository.deleteRecord(canonicalKey, scope, context);
    this.cache.delete(canonicalKey);
  }

  /**
   * Alias for remove() to delete a key.
   */
  public async delete(
    key: string,
    overrideContext?: ConfigurationContext
  ): Promise<void> {
    return this.remove(key, overrideContext);
  }

  /**
   * Alias for get() to resolve values.
   */
  public async resolve<T = unknown>(
    key: string,
    context?: ConfigurationContext
  ): Promise<T> {
    return this.get<T>(key, context);
  }

  /**
   * Subscribes to configuration change events.
   */
  public subscribe(
    keyOrListener: any,
    callback?: any
  ): () => void {
    return configurationEvents.subscribe(keyOrListener, callback);
  }
}

export const configurationService = new ConfigurationService();
