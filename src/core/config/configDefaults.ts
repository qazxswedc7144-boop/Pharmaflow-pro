// src/core/config/configDefaults.ts
import { CONFIG_REGISTRY, normalizeConfigKey } from './configKeys';
import { ConfigurationDefinition } from './types';

/**
 * Returns default configuration definition for a key.
 */
export function getConfigDefinition(key: string): ConfigurationDefinition<any> | undefined {
  const canonicalKey = normalizeConfigKey(key);
  return CONFIG_REGISTRY[canonicalKey];
}

/**
 * Returns default value for a configuration key.
 */
export function getDefaultValue<T = unknown>(key: string): T | undefined {
  const def = getConfigDefinition(key);
  return def ? (def.defaultValue as T) : undefined;
}

/**
 * Returns dictionary of all default configuration values.
 */
export function getAllDefaultValues(): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, def] of Object.entries(CONFIG_REGISTRY)) {
    result[key] = def.defaultValue;
  }
  return result;
}
