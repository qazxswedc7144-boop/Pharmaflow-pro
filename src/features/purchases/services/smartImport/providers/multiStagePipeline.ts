// src/features/purchases/services/smartImport/providers/multiStagePipeline.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Multi-Stage Extraction Pipeline (Parse -> OCR -> AI -> Self-Healing -> Confidence Scoring)
 */

import { 
  ExtractionProviderResult, 
  ExtractionProviderType 
} from './provider.types';
import { 
  ImportParseContext, 
  ImportSourceType, 
  CanonicalImportDocument, 
  ExtractedImportRow, 
  ImportSummary 
} from '../types';
import { SourceDetector } from '../sourceDetector';
import { ProviderRegistry } from './providerRegistry';
import { ExtractionCacheService } from '../cache/extractionCacheService';
import { SelfHealingEngine } from '../selfHealing/selfHealingEngine';
import { ConfidenceEngine } from '../confidence/confidenceEngine';
import { DocumentConfidenceReport } from '../confidence/confidence.types';

export interface MultiStageExtractionOptions extends ImportParseContext {
  forceReprocess?: boolean;
  minConfidenceThreshold?: number; // default 0.80
}

export interface MultiStageExtractionResult {
  canonicalDoc: CanonicalImportDocument;
  activeProvider: ExtractionProviderType;
  activeProviderName: string;
  isCached: boolean;
  isFallbackUsed: boolean;
  fallbackReason?: string;
  healingSummary: {
    healedRowCount: number;
    healedFieldCount: number;
    details: string[];
  };
  confidenceReport: DocumentConfidenceReport;
  executionTimeMs: number;
}

