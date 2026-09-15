// server/modules/consolidation/consolidation.metrics.ts
// Enterprise Observability Metrics Registry for Financial Consolidation

export interface ReportTypeMetric {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  warningRequests: number;
  cacheHits: number;
  cacheMisses: number;
  imbalancesDetected: number;
  latenciesMs: number[];
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

export interface AiMetrics {
  totalCalls: number;
  successCount: number;
  fallbackCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface TenantMetricSummary {
  tenantId: string;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatio: number;
  imbalanceCount: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  uptimeSeconds: number;
  activeCalculations: number;
  globalSummary: {
    totalRequests: number;
    successRate: number;
    cacheHitRatio: number;
    imbalanceCount: number;
    avgDurationMs: number;
    aiInsightsGenerated: number;
    aiFallbacksUsed: number;
  };
  reports: Record<string, ReportTypeMetric>;
  aiMetrics: AiMetrics;
  tenantSummary?: TenantMetricSummary;
  tenantStats?: Record<string, { requests: number; cacheHits: number; imbalances: number }>;
}

export class ConsolidationMetrics {
  private static startTime = Date.now();
  private static activeCalculations = 0;

  // Key: reportType -> Metric
  private static reports: Map<string, ReportTypeMetric> = new Map();

  // Tenant-scoped counters: Map<tenantId, { requests, cacheHits, imbalances }>
  private static tenantCounters: Map<string, { requests: number; cacheHits: number; imbalances: number }> = new Map();

  private static aiStats: AiMetrics = {
    totalCalls: 0,
    successCount: 0,
    fallbackCount: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
  };

  private static getOrCreateReportMetric(reportType: string): ReportTypeMetric {
    let metric = this.reports.get(reportType);
    if (!metric) {
      metric = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        warningRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        imbalancesDetected: 0,
        latenciesMs: [],
        minDurationMs: 0,
        maxDurationMs: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
      };
      this.reports.set(reportType, metric);
    }
    return metric;
  }

  public static incrementActive(): void {
    this.activeCalculations++;
  }

  public static decrementActive(): void {
    if (this.activeCalculations > 0) {
      this.activeCalculations--;
    }
  }

  public static getActiveCalculations(): number {
    return this.activeCalculations;
  }

  /**
   * Records a completed consolidation calculation run.
   */
  public static recordExecution(params: {
    reportType: string;
    tenantId: string;
    durationMs: number;
    status: "SUCCESS" | "WARNING" | "FAILURE";
    cacheStatus: "HIT" | "MISS" | "BYPASS";
    isImbalanced?: boolean;
  }): void {
    const metric = this.getOrCreateReportMetric(params.reportType);
    metric.totalRequests++;

    if (params.status === "SUCCESS") metric.successfulRequests++;
    else if (params.status === "WARNING") metric.warningRequests++;
    else if (params.status === "FAILURE") metric.failedRequests++;

    if (params.cacheStatus === "HIT") metric.cacheHits++;
    else if (params.cacheStatus === "MISS") metric.cacheMisses++;

    if (params.isImbalanced) {
      metric.imbalancesDetected++;
    }

    // Record latency
    metric.latenciesMs.push(params.durationMs);
    if (metric.latenciesMs.length > 500) {
      metric.latenciesMs.shift(); // Keep rolling window of recent 500
    }

    metric.minDurationMs = metric.minDurationMs === 0 ? params.durationMs : Math.min(metric.minDurationMs, params.durationMs);
    metric.maxDurationMs = Math.max(metric.maxDurationMs, params.durationMs);

    const sum = metric.latenciesMs.reduce((a, b) => a + b, 0);
    metric.avgDurationMs = Math.round((sum / metric.latenciesMs.length) * 100) / 100;

    // Calculate P95
    const sorted = [...metric.latenciesMs].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    metric.p95DurationMs = sorted[p95Idx] || params.durationMs;

    // Record tenant-specific counter
    if (params.tenantId) {
      const tc = this.tenantCounters.get(params.tenantId) || { requests: 0, cacheHits: 0, imbalances: 0 };
      tc.requests++;
      if (params.cacheStatus === "HIT") tc.cacheHits++;
      if (params.isImbalanced) tc.imbalances++;
      this.tenantCounters.set(params.tenantId, tc);
    }
  }

  /**
   * Records an imbalance occurrence.
   */
  public static recordImbalance(reportType: string, tenantId?: string): void {
    const metric = this.getOrCreateReportMetric(reportType);
    metric.imbalancesDetected++;

    if (tenantId) {
      const tc = this.tenantCounters.get(tenantId) || { requests: 0, cacheHits: 0, imbalances: 0 };
      tc.imbalances++;
      this.tenantCounters.set(tenantId, tc);
    }
  }

  /**
   * Records AI insight generation metrics.
   */
  public static recordAiCall(durationMs: number, success: boolean, usedFallback: boolean): void {
    this.aiStats.totalCalls++;
    if (success) this.aiStats.successCount++;
    if (usedFallback) this.aiStats.fallbackCount++;
    this.aiStats.totalDurationMs += durationMs;
    this.aiStats.avgDurationMs = Math.round((this.aiStats.totalDurationMs / this.aiStats.totalCalls) * 100) / 100;
  }

