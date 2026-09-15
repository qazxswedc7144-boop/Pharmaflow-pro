// src/core/observability/observabilityService.ts

import {
  ObservabilityCategory,
  ObservabilitySeverity,
  ObservabilityContext,
  DiagnosticRecord,
  DiagnosticSnapshot,
  RecoveryStrategy,
  CircuitBreakerState,
  ObservabilityEventPayload
} from './types';
import { createObservabilityContext } from './observabilityContext';
import { diagnosticsEngine } from './diagnosticsEngine';
import { healthMonitor } from './healthMonitor';
import { performanceMonitor } from './performanceMonitor';
import { observabilityEvents } from './observabilityEvents';
import { redactObject, redactString } from './diagnosticsRedactor';
import { db } from '@/core/db';

export class ObservabilityService {
  private static instance: ObservabilityService;

  public static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  /**
   * Main unified entry point for recording any observability event or error.
   */
  public async record(
    eventOrPayload: ObservabilityEventPayload | { type: 'ERROR'; error: any; context?: Partial<ObservabilityContext>; category?: ObservabilityCategory; severity?: ObservabilitySeverity }
  ): Promise<DiagnosticRecord | null> {
    const isDev = process.env.NODE_ENV !== 'production';

    if ('type' in eventOrPayload && eventOrPayload.type === 'ERROR') {
      const errorPayload = eventOrPayload as any;
      const rawError = errorPayload.error || errorPayload;
      const ctx = createObservabilityContext(errorPayload.context);

      const record = await diagnosticsEngine.processError(
        rawError,
        ctx,
        errorPayload.category,
        errorPayload.severity
      );

      if (isDev) {
        console.error(
          `[ObservabilityService] [${record.severity}] [${record.category}] [Corr: ${record.correlationId}] ${record.message}`,
          record
        );
      }

      observabilityEvents.emit({
        type: 'ERROR',
        errorId: record.errorId,
        correlationId: record.correlationId,
        category: record.category,
        severity: record.severity,
        message: record.message,
        rootCause: record.rootCause,
        stack: record.stack,
        feature: record.feature,
        recoverable: record.recoverable,
        retryable: record.retryable,
        metadata: record.metadata
      });

      // Evaluate system health asynchronously on critical errors
      if (record.severity === 'CRITICAL' || record.severity === 'FATAL') {
        healthMonitor.evaluateSystemHealth().catch(() => {});
      }

      return record;
    } else {
      const payload = eventOrPayload as ObservabilityEventPayload;
      observabilityEvents.emit(payload);

      if (isDev) {
        console.log(`[ObservabilityService] Event [${payload.type}]`, payload);
      }

      return null;
    }
  }

  /**
   * Records a standard application error.
   */
  public async recordError(
    error: any,
    contextOverrides?: Partial<ObservabilityContext>,
    categoryOverride?: ObservabilityCategory,
    severityOverride?: ObservabilitySeverity
  ): Promise<DiagnosticRecord> {
    const ctx = createObservabilityContext(contextOverrides);
    const record = await diagnosticsEngine.processError(error, ctx, categoryOverride, severityOverride);

    observabilityEvents.emit({
      type: 'ERROR',
      errorId: record.errorId,
      correlationId: record.correlationId,
      category: record.category,
      severity: record.severity,
      message: record.message,
      rootCause: record.rootCause,
      stack: record.stack,
      feature: record.feature,
      recoverable: record.recoverable,
      retryable: record.retryable,
      metadata: record.metadata
    });

    if (process.env.NODE_ENV !== 'production') {
      console.error(`[ObservabilityService] [${record.severity}] [${record.category}] ${record.message}`);
    }

    return record;
  }

  /**
   * Records a warning message.
   */
  public async recordWarning(
    message: string,
    contextOverrides?: Partial<ObservabilityContext>,
    metadata?: Record<string, any>
  ): Promise<DiagnosticRecord> {
    const err = new Error(message);
    if (metadata) (err as any).metadata = metadata;
    return this.recordError(
      err,
      contextOverrides,
      'UNKNOWN',
      'WARNING'
    );
  }

