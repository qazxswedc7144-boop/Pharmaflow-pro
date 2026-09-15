// packages/sync-engine/src/transport/httpTransport.ts
import { unifiedTransport } from "../../../src/shared/network/transport/unifiedTransport";
import { RequestOptions } from "../../../src/shared/network/transport/types";

export interface RequestConfig extends RequestOptions {
  timeoutMs?: number;
  retries?: number;
  idempotencyKey?: string;
  deviceId?: string;
  headers?: Record<string, string>;
  method?: string;
  body?: any;
}

/**
 * Legacy HttpTransport Compatibility Facade
 * Delegates all traffic directly to the UnifiedTransport Source of Truth.
 */
export class HttpTransport {
  public static async request<T = unknown>(url: string, config: RequestConfig = {}): Promise<T> {
    return unifiedTransport.request<T>({
      url,
      profile: "SYNC",
      ...config,
    });
  }
}
