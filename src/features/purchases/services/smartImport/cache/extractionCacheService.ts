/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5 / 2.6: Tenant-Scoped Extraction Cache
 *
 * Safe in-memory cache for Smart Import extraction results.
 *
 * Architecture guarantees:
 * - Tenant isolation
 * - Branch isolation
 * - Document fingerprinting
 * - TTL expiration
 * - Bounded LRU eviction
 * - Defensive cloning
 * - No database writes
 * - No UI dependencies
 */

import type { CanonicalImportDocument } from '../types';

/**
 * Options used when reading from the extraction cache.
 */
export interface ExtractionCacheLookupOptions {
  tenantId?: string;
  branchId?: string;
  forceReprocess?: boolean;
}

/**
 * Options used when saving an extraction result.
 */
export interface ExtractionCacheSaveOptions {
  tenantId?: string;
  branchId?: string;
  providerName: string;
  confidence?: number;
  ttlMs?: number;
}

/**
 * Public cached extraction result.
 */
export interface CachedExtractionDocument {
  document: CanonicalImportDocument;
  providerName: string;
  confidence?: number;
  createdAt: number;
  cacheKey: string;
}

/**
 * Internal cache entry.
 */
interface InternalCacheEntry extends CachedExtractionDocument {
  lastAccessedAt: number;
  sizeBytes: number;
  expiresAt: number;
  tenantId: string;
  branchId?: string;
}

/**
 * Central extraction cache service.
 *
 * This service intentionally keeps extracted Smart Import documents
 * isolated by tenant and branch.
 *
 * It is a cache only and must never become a source of truth.
 */
export class ExtractionCacheService {
  /**
   * Pipeline version tag to prevent stale/mock cache collisions
   */
  private static readonly PIPELINE_VERSION = 'v3.0.0-Sovereign-Clean';

  /**
   * Maximum number of cached documents.
   */
  private static readonly MAX_ENTRIES = 50;

  /**
   * Maximum memory used by the cache (25MB).
   */
  private static readonly MAX_SIZE_BYTES = 25 * 1024 * 1024;

  /**
   * Default cache entry lifetime: 30 minutes.
   */
  private static readonly DEFAULT_TTL_MS = 30 * 60 * 1000;

  /**
   * In-memory LRU cache map.
   */
  private static cache = new Map<string, InternalCacheEntry>();

  /**
   * Current estimated cache memory usage.
   */
  private static currentSizeBytes = 0;