export class MultiStagePipeline {
  /**
   * Executes complete resilient multi-stage extraction pipeline
   */
  public static async execute(
    file: File | string,
    options: MultiStageExtractionOptions
  ): Promise<MultiStageExtractionResult> {
    const pipelineStartTime = Date.now();
    const { tenantId, branchId, onProgress, forceReprocess } = options;

    // Step 1: Detect Source Type
    onProgress?.(10, 'جاري فحص مصدر وصيغة المستند...');
    const validation = SourceDetector.validateFile(file);
    const sourceType: ImportSourceType = validation.sourceType;

    // Step 2: Check Tenant-Scoped Cache
    if (!forceReprocess) {
      onProgress?.(15, 'جاري التحقق من الذاكرة المؤقتة للمستندات...');
      const cached = await ExtractionCacheService.getCachedDocument(file, {
        tenantId,
        branchId,
        forceReprocess
      });

      if (cached) {
        onProgress?.(100, 'تم استرجاع بيانات المستند من الذاكرة المؤقتة المعزولة!');
        const cachedDoc = cached.document;

        // Re-score confidence
        const rows = this.extractRowsFromCanonicalDoc(cachedDoc);
        const summary = this.buildSummaryFromCanonicalDoc(cachedDoc, rows);
        const confidenceReport = ConfidenceEngine.scoreDocument(summary, rows);

        return {
          canonicalDoc: cachedDoc,
          activeProvider: (cachedDoc.metadata.extractionMethod === 'AI_DOCUMENT' ? 'AI' : (cachedDoc.metadata.extractionMethod === 'OCR' ? 'OCR' : 'LOCAL_PARSER')),
          activeProviderName: `Cached [${cached.providerName}]`,
          isCached: true,
          isFallbackUsed: false,
          healingSummary: { healedRowCount: 0, healedFieldCount: 0, details: ['تم استرجاع النتيجة من الكاش المعزول'] },
          confidenceReport,
          executionTimeMs: Date.now() - pipelineStartTime
        };
      }
    }

    // Step 3: Multi-Stage Provider Execution
    let extractionResult: ExtractionProviderResult | null = null;
    let lastProviderError: any = null;

    // Stage A: Deterministic Local Parser
    const localParser = ProviderRegistry.getProvider('LOCAL_PARSER');
    if (localParser.canExtract(file, sourceType)) {
      try {
        onProgress?.(25, 'جاري القراءة المباشرة والتحليل الحتمي للجداول بدون ذكاء اصطناعي...');
        const res = await localParser.extract(file, options);
        // If local parser extracted items with good confidence, use it immediately
        if (res.canonicalDoc.tables.length > 0 && (res.canonicalDoc.tables[0]?.rows?.length ?? 0) > 0) {
          extractionResult = res;
        }
      } catch (err: any) {
        lastProviderError = err;
        console.warn('[MultiStagePipeline] Local parser failed or not applicable, advancing to next stage:', err.message);
      }
    }

    // Stage B: Local OCR Provider
    if (!extractionResult) {
      const localOcr = ProviderRegistry.getProvider('OCR');
      if (localOcr.canExtract(file, sourceType)) {
        try {
          onProgress?.(40, 'جاري تشغيل محرك OCR للتعرف على محتويات الفاتورة...');
          const res = await localOcr.extract(file, options);
          if (res.canonicalDoc.tables.length > 0 && (res.canonicalDoc.tables[0]?.rows?.length ?? 0) > 0) {
            extractionResult = res;
          }
        } catch (err: any) {
          lastProviderError = err;
          console.warn('[MultiStagePipeline] Local OCR failed, advancing to AI stage:', err.message);
        }
      }
    }

    // Stage C: AI Extraction Provider (Gemini API)
    if (!extractionResult) {
      const aiProvider = ProviderRegistry.getProvider('AI');
      if (aiProvider.canExtract(file, sourceType) && aiProvider.healthStatus !== 'CIRCUIT_OPEN') {
        try {
          onProgress?.(55, 'جاري استخدام نموذج الذكاء الاصطناعي لاستخراج وتحليل بيانات الفاتورة...');
          const res = await aiProvider.extract(file, options);
          if (res.canonicalDoc.tables.length > 0 && (res.canonicalDoc.tables[0]?.rows?.length ?? 0) > 0) {
            extractionResult = res;
          }
        } catch (err: any) {
          lastProviderError = err;
          console.warn('[MultiStagePipeline] AI extraction failed, falling back to safe backup engine:', err.message);
        }
      }
    }

    // Stage D: Fallback Provider (Guaranteed safe fallback)
    if (!extractionResult) {
      onProgress?.(70, 'جاري تشغيل المحرك الاحتياطي لضمان استمرار عملية الاستيراد...');
      const fallbackProvider = ProviderRegistry.getProvider('FALLBACK');
      extractionResult = await fallbackProvider.extract(file, options);
      if (lastProviderError) {
        extractionResult.fallbackReason = lastProviderError?.message || 'تعذر المعالجة بالمحركات الأساسية';
      }
    }

    // Step 4: Field-Level Self-Healing & Cross-Validation
    onProgress?.(85, 'جاري فحص وتطهير الحقول ومعالجة الحسابات ذاتياً (Self-Healing)...');
    const rawRows = this.extractRowsFromCanonicalDoc(extractionResult.canonicalDoc);
    const healedRows: ExtractedImportRow[] = [];
    const healingDetails: string[] = [];
    let healedRowCount = 0;
    let healedFieldCount = 0;

    for (const r of rawRows) {
      const healingRes = SelfHealingEngine.healRow(r);
      const isHealed = r.isHealed || healingRes.healingResult.isModified;
      healedRows.push({
        ...healingRes.healedRow,
        isHealed,
        healingExplanations: [
          ...(r.healingExplanations || []),
          ...healingRes.healingResult.explanations
        ]
      });
      if (isHealed) {
        healedRowCount++;
        healedFieldCount += healingRes.healingResult.healedFields.length;
        healingDetails.push(...healingRes.healingResult.explanations);
      }
    }

    // Update table rows in canonical document with healed data
    if (extractionResult.canonicalDoc.tables.length > 0 && extractionResult.canonicalDoc.tables[0]) {
      extractionResult.canonicalDoc.tables[0].rows = healedRows.map(hr => ({
        sourceRowIndex: hr.rowNumber,
        cells: {
          productName: hr.productName,
          quantity: hr.quantity,
          unitPrice: hr.unitPrice,
          total: hr.total,
          expiryDate: hr.expiryDate,
          batchNumber: hr.batchNumber,
          barcode: hr.barcode,
          productCode: hr.productCode,
          bonusQty: hr.bonusQty,
          discount: hr.discountPercent,
          isHealed: hr.isHealed,
          healingExplanations: hr.healingExplanations
        },
        rawCells: [
          hr.productCode,
          hr.productName,
          hr.quantity,
          hr.unitPrice,
          hr.total,
          hr.expiryDate,
          hr.batchNumber,
          hr.barcode
        ]
      }));
    }

    // Step 5: Multi-Field Confidence Scoring
    onProgress?.(95, 'جاري حساب مستويات الثقة لكل حقل وصنف...');
    const summary = this.buildSummaryFromCanonicalDoc(extractionResult.canonicalDoc, healedRows);
    const confidenceReport = ConfidenceEngine.scoreDocument(summary, healedRows);

    // Step 6: Save to Isolated Cache
    await ExtractionCacheService.saveCachedDocument(file, extractionResult.canonicalDoc, {
      tenantId,
      branchId,
      providerName: extractionResult.providerName,
      confidence: confidenceReport.overallScore
    });

    onProgress?.(100, 'اكتملت المعالجة بنجاح!');

    return {
      canonicalDoc: extractionResult.canonicalDoc,
      activeProvider: extractionResult.providerType,
      activeProviderName: extractionResult.providerName,
      isCached: false,
      isFallbackUsed: extractionResult.isFallbackUsed || false,
      fallbackReason: extractionResult.fallbackReason,
      healingSummary: {
        healedRowCount,
        healedFieldCount,
        details: healingDetails
      },
      confidenceReport,
      executionTimeMs: Date.now() - pipelineStartTime
    };
  }

