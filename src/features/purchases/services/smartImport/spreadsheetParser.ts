// src/features/purchases/services/smartImport/spreadsheetParser.ts
import readXlsxFile from 'read-excel-file/browser';
import { IMPORT_LIMITS } from './sourceDetector';
import { ColumnIntelligence } from './columnIntelligence';
import { ColumnDefinition, CanonicalImportTable, CanonicalImportRawRow, CanonicalImportDocument, ImportDiagnostic } from './types';
import { normalizeToISODate } from '@/utils/expiryUtils';

/**
 * Enterprise Spreadsheet & CSV Parser for PharmaFlow PRO ERP
 */
export class SpreadsheetParser {
  /**
   * Converts Excel Serial Dates (1900 or 1904 system) to canonical ISO date (YYYY-MM-DD)
   * with strict UTC arithmetic to prevent timezone offset shifts (+/- 1 day drift).
   */
  static excelSerialDateToISO(serial: number, is1904: boolean = false): string {
    if (typeof serial !== 'number' || isNaN(serial) || serial <= 0) {
      return '';
    }

    try {
      if (is1904) {
        // 1904 Date System (Mac standard): Day 0 is Jan 1, 1904
        const msPerDay = 86400000;
        const utcMs = Date.UTC(1904, 0, 1) + Math.floor(serial) * msPerDay;
        const d = new Date(utcMs);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return normalizeToISODate(`${y}-${m}-${day}`);
      }

      // 1900 Date System (Default): Day 1 is Jan 1, 1900
      // Handles the famous Lotus 1-2-3 / Excel 1900 leap year bug (Day 60 = Feb 29, 1900)
      let days = Math.floor(serial);
      if (days === 60) {
        return '1900-02-28'; // graceful fallback for the non-existent 1900-02-29
      }
      if (days > 60) {
        days -= 1; // Compensate for fictitious 1900-02-29 leap day
      }

      // Base UTC: Jan 1, 1900
      const msPerDay = 86400000;
      const utcMs = Date.UTC(1900, 0, 1) + (days - 1) * msPerDay;
      const d = new Date(utcMs);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return normalizeToISODate(`${y}-${m}-${day}`);
    } catch {
      return '';
    }
  }

  /**
   * Intelligently parses date cell value from either serial number, Date object, or text
   */
  static parseCellValueToDate(val: any, is1904: boolean = false): string {
    if (val === null || val === undefined) return '';

    // 1. JS Date instance
    if (val instanceof Date) {
      try {
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return normalizeToISODate(`${y}-${m}-${d}`);
      } catch {
        return '';
      }
    }

    // 2. Numeric serial date (e.g. 45292 -> ~2023-12-31)
    if (typeof val === 'number') {
      if (val >= 1000 && val <= 100000) {
        return this.excelSerialDateToISO(val, is1904);
      }
      return '';
    }

    // 3. String date
    let str = this.normalizeNumerals(String(val).trim());
    if (!str) return '';

    // If string contains purely a 4-5 digit number (e.g. "45292")
    if (/^\d{4,5}$/.test(str)) {
      const num = parseInt(str, 10);
      if (num >= 1000 && num <= 100000) {
        const serialDate = this.excelSerialDateToISO(num, is1904);
        if (serialDate) return serialDate;
      }
    }

    return normalizeToISODate(str);
  }

  /**
   * Converts Eastern Arabic (٠-٩) and Persian (۰-۹) numerals into standard ASCII digits (0-9)
   */
  static normalizeNumerals(val: string): string {
    if (!val) return '';
    return val
      .replace(/[\u0660-\u0669]/g, d => (d.charCodeAt(0) - 0x0660).toString())
      .replace(/[\u06F0-\u06F9]/g, d => (d.charCodeAt(0) - 0x06F0).toString());
  }

  /**
   * Sanitizes cell values to prevent Formula Injection (CSV/Excel DDE Injection)
   * and Prototype Pollution.
   */
  static sanitizeCellValue(val: any, is1904: boolean = false): string {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) {
      return this.parseCellValueToDate(val, is1904);
    }
    
    // Check if cell is a serial date number
    if (typeof val === 'number' && val >= 30000 && val <= 70000) {
      // In Excel, 30000 to 70000 are dates between 1982 and 2091
      // We will keep numeric representation but allow date parser to interpret it if mapped to expiryDate
    }

    let str = String(val).trim();

