// src/shared/network/transport/types.ts

export type RequestProfile = 
  | 'FINANCIAL'
  | 'SYNC'
  | 'AUTH'
  | 'AI'
  | 'OCR'
  | 'UPLOAD'
  | 'DEFAULT';

export type NetworkErrorCode =
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'REQUEST_ABORTED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'UNKNOWN_NETWORK_ERROR';

export interface UnifiedNetworkError extends Error {
  code: NetworkErrorCode;
  status?: number;
  requestId?: string;
  retryable: boolean;
  originalError?: unknown;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  profile?: RequestProfile;
  timeoutMs?: number;
  retries?: number;
  idempotencyKey?: string;
  skipAuth?: boolean;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  deviceId?: string;
  signal?: AbortSignal;
  raw?: boolean;
}

export interface RequestConfig extends RequestOptions {
  url: string;
  body?: unknown;
}

export interface Transport {
  request<T>(config: RequestConfig): Promise<T>;
  get<T>(url: string, config?: RequestOptions): Promise<T>;
  post<T>(url: string, body?: unknown, config?: RequestOptions): Promise<T>;
  put<T>(url: string, body?: unknown, config?: RequestOptions): Promise<T>;
  patch<T>(url: string, body?: unknown, config?: RequestOptions): Promise<T>;
  delete<T>(url: string, config?: RequestOptions): Promise<T>;
}
