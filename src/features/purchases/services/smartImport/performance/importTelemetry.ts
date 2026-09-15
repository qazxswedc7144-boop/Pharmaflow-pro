// src/features/purchases/services/smartImport/performance/importTelemetry.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Smart Import Telemetry & Benchmark Service
 */

import { auditLogService } from '@/services/audit/auditLog';

export interface ImportPerformanceMetrics {
  sourceType: string;
  fileName: string;
  fileSize: number;
  totalRows: number;
  parseTimeMs: number;
  matchingTimeMs: number;
  confidenceTimeMs: number;
  aiTimeMs: number;
  totalTimeMs: number;
  cacheHit: boolean;
  workerUsed: boolean;
  healedRowsCount: number;
  memorySavedKb?: number;
  tenantId?: string;
  branchId?: string;
}

export class ImportTelemetry {
  /**
   * Sanitizes and logs performance metrics into sovereign audit log
   */
  static async recordImportBenchmark(metrics: ImportPerformanceMetrics): Promise<void> {
    try {
      const sanitizedMetrics = {
        sourceType: metrics.sourceType,
        fileName: metrics.fileName ? metrics.fileName.substring(0, 100) : 'unknown',
        fileSizeBytes: metrics.fileSize,
        totalRows: metrics.totalRows,
        parseTimeMs: Math.round(metrics.parseTimeMs),
        matchingTimeMs: Math.round(metrics.matchingTimeMs),
        confidenceTimeMs: Math.round(metrics.confidenceTimeMs),
        aiTimeMs: Math.round(metrics.aiTimeMs),
        totalTimeMs: Math.round(metrics.totalTimeMs),
        cacheHit: Boolean(metrics.cacheHit),
        workerUsed: Boolean(metrics.workerUsed),
        healedRowsCount: metrics.healedRowsCount,
        memorySavedKb: metrics.memorySavedKb ? Math.round(metrics.memorySavedKb) : 0,
        throughputRowsPerSec: metrics.totalTimeMs > 0 ? Math.round((metrics.totalRows / (metrics.totalTimeMs / 1000)) * 10) / 10 : 0
      };

      await auditLogService.log({
        table: 'purchases',
        action: 'SMART_IMPORT_BENCHMARK',
        entityId: `BENCH-${Date.now()}`,
        newData: sanitizedMetrics,
        details: `Smart Import Performance: ${metrics.totalRows} rows in ${metrics.totalTimeMs}ms (Worker: ${metrics.workerUsed}, Cache: ${metrics.cacheHit})`
      });
    } catch (err) {
      console.warn('[ImportTelemetry] Failed to log telemetry benchmark:', err);
    }
  }
}
