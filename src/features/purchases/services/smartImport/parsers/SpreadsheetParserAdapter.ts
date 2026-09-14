// src/features/purchases/services/smartImport/parsers/SpreadsheetParserAdapter.ts
import { 
  CanonicalImportDocument, 
  ImportParseContext, 
  ImportSourceParser, 
  ImportSourceType 
} from '../types';
import { SpreadsheetParser } from '../spreadsheetParser';
import { generateFileHash } from '@/utils/hash';
import { IMPORT_LIMITS } from '../sourceDetector';

/**
 * Universal Spreadsheet & Delimited Text Parser Adapter
 * Ingests XLSX, XLS, XLSM, XLSB, CSV, TSV, and TXT files.
 * Transforms 2D grid matrix into CanonicalImportDocument with full column intelligence & serial date handling.
 */
export class SpreadsheetParserAdapter implements ImportSourceParser {
  canParse(file: File | string, type: ImportSourceType): boolean {
    if (type === 'EXCEL' || type === 'CSV' || type === 'TSV' || type === 'TXT') return true;
    if (typeof file === 'string') {
      const lower = file.toLowerCase();
      return (
        lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm') || lower.endsWith('.xlsb') ||
        lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt') ||
        file.startsWith('data:text/csv') || file.startsWith('data:application/vnd.ms-excel')
      );
    }
    if (file instanceof File) {
      const lower = file.name.toLowerCase();
      return (
        IMPORT_LIMITS.SUPPORTED_EXCEL_EXTENSIONS.some(ext => lower.endsWith(ext)) ||
        IMPORT_LIMITS.SUPPORTED_CSV_EXTENSIONS.some(ext => lower.endsWith(ext)) ||
        file.type.includes('spreadsheetml') || file.type.includes('excel') || file.type.includes('csv')
      );
    }
    return false;
  }

  async parse(file: File | string, context: ImportParseContext): Promise<CanonicalImportDocument> {
    const { onProgress } = context;
    onProgress?.(25, 'جاري تحليل بيانات الجدول والتحقق من التنسيقات...');

    let grid: string[][];
    let fileName = 'spreadsheet.xlsx';
    let fileSize = 0;
    let type: 'EXCEL' | 'CSV' | 'TSV' | 'TXT' = 'EXCEL';

    if (typeof file === 'string') {
      fileName = 'data_import.csv';
      fileSize = file.length;
      type = 'CSV';
      grid = SpreadsheetParser.parseCSVText(file);
    } else {
      fileName = file.name;
      fileSize = file.size;
      const lower = fileName.toLowerCase();
      if (lower.endsWith('.tsv')) type = 'TSV';
      else if (lower.endsWith('.txt')) type = 'TXT';
      else if (lower.endsWith('.csv')) type = 'CSV';
      else type = 'EXCEL';

      grid = await SpreadsheetParser.parseFileToGrid(file);
    }

    if (!grid || grid.length === 0) {
      throw new Error('ملف الجدول فارغ أو لا يحتوي على أي صفوف صالحة.');
    }

    onProgress?.(50, 'جاري البحث عن ترويسات الجدول وتحديد الأعمدة المعيارية...');
    const fileHash = await generateFileHash(file);

    const canonicalDoc = SpreadsheetParser.convertGridToCanonicalDocument(grid, {
      type,
      fileName,
      fileSize,
      hash: fileHash
    });

    onProgress?.(80, 'اكتملت قراءة وتجهيز بيانات الجدول بنجاح!');
    return canonicalDoc;
  }
}
