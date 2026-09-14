// server/modules/sync/sync-metrics.service.ts
// Observability & Structured Synchronization Metrics for Phase 8.3

export interface SyncMetricsSnapshot {
  tenantId: string;
  syncDurationMs: number;
  pushDurationMs: number;
  pullDurationMs: number;
  mutationsProcessed: number;
  mutationsFailed: number;
  mutationsRetried: number;
  conflictsCount: number;
  duplicatesCount: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  lastSuccessfulSync: string | null;
  lastFailedSync: string | null;
  lastError: string | null;
  activeDevicesCount: number;
  revokedDevicesCount: number;
  systemHealth: "HEALTHY" | "DEGRADED" | "CRITICAL";
  timestamp: string;
}

export class SyncMetricsService {
  private static metricsByTenant = new Map<string, SyncMetricsSnapshot>();

  /**
   * Initializes or gets current metrics record for a tenant
   */
  private static getOrCreateMetrics(tenantId: string): SyncMetricsSnapshot {
    let snapshot = this.metricsByTenant.get(tenantId);
    if (!snapshot) {
      snapshot = {
        tenantId,
        syncDurationMs: 0,
        pushDurationMs: 0,
        pullDurationMs: 0,
        mutationsProcessed: 0,
        mutationsFailed: 0,
        mutationsRetried: 0,
        conflictsCount: 0,
        duplicatesCount: 0,
        bytesUploaded: 0,
        bytesDownloaded: 0,
        lastSuccessfulSync: null,
        lastFailedSync: null,
        lastError: null,
        activeDevicesCount: 1,
        revokedDevicesCount: 0,
        systemHealth: "HEALTHY",
        timestamp: new Date().toISOString()
      };
      this.metricsByTenant.set(tenantId, snapshot);
    }
    return snapshot;
  }

  /**
   * Records a push batch operation metrics
   */
  static recordPushMetrics(params: {
    tenantId: string;
    durationMs: number;
    processedCount: number;
    failedCount: number;
    duplicateCount: number;
    conflictCount: number;
    payloadBytes: number;
    success: boolean;
    error?: string | null;
  }): void {
    const m = this.getOrCreateMetrics(params.tenantId);
    const now = new Date().toISOString();

    m.pushDurationMs = params.durationMs;
    m.syncDurationMs = params.durationMs;
    m.mutationsProcessed += params.processedCount;
    m.mutationsFailed += params.failedCount;
    m.duplicatesCount += params.duplicateCount;
    m.conflictsCount += params.conflictCount;
    m.bytesUploaded += params.payloadBytes;
    m.timestamp = now;

    if (params.success) {
      m.lastSuccessfulSync = now;
      m.systemHealth = "HEALTHY";
    } else {
      m.lastFailedSync = now;
      m.lastError = params.error || "Push operation failed";
      m.systemHealth = m.mutationsFailed > 10 ? "DEGRADED" : "HEALTHY";
    }
  }

  /**
   * Records a pull delta operation metrics
   */
  static recordPullMetrics(params: {
    tenantId: string;
    durationMs: number;
    changesReturned: number;
    responseBytes: number;
    success: boolean;
    error?: string | null;
  }): void {
    const m = this.getOrCreateMetrics(params.tenantId);
    const now = new Date().toISOString();

    m.pullDurationMs = params.durationMs;
    m.bytesDownloaded += params.responseBytes;
    m.timestamp = now;

    if (params.success) {
      m.lastSuccessfulSync = now;
    } else {
      m.lastFailedSync = now;
      m.lastError = params.error || "Pull operation failed";
    }
  }

  /**
   * Returns current snapshot for a tenant
   */
  static getMetrics(tenantId: string): SyncMetricsSnapshot {
    return { ...this.getOrCreateMetrics(tenantId) };
  }

  /**
   * Returns all tenant metrics snapshots for system administration
   */
  static getAllMetrics(): SyncMetricsSnapshot[] {
    return Array.from(this.metricsByTenant.values());
  }

  /**
   * Resets tenant metrics (e.g. for test isolation)
   */
  static reset(tenantId?: string): void {
    if (tenantId) {
      this.metricsByTenant.delete(tenantId);
    } else {
      this.metricsByTenant.clear();
    }
  }
}
