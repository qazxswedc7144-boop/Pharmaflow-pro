// src/features/purchases/services/smartImport/providers/aiExtractionProvider.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Resilient AI Extraction Provider with Image Optimization & Circuit Breaker
 */

import { 
  IDocumentExtractionProvider, 
  ExtractionProviderResult, 
  ProviderHealthStatus, 
  ExtractionProviderType 
} from './provider.types';
import { 
  ImportParseContext, 
  ImportSourceType, 
  CanonicalImportDocument, 
  CanonicalImportTable, 
  CanonicalImportRawRow 
} from '../types';
import { CircuitBreaker } from './circuitBreaker';
import { RateLimiter } from './rateLimiter';
import { ImageOptimizer } from '../performance/imageOptimizer';

export class AiExtractionProvider implements IDocumentExtractionProvider {
  public readonly name = 'GeminiAiExtractionEngine';
  public readonly type: ExtractionProviderType = 'AI';
  
  private circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 15000
  });

  private rateLimiter = new RateLimiter({
    minIntervalMs: 1200,
    maxRetries: 1,
    initialBackoffMs: 800
  });

  public get healthStatus(): ProviderHealthStatus {
    return this.circuitBreaker.getHealthStatus();
  }

  public set healthStatus(status: ProviderHealthStatus) {
    if (status === 'CIRCUIT_OPEN') {
      this.circuitBreaker.recordFailure();
    }
  }

  public canExtract(_file: File | string, sourceType: ImportSourceType): boolean {
    return (
      sourceType === 'IMAGE' ||
      sourceType === 'CAMERA' ||
      sourceType === 'PDF' ||
      sourceType === 'PDF_SCANNED' ||
      sourceType === 'TXT'
    );
  }

  public async extract(
    file: File | string, 
    context: ImportParseContext
  ): Promise<ExtractionProviderResult> {
    const startTime = Date.now();
    const { onProgress, signal } = context;

    // Check circuit breaker first
    if (this.circuitBreaker.isOpen()) {
      throw new Error('قاطع الدائرة (Circuit Breaker) مفتوح بسبب أخطاء متكررة في خادم الذكاء الاصطناعي. تم التحويل الاحتياطي.');
    }

    onProgress?.(40, 'جاري تحسين الصورة والتواصل مع نموذج الذكاء الاصطناعي...');

    try {
      // 1. Image Optimization & Smart Downscaling if image
      let processedFile: File | string = file;
      try {
        if (
          (typeof file === 'string' && file.startsWith('data:image/')) ||
          (file instanceof File && file.type.startsWith('image/'))
        ) {
          const opt = await ImageOptimizer.optimizeForOcr(file, { maxDimension: 2048, targetQuality: 0.90 });
          if (opt.isDownscaled) {
            processedFile = opt.dataUrl;
          }
        }
      } catch (optErr) {
        console.warn('[AiExtractionProvider] Image optimization skipped, using raw file:', optErr);
      }

      // 2. Execute with timeout and rate limiter
      const result = await this.rateLimiter.executeWithRetry(async () => {
        // Create an AbortController with 15 second timeout to prevent UI freeze
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => {
          timeoutController.abort();
        }, 15000);

        const combinedSignal = signal || timeoutController.signal;

        try {
          // Dynamic import to keep boundaries clean
          const { processInvoice } = await import('@/services/data/smartImportEngine');
          
          if (combinedSignal.aborted) {
            throw new Error('تم إلغاء عملية الذكاء الاصطناعي بسبب انتهاء المهلة المحددة (Timeout).');
          }

          const parsed = await processInvoice(processedFile);
          clearTimeout(timeoutId);
          return parsed;
        } catch (callErr: any) {
          clearTimeout(timeoutId);
          if (combinedSignal.aborted || callErr?.name === 'AbortError') {
            throw new Error('انتهت مهلة استجابة نموذج الذكاء الاصطناعي (AI Timeout: 15s).');
          }
          throw callErr;
        }
      });

      this.circuitBreaker.recordSuccess();

      const executionTimeMs = Date.now() - startTime;

      const rawRows: CanonicalImportRawRow[] = (result.items || []).map((item, idx) => {
        const q = Number(item.quantity || 1);
        const p = Number(item.price || 0);
        const disc = Number(item.discountPercent || 0);
        const calculatedTotal = disc > 0 ? (q * p) * (1 - disc / 100) : (q * p);

        return {
          sourceRowIndex: idx + 1,
          cells: {
            productName: item.name || '',
            quantity: q > 0 ? q : 1,
            unitPrice: p,
            total: calculatedTotal,
            expiryDate: item.expiryDate,
            batchNumber: item.batchNumber,
            discount: disc,
            barcode: item.barcode,
            bonusQty: item.bonusQty,
            unit: item.unit,
            notes: item.notes
          },
          rawCells: [
            item.name,
            q,
            p,
            calculatedTotal,
            item.expiryDate,
            item.batchNumber,
            item.barcode
          ],
          sourceReference: { row: idx + 1 }
        };
      });

      const table: CanonicalImportTable = {
        id: `ai-tbl-${Date.now()}`,
        sourceIndex: 0,
        name: 'AI_Extracted_Items',
        headers: ['اسم الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'الصلاحية', 'التشغيلة', 'الباركود'],
        rows: rawRows,
        confidence: 0.90,
        isPrimaryInvoiceTable: true
      };

      const canonicalDoc: CanonicalImportDocument = {
        id: `can-ai-${Date.now()}`,
        source: {
          type: 'IMAGE',
          fileName: file instanceof File ? file.name : 'ai_scan.png',
          size: file instanceof File ? file.size : 0
        },
        metadata: {
          extractionMethod: 'AI_DOCUMENT',
          extractedAt: new Date().toISOString(),
          parserVersion: '2.6.0',
          confidence: 0.90
        },
        documentFields: {
          supplierName: result.supplier,
          invoiceNumber: result.invoice_number,
          invoiceDate: result.date,
          notes: result.notes
        },
        tables: [table],
        warnings: [],
        diagnostics: []
      };

      return {
        canonicalDoc,
        providerType: this.type,
        providerName: this.name,
        executionTimeMs,
        rawText: result.notes,
        diagnostics: [],
        confidence: 0.90,
        isFallbackUsed: false
      };
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      // Sanitized error without leaking API keys
      const safeErrorMsg = err?.message?.replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=***') || 'خطأ في معالجة الذكاء الاصطناعي';
      throw new Error(`تعذر استكمال استخراج AI: ${safeErrorMsg}`);
    }
  }

  public resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}