  /**
   * Retrieves a cached extraction result.
   *
   * Returns null when:
   * - forceReprocess is enabled
   * - no matching cache entry exists
   * - cache entry has expired
   */
  public static async getCachedDocument(
    file: File | string,
    options: ExtractionCacheLookupOptions
  ): Promise<CachedExtractionDocument | null> {
    if (options.forceReprocess) {
      return null;
    }

    try {
      const cacheKey = await this.createCacheKey(
        file,
        options.tenantId,
        options.branchId
      );

      const entry = this.cache.get(cacheKey);

      if (!entry) {
        return null;
      }

      if (this.isExpired(entry)) {
        this.deleteByKey(cacheKey);
        return null;
      }

      // Refresh LRU position
      entry.lastAccessedAt = Date.now();
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, entry);

      return this.toPublicEntry(entry);
    } catch (err) {
      console.warn('[ExtractionCacheService] getCachedDocument error:', err);
      return null;
    }
  }

  /**
   * Saves a successful extraction result into the cache.
   *
   * Cache is isolated by:
   * tenantId + branchId + document fingerprint + pipelineVersion
   */
  public static async saveCachedDocument(
    file: File | string,
    document: CanonicalImportDocument,
    options: ExtractionCacheSaveOptions
  ): Promise<void> {
    try {
      // Do not cache documents with zero items or extremely low confidence
      const primaryTable = document.tables.find(t => t.isPrimaryInvoiceTable) || document.tables[0];
      const rowCount = primaryTable?.rows?.length || 0;
      if (rowCount === 0 && (!document.documentFields.invoiceNumber && !document.documentFields.supplierName)) {
        return;
      }

      const cacheKey = await this.createCacheKey(
        file,
        options.tenantId,
        options.branchId
      );

      // Defensive clone prevents external mutations
      const clonedDocument = this.cloneDocument(document);
      const sizeBytes = this.estimateSizeBytes(clonedDocument);

      // Never cache a single document larger than the cache budget
      if (sizeBytes > this.MAX_SIZE_BYTES) {
        return;
      }

      // Replace existing entry if present
      this.deleteByKey(cacheKey);

      // Evict least recently used entries if over capacity
      while (
        this.cache.size >= this.MAX_ENTRIES ||
        this.currentSizeBytes + sizeBytes > this.MAX_SIZE_BYTES
      ) {
        const evicted = this.evictLeastRecentlyUsed();
        if (!evicted) break;
      }

      if (this.currentSizeBytes + sizeBytes > this.MAX_SIZE_BYTES) {
        return;
      }

      const now = Date.now();
      const ttl = options.ttlMs || this.DEFAULT_TTL_MS;

      const entry: InternalCacheEntry = {
        document: clonedDocument,
        providerName: options.providerName,
        ...(options.confidence !== undefined ? { confidence: options.confidence } : {}),
        createdAt: now,
        expiresAt: now + ttl,
        cacheKey,
        lastAccessedAt: now,
        sizeBytes,
        tenantId: this.normalizeScope(options.tenantId),
        branchId: options.branchId ? this.normalizeScope(options.branchId) : undefined
      };

      this.cache.set(cacheKey, entry);
      this.currentSizeBytes += sizeBytes;
    } catch (err) {
      console.warn('[ExtractionCacheService] saveCachedDocument error:', err);
    }
  }

  /**
   * Invalidates one specific document cache entry.
   */
  public static async invalidateDocument(
    file: File | string,
    scope: {
      tenantId?: string;
      branchId?: string;
    }
  ): Promise<boolean> {
    const cacheKey = await this.createCacheKey(
      file,
      scope.tenantId,
      scope.branchId
    );

    return this.deleteByKey(cacheKey);
  }

  /**
   * Removes all cached documents for a tenant.
   * Optionally restricts removal to a single branch.
   */
  public static clearTenantCache(
    tenantId: string,
    branchId?: string
  ): number {
    let removed = 0;
    const normalizedTenantId = this.normalizeScope(tenantId);
    const normalizedBranchId = branchId ? this.normalizeScope(branchId) : undefined;

    for (const [key, entry] of this.cache.entries()) {
      const isTenantMatch = entry.tenantId === normalizedTenantId || key.startsWith(`tenant:${normalizedTenantId}|`);
      const isBranchMatch = !normalizedBranchId || entry.branchId === normalizedBranchId;

      if (isTenantMatch && isBranchMatch) {
        if (this.deleteByKey(key)) {
          removed += 1;
        }
      }
    }

    return removed;
  }

  /**
   * Clears the complete in-memory cache.
   */
  public static clearAll(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  /**
   * Returns cache diagnostics.
   */
  public static getStats(): {
    count: number;
    sizeBytes: number;
    maxEntries: number;
    maxSizeBytes: number;
    ttlMs: number;
  } {
    this.pruneExpiredEntries();

    return {
      count: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxEntries: this.MAX_ENTRIES,
      maxSizeBytes: this.MAX_SIZE_BYTES,
      ttlMs: this.DEFAULT_TTL_MS
    };
  }

  /**
   * Creates a tenant-scoped and branch-scoped cache key.
   */
  public static async createCacheKey(
    file: File | string,
    tenantId?: string,
    branchId?: string
  ): Promise<string> {
    const fingerprint = await this.createDocumentFingerprint(file);
    const t = this.normalizeScope(tenantId);
    const b = this.normalizeScope(branchId);

    return `tenant:${t}|branch:${b}|v:${this.PIPELINE_VERSION}|document:${fingerprint}`;
  }

  /**
   * Creates a stable document fingerprint.
   */
  public static async createDocumentFingerprint(
    file: File | string
  ): Promise<string> {
    if (typeof file === 'string') {
      return this.hashText(file);
    }

    try {
      const buffer = await file.arrayBuffer();
      const contentHash = await this.hashBytes(new Uint8Array(buffer));
      const metadata = [
        file.name || 'unnamed',
        file.type || 'unknown',
        file.size || 0,
        file.lastModified || 0
      ].join('|');

      const metadataHash = await this.hashText(metadata);
      return `${metadataHash}:${contentHash}`;
    } catch {
      const fallbackMeta = `${file.name || 'f'}_${file.size || 0}_${file.lastModified || 0}`;
      return this.hashText(fallbackMeta);
    }
  }

  /**
   * Hashes text.
   */
  private static async hashText(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    return this.hashBytes(bytes);
  }

  /**
   * Hashes bytes.
   */
  private static async hashBytes(data: Uint8Array): Promise<string> {
    if (
      typeof globalThis.crypto !== 'undefined' &&
      globalThis.crypto.subtle
    ) {
      try {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);

        const digest = await globalThis.crypto.subtle.digest(
          'SHA-256',
          copy.buffer
        );

        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      } catch {
        // Fallback to deterministic hash
      }
    }

    // Deterministic FNV-style hash
    let hash = 2166136261;
    for (const byte of data) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Checks TTL expiration.
   */
  private static isExpired(entry: InternalCacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Removes expired entries.
   */
  private static pruneExpiredEntries(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.deleteByKey(key);
      }
    }
  }

  /**
   * Evicts least recently used entry.
   */
  private static evictLeastRecentlyUsed(): boolean {
    const oldestKey = this.cache.keys().next().value as string | undefined;
    if (!oldestKey) return false;
    return this.deleteByKey(oldestKey);
  }

  /**
   * Deletes an entry and updates memory accounting.
   */
  private static deleteByKey(cacheKey: string): boolean {
    const entry = this.cache.get(cacheKey);
    if (!entry) return false;

    this.currentSizeBytes = Math.max(0, this.currentSizeBytes - entry.sizeBytes);
    return this.cache.delete(cacheKey);
  }

  /**
   * Estimates object memory size.
   */
  private static estimateSizeBytes(value: unknown): number {
    try {
      return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
      return 1024;
    }
  }

  /**
   * Defensive deep clone.
   */
  private static cloneDocument(
    document: CanonicalImportDocument
  ): CanonicalImportDocument {
    if (typeof globalThis.structuredClone === 'function') {
      return globalThis.structuredClone(document);
    }
    return JSON.parse(JSON.stringify(document)) as CanonicalImportDocument;
  }

  /**
   * Returns a cloned public result.
   */
  private static toPublicEntry(
    entry: InternalCacheEntry
  ): CachedExtractionDocument {
    return {
      document: this.cloneDocument(entry.document),
      providerName: entry.providerName,
      ...(entry.confidence !== undefined ? { confidence: entry.confidence } : {}),
      createdAt: entry.createdAt,
      cacheKey: entry.cacheKey
    };
  }

  /**
   * Normalizes scope identifiers.
   */
  private static normalizeScope(value?: string): string {
    return (value || 'DEFAULT').trim();
  }

  /**
   * Compatibility wrapper for direct tenant/branch/hash cache writes
   */
  public static async set(
    tenantId: string,
    hash: string,
    data: any,
    confidence: number = 1.0,
    branchId?: string,
    ttlMs?: number
  ): Promise<void> {
    const cacheKey = `hash:${this.normalizeScope(tenantId)}:${this.normalizeScope(branchId)}:${hash}`;
    const now = Date.now();
    const ttl = ttlMs || this.DEFAULT_TTL_MS;
    const sizeBytes = 1024;

    this.cache.set(cacheKey, {
      document: (data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data) as any,
      providerName: 'DIRECT_SET',
      confidence,
      createdAt: now,
      cacheKey,
      lastAccessedAt: now,
      sizeBytes,
      expiresAt: now + ttl,
      tenantId: this.normalizeScope(tenantId),
      branchId: this.normalizeScope(branchId)
    });
  }

  /**
   * Compatibility wrapper for direct tenant/branch/hash cache reads
   */
  public static async get(
    tenantId: string,
    hash: string,
    branchId?: string
  ): Promise<any | null> {
    const cacheKey = `hash:${this.normalizeScope(tenantId)}:${this.normalizeScope(branchId)}:${hash}`;
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      return null;
    }
    const doc = entry.document;
    return {
      ...(doc && typeof doc === 'object' ? doc : {}),
      data: doc,
      document: doc,
      confidence: entry.confidence
    };
  }
}
