// src/shared/network/idempotency.ts
import { unifiedTransport } from "@/shared/network/transport/unifiedTransport";

/**
 * Generates an RFC4122 compliant UUID v4 string.
 * Supports native crypto.randomUUID with high-performance pseudorandom fallback
 * for legacy container scopes and offline web views.
 */
export function generateIdempotencyKey(): string {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Enterprise Compatibility Facade wrapping UnifiedTransport for Financial / Consolidation API calls.
 */
export const financialApiClient = {
  get: async <T = any>(url: string, options?: any): Promise<{ data: T }> => {
    const data = await unifiedTransport.get<T>(url, { profile: 'FINANCIAL', ...options });
    return { data };
  },
  post: async <T = any>(url: string, body?: any, options?: any): Promise<{ data: T }> => {
    const data = await unifiedTransport.post<T>(url, body, { profile: 'FINANCIAL', ...options });
    return { data };
  },
  put: async <T = any>(url: string, body?: any, options?: any): Promise<{ data: T }> => {
    const data = await unifiedTransport.put<T>(url, body, { profile: 'FINANCIAL', ...options });
    return { data };
  },
  delete: async <T = any>(url: string, options?: any): Promise<{ data: T }> => {
    const data = await unifiedTransport.delete<T>(url, { profile: 'FINANCIAL', ...options });
    return { data };
  },
  interceptors: {
    request: { use: () => {} },
    response: { use: () => {} }
  }
};

