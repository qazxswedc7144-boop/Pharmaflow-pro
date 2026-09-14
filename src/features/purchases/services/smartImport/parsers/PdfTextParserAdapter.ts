// src/features/purchases/services/smartImport/parsers/PdfTextParserAdapter.ts
import { 
  CanonicalImportDocument, 
  CanonicalImportTable, 
  CanonicalImportRawRow, 
  ImportDiagnostic, 
  ImportParseContext, 
  ImportSourceParser, 
  ImportSourceType 
} from '../types';
import { IMPORT_LIMITS } from '../sourceDetector';
import { SpreadsheetParser } from '../spreadsheetParser';
import { generateFileHash } from '@/utils/hash';

/**
 * Deterministic PDF Text Parser Adapter
 * Attempts local, zero-cost text extraction first before falling back to OCR/AI.
 */
export class PdfTextParserAdapter implements ImportSourceParser {
  canParse(file: File | string, type: ImportSourceType): boolean {
    if (type === 'PDF' || type === 'PDF_TEXT') return true;
    if (typeof file === 'string') {
      return file.toLowerCase().endsWith('.pdf') || file.startsWith('data:application/pdf');
    }
    if (file instanceof File) {
      return file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    }
    return false;
  }

  async parse(file: File | string, context: ImportParseContext): Promise<CanonicalImportDocument> {
    const { onProgress } = context;
    onProgress?.(20, 'جاري استخراج وتحليل النصوص الرقمية من ملف PDF...');

    let arrayBuffer: ArrayBuffer;
    let fileName = 'document.pdf';
    let fileSize = 0;

    if (typeof file === 'string') {
      if (file.startsWith('data:')) {
        const base64Data = file.split(',')[1] || file;
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
        fileSize = bytes.length;
      } else {
        arrayBuffer = new TextEncoder().encode(file).buffer;
        fileSize = arrayBuffer.byteLength;
      }
    } else {
      fileName = file.name;
      fileSize = file.size;
      arrayBuffer = await file.arrayBuffer();
    }

    if (fileSize > IMPORT_LIMITS.MAX_PDF_FILE_SIZE) {
      throw new Error(`حجم ملف PDF (${(fileSize / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به.`);
    }

    const fileHash = await generateFileHash(file);

    let pdf: any = null;
    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (typeof window !== 'undefined' && 'Worker' in window && pdfjsLib.GlobalWorkerOptions) {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        } catch {
          // ignore worker setup error
        }
      }
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        useSystemFonts: true,
        stopAtErrors: false
      });
      pdf = await loadingTask.promise;
    } catch {
      // If pdfjs failed or running in headless environment without DOMMatrix, return scanned document marker
      pdf = null;
    }

    if (!pdf) {
      return {
        id: `DOC-PDF-SCANNED-${Date.now()}`,
        source: {
          type: 'PDF_SCANNED',
          fileName,
          size: fileSize,
          hash: fileHash,
          pageCount: 1
        },
        metadata: {
          extractionMethod: 'OCR',
          extractedAt: new Date().toISOString(),
          parserVersion: '2.1.0',
          confidence: 0.70
        },
        documentFields: {},
        tables: [],
        warnings: [],
        diagnostics: [{
          code: 'PDF_SCANNED_DETECTED',
          severity: 'INFO',
          message: 'سيتم مسح مستند PDF ضوئياً عبر محرك OCR.'
        }]
      };
    }

    const maxPages = Math.min(pdf.numPages, IMPORT_LIMITS.MAX_PDF_PAGES);
    let fullText = '';
    const pageLines: string[][] = [];

    for (let i = 1; i <= maxPages; i++) {
      onProgress?.(20 + Math.round((i / maxPages) * 30), `جاري قراءة نصوص الصفحة ${i} من ${maxPages}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent({
        includeMarkedContent: false,
        disableNormalization: false
      });

      const rawItems = textContent.items
        .map((item: any) => (typeof item.str === 'string' ? item.str.trim() : ''))
        .filter((str: string) => str.length > 0);

      fullText += rawItems.join(' ') + '\n';
      if (rawItems.length > 0) {
        pageLines.push(rawItems);
      }
    }

    // Check if the PDF has sufficient embedded text (otherwise it's likely a scanned image)
    const totalChars = fullText.replace(/\s+/g, '').length;
    const isScanned = totalChars < 40;

    const diagnostics: ImportDiagnostic[] = [];

    if (isScanned) {
      diagnostics.push({
        code: 'PDF_SCANNED_DETECTED',
        severity: 'INFO',
        message: 'تم اكتشاف أن ملف PDF ممسوح ضوئياً (صورة بدون نصوص مضمنة)، سيتم استخدام محرك OCR.',
        metadata: { totalChars, pageCount: maxPages }
      });

      return {
        id: `DOC-PDF-SCANNED-${Date.now()}`,
        source: {
          type: 'PDF_SCANNED',
          fileName,
          size: fileSize,
          hash: fileHash,
          pageCount: maxPages
        },
        metadata: {
          extractionMethod: 'OCR',
          extractedAt: new Date().toISOString(),
          parserVersion: '2.1.0',
          confidence: 0.70
        },
        documentFields: {},
        tables: [],
        warnings: [],
        diagnostics
      };
    }

    // Text PDF: Try parsing into grid or line structures
    onProgress?.(65, 'جاري بناء هيكل البيانات وتحديد تفاصيل الفاتورة...');

    const grid = SpreadsheetParser.parseCSVText(fullText);
    let table: CanonicalImportTable;

    if (grid.length >= 2) {
      const { headerRowIndex, columnDefs } = SpreadsheetParser.findTableHeaders(grid);
      const headers = grid[headerRowIndex] || [];
      const rawRows: CanonicalImportRawRow[] = [];

      for (let r = headerRowIndex + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!row || row.length === 0 || SpreadsheetParser.isFooterOrSummaryRow(row)) continue;

        const cells: Record<string, unknown> = {};
        headers.forEach((_, idx) => {
          const fieldName = columnDefs[idx]?.mappedField || `Col_${idx + 1}`;
          cells[fieldName] = row[idx] ?? '';
        });

        rawRows.push({
          sourceRowIndex: r,
          cells,
          rawCells: row,
          sourceReference: {
            page: 1,
            row: r
          }
        });
      }

      table = {
        id: `pdf-tbl-${Date.now()}`,
        sourceIndex: 0,
        name: 'PdfExtractedTable',
        headers: headers.map(h => SpreadsheetParser.sanitizeCellValue(h)),
        rows: rawRows,
        confidence: 0.88,
        isPrimaryInvoiceTable: true
      };
    } else {
      table = {
        id: `pdf-tbl-${Date.now()}`,
        sourceIndex: 0,
        name: 'PdfTextContent',
        headers: ['النص المستخرج'],
        rows: pageLines.map((line, idx) => ({
          sourceRowIndex: idx + 1,
          cells: { text: line.join(' ') },
          rawCells: line,
          sourceReference: { page: idx + 1 }
        })),
        confidence: 0.75,
        isPrimaryInvoiceTable: true
      };
    }

    diagnostics.push({
      code: 'PDF_TEXT_EXTRACTED',
      severity: 'INFO',
      message: `تم استخراج النصوص الرقمية بنجاح بعدد ${table.rows.length} صف من ${maxPages} صفحة.`,
      metadata: { pageCount: maxPages, rowCount: table.rows.length }
    });

    return {
      id: `DOC-PDF-TEXT-${Date.now()}`,
      source: {
        type: 'PDF_TEXT',
        fileName,
        size: fileSize,
        hash: fileHash,
        pageCount: maxPages
      },
      metadata: {
        extractionMethod: 'PDF_TEXT',
        extractedAt: new Date().toISOString(),
        parserVersion: '2.1.0',
        confidence: table.confidence
      },
      documentFields: {
        notes: fullText.slice(0, 500)
      },
      tables: [table],
      warnings: [],
      diagnostics
    };
  }
}
