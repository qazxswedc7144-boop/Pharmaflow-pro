// src/core/observability/types.ts

export type ObservabilityCategory =
  | 'NETWORK'
  | 'AUTH'
  | 'SESSION'
  | 'DATABASE'
  | 'TRANSACTION'
  | 'FINANCIAL'
  | 'SYNC'
  | 'VALIDATION'
  | 'BUSINESS_RULE'
  | 'INVENTORY'
  | 'ACCOUNTING'
  | 'IMPORT'
  | 'AI'
  | 'OCR'
  | 'CONFIGURATION'
  | 'PERFORMANCE'
  | 'UNKNOWN';

export type ObservabilitySeverity =
  | 'INFO'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL'
  | 'FATAL';

export type SystemHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNHEALTHY'
  | 'CRITICAL'
  | 'RECOVERING'
  | 'OFFLINE';

export type HealthSubsystemStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNHEALTHY'
  | 'CRITICAL'
  | 'OFFLINE';

export type RecoveryStrategy =
  | 'RETRY'
  | 'BACKOFF'
  | 'REAUTH'
  | 'RECONNECT'
  | 'REBUILD_QUEUE'
  | 'REPLAY_OPERATION'
  | 'RESTORE_STATE'
  | 'SAFE_MODE'
  | 'MANUAL_INTERVENTION';

export type SystemOperatingMode =
  | 'NORMAL'
  | 'DEGRADED'
  | 'SAFE_MODE';

export type CircuitBreakerState =
  | 'CLOSED'
  | 'OPEN'
  | 'HALF_OPEN';

export interface ObservabilityContext {
  correlationId: string;
  operationId?: string;
  requestId?: string;
  tenantId: string;
  branchId?: string | null;
  userId: string;
  deviceId: string;
  feature?: string;
  workflow?: string;
  timestamp: string;
}

export interface DiagnosticRecord {
  id: string;
  errorId: string;
  correlationId: string;
  fingerprint: string;
  category: ObservabilityCategory;
  severity: ObservabilitySeverity;
  message: string;
  rootCause?: string;
  stack?: string;
  feature?: string;
  recoverable: boolean;
  retryable: boolean;
  metadata?: Record<string, any>;
  tenantId: string;
  timestamp: string;
}

export interface ErrorAggregate {
  fingerprint: string;
  category: ObservabilityCategory;
  normalizedMessage: string;
  feature: string;
  rootCause?: string;
  severity: ObservabilitySeverity;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  tenantId: string;
}

export interface SubsystemHealth {
  status: HealthSubsystemStatus;
  details: Record<string, any>;
  lastChecked: string;
}

export interface AggregatedSystemHealth {
  overall: SystemHealthStatus;
  mode: SystemOperatingMode;
  subsystems: {
    database: SubsystemHealth;
    sync: SubsystemHealth;
    network: SubsystemHealth;
    auth: SubsystemHealth;
    performance: SubsystemHealth;
  };
  timestamp: string;
}

export interface RecoveryEventRecord {
  id: string;
  correlationId: string;
  errorId?: string;
  strategy: RecoveryStrategy;
  feature?: string;
  status: 'ATTEMPTED' | 'SUCCESS' | 'FAILED' | 'RECONCILIATION_REQUIRED';
  attemptCount: number;
  details?: string;
  tenantId: string;
  timestamp: string;
}

export interface PerformanceEventRecord {
  id: string;
  correlationId: string;
  operationName: string;
  category: 'NAVIGATION' | 'DATABASE' | 'FINANCIAL_SAVE' | 'SMART_IMPORT' | 'SYNC' | 'NETWORK' | 'AI_OCR';
  durationMs: number;
  isSlow: boolean;
  thresholdMs: number;
  metadata?: Record<string, any>;
  tenantId: string;
  timestamp: string;
}

export type ObservabilityEventPayload =
  | {
      type: 'ERROR';
      errorId: string;
      correlationId: string;
      category: ObservabilityCategory;
      severity: ObservabilitySeverity;
      message: string;
      rootCause?: string;
      stack?: string;
      feature?: string;
      recoverable: boolean;
      retryable: boolean;
      metadata?: Record<string, any>;
    }
  | {
      type: 'PERFORMANCE';
      correlationId: string;
      operationName: string;
      category: 'NAVIGATION' | 'DATABASE' | 'FINANCIAL_SAVE' | 'SMART_IMPORT' | 'SYNC' | 'NETWORK' | 'AI_OCR';
      durationMs: number;
      isSlow: boolean;
      thresholdMs: number;
      metadata?: Record<string, any>;
    }
  | {
      type: 'HEALTH';
      subsystem: 'database' | 'sync' | 'network' | 'auth' | 'performance' | 'overall';
      status: HealthSubsystemStatus | SystemHealthStatus;
      details?: Record<string, any>;
    }
  | {
      type: 'RECOVERY';
      correlationId: string;
      strategy: RecoveryStrategy;
      status: 'ATTEMPTED' | 'SUCCESS' | 'FAILED' | 'RECONCILIATION_REQUIRED';
      details?: string;
    }
  | {
      type: 'CIRCUIT_BREAKER';
      serviceName: string;
      state: CircuitBreakerState;
      failureCount: number;
    };

export interface DiagnosticSnapshot {
  systemHealth: AggregatedSystemHealth;
  context: ObservabilityContext;
  networkState: { online: boolean; latencyMs?: number };
  syncMetrics: { queueSize: number; failedCount: number; oldestPendingAgeMs?: number };
  dbMetrics: { status: string; totalTables: number };
  recentErrors: DiagnosticRecord[];
  recentRecoveries: RecoveryEventRecord[];
  performanceBottlenecks: PerformanceEventRecord[];
  appVersion: string;
  buildVersion: string;
  deviceMetadata: { deviceId: string; userAgent: string };
  timestamp: string;
}
