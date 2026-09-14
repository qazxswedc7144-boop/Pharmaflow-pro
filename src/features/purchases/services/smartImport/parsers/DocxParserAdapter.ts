// src/features/purchases/services/smartImport/parsers/DocxParserAdapter.ts
import JSZip from 'jszip';
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
 * Secure DOCX Table Parser Adapter
 * Ingests .docx files, safely reads word/document.xml via JSZip,
 * extracts all tables, detects table headers, and builds a CanonicalImportDocument.
 * Completely immune to macro execution, XML external entities (XXE), and prototype pollution.
 */
export class DocxParserAdapter implements ImportSourceParser {
  canParse(file: File | string, type: ImportSourceType): boolean {
    if (type === 'DOCX') return true;
    if (typeof file === 'string') {
      const lower = file.toLowerCase();
      return lower.endsWith('.docx') || lower.endsWith('.doc') || file.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml');
    }
    if (file instanceof File) {
      const lower = file.name.toLowerCase();
      return lower.endsWith('.docx') || lower.endsWith('.doc') || file.type.includes('wordprocessingml');
    }
    return false;
  }

  /**
   * Safely extracts text content from an XML snippet containing w:tc (table cell)
   */
  private extractCellText(tcXml: string): string {
    const textMatches = tcXml.match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
    const textPieces = textMatches.map(tag => {
      return tag.replace(/^<w:t(?:\s+[^>]*)?>/, '').replace(/<\/w:t>$/, '');
    });
    const combined = textPieces.join('').trim();
    return combined
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  /**
   * Parses raw XML string of document.xml into arrays of 2D string tables
   */
  private parseDocumentXmlTables(xmlText: string): string[][][] {
    const tables: string[][][] = [];
    const tableRegex = /<w:tbl(?:\s+[^>]*)?>([\s\S]*?)<\/w:tbl>/g;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRegex.exec(xmlText)) !== null) {
      if (tables.length >= IMPORT_LIMITS.MAX_DOCX_TABLES) break;

      const tblXml = tableMatch[1] || '';
      const rows: string[][] = [];
      const rowRegex = /<w:tr(?:\s+[^>]*)?>([\s\S]*?)<\/w:tr>/g;
      let rowMatch: RegExpExecArray | null;

      while ((rowMatch = rowRegex.exec(tblXml)) !== null) {
        if (rows.length >= IMPORT_LIMITS.MAX_TOTAL_ROWS) break;

        const trXml = rowMatch[1] || '';
        const cells: string[] = [];
        const cellRegex = /<w:tc(?:\s+[^>]*)?>([\s\S]*?)<\/w:tc>/g;
        let cellMatch: RegExpExecArray | null;

        while ((cellMatch = cellRegex.exec(trXml)) !== null) {
          const rawText = this.extractCellText(cellMatch[1] || '');
          const sanitized = SpreadsheetParser.sanitizeCellValue(rawText);
          cells.push(sanitized);
        }

        if (cells.length > 0 && cells.some(c => c.length > 0)) {
          rows.push(cells);
        }
      }

      if (rows.length > 0) {
        tables.push(rows);
      }
    }

    return tables;
  }

  async parse(file: File | string, context: ImportParseContext): Promise<CanonicalImportDocument> {
    const { onProgress } = context;
    onProgress?.(20, 'جاري فحص وتفريغ مستند Word (.docx)...');

    let arrayBuffer: ArrayBuffer;
    let fileName = 'document.docx';
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

    if (fileSize > IMPORT_LIMITS.MAX_DOCX_FILE_SIZE) {
      throw new Error(`حجم ملف Word (${(fileSize / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به.`);
    }

    const fileHash = await generateFileHash(file);

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(arrayBuffer);
    } catch {
      throw new Error('ملف Word غير صالح أو تالف أو محمي بكلمة مرور.');
    }

    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('الملف ليس مستند Word (.docx) قياسي أو يفتقر إلى بنية document.xml.');
    }

    onProgress?.(45, 'جاري قراءة الجداول من مستند Word...');
    const xmlText = await docXmlFile.async('text');
    const rawTables = this.parseDocumentXmlTables(xmlText);

    const diagnostics: ImportDiagnostic[] = [];

    if (rawTables.length === 0) {
      diagnostics.push({
        code: 'DOCX_NO_TABLES_FOUND',
        severity: 'WARNING',
        message: 'لم يتم العثور على أي جداول في ملف Word. يُفضل استخدام جداول منسقة في Word لاستيراد الفواتير.'
      });

      return {
        id: `DOC-WORD-${Date.now()}`,
        source: {
          type: 'DOCX',
          fileName,
          size: fileSize,
          hash: fileHash,
          tableCount: 0
        },
        metadata: {
          extractionMethod: 'DOCX_TABLE',
          extractedAt: new Date().toISOString(),
          parserVersion: '2.1.0',
          confidence: 0.10
        },
        documentFields: {},
        tables: [],
        warnings: [],
        diagnostics
      };
    }

    onProgress?.(65, 'جاري تحليل الأعمدة ومطابقة الحقول...');

    const canonicalTables: CanonicalImportTable[] = [];
    let bestTableIndex = 0;
    let highestTableScore = -1;

    rawTables.forEach((grid, tIdx) => {
      const { headerRowIndex, columnDefs } = SpreadsheetParser.findTableHeaders(grid);
      const headers = grid[headerRowIndex] || [];

      let tableScore = 0;
      columnDefs.forEach(def => {
        if (def.mappedField === 'productName') tableScore += 50;
        else if (def.mappedField === 'quantity') tableScore += 40;
        else if (def.mappedField === 'unitPrice' || def.mappedField === 'total') tableScore += 30;
        else if (def.mappedField !== 'ignore') tableScore += 10;
      });

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
            table: tIdx + 1,
            row: r
          }
        });
      }

      if (tableScore > highestTableScore) {
        highestTableScore = tableScore;
        bestTableIndex = tIdx;
      }

      canonicalTables.push({
        id: `docx-tbl-${tIdx + 1}`,
        sourceIndex: tIdx,
        name: `Word_Table_${tIdx + 1}`,
        headers: headers.map(h => SpreadsheetParser.sanitizeCellValue(h)),
        rows: rawRows,
        confidence: tableScore > 80 ? 0.95 : (tableScore > 40 ? 0.80 : 0.50),
        isPrimaryInvoiceTable: false
      });

      diagnostics.push({
        code: 'DOCX_TABLE_EXTRACTED',
        severity: 'INFO',
        message: `تم استخراج جدول Word رقم ${tIdx + 1} بعدد ${rawRows.length} صف.`,
        sourceReference: { table: tIdx + 1 },
        metadata: { headerRowIndex, rowCount: rawRows.length, score: tableScore }
      });
    });

    if (canonicalTables[bestTableIndex]) {
      canonicalTables[bestTableIndex]!.isPrimaryInvoiceTable = true;
    }

    onProgress?.(80, 'اكتمل استخراج جداول Word بنجاح!');

    return {
      id: `DOC-WORD-${Date.now()}`,
      source: {
        type: 'DOCX',
        fileName,
        size: fileSize,
        hash: fileHash,
        tableCount: canonicalTables.length
      },
      metadata: {
        extractionMethod: 'DOCX_TABLE',
        extractedAt: new Date().toISOString(),
        parserVersion: '2.1.0',
        confidence: canonicalTables[bestTableIndex]?.confidence || 0.85
      },
      documentFields: {},
      tables: canonicalTables,
      warnings: [],
      diagnostics
    };
  }
}
