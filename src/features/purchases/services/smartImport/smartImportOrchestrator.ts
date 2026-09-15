// src/features/purchases/services/smartImport/smartImportOrchestrator.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Smart Import Performance & Large File Hardening Orchestrator
 */

import { SourceDetector } from './sourceDetector';
import { SpreadsheetParser } from './spreadsheetParser';
import { ColumnIntelligence } from './columnIntelligence';
import { DataValidator } from './dataValidator';
import { ProductMatchingEngine } from './productMatchingEngine';
import { ParserRegistry } from './parsers';
import { MultiStagePipeline } from './providers/multiStagePipeline';
import { ConfidenceEngine } from './confidence/confidenceEngine';
import { 
  ImportAnalysisResult, 
  ExtractedImportRow, 
  ColumnDefinition, 
  TargetField, 
  SmartImportProgressCallback,
  CanonicalImportDocument
} from './types';
import { authService } from '@features/auth/services/authService';
import { auditLogService } from '@/services/audit/auditLog';
import { Product, InvoiceItem } from '@/types';
import { normalizeToISODate } from '@/utils/expiryUtils';
import { ImportLimitEnforcer } from './performance/importLimits';
import { SmartImportWorkerBridge } from './performance/workerBridge';
import { ImportTelemetry } from './performance/importTelemetry';

export interface SmartImportAnalysisOptions {
  tenantId?: string;
  branchId?: string;
  products?: Product[];
  onProgress?: SmartImportProgressCallback;
  forceReprocess?: boolean;
  abortSignal?: AbortSignal;
  learnedAliases?: Record<string, string>;
  chunkSize?: number;
}

export class SmartImportOrchestrator {
  /**
   * Alias for analyzeInvoice
   */
  static async analyzeFile(
    file: File | string,
    options: SmartImportAnalysisOptions = {}
  ): Promise<ImportAnalysisResult> {
    return this.analyzeInvoice(file, options);
  }

