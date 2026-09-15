// src/core/config/configValidation.ts
import { CONFIG_REGISTRY, normalizeConfigKey } from './configKeys';
import { ConfigScope, ConfigurationContext } from './types';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  sanitizedValue?: any;
}

/**
 * Validates configuration mutations before persistence.
 */
export function validateConfigMutation(
  key: string,
  value: any,
  _scope?: ConfigScope,
  _context?: ConfigurationContext
): ValidationResult {
  const canonicalKey = normalizeConfigKey(key);
  const def = CONFIG_REGISTRY[canonicalKey];

  if (!def) {
    // Dynamic or custom setting keys are allowed if valid string
    return { valid: true, sanitizedValue: value };
  }

  // 1. Check read-only / SERVER_AUTHORITATIVE protection
  if (def.readOnly || def.syncPolicy === 'SERVER_AUTHORITATIVE') {
    return {
      valid: false,
      reason: `Configuration key '${canonicalKey}' is server-authoritative or read-only and cannot be modified locally.`
    };
  }

  // 2. Custom validator if defined
  if (def.validator && typeof def.validator === 'function') {
    if (!def.validator(value)) {
      return {
        valid: false,
        reason: `Value for '${canonicalKey}' failed custom validation.`
      };
    }
  }

  // 3. Known type checks
  const defaultType = typeof def.defaultValue;
  if (value !== null && value !== undefined) {
    if (defaultType === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, reason: `Value for '${canonicalKey}' must be a valid number.` };
      }
      // Percent checks
      if (canonicalKey.includes('percent') || canonicalKey.includes('limit')) {
        if (num < 0 || num > 100) {
          return { valid: false, reason: `Percentage value for '${canonicalKey}' must be between 0 and 100.` };
        }
      }
      return { valid: true, sanitizedValue: num };
    }

    if (defaultType === 'boolean') {
      const boolVal = Boolean(value);
      return { valid: true, sanitizedValue: boolVal };
    }
  }

  return { valid: true, sanitizedValue: value };
}
