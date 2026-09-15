// src/core/config/types.ts
/**
 * Phase 3.4.5 — Configuration Scopes
 */
export type ConfigScope =
  | 'SYSTEM'
  | 'TENANT'
  | 'BRANCH'
  | 'USER'
  | 'DEVICE'
  | 'RUNTIME';

export type ConfigSyncPolicy = 'LOCAL_ONLY' | 'SYNCABLE' | 'SERVER_AUTHORITATIVE';

export interface ConfigurationContext {
  tenantId?: string;
  branchId?: string;
  userId?: string;
  deviceId?: string;
}

export interface ConfigurationMetadata {
  key: string;
  scope: ConfigScope;
  syncPolicy: ConfigSyncPolicy;
  legacyKeys?: string[];
  readOnly?: boolean;
  description?: string;
}

export interface ConfigurationDefinition<T = unknown> extends ConfigurationMetadata {
  defaultValue: T;
  validator?: (value: any) => boolean;
}

export interface ConfigurationRecord<T = unknown> {
  key: string;
  value: T;
  scope: ConfigScope;
  context: ConfigurationContext;
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface ConfigChangeEvent<T = unknown> {
  key: string;
  value: T;
  oldValue?: T;
  scope: ConfigScope;
  context: ConfigurationContext;
  source: string;
  timestamp: string;
}
