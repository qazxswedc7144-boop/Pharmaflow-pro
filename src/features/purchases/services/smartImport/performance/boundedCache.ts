// src/features/purchases/services/smartImport/performance/boundedCache.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Bounded LRU Cache & Memory Safety Architecture
 */

export interface CacheEntry<V> {
  value: V;
  sizeBytes: number;
  createdAt: number;
  lastAccessedAt: number;
  tenantId?: string;
  branchId?: string;
}

export interface BoundedLRUCacheOptions {
  maxEntries?: number;
  maxSizeBytes?: number;
  defaultTtlMs?: number;
}

export class BoundedLRUCache<K, V> {
  private map: Map<K, CacheEntry<V>> = new Map();
  private maxEntries: number;
  private maxSizeBytes: number;
  private defaultTtlMs: number;
  private currentSizeBytes: number = 0;

  constructor(options: BoundedLRUCacheOptions = {}) {
    this.maxEntries = options.maxEntries || 100;
    this.maxSizeBytes = options.maxSizeBytes || 50 * 1024 * 1024; // 50MB
    this.defaultTtlMs = options.defaultTtlMs || 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Estimates memory footprint of an object in bytes
   */
  private estimateSize(value: any): number {
    try {
      if (value === null || value === undefined) return 8;
      if (typeof value === 'boolean') return 4;
      if (typeof value === 'number') return 8;
      if (typeof value === 'string') return value.length * 2;
      if (typeof value === 'object') {
        const jsonStr = JSON.stringify(value);
        return jsonStr.length * 2;
      }
      return 64;
    } catch {
      return 256;
    }
  }

  /**
   * Gets item by key and updates LRU position
   */
  get(key: K): V | null {
    const entry = this.map.get(key);
    if (!entry) return null;

    // Check TTL expiration
    const now = Date.now();
    if (this.defaultTtlMs > 0 && now - entry.createdAt > this.defaultTtlMs) {
      this.delete(key);
      return null;
    }

    // Refresh LRU recency
    entry.lastAccessedAt = now;
    // Move to end of insertion order Map by re-inserting
    this.map.delete(key);
    this.map.set(key, entry);

    return entry.value;
  }

  /**
   * Sets item in cache, evicting oldest if capacity/memory exceeded
   */
  set(
    key: K, 
    value: V, 
    metadata: { tenantId?: string; branchId?: string; sizeBytes?: number } = {}
  ): void {
    const now = Date.now();
    const sizeBytes = metadata.sizeBytes || this.estimateSize(value);

    // If key already exists, remove it first to adjust size counter
    if (this.map.has(key)) {
      this.delete(key);
    }

    // Evict oldest entries if capacity or memory limit is exceeded
    while (
      (this.map.size >= this.maxEntries || this.currentSizeBytes + sizeBytes > this.maxSizeBytes) &&
      this.map.size > 0
    ) {
      this.evictOldest();
    }

    const entry: CacheEntry<V> = {
      value,
      sizeBytes,
      createdAt: now,
      lastAccessedAt: now,
      tenantId: metadata.tenantId,
      branchId: metadata.branchId
    };

    this.map.set(key, entry);
    this.currentSizeBytes += sizeBytes;
  }

  /**
   * Deletes a key from cache
   */
  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    this.currentSizeBytes = Math.max(0, this.currentSizeBytes - entry.sizeBytes);
    return this.map.delete(key);
  }

  /**
   * Checks if key exists without updating access time
   */
  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.defaultTtlMs > 0 && Date.now() - entry.createdAt > this.defaultTtlMs) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Clears all cache entries
   */
  clear(): void {
    this.map.clear();
    this.currentSizeBytes = 0;
  }

  /**
   * Evicts the least-recently used entry
   */
  private evictOldest(): void {
    const firstKey = this.map.keys().next().value;
    if (firstKey !== undefined) {
      this.delete(firstKey);
    }
  }

  /**
   * Prunes entries matching a specific tenantId or branchId
   */
  pruneTenant(tenantId: string, branchId?: string): number {
    let count = 0;
    for (const [key, entry] of this.map.entries()) {
      if (entry.tenantId === tenantId) {
        if (!branchId || entry.branchId === branchId) {
          this.delete(key);
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Cache statistics
   */
  getStats(): { count: number; maxEntries: number; sizeBytes: number; maxSizeBytes: number } {
    return {
      count: this.map.size,
      maxEntries: this.maxEntries,
      sizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes
    };
  }
}