  /**
   * Main pipeline entry point: analyzes uploaded invoice file, DOCX, spreadsheet, PDF, or camera capture
   */
  static async analyzeInvoice(
    file: File | string,
    options: SmartImportAnalysisOptions = {}
  ): Promise<ImportAnalysisResult> {
    const startTime = Date.now();
    let parseTimeMs = 0;
    let matchingTimeMs = 0;
    let confidenceTimeMs = 0;
    let aiTimeMs = 0;

    const { onProgress, forceReprocess, abortSignal, learnedAliases, chunkSize } = options;

    if (abortSignal?.aborted) {
      const err = new Error('تم إلغاء عملية الاستيراد بناءً على طلب المستخدم.');
      err.name = 'AbortError';
      throw err;
    }

    const user = authService.getCurrentUser();
    const tenantId = options.tenantId || (user as any)?.tenantId || 'DEFAULT_TENANT';
    const branchId = options.branchId || (user as any)?.branchId || 'WH-MAIN';
    const userId = user?.User_Email || user?.id || 'SYSTEM_USER';

    // 1. Source Detection & Early Limits Enforcement
    onProgress?.('DETECTING_SOURCE', 10, 'جاري فحص مصدر وصيغة المستند ومطابقة الحدود...');
    const validation = SourceDetector.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.errorMessage || 'ملف غير مدعوم');
    }

    await auditLogService.log({
      table: 'purchases',
      action: 'SMART_IMPORT_STARTED',
      entityId: `IMP-${Date.now()}`,
      newData: { fileName: validation.fileName, sourceType: validation.sourceType, size: validation.fileSize },
      details: `Smart Import started for source ${validation.sourceType} (${validation.fileName})`
    });

    // 2. Multi-Stage Pipeline Execution (with Yielding & Signal)
    const parseStart = Date.now();
    const pipelineResult = await MultiStagePipeline.execute(file, {
      tenantId,
      branchId,
      userId,
      forceReprocess,
      signal: abortSignal,
      onProgress: (pct, msg) => {
        const stage = pct < 30 ? 'PARSING_DOCUMENT' : pct < 60 ? 'DETECTING_COLUMNS' : 'EXTRACTING_ROWS';
        onProgress?.(stage, pct, msg);
      }
    });
    parseTimeMs = Date.now() - parseStart;
    if (pipelineResult.activeProvider === 'AI') {
      aiTimeMs = pipelineResult.executionTimeMs;
    }

    const canonicalDoc = pipelineResult.canonicalDoc;
    const detectedSupplier = canonicalDoc.documentFields.supplierName;
    const detectedInvoiceNumber = canonicalDoc.documentFields.invoiceNumber;
    const detectedDate = canonicalDoc.documentFields.invoiceDate;
    const rawText = canonicalDoc.documentFields.notes || '';

    let detectedColumns: ColumnDefinition[] = [];
    let headerRowIndex = 0;
    let rawExtractedRows: Partial<ExtractedImportRow>[] = [];

    // Parse columns from canonical document
    const primaryTable = canonicalDoc.tables.find(t => t.isPrimaryInvoiceTable) || canonicalDoc.tables[0];
    if (primaryTable && primaryTable.headers && primaryTable.headers.length > 0) {
      const sampleValues = primaryTable.rows.slice(0, 5).map(r => r.rawCells?.map(c => String(c || '')) || []);
      const samplesByCol: string[][] = primaryTable.headers.map((_, colIdx) => 
        sampleValues.map(row => row[colIdx] || '').filter(Boolean)
      );
      detectedColumns = ColumnIntelligence.analyzeHeaders(primaryTable.headers, samplesByCol);
    } else {
      detectedColumns = [
        { index: 0, rawHeader: 'اسم الصنف', normalizedHeader: 'اسم الصنف', mappedField: 'productName', confidence: 99, isAutoMapped: true, sampleValues: [] },
        { index: 1, rawHeader: 'الكمية', normalizedHeader: 'الكمية', mappedField: 'quantity', confidence: 98, isAutoMapped: true, sampleValues: [] },
        { index: 2, rawHeader: 'سعر الوحدة', normalizedHeader: 'سعر الوحدة', mappedField: 'unitPrice', confidence: 96, isAutoMapped: true, sampleValues: [] },
        { index: 3, rawHeader: 'الإجمالي', normalizedHeader: 'الإجمالي', mappedField: 'total', confidence: 95, isAutoMapped: true, sampleValues: [] },
        { index: 4, rawHeader: 'الصلاحية', normalizedHeader: 'الصلاحية', mappedField: 'expiryDate', confidence: 90, isAutoMapped: true, sampleValues: [] },
        { index: 5, rawHeader: 'التشغيلة', normalizedHeader: 'التشغيلة', mappedField: 'batchNumber', confidence: 90, isAutoMapped: true, sampleValues: [] }
      ];
    }

    rawExtractedRows = MultiStagePipeline.extractRowsFromCanonicalDoc(canonicalDoc);

    if (rawExtractedRows.length === 0) {
      throw new Error('لم يتم العثور على أي أصناف مقروءة في المستند.');
    }

    // Enterprise Row Limit Enforcement
    const rowCheck = ImportLimitEnforcer.validateRowCount(validation.sourceType, rawExtractedRows.length);
    if (!rowCheck.isAllowed) {
      throw new Error(rowCheck.errorMessage || 'تجاوز عدد الأسطر الحد الأقصى المسموح به.');
    }

    // 3. Load Scoped Database Products (Tenant & Branch Isolated)
    onProgress?.('MATCHING_PRODUCTS', 70, 'جاري تحميل دليل الأدوية والمخزون المعزول...');
    const dbProducts = options.products && options.products.length > 0 
      ? options.products 
      : await ProductMatchingEngine.loadScopedProducts(tenantId, branchId);
    
    // 4. Data Validation & Math Verification
    onProgress?.('VALIDATING_DATA', 78, 'جاري التحقق الحسابي الأولي...');
    const seenItemsMap = new Map<string, number>();
    const validatedRows: ExtractedImportRow[] = rawExtractedRows.map((rawRow, idx) => {
      return DataValidator.validateRow(rawRow, idx + 1, seenItemsMap);
    });

    // 5. Worker Bridge / Chunked Batch Processing for Matching, Healing & Confidence Scoring
    onProgress?.('MATCHING_PRODUCTS', 85, 'جاري مطابقة الأصناف والاستشفاء الذاتي وحساب الثقة...');
    const matchStart = Date.now();
    const workerBridge = new SmartImportWorkerBridge();
    
    let workerResult;
    try {
      workerResult = await workerBridge.processBatch(
        {
          rows: validatedRows,
          products: dbProducts,
          learnedAliases: learnedAliases || {},
          chunkSize: chunkSize || 150
        },
        {
          abortSignal,
          onProgress: (proc, total, pct) => {
            const mappedPct = 85 + Math.round((pct / 100) * 12);
            onProgress?.('MATCHING_PRODUCTS', mappedPct, `جاري معالجة الأصناف (${proc}/${total})...`);
          }
        }
      );
    } finally {
      workerBridge.terminate();
    }

    matchingTimeMs = Date.now() - matchStart;
    const finalEnrichedRows: ExtractedImportRow[] = workerResult.enrichedRows;
    const healedCount = workerResult.healedCount;

    // 6. Compute Final Summaries & Overall Confidence
    const confStart = Date.now();
    const summary = DataValidator.generateSummary(finalEnrichedRows);
    summary.detectedSupplier = detectedSupplier;
    summary.detectedInvoiceNumber = detectedInvoiceNumber;
    summary.detectedDate = detectedDate;

    const docConfidence = ConfidenceEngine.scoreDocument(summary, finalEnrichedRows);
    summary.confidenceScore = docConfidence.overallScore;
    summary.confidenceLevel = docConfidence.overallLevel;
    summary.healedRowsCount = healedCount;
    summary.providerName = pipelineResult.activeProviderName;
    summary.isFallbackActive = pipelineResult.isFallbackUsed;
    summary.isWorkerUsed = workerResult.workerUsed;
    confidenceTimeMs = Date.now() - confStart;

    onProgress?.('READY_FOR_REVIEW', 100, 'اكتمل التحليل الذكي بنجاح ومركز القرارات جاهز!');

    const totalProcessingTimeMs = Date.now() - startTime;

    // 7. Sanitize & Record Telemetry Benchmark
    const performanceMetrics = {
      sourceType: validation.sourceType,
      fileName: validation.fileName,
      fileSize: validation.fileSize,
      totalRows: finalEnrichedRows.length,
      parseTimeMs,
      matchingTimeMs,
      confidenceTimeMs,
      aiTimeMs,
      totalTimeMs: totalProcessingTimeMs,
      cacheHit: Boolean(pipelineResult.isCached),
      workerUsed: Boolean(workerResult.workerUsed),
      healedRowsCount: healedCount,
      tenantId,
      branchId
    };

    await ImportTelemetry.recordImportBenchmark(performanceMetrics);

    await auditLogService.log({
      table: 'purchases',
      action: 'SMART_IMPORT_ANALYZED',
      entityId: `IMP-${Date.now()}`,
      newData: {
        totalRows: finalEnrichedRows.length,
        validRows: summary.validRowsCount,
        newProducts: summary.newProductCandidatesCount,
        totalAmount: summary.totalInvoiceAmount,
        provider: pipelineResult.activeProviderName,
        confidence: docConfidence.overallScore,
        healedRows: healedCount,
        isCached: pipelineResult.isCached,
        isWorkerUsed: workerResult.workerUsed,
        processingTimeMs: totalProcessingTimeMs
      },
      details: `Smart Import analyzed: ${finalEnrichedRows.length} rows (${totalProcessingTimeMs}ms, Worker: ${workerResult.workerUsed}) via ${pipelineResult.activeProviderName}`
    });

    return {
      sourceType: validation.sourceType,
      fileName: validation.fileName,
      fileSize: validation.fileSize,
      detectedColumns,
      headerRowIndex,
      rows: finalEnrichedRows,
      summary,
      rawText,
      confidenceReport: docConfidence,
      healingSummary: pipelineResult.healingSummary,
      metadata: {
        tenantId,
        branchId,
        userId,
        analyzedAt: new Date().toISOString(),
        processingTimeMs: totalProcessingTimeMs,
        providerType: pipelineResult.activeProvider,
        providerName: pipelineResult.activeProviderName,
        isCached: pipelineResult.isCached,
        isFallbackUsed: pipelineResult.isFallbackUsed,
        fallbackReason: pipelineResult.fallbackReason,
        parserVersion: '2.6.0',
        isWorkerUsed: workerResult.workerUsed,
        performanceMetrics: {
          parseTimeMs,
          matchingTimeMs,
          confidenceTimeMs,
          aiTimeMs,
          totalTimeMs: totalProcessingTimeMs,
          totalRows: finalEnrichedRows.length,
          cacheHit: Boolean(pipelineResult.isCached),
          workerUsed: Boolean(workerResult.workerUsed)
        }
      }
    };
  }

  /**
   * Universal method to analyze and parse a file into CanonicalImportDocument
   */
  static async parseToCanonicalDocument(
    file: File | string,
    options: {
      tenantId?: string;
      branchId?: string;
      onProgress?: (percent: number, message: string) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<CanonicalImportDocument> {
    const user = authService.getCurrentUser();
    const tenantId = options.tenantId || (user as any)?.tenantId || 'DEFAULT_TENANT';
    const branchId = options.branchId || (user as any)?.branchId || 'WH-MAIN';
    const userId = user?.User_Email || user?.id || 'SYSTEM_USER';

    const validation = SourceDetector.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.errorMessage || 'ملف غير مدعوم');
    }

    const parser = ParserRegistry.getParser(file, validation.sourceType);
    return await parser.parse(file, {
      tenantId,
      branchId,
      userId,
      onProgress: options.onProgress,
      signal: options.signal
    });
  }

  /**
   * Extracts raw items from spreadsheet grid using the given column definitions
   */
  static extractRowsFromGrid(
    grid: string[][],
    headerRowIndex: number,
    columnDefs: ColumnDefinition[]
  ): Partial<ExtractedImportRow>[] {
    const rows: Partial<ExtractedImportRow>[] = [];
    const colMap = new Map<TargetField, number>();

    columnDefs.forEach(def => {
      if (def.mappedField !== 'ignore') {
        colMap.set(def.mappedField, def.index);
      }
    });

    const nameIdx = colMap.get('productName') ?? -1;
    const qtyIdx = colMap.get('quantity') ?? -1;
    const priceIdx = colMap.get('unitPrice') ?? -1;
    const totalIdx = colMap.get('total') ?? -1;
    const batchIdx = colMap.get('batchNumber') ?? -1;
    const expIdx = colMap.get('expiryDate') ?? -1;
    const discIdx = colMap.get('discount') ?? -1;
    const taxIdx = colMap.get('tax') ?? -1;
    const barcodeIdx = colMap.get('barcode') ?? -1;
    const codeIdx = colMap.get('productCode') ?? -1;
    const bonusIdx = colMap.get('bonusQty') ?? -1;
    const unitIdx = colMap.get('unit') ?? -1;
    const noteIdx = colMap.get('notes') ?? -1;

    for (let r = headerRowIndex + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      // Filter footer / summary rows
      if (SpreadsheetParser.isFooterOrSummaryRow(row)) {
        continue;
      }

      // Raw cells map
      const rawCells: Record<string, string> = {};
      row.forEach((cell, idx) => {
        const headerName = columnDefs[idx]?.rawHeader || `Col_${idx + 1}`;
        rawCells[headerName] = cell || '';
      });

      // Extract Name
      let productName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
      if (!productName) {
        // Fallback: pick first cell that has text length > 2 and is not a pure number
        const fallbackCell = row.find(c => typeof c === 'string' && c.trim().length > 2 && isNaN(Number(c)));
        if (fallbackCell) productName = String(fallbackCell).trim();
      }

      // Skip completely empty product names or repeated headers
      if (!productName || ColumnIntelligence.normalizeHeader(productName) === ColumnIntelligence.normalizeHeader(columnDefs[nameIdx]?.rawHeader || '')) {
        continue;
      }

      const qty = qtyIdx !== -1 ? SpreadsheetParser.parseCleanNumber(row[qtyIdx], 1) : 1;
      const price = priceIdx !== -1 ? SpreadsheetParser.parseCleanNumber(row[priceIdx], 0) : 0;
      const total = totalIdx !== -1 ? SpreadsheetParser.parseCleanNumber(row[totalIdx], undefined as any) : undefined;
      const batch = batchIdx !== -1 ? String(row[batchIdx] || '').trim() : undefined;
      const expiry = expIdx !== -1 ? String(row[expIdx] || '').trim() : undefined;
      const discount = discIdx !== -1 ? SpreadsheetParser.parseCleanNumber(row[discIdx], 0) : 0;
      const tax = taxIdx !== -1 ? SpreadsheetParser.parseCleanNumber(row[taxIdx], 0) : undefined;
      const barcode = barcodeIdx !== -1 ? String(row[barcodeIdx] || '').trim() : undefined;
      const productCode = codeIdx !== -1 ? String(row[codeIdx] || '').trim() : undefined;
      const bonus = bonusIdx !== -1 ? SpreadsheetParser.parseCleanNumber(row[bonusIdx], 0) : undefined;
      const unit = unitIdx !== -1 ? String(row[unitIdx] || '').trim() : undefined;
      const notes = noteIdx !== -1 ? String(row[noteIdx] || '').trim() : undefined;

      rows.push({
        rowNumber: r - headerRowIndex,
        rawCells,
        productName,
        quantity: qty,
        unitPrice: price,
        total,
        batchNumber: batch || undefined,
        expiryDate: expiry || undefined,
        discountPercent: discount,
        tax,
        barcode: barcode || undefined,
        productCode: productCode || undefined,
        bonusQty: bonus,
        unit: unit || undefined,
        notes: notes || undefined
      });
    }

    return rows;
  }

  /**
   * Re-analyzes rows with new user-provided column mappings (Manual Override)
   */
  static reapplyColumnMappings(
    rawGrid: string[][],
    headerRowIndex: number,
    updatedColumns: ColumnDefinition[],
    dbProducts: Product[]
  ): ExtractedImportRow[] {
    const rawRows = this.extractRowsFromGrid(rawGrid, headerRowIndex, updatedColumns);
    const seenItemsMap = new Map<string, number>();
    const validated = rawRows.map((rawRow, idx) => DataValidator.validateRow(rawRow, idx + 1, seenItemsMap));
    return ProductMatchingEngine.matchAllRows(validated, dbProducts);
  }

  /**
   * Transforms approved ExtractedImportRows into PharmaFlow Purchase Invoice standard InvoiceItem[] array
   */
  static convertToInvoiceItems(
    rows: ExtractedImportRow[],
    invoiceNumber: string
  ): InvoiceItem[] {
    return rows
      .filter(row => !row.isSkipped && row.productName)
      .map((row, idx) => {
        const q = row.quantity > 0 ? row.quantity : 1;
        const p = row.unitPrice >= 0 ? row.unitPrice : 0;
        const disc = row.discountPercent || 0;
        const sub = q * p;
        const finalSum = row.total !== undefined && row.total > 0 
          ? row.total 
          : (disc > 0 ? sub * (1 - disc / 100) : sub);

        const notesParts = [
          row.barcode ? `باركود: ${row.barcode}` : '',
          row.productCode ? `كود: ${row.productCode}` : '',
          row.bonusQty ? `بونص: +${row.bonusQty}` : '',
          row.batchNumber ? `تشغيلة: ${row.batchNumber}` : '',
          row.unit ? `الوحدة: ${row.unit}` : '',
          row.notes || ''
        ].filter(Boolean);

        return {
          id: `PUR-DET-${Date.now()}-${idx}`,
          parent_id: invoiceNumber,
          product_id: row.matchedProductId || `manual-${Date.now()}-${idx}`,
          productId: row.matchedProductId || `manual-${Date.now()}-${idx}`,
          productName: row.matchedProductName || row.productName,
          name: row.matchedProductName || row.productName,
          quantity: q,
          qty: q,
          unitPrice: p,
          price: p,
          subtotal: finalSum,
          sum: finalSum,
          discount_val: disc,
          row_order: idx + 1,
          expiryDate: normalizeToISODate(row.expiryDate),
          notes: notesParts.join(' | ')
        };
      });
  }
}