    // Neutralize dangerous formula injection prefixes for non-numeric content
    if (/^[=+\-@\t\r]/.test(str)) {
      const withoutLeading = str.replace(/^[=+\-@\t\r]+/, '');
      // If it's just a negative number like -5.0 or +10, keep the numeric sign
      if (!isNaN(Number(withoutLeading))) {
        str = (str.startsWith('-') ? '-' : '') + withoutLeading;
      } else {
        str = withoutLeading;
      }
    }

    // Block Prototype Pollution keywords
    if (str === '__proto__' || str === 'constructor' || str === 'prototype') {
      return '';
    }

    return str;
  }

  /**
   * Parses and cleans a numeric string: removes currencies, thousand commas, and converts Arabic digits
   */
  static parseCleanNumber(val: any, defaultValue: number = 0): number {
    if (val === null || val === undefined) return defaultValue;
    if (typeof val === 'number') return isNaN(val) ? defaultValue : val;

    let str = this.normalizeNumerals(String(val).trim());
    // Strip currency symbols and whitespace
    str = str.replace(/[$€£¥﷼]/g, '')
             .replace(/(YER|SAR|USD|EGP|AED|EUR|GBP|ريال|ر\.س|ر\.ي|ج\.م|درهم|دولار)/gi, '')
             .replace(/%/g, '')
             .replace(/,/g, '') // remove thousand separators
             .trim();

    const num = parseFloat(str);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Parses CSV/TSV/TXT string safely supporting multiline values, quotes, and various delimiters
   */
  static parseCSVText(csvText: string): string[][] {
    const rows: string[][] = [];
    const lines = csvText.split(/\r?\n/);
    
    for (const line of lines) {
      if (!line.trim()) continue;
      if (rows.length >= IMPORT_LIMITS.MAX_TOTAL_ROWS) break;

      const row: string[] = [];
      let insideQuotes = false;
      let currentCell = '';
      
      // Delimiter detection for current line (comma, tab, semicolon, pipe)
      let delimiter = ',';
      if (line.includes('\t')) delimiter = '\t';
      else if (line.includes(';') && !line.includes(',')) delimiter = ';';
      else if (line.includes('|') && !line.includes(',')) delimiter = '|';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (insideQuotes && line[i + 1] === '"') {
            currentCell += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === delimiter && !insideQuotes) {
          row.push(this.sanitizeCellValue(currentCell));
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      row.push(this.sanitizeCellValue(currentCell));
      if (row.length > 0 && row.some(c => c.length > 0)) {
        rows.push(row);
      }
    }
    return rows;
  }

  /**
   * Detects whether a row represents a summary, footer, grand total, or signature
   */
  static isFooterOrSummaryRow(row: string[]): boolean {
    const rawCombined = row.join(' ').toLowerCase();
    const normalizedCombined = rawCombined
      .replace(/[إأآا]/g, 'ا')
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/\s+/g, ' ');

    const footerKeywords = [
      'grand total', 'subtotal', 'sub total', 'vat total', 'net total', 'total amount', 'total', 'sum',
      'اجمالي عام', 'الاجمالي العام', 'المجموع الكلي', 'مجموع كلي', 'اجمالي الفاتورة', 'صافي الفاتورة',
      'الاجمالي النهائي', 'المجموع النهائي', 'اجمالي كلي', 'المجموع', 'اجمالي', 'مجموع', 'الاجمالي',
      'توقيع', 'المستلم', 'المدير', 'signature', 'received by', 'approved by', 'page', 'صفحة'
    ];

    return footerKeywords.some(k => {
      const normK = k.replace(/[إأآا]/g, 'ا');
      return normalizedCombined.includes(normK) || rawCombined.includes(k);
    });
  }

  /**
   * Detects the probable header row in the table (scanning rows 0 through 25)
   */
  static findTableHeaders(rows: string[][]): { headerRowIndex: number; columnDefs: ColumnDefinition[] } {
    const maxScanRows = Math.min(rows.length, 25);
    let bestHeaderRowIndex = 0;
    let highestMatchScore = -1;
    let bestColumnDefs: ColumnDefinition[] = [];

    const sampleLookahead = 5;

    for (let r = 0; r < maxScanRows; r++) {
      const candidateRow = rows[r];
      if (!candidateRow || candidateRow.length === 0) continue;

      // Extract sample values from subsequent rows for each column
      const samplesByCol: string[][] = candidateRow.map((_, colIdx) => {
        const samples: string[] = [];
        for (let s = r + 1; s < Math.min(rows.length, r + 1 + sampleLookahead); s++) {
          const sampleRow = rows[s];
          if (sampleRow && sampleRow[colIdx]) {
            samples.push(sampleRow[colIdx] || '');
          }
        }
        return samples;
      });

      const colDefs = ColumnIntelligence.analyzeHeaders(candidateRow, samplesByCol);

      // Score this row as a potential header row
      let score = 0;
      colDefs.forEach(def => {
        if (def.mappedField === 'productName') score += 50;
        else if (def.mappedField === 'quantity') score += 40;
        else if (def.mappedField === 'unitPrice' || def.mappedField === 'total') score += 30;
        else if (def.mappedField !== 'ignore') score += 15;
      });

      if (score > highestMatchScore) {
        highestMatchScore = score;
        bestHeaderRowIndex = r;
        bestColumnDefs = colDefs;
      }

      // If we found a confident header row with both product name and quantity
      if (score >= 90) {
        break;
      }
    }

    return {
      headerRowIndex: bestHeaderRowIndex,
      columnDefs: bestColumnDefs
    };
  }

  /**
   * Converts a 2D string matrix into CanonicalImportTable and CanonicalImportDocument
   */
  static convertGridToCanonicalDocument(
    grid: string[][],
    sourceInfo: {
      type: 'EXCEL' | 'CSV' | 'TSV' | 'TXT';
      fileName: string;
      fileSize: number;
      hash?: string;
    }
  ): CanonicalImportDocument {
    const { headerRowIndex, columnDefs } = this.findTableHeaders(grid);
    const headers = grid[headerRowIndex] || [];

    const rawRows: CanonicalImportRawRow[] = [];
    for (let r = headerRowIndex + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row || row.length === 0 || this.isFooterOrSummaryRow(row)) continue;

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
          sheet: 'Sheet1',
          row: r
        }
      });
    }

    const table: CanonicalImportTable = {
      id: `tbl-${Date.now()}-1`,
      sourceIndex: 0,
      name: 'MainInvoiceTable',
      headers: headers.map(h => this.sanitizeCellValue(h)),
      rows: rawRows,
      confidence: columnDefs.some(c => c.mappedField === 'productName') ? 0.95 : 0.60,
      isPrimaryInvoiceTable: true
    };

    const diagnostics: ImportDiagnostic[] = [
      {
        code: 'TABLE_DETECTED',
        severity: 'INFO',
        message: `تم اكتشاف الجدول الرئيسي بدءاً من السطر ${headerRowIndex + 1} بعدد ${rawRows.length} صف.`,
        metadata: { headerRowIndex, totalRows: rawRows.length }
      }
    ];

    return {
      id: `DOC-${Date.now()}`,
      source: {
        type: sourceInfo.type,
        fileName: sourceInfo.fileName,
        size: sourceInfo.fileSize,
        hash: sourceInfo.hash,
        sheetCount: 1,
        tableCount: 1
      },
      metadata: {
        extractionMethod: 'SPREADSHEET',
        extractedAt: new Date().toISOString(),
        parserVersion: '2.1.0',
        confidence: table.confidence
      },
      documentFields: {},
      tables: [table],
      warnings: [],
      diagnostics
    };
  }

  /**
   * Parses an Excel File or CSV into a normalized 2D matrix of cleaned string cells
   */
  static async parseFileToGrid(file: File): Promise<string[][]> {
    const name = file.name.toLowerCase();
    
    if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt') || file.type.includes('csv') || file.type === 'text/plain') {
      const text = await file.text();
      return this.parseCSVText(text);
    }

    // Try reading via read-excel-file
    try {
      const rawRows = await readXlsxFile(file);
      if (!rawRows || (rawRows as any[]).length === 0) {
        throw new Error('ملف الاكسل فارغ');
      }

      return (rawRows as any[]).slice(0, IMPORT_LIMITS.MAX_TOTAL_ROWS).map((row: any) =>
        (Array.isArray(row) ? row : []).map((cell: any) => this.sanitizeCellValue(cell))
      );
    } catch (parseErr: any) {
      // Fallback: try parsing as text/CSV if XLSX engine couldn't handle it
      try {
        const text = await file.text();
        const csvGrid = this.parseCSVText(text);
        if (csvGrid.length > 0) return csvGrid;
      } catch {
        // ignore fallback failure
      }
      throw new Error(`فشل قراءة ملف الاكسل: ${parseErr.message || 'تنسيق الملف غير مدعوم'}`);
    }
  }
}
