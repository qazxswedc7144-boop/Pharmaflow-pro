// src/features/purchases/services/smartImport/performance/chunkedProcessor.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Chunked & Incremental Processing Engine
 */

import { ENTERPRISE_IMPORT_LIMITS } from './importLimits';

export interface ChunkProcessingOptions<R> {
  chunkSize?: number;
  yieldIntervalMs?: number;
  abortSignal?: AbortSignal;
  onProgress?: (processed: number, total: number, percentage: number) => void;
  onChunkComplete?: (chunkResults: R[], chunkIndex: number) => void;
}

export class ChunkedProcessor {
  /**
   * Helper to yield execution back to the browser/environment event loop
   */
  static async yieldToMainThread(ms: number = 0): Promise<void> {
    return new Promise(resolve => {
      if (typeof setTimeout !== 'undefined') {
        setTimeout(resolve, ms);
      } else {
        resolve();
      }
    });
  }

  /**
   * Processes a large collection of items in cooperative non-blocking chunks
   */
  static async processInChunks<T, R>(
    items: T[],
    processorFn: (item: T, index: number) => Promise<R> | R,
    options: ChunkProcessingOptions<R> = {}
  ): Promise<R[]> {
    const chunkSize = options.chunkSize || ENTERPRISE_IMPORT_LIMITS.DEFAULT_CHUNK_SIZE;
    const yieldMs = options.yieldIntervalMs ?? ENTERPRISE_IMPORT_LIMITS.YIELD_INTERVAL_MS;
    const total = items.length;
    const results: R[] = new Array(total);

    if (total === 0) return [];

    let processedCount = 0;
    const totalChunks = Math.ceil(total / chunkSize);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      // Check cancellation
      if (options.abortSignal?.aborted) {
        const err = new Error('تم إلغاء عملية الاستيراد بناءً على طلب المستخدم.');
        err.name = 'AbortError';
        throw err;
      }

      const start = chunkIdx * chunkSize;
      const end = Math.min(start + chunkSize, total);
      const chunkResults: R[] = [];

      for (let i = start; i < end; i++) {
        // Individual item check for early exit
        if (options.abortSignal?.aborted) {
          const err = new Error('تم إلغاء عملية الاستيراد بناءً على طلب المستخدم.');
          err.name = 'AbortError';
          throw err;
        }

        const currentItem = items[i] as T;
        const res = await processorFn(currentItem, i);
        results[i] = res;
        chunkResults.push(res);
        processedCount++;
      }

      options.onChunkComplete?.(chunkResults, chunkIdx);

      const percent = Math.round((processedCount / total) * 100);
      options.onProgress?.(processedCount, total, percent);

      // Cooperative yield between chunks to prevent frame drops
      if (chunkIdx < totalChunks - 1) {
        await this.yieldToMainThread(yieldMs);
      }
    }

    return results;
  }

  /**
   * Slices large text / CSV lines safely into row chunks
   */
  static async sliceLinesInChunks(
    rawContent: string,
    onChunk: (lines: string[], chunkIndex: number) => Promise<void> | void,
    chunkSize: number = 200,
    abortSignal?: AbortSignal
  ): Promise<number> {
    const lines = rawContent.split(/\r?\n/);
    const total = lines.length;
    const totalChunks = Math.ceil(total / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      if (abortSignal?.aborted) {
        const err = new Error('تم إلغاء المعالجة الجزئية.');
        err.name = 'AbortError';
        throw err;
      }

      const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize);
      await onChunk(chunk, i);

      if (i < totalChunks - 1) {
        await this.yieldToMainThread(ENTERPRISE_IMPORT_LIMITS.YIELD_INTERVAL_MS);
      }
    }

    return total;
  }
}
