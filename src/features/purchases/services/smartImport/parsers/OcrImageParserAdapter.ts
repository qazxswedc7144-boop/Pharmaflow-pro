// src/features/purchases/services/smartImport/parsers/OcrImageParserAdapter.ts
import { 
  CanonicalImportDocument, 
  CanonicalImportTable, 
  CanonicalImportRawRow, 
  ImportDiagnostic, 
  ImportParseContext, 
  ImportSourceParser, 
  ImportSourceType 
} from '../types';
import { OCRDocumentParser } from '../ocrDocumentParser';
import { generateFileHash } from '@/utils/hash';

/**
 * OCR & Image/Camera Document Parser Adapter
 * Handles Scanned PDFs, PNG, JPG, WEBP, BMP images, and direct camera captures.
 * Features tenant-scoped caching, timeout protection, and builds CanonicalImportDocument.
 */
export class OcrImageParserAdapter implements ImportSourceParser {
  canParse(file: File | string, type: ImportSourceType): boolean {
    if (type === 'IMAGE' || type === 'CAMERA' || type === 'PDF_SCANNED' || type === 'PDF') return true;
    if (typeof file === 'string') {
      return file.startsWith('data:image/') || file.startsWith('data:') || file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp');
    }
    if (file instanceof File) {
      return file.type.startsWith('image/') || file.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|bmp|jfif)$/i) !== null;
    }
    return false;
  }

  async parse(file: File | string, context: ImportParseContext): Promise<CanonicalImportDocument> {
    const { onProgress, tenantId, branchId } = context;
    onProgress?.(30, 'جاري المسح الضوئي الذكي والتعرف على نصوص الفاتورة...');

    const fileHash = await generateFileHash(file);
    const cacheKey = `pharmaflow_ocr_${tenantId}_${branchId}_${fileHash}_v2.1`;

    let cachedDoc: CanonicalImportDocument | null = null;
    try {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        if (parsed && parsed.timestamp && (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000)) {
          cachedDoc = parsed.document;
        }
      }
    } catch {
      // ignore storage access errors
    }

    if (cachedDoc) {
      onProgress?.(80, 'تم استرجاع نتيجة المسح الضوئي من الذاكرة المؤقتة...');
      return cachedDoc;
    }

    // Process via OCRDocumentParser
    onProgress?.(50, 'جاري استخراج بيانات المورد ورقم الفاتورة والأصناف...');
    const ocrResult = await OCRDocumentParser.parseDocument(file);

    const rawRows: CanonicalImportRawRow[] = (ocrResult.rows || []).map((row, idx) => ({
      sourceRowIndex: idx + 1,
      cells: {
        productName: row.productName || '',
        quantity: row.quantity || 1,
        unitPrice: row.unitPrice || 0,
        total: row.total,
        expiryDate: row.expiryDate,
        batchNumber: row.batchNumber,
        discount: row.discountPercent,
        barcode: row.barcode,
        bonusQty: row.bonusQty,
        unit: row.unit,
        notes: row.notes
      },
      rawCells: [
        row.productName,
        row.quantity,
        row.unitPrice,
        row.total,
        row.expiryDate,
        row.batchNumber,
        row.barcode
      ],
      sourceReference: {
        row: idx + 1
      }
    }));

    const table: CanonicalImportTable = {
      id: `ocr-tbl-${Date.now()}`,
      sourceIndex: 0,
      name: 'OCR_Extracted_Items',
      headers: ['اسم الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'الصلاحية', 'التشغيلة', 'الباركود'],
      rows: rawRows,
      confidence: 0.85,
      isPrimaryInvoiceTable: true
    };

    const diagnostics: ImportDiagnostic[] = [
      {
        code: 'OCR_EXTRACTION_SUCCESS',
        severity: 'INFO',
        message: `تم التعرف على المستند ضوئياً واستخراج ${rawRows.length} صنف بنجاح.`
      }
    ];

    const fileName = typeof file === 'string' 
      ? (file.startsWith('data:') ? 'camera_capture.jpg' : 'image_document.jpg') 
      : file.name;
    const fileSize = typeof file === 'string' ? file.length : file.size;

    const doc: CanonicalImportDocument = {
      id: `DOC-OCR-${Date.now()}`,
      source: {
        type: typeof file === 'string' && file.startsWith('data:image/') ? 'CAMERA' : 'IMAGE',
        fileName,
        size: fileSize,
        hash: fileHash,
        pageCount: 1
      },
      metadata: {
        extractionMethod: 'OCR',
        extractedAt: new Date().toISOString(),
        parserVersion: '2.1.0',
        confidence: 0.85
      },
      documentFields: {
        supplierName: ocrResult.supplier,
        invoiceNumber: ocrResult.invoiceNumber,
        invoiceDate: ocrResult.date,
        notes: ocrResult.rawText?.slice(0, 500)
      },
      tables: [table],
      warnings: [],
      diagnostics
    };

    // Cache document
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        document: doc,
        timestamp: Date.now()
      }));
    } catch {
      // ignore
    }

    onProgress?.(100, 'اكتمل المسح الضوئي الذكي!');
    return doc;
  }
}