  /**
   * Records an informational event.
   */
  public async recordInfo(
    message: string,
    contextOverrides?: Partial<ObservabilityContext>,
    metadata?: Record<string, any>
  ): Promise<DiagnosticRecord> {
    const err = new Error(message);
    if (metadata) (err as any).metadata = metadata;
    return this.recordError(
      err,
      contextOverrides,
      'UNKNOWN',
      'INFO'
    );
  }

  /**
   * Records a performance metric event.
   */
  public recordPerformance(
    operationName: string,
    category: 'NAVIGATION' | 'DATABASE' | 'FINANCIAL_SAVE' | 'SMART_IMPORT' | 'SYNC' | 'NETWORK' | 'AI_OCR',
    durationMs: number,
    contextOverrides?: Partial<ObservabilityContext>,
    metadata?: Record<string, any>
  ) {
    const ctx = createObservabilityContext(contextOverrides);
    return performanceMonitor.recordPerformance(operationName, category, durationMs, ctx, metadata);
  }

  /**
   * Records a recovery attempt or result.
   */
  public async recordRecovery(
    strategy: RecoveryStrategy,
    status: 'ATTEMPTED' | 'SUCCESS' | 'FAILED' | 'RECONCILIATION_REQUIRED',
    contextOverrides?: Partial<ObservabilityContext>,
    details?: string
  ) {
    const ctx = createObservabilityContext(contextOverrides);
    const recId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const recoveryRecord = {
      id: recId,
      correlationId: ctx.correlationId,
      strategy,
      feature: ctx.feature,
      status,
      attemptCount: 1,
      details: redactString(details || ''),
      tenantId: ctx.tenantId,
      timestamp: ctx.timestamp
    };

    try {
      if (db && db.recovery_events) {
        await db.recovery_events.put(recoveryRecord);
      }
    } catch (e) {
      console.warn('[ObservabilityService] Could not persist recovery record:', e);
    }

    observabilityEvents.emit({
      type: 'RECOVERY',
      correlationId: ctx.correlationId,
      strategy,
      status,
      details: recoveryRecord.details
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ObservabilityService] Recovery [${strategy}] Status: ${status} (Corr: ${ctx.correlationId})`);
    }

    return recoveryRecord;
  }

  /**
   * Records a Circuit Breaker state change.
   */
  public recordCircuitBreaker(serviceName: string, state: CircuitBreakerState, failureCount: number) {
    observabilityEvents.emit({
      type: 'CIRCUIT_BREAKER',
      serviceName,
      state,
      failureCount
    });
  }

  /**
   * Produces an Enterprise Diagnostic Snapshot.
   * Redacts sensitive data (JWTs, tokens, passwords, API keys).
   */
  public async createDiagnosticSnapshot(): Promise<DiagnosticSnapshot> {
    const context = createObservabilityContext();
    const systemHealth = await healthMonitor.evaluateSystemHealth();
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    let queueSize = 0;
    let failedCount = 0;
    try {
      if (db && db.outbox) {
        queueSize = await db.outbox.where('status').equals('pending').count();
        failedCount = await db.outbox.where('status').equals('failed').count();
      }
    } catch {}

    let recentErrors: DiagnosticRecord[] = [];
    try {
      if (db && db.system_diagnostics) {
        recentErrors = await db.system_diagnostics
          .orderBy('timestamp')
          .reverse()
          .limit(25)
          .toArray();
      }
    } catch {}

    let recentRecoveries: any[] = [];
    try {
      if (db && db.recovery_events) {
        recentRecoveries = await db.recovery_events
          .orderBy('timestamp')
          .reverse()
          .limit(25)
          .toArray();
      }
    } catch {}

    const performanceBottlenecks = performanceMonitor.getBottlenecks();

    const snapshot: DiagnosticSnapshot = {
      systemHealth,
      context,
      networkState: { online: isOnline },
      syncMetrics: { queueSize, failedCount },
      dbMetrics: {
        status: db && db.isOpen() ? 'OPEN' : 'CLOSED',
        totalTables: db ? db.tables.length : 0
      },
      recentErrors,
      recentRecoveries,
      performanceBottlenecks,
      appVersion: '3.4.6',
      buildVersion: '2026.08.29-PROD',
      deviceMetadata: {
        deviceId: context.deviceId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/Container'
      },
      timestamp: new Date().toISOString()
    };

    return redactObject(snapshot);
  }
}

export const observabilityService = ObservabilityService.getInstance();
