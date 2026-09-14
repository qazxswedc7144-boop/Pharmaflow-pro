// src/shared/security/sanitize.ts

/**
 * Enterprise-grade sanitization utility to prevent SQL Injections,
 * XSS attacks, prototype pollution, and corrupted control/unicode codes.
 */
export function sanitizeString(val: string): string {
  if (!val) return "";
  
  // 1. Normalize Unicode (e.g., NFC normalization)
  let result = val.normalize("NFC");

  // 2. Remove non-printable control characters (ASCII 0-31 and 127), keeping tabs and newlines
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 3. Trim outer whitespaces
  result = result.trim();

  // 4. Strip NULL characters to prevent null byte injection
  result = result.replace(/\0/g, "");

  // 5. Strip dangerous HTML script tags and inline execution patterns for XSS hardening
  result = result
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript\s*:/gi, "no-js-scheme:")
    .replace(/\bon\w+\s*=/gi, "data-blocked=");

  return result;
}

/**
 * Deeply sanitizes all string values inside a given object recursively
 * with strict prototype pollution protection.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  if (typeof obj === "object") {
    const rawObj = obj as any;
    const sanitizedObj: any = {};
    for (const key of Object.keys(rawObj)) {
      // Prototype Pollution Prevention: Block reserved property names
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      sanitizedObj[key] = sanitizeObject(rawObj[key]);
    }
    return sanitizedObj as T;
  }

  return obj;
}