  /**
   * Generates a comprehensive snapshot of all metrics.
   */
  public static getSnapshot(filterTenantId?: string): MetricsSnapshot {
    let totalReq = 0;
    let totalSucc = 0;
    let totalHits = 0;
    let totalMiss = 0;
    let totalImbalances = 0;
    let durationSum = 0;
    let latencyCount = 0;

    const reportsObj: Record<string, ReportTypeMetric> = {};

    for (const [key, metric] of this.reports.entries()) {
      reportsObj[key] = { ...metric };
      totalReq += metric.totalRequests;
      totalSucc += metric.successfulRequests;
      totalHits += metric.cacheHits;
      totalMiss += metric.cacheMisses;
      totalImbalances += metric.imbalancesDetected;
      for (const lat of metric.latenciesMs) {
        durationSum += lat;
        latencyCount++;
      }
    }

    const tenantStatsObj: Record<string, { requests: number; cacheHits: number; imbalances: number }> = {};
    if (filterTenantId) {
      const tc = this.tenantCounters.get(filterTenantId);
      if (tc) tenantStatsObj[filterTenantId] = tc;
    } else {
      for (const [tId, val] of this.tenantCounters.entries()) {
        tenantStatsObj[tId] = val;
      }
    }

    const cacheTotal = totalHits + totalMiss;
    const cacheHitRatio = cacheTotal > 0 ? Math.round((totalHits / cacheTotal) * 1000) / 10 : 0;
    const successRate = totalReq > 0 ? Math.round((totalSucc / totalReq) * 1000) / 10 : 100;
    const avgDurationMs = latencyCount > 0 ? Math.round((durationSum / latencyCount) * 100) / 100 : 0;

    let tenantSummary: TenantMetricSummary | undefined;
    if (filterTenantId) {
      const tc = this.tenantCounters.get(filterTenantId) || { requests: 0, cacheHits: 0, imbalances: 0 };
      tenantSummary = {
        tenantId: filterTenantId,
        totalRequests: tc.requests,
        cacheHits: tc.cacheHits,
        cacheMisses: Math.max(0, tc.requests - tc.cacheHits),
        cacheHitRatio: tc.requests > 0 ? Math.round((tc.cacheHits / tc.requests) * 1000) / 1000 : 0,
        imbalanceCount: tc.imbalances,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      activeCalculations: this.activeCalculations,
      globalSummary: {
        totalRequests: totalReq,
        successRate,
        cacheHitRatio,
        imbalanceCount: totalImbalances,
        avgDurationMs,
        aiInsightsGenerated: this.aiStats.successCount,
        aiFallbacksUsed: this.aiStats.fallbackCount,
      },
      reports: reportsObj,
      aiMetrics: { ...this.aiStats },
      tenantSummary,
      tenantStats: tenantStatsObj,
    };
  }

  /**
   * Formats metrics in standard Prometheus text representation.
   */
  public static toPrometheusFormat(): string {
    const lines: string[] = [];
    const snapshot = this.getSnapshot();

    lines.push("# HELP consolidation_active_calculations Current in-flight financial calculations");
    lines.push("# TYPE consolidation_active_calculations gauge");
    lines.push(`consolidation_active_calculations ${snapshot.activeCalculations}`);

    lines.push("# HELP consolidation_requests_total Total consolidation requests by report type and status");
    lines.push("# TYPE consolidation_requests_total counter");

    for (const [reportType, m] of Object.entries(snapshot.reports)) {
      lines.push(`consolidation_requests_total{report="${reportType}",status="success"} ${m.successfulRequests}`);
      lines.push(`consolidation_requests_total{report="${reportType}",status="warning"} ${m.warningRequests}`);
      lines.push(`consolidation_requests_total{report="${reportType}",status="failure"} ${m.failedRequests}`);
      lines.push(`consolidation_cache_hits_total{report="${reportType}"} ${m.cacheHits}`);
      lines.push(`consolidation_cache_misses_total{report="${reportType}"} ${m.cacheMisses}`);
      lines.push(`consolidation_imbalances_total{report="${reportType}"} ${m.imbalancesDetected}`);
      lines.push(`consolidation_duration_avg_ms{report="${reportType}"} ${m.avgDurationMs}`);
      lines.push(`consolidation_duration_p95_ms{report="${reportType}"} ${m.p95DurationMs}`);
    }

    lines.push("# HELP consolidation_ai_calls_total AI insights requests status and duration");
    lines.push("# TYPE consolidation_ai_calls_total counter");
    lines.push(`consolidation_ai_calls_total{status="success"} ${snapshot.aiMetrics.successCount}`);
    lines.push(`consolidation_ai_calls_total{status="fallback"} ${snapshot.aiMetrics.fallbackCount}`);
    lines.push(`consolidation_ai_duration_avg_ms ${snapshot.aiMetrics.avgDurationMs}`);

    return lines.join("\n") + "\n";
  }

  /**
   * Resets internal metrics (useful for testing).
   */
  public static reset(): void {
    this.reports.clear();
    this.tenantCounters.clear();
    this.activeCalculations = 0;
    this.aiStats = {
      totalCalls: 0,
      successCount: 0,
      fallbackCount: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
    };
  }
}
