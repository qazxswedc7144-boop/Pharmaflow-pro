// src/features/purchases/services/smartImport/batchProcessing/batchIdempotencyService.ts
import { CanonicalResolutionResult } from './types';
import { configurationService } from '@/services/config/configurationService';

interface IdempotencyRecord {
  idempotencyKey: string;
  sessionId: string;
  tenantId: string;
  payloadHash: string;
  result: CanonicalResolutionResult;
  createdAt: string;
  expiresAt: number;
}

export class BatchIdempotencyService {
  private static storageKeyPrefix = 'pharmaflow_batch_idempotency_';
  private static memoryCache = new Map<string, IdempotencyRecord>();
  private static defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generates a stable payload hash for request fingerprinting
   */
  static hashPayload(payload: any): string {
    let cleanPayload: any = payload;
    if (payload && typeof payload === 'object') {
      cleanPayload = {
        sessionId: payload.sessionId,
        tenantId: payload.tenantId,
        branchId: payload.branchId,
        supplierDecision: payload.supplierDecision,
        productDecisions: payload.productDecisions,
        summary: payload.summary ? {
          totalRows: payload.summary.totalRows,
          totalAmount: payload.summary.totalAmount,
          detectedSupplier: payload.summary.detectedSupplier,
          detectedInvoiceNumber: payload.summary.detectedInvoiceNumber
        } : undefined
      };
    }
    const jsonStr = typeof cleanPayload === 'string' ? cleanPayload : JSON.stringify(cleanPayload);
    let hash = 0;
    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return `hash_${Math.abs(hash).toString(36)}_${jsonStr.length}`;
  }

  /**
   * Checks if an execution with the given idempotencyKey and tenantId has already succeeded
   */
  static getExecution(tenantId: string, idempotencyKey: string, currentPayloadHash?: string): {
    exists: boolean;
    result?: CanonicalResolutionResult;
    mismatch?: boolean;
  } {
    if (!tenantId || !idempotencyKey) {
      return { exists: false };
    }

    const key = `${this.storageKeyPrefix}${tenantId}_${idempotencyKey}`;
    
    // Check in-memory cache first
    let record = this.memoryCache.get(key);

    // Fallback to configurationService if in browser environment
    if (!record) {
      try {
        const stored = configurationService.getSync<IdempotencyRecord>(key);
        if (stored) {
          record = stored;
          if (record && Date.now() > record.expiresAt) {
            configurationService.set(key, null).catch(() => {});
            record = undefined;
          }
        }
      } catch (err) {
        console.warn('[BatchIdempotencyService] configurationService read error:', err);
      }
    }

    if (!record) {
      return { exists: false };
    }

    if (Date.now() > record.expiresAt) {
      this.memoryCache.delete(key);
      return { exists: false };
    }

    // Check payload mismatch if hash provided
    if (currentPayloadHash && record.payloadHash && record.payloadHash !== currentPayloadHash) {
      return {
        exists: true,
        mismatch: true
      };
    }

    return {
      exists: true,
      result: {
        ...record.result,
        idempotentReplay: true
      },
      mismatch: false
    };
  }

  /**
   * Records a successful batch resolution execution for future idempotent replays
   */
  static recordExecution(
    tenantId: string,
    idempotencyKey: string,
    sessionId: string,
    payloadHash: string,
    result: CanonicalResolutionResult,
    ttlMs: number = this.defaultTtlMs
  ): void {
    if (!tenantId || !idempotencyKey) return;

    const key = `${this.storageKeyPrefix}${tenantId}_${idempotencyKey}`;
    const record: IdempotencyRecord = {
      idempotencyKey,
      sessionId,
      tenantId,
      payloadHash,
      result,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + ttlMs
    };

    this.memoryCache.set(key, record);

    configurationService.set(key, record).catch(() => {});
  }

  /**
   * Clears an idempotency record (e.g. during rollback or test resets)
   */
  static clearExecution(tenantId: string, idempotencyKey: string): void {
    const key = `${this.storageKeyPrefix}${tenantId}_${idempotencyKey}`;
    this.memoryCache.delete(key);
    configurationService.set(key, null).catch(() => {});
  }
}
