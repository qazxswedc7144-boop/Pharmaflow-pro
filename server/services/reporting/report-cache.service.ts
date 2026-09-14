// server/services/reporting/report-cache.service.ts
// Enterprise In-Memory & Distributed Report Cache Service

import crypto from "crypto";

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  tenantId: string;
  reportType: string;
  key: string;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRatio: number;
}

export class ReportCacheService {
  private static instance: ReportCacheService;
  private cache = new Map<string, CacheEntry<any>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private defaultTtlMs = 10 * 60 * 1000; // 10 minutes default

  private constructor() {
    // Run background sweeper every 2 minutes to evict stale entries
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.evictExpired(), 2 * 60 * 1000);
    }
  }

  public static getInstance(): ReportCacheService {
    if (!ReportCacheService.instance) {
      ReportCacheService.instance = new ReportCacheService();
    }
    return ReportCacheService.instance;
  }

  public generateKey(
    tenantId: string,
    userId: string,
    reportType: string,
    filters: Record<string, any>
  ): string {
    const normalizedFilters = Object.keys(filters)
      .sort()
      .reduce((acc, k) => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== "") {
          acc[k] = filters[k];
        }
        return acc;
      }, {} as Record<string, any>);

    const filterHash = crypto
      .createHash("md5")
      .update(JSON.stringify(normalizedFilters))
      .digest("hex")
      .slice(0, 16);

    return `report:${tenantId}:${userId}:${reportType}:${filterHash}`;
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.evictions++;
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  public set<T>(
    key: string,
    data: T,
    tenantId: string,
    reportType: string,
    ttlMs: number = this.defaultTtlMs
  ): void {
    // Cap cache size to avoid memory bloat in containerized environments (max 1000 reports)
    if (this.cache.size >= 1000) {
      this.evictOldest(200);
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      cachedAt: now,
      expiresAt: now + ttlMs,
      tenantId,
      reportType,
      key
    });
  }

  public invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  public invalidateTenant(tenantId: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tenantId === tenantId) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  public invalidateReportType(tenantId: string, reportType: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tenantId === tenantId && entry.reportType === reportType) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  public clearAll(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  public getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatio: Math.round(hitRatio * 100) / 100
    };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.evictions++;
      }
    }
  }

  private evictOldest(count: number): void {
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const item = entries[i];
      if (item) {
        this.cache.delete(item[0]);
        this.evictions++;
      }
    }
  }
}

export const reportCacheService = ReportCacheService.getInstance();
