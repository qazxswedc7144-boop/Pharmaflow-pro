// src/core/observability/diagnosticsRedactor.ts

const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'authtoken',
  'token',
  'jwt',
  'refreshtoken',
  'refresh_token',
  'access_token',
  'password',
  'passwd',
  'secret',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'creditcard',
  'cardnumber'
]);

/**
 * Redacts sensitive tokens, passwords, and secrets from string patterns.
 */
export function redactString(text: string): string {
  if (!text) return text;
  
  let result = text;

  // Redact Bearer tokens
  result = result.replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, `Bearer ${REDACTED}`);

  // Redact raw JWT patterns
  result = result.replace(/eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*/g, REDACTED);

  // Redact key-value pairs in URLs/strings (e.g. password=123, apiKey=xyz)
  result = result.replace(/(password|secret|token|apikey|api_key)=([^&]+)/gi, `$1=${REDACTED}`);

  return result;
}

/**
 * Deeply redacts sensitive keys from an object or array payload.
 */
export function redactObject<T = any>(obj: T, depth: number = 0): T {
  if (obj === null || obj === undefined || depth > 8) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactString(obj) as any;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1)) as any;
  }

  if (obj instanceof Error) {
    const errorCopy: Record<string, any> = {
      name: obj.name,
      message: redactString(obj.message),
      stack: redactString(obj.stack || '')
    };
    for (const key of Object.keys(obj)) {
      if (!SENSITIVE_KEYS.has(key.toLowerCase())) {
        errorCopy[key] = redactObject((obj as any)[key], depth + 1);
      } else {
        errorCopy[key] = REDACTED;
      }
    }
    return errorCopy as any;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = REDACTED;
    } else if (typeof value === 'string') {
      sanitized[key] = redactString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactObject(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
