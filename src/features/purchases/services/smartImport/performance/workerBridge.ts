// src/features/purchases/services/smartImport/performance/workerBridge.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Web Worker Isolation Bridge & Resilient Main-Thread Fallback
 */

import { Product } from '@/types';
import { ExtractedImportRow } from '../types';
import { ChunkedProcessor } from './chunkedProcessor';
import { ProductMatchingIndex } from './matchingIndex';
import { SelfHealingEngine } from '../selfHealing/selfHealingEngine';
import { ConfidenceEngine } from '../confidence/confidenceEngine';

export interface WorkerBatchTaskPayload {
  rows: ExtractedImportRow[];
  products: Product[];
  learnedAliases?: Record<string, string>;
  chunkSize?: number;
}

export interface WorkerBatchTaskResult {
  enrichedRows: ExtractedImportRow[];
  healedCount: number;
  workerUsed: boolean;
  durationMs: number;
}

export class SmartImportWorkerBridge {
  private activeWorker: Worker | null = null;
  private workerBlobUrl: string | null = null;

  /**
   * Checks if Web Worker is supported and accessible in current runtime
   */
  static isWorkerSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    );
  }

  /**
   * Generates inline worker source code blob
   */
  private createWorkerScript(): string {
    return `
      self.onmessage = function(e) {
        var data = e.data;
        if (data.type === 'PROCESS_BATCH') {
          var rows = data.rows || [];
          var products = data.products || [];
          var aliases = data.learnedAliases || {};
          var startTime = Date.now();

          // Build index inside worker
          var barcodeMap = {};
          var codeMap = {};
          var exactNameMap = {};
          var normMap = {};

          for (var i = 0; i < products.length; i++) {
            var p = products[i];
            if (p.Is_Active === false) continue;
            var pName = (p.name || p.Name || '').trim();
            var lower = pName.toLowerCase();
            var norm = lower.replace(/[^\\w\\u0600-\\u06FF]/g, '');
            if (p.barcode) barcodeMap[p.barcode.trim()] = p;
            if (p.id) codeMap[p.id.trim()] = p;
            if (lower) exactNameMap[lower] = p;
            if (norm) normMap[norm] = p;
          }

          var healedCount = 0;
          var enrichedRows = [];

          for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var rawName = (row.productName || '').trim();
            var barcode = (row.barcode || '').trim();
            var code = (row.productCode || '').trim();
            var matchedProduct = null;
            var matchType = 'NONE';
            var score = 0;

            if (barcode && barcodeMap[barcode]) {
              matchedProduct = barcodeMap[barcode];
              matchType = 'BARCODE';
              score = 1.0;
            } else if (code && codeMap[code]) {
              matchedProduct = codeMap[code];
              matchType = 'CODE';
              score = 0.98;
            } else if (rawName && exactNameMap[rawName.toLowerCase()]) {
              matchedProduct = exactNameMap[rawName.toLowerCase()];
              matchType = 'EXACT';
              score = 0.99;
            } else if (rawName) {
              var rowNorm = rawName.toLowerCase().replace(/[^\\w\\u0600-\\u06FF]/g, '');
              if (normMap[rowNorm]) {
                matchedProduct = normMap[rowNorm];
                matchType = 'NORMALIZED';
                score = 0.95;
              }
            }

            var enriched = Object.assign({}, row);
            if (matchedProduct) {
              enriched.matchedProductId = matchedProduct.id;
              enriched.matchedProductName = matchedProduct.name || matchedProduct.Name;
              enriched.matchType = matchType;
              enriched.matchScore = score;
              enriched.isNewProductCandidate = false;
            } else {
              enriched.matchType = 'NONE';
              enriched.matchScore = 0;
              enriched.isNewProductCandidate = true;
            }

            enrichedRows.push(enriched);

            if ((r + 1) % 100 === 0 || r === rows.length - 1) {
              self.postMessage({
                type: 'PROGRESS',
                processed: r + 1,
                total: rows.length,
                percent: Math.round(((r + 1) / rows.length) * 100)
              });
            }
          }

          self.postMessage({
            type: 'COMPLETE',
            enrichedRows: enrichedRows,
            healedCount: healedCount,
            durationMs: Date.now() - startTime
          });
        }
      };
    `;
  }

  /**
   * Executes batch processing inside isolated Web Worker, with seamless main thread fallback
   */
  async processBatch(
    payload: WorkerBatchTaskPayload,
    options: {
      abortSignal?: AbortSignal;
      onProgress?: (processed: number, total: number, percent: number) => void;
    } = {}
  ): Promise<WorkerBatchTaskResult> {
    // Check if worker is supported and we're in browser
    if (SmartImportWorkerBridge.isWorkerSupported()) {
      try {
        return await this.executeInWorker(payload, options);
      } catch (workerErr: any) {
        if (workerErr.name === 'AbortError') {
          throw workerErr;
        }
        console.warn('[SmartImportWorkerBridge] Worker execution failed, falling back to chunked main thread processing:', workerErr);
      } finally {
        this.terminate();
      }
    }

    // Fallback: Asynchronous Chunked Main Thread Processing
    return await this.executeInMainThreadFallback(payload, options);
  }

  /**
   * Spawns worker and executes task asynchronously
   */
  private executeInWorker(
    payload: WorkerBatchTaskPayload,
    options: {
      abortSignal?: AbortSignal;
      onProgress?: (processed: number, total: number, percent: number) => void;
    }
  ): Promise<WorkerBatchTaskResult> {
    return new Promise((resolve, reject) => {
      try {
        const script = this.createWorkerScript();
        const blob = new Blob([script], { type: 'application/javascript' });
        this.workerBlobUrl = URL.createObjectURL(blob);
        this.activeWorker = new Worker(this.workerBlobUrl);

        if (options.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            this.terminate();
            const err = new Error('تم إلغاء معالجة الاستيراد في الـ Worker');
            err.name = 'AbortError';
            reject(err);
          });
        }

        this.activeWorker.onmessage = (event) => {
          const msg = event.data;
          if (msg.type === 'PROGRESS') {
            options.onProgress?.(msg.processed, msg.total, msg.percent);
          } else if (msg.type === 'COMPLETE') {
            // Post-process with local SelfHealing & ConfidenceEngine
            const index = new ProductMatchingIndex(payload.products);
            let healedCount = 0;

            const finalEnrichedRows = msg.enrichedRows.map((row: ExtractedImportRow) => {
              // Full 8-tier safety pass
              const recheckCandidate = index.matchRow(row, payload.learnedAliases);
              const matchedRow: ExtractedImportRow = recheckCandidate ? {
                ...row,
                matchedProductId: recheckCandidate.product.id,
                matchedProductName: recheckCandidate.product.name || recheckCandidate.product.Name,
                matchType: recheckCandidate.matchType,
                matchScore: recheckCandidate.score,
                isNewProductCandidate: false
              } : {
                ...row,
                isNewProductCandidate: true,
                matchType: 'NONE',
                matchScore: 0
              };

              const healing = SelfHealingEngine.healRow(matchedRow);
              const rowConf = ConfidenceEngine.scoreRow(healing.healedRow);
              const isRowHealed = row.isHealed || healing.healingResult.isModified;
              if (isRowHealed) healedCount++;

              return {
                ...healing.healedRow,
                isHealed: isRowHealed,
                healingExplanations: [
                  ...(row.healingExplanations || []),
                  ...healing.healingResult.explanations
                ],
                fieldConfidence: {
                  productName: { score: rowConf.productNameConfidence.score, level: rowConf.productNameConfidence.level, reasons: rowConf.productNameConfidence.reasons },
                  quantity: { score: rowConf.quantityConfidence.score, level: rowConf.quantityConfidence.level, reasons: rowConf.quantityConfidence.reasons },
                  unitPrice: { score: rowConf.unitPriceConfidence.score, level: rowConf.unitPriceConfidence.level, reasons: rowConf.unitPriceConfidence.reasons },
                  total: { score: rowConf.totalConfidence.score, level: rowConf.totalConfidence.level, reasons: rowConf.totalConfidence.reasons },
                  expiryDate: { score: rowConf.expiryDateConfidence.score, level: rowConf.expiryDateConfidence.level, reasons: rowConf.expiryDateConfidence.reasons },
                  barcode: { score: rowConf.barcodeConfidence.score, level: rowConf.barcodeConfidence.level, reasons: rowConf.barcodeConfidence.reasons },
                  batchNumber: { score: rowConf.batchNumberConfidence.score, level: rowConf.batchNumberConfidence.level, reasons: rowConf.batchNumberConfidence.reasons }
                }
              };
            });

            this.terminate();
            resolve({
              enrichedRows: finalEnrichedRows,
              healedCount,
              workerUsed: true,
              durationMs: msg.durationMs
            });
          }
        };

        this.activeWorker.onerror = (err) => {
          this.terminate();
          reject(err);
        };

        // Post without secrets
        this.activeWorker.postMessage({
          type: 'PROCESS_BATCH',
          rows: payload.rows,
          products: payload.products,
          learnedAliases: payload.learnedAliases || {}
        });

      } catch (err) {
        this.terminate();
        reject(err);
      }
    });
  }

  /**
   * Fallback executing chunked processing safely on main thread
   */
  private async executeInMainThreadFallback(
    payload: WorkerBatchTaskPayload,
    options: {
      abortSignal?: AbortSignal;
      onProgress?: (processed: number, total: number, percent: number) => void;
    }
  ): Promise<WorkerBatchTaskResult> {
    const startTime = Date.now();
    const index = new ProductMatchingIndex(payload.products);
    let healedCount = 0;

    const enrichedRows = await ChunkedProcessor.processInChunks(
      payload.rows,
      (row) => {
        const candidate = index.matchRow(row, payload.learnedAliases);
        let matchedRow: ExtractedImportRow;

        if (candidate) {
          matchedRow = {
            ...row,
            matchedProductId: candidate.product.id,
            matchedProductName: candidate.product.name || candidate.product.Name,
            matchType: candidate.matchType,
            matchScore: candidate.score,
            isNewProductCandidate: false
          };
        } else {
          matchedRow = {
            ...row,
            matchedProductId: undefined,
            matchedProductName: undefined,
            matchType: 'NONE',
            matchScore: 0,
            isNewProductCandidate: true,
            validationIssues: [
              ...row.validationIssues,
              'صنف جديد غير مسجل في قاعدة البيانات الحالية'
            ]
          };
        }

        const healing = SelfHealingEngine.healRow(matchedRow);
        const rowConf = ConfidenceEngine.scoreRow(healing.healedRow);

        const isRowHealed = row.isHealed || healing.healingResult.isModified;
        if (isRowHealed) {
          healedCount++;
        }

        return {
          ...healing.healedRow,
          isHealed: isRowHealed,
          healingExplanations: [
            ...(row.healingExplanations || []),
            ...healing.healingResult.explanations
          ],
          fieldConfidence: {
            productName: { score: rowConf.productNameConfidence.score, level: rowConf.productNameConfidence.level, reasons: rowConf.productNameConfidence.reasons },
            quantity: { score: rowConf.quantityConfidence.score, level: rowConf.quantityConfidence.level, reasons: rowConf.quantityConfidence.reasons },
            unitPrice: { score: rowConf.unitPriceConfidence.score, level: rowConf.unitPriceConfidence.level, reasons: rowConf.unitPriceConfidence.reasons },
            total: { score: rowConf.totalConfidence.score, level: rowConf.totalConfidence.level, reasons: rowConf.totalConfidence.reasons },
            expiryDate: { score: rowConf.expiryDateConfidence.score, level: rowConf.expiryDateConfidence.level, reasons: rowConf.expiryDateConfidence.reasons },
            barcode: { score: rowConf.barcodeConfidence.score, level: rowConf.barcodeConfidence.level, reasons: rowConf.barcodeConfidence.reasons },
            batchNumber: { score: rowConf.batchNumberConfidence.score, level: rowConf.batchNumberConfidence.level, reasons: rowConf.batchNumberConfidence.reasons }
          }
        };
      },
      {
        chunkSize: payload.chunkSize || 150,
        abortSignal: options.abortSignal,
        onProgress: (proc, total, pct) => options.onProgress?.(proc, total, pct)
      }
    );

    return {
      enrichedRows,
      healedCount,
      workerUsed: false,
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Cleanly terminates active worker and revokes blob URL
   */
  terminate(): void {
    if (this.activeWorker) {
      try {
        this.activeWorker.terminate();
      } catch {
        // Ignore
      }
      this.activeWorker = null;
    }

    if (this.workerBlobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(this.workerBlobUrl);
      } catch {
        // Ignore
      }
      this.workerBlobUrl = null;
    }
  }
}