  /**
   * Helper: converts canonical document table rows into ExtractedImportRow array
   */
  public static extractRowsFromCanonicalDoc(doc: CanonicalImportDocument): ExtractedImportRow[] {
    const table = doc.tables.find(t => t.isPrimaryInvoiceTable) || doc.tables[0];
    if (!table) return [];

    return table.rows.map((row, idx) => {
      const c = row.cells || {};
      const q = typeof c.quantity === 'number' ? c.quantity : Number(c.quantity || 1);
      const p = typeof c.unitPrice === 'number' ? c.unitPrice : Number(c.unitPrice || 0);
      const t = typeof c.total === 'number' ? c.total : (c.total !== undefined && c.total !== null && String(c.total).trim() !== '' ? Number(c.total) : undefined);
      const isHealed = c.isHealed === true;
      const healingExplanations = Array.isArray(c.healingExplanations) 
        ? (c.healingExplanations as string[]) 
        : (Array.isArray(c.healingNotes) ? (c.healingNotes as string[]) : undefined);

      return {
        rowNumber: idx + 1,
        rawCells: (row.rawCells as any) || {},
        productName: String(c.productName || '').trim(),
        quantity: q > 0 ? q : 1,
        unitPrice: p >= 0 ? p : 0,
        total: t,
        expiryDate: c.expiryDate ? String(c.expiryDate).trim() : undefined,
        batchNumber: c.batchNumber ? String(c.batchNumber).trim() : undefined,
        barcode: c.barcode ? String(c.barcode).trim() : undefined,
        productCode: c.productCode ? String(c.productCode).trim() : undefined,
        bonusQty: typeof c.bonusQty === 'number' ? c.bonusQty : (c.bonusQty ? Number(c.bonusQty) : undefined),
        discountPercent: typeof c.discount === 'number' ? c.discount : (c.discount ? Number(c.discount) : 0),
        status: 'VALID',
        validationIssues: [],
        isHealed,
        healingExplanations
      };
    });
  }

  /**
   * Helper: constructs ImportSummary from canonical doc and rows
   */
  public static buildSummaryFromCanonicalDoc(
    doc: CanonicalImportDocument,
    rows: ExtractedImportRow[]
  ): ImportSummary {
    const totalAmount = rows.reduce((acc, r) => acc + (r.total || (r.quantity * r.unitPrice)), 0);

    return {
      totalRowsDetected: rows.length,
      validRowsCount: rows.length,
      reviewRequiredCount: 0,
      skippedRowsCount: 0,
      newProductCandidatesCount: 0,
      duplicateCandidatesCount: 0,
      totalInvoiceAmount: Number(totalAmount.toFixed(2)),
      detectedSupplier: doc.documentFields.supplierName,
      detectedInvoiceNumber: doc.documentFields.invoiceNumber,
      detectedDate: doc.documentFields.invoiceDate
    };
  }
}
