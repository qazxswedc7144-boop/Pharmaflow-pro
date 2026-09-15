// src/core/observability/performanceMonitor.ts

import { db } from '@/core/db';
import { PerformanceEventRecord, ObservabilityContext } from './types';
import { observabilityEvents } from './observabilityEvents';

export const SLOW_OPERATION_THRESHOLDS = {
  NAVIGATION: 1000,
  DATABASE: 500,
  FINANCIAL_SAVE: 3000,
  SMART_IMPORT: 10000,
  SYNC: 5000,
  NETWORK: 3000,
  AI_OCR: 8000
};

export class PerformanceMonitor {
  private recentPerformanceEvents: PerformanceEventRecord[] = [];

  /**
   * Times a given function and records performance metrics automatically.
   */
  public async track<T>(
    operationName: string,
    category: 'NAVIGATION' | 'DATABASE' | 'FINANCIAL_SAVE' | 'SMART_IMPORT' | 'SYNC' | 'NETWORK' | 'AI_OCR',
    action: () => Promise<T>,
    context: ObservabilityContext,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now();
    try {
      return await action();
    } finally {
      const durationMs = Math.round(performance.now() - start);
      this.recordPerformance(operationName, category, durationMs, context, metadata);
    }
  }

  /**
   * Records a performance metric event.
   */
  public recordPerformance(
    operationName: string,
    category: 'NAVIGATION' | 'DATABASE' | 'FINANCIAL_SAVE' | 'SMART_IMPORT' | 'SYNC' | 'NETWORK' | 'AI_OCR',
    durationMs: number,
    context: ObservabilityContext,
    metadata?: Record<string, any>
  ): PerformanceEventRecord {
    const thresholdMs = SLOW_OPERATION_THRESHOLDS[category] || 1000;
    const isSlow = durationMs > thresholdMs;

    const recordId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `perf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const record: PerformanceEventRecord = {
      id: recordId,
      correlationId: context.correlationId,
      operationName,
      category,
      durationMs,
      isSlow,
      thresholdMs,
      metadata,
      tenantId: context.tenantId,
      timestamp: context.timestamp
    };

    // Keep in-memory cache of recent bottleneck events
    if (isSlow) {
      this.recentPerformanceEvents.unshift(record);
      if (this.recentPerformanceEvents.length > 100) {
        this.recentPerformanceEvents.pop();
      }
    }

    // Emit event
    observabilityEvents.emit({
      type: 'PERFORMANCE',
      correlationId: context.correlationId,
      operationName,
      category,
      durationMs,
      isSlow,
      thresholdMs,
      metadata
    });

    // Optionally save slow events in Dexie table systemPerformanceLog
    if (isSlow && db && db.systemPerformanceLog) {
      db.systemPerformanceLog.put({
        id: recordId,
        operation: operationName,
        category,
        durationMs,
        thresholdMs,
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        timestamp: context.timestamp
      }).catch(err => console.warn('[PerformanceMonitor] Could not persist log:', err));
    }

    return record;
  }

  public getBottlenecks(): PerformanceEventRecord[] {
    return [...this.recentPerformanceEvents];
  }
}

export const performanceMonitor = new PerformanceMonitor();
