// src/features/purchases/services/smartImport/parsers/index.ts
import { ImportSourceParser, ImportSourceType } from '../types';
import { SpreadsheetParserAdapter } from './SpreadsheetParserAdapter';
import { DocxParserAdapter } from './DocxParserAdapter';
import { PdfTextParserAdapter } from './PdfTextParserAdapter';
import { OcrImageParserAdapter } from './OcrImageParserAdapter';

export {
  SpreadsheetParserAdapter,
  DocxParserAdapter,
  PdfTextParserAdapter,
  OcrImageParserAdapter
};

/**
 * Universal Parser Registry & Factory
 */
export class ParserRegistry {
  private static parsers: ImportSourceParser[] = [
    new SpreadsheetParserAdapter(),
    new DocxParserAdapter(),
    new PdfTextParserAdapter(),
    new OcrImageParserAdapter()
  ];

  /**
   * Resolves the best parser adapter for a given file and source type
   */
  static getParser(file: File | string, type: ImportSourceType): ImportSourceParser {
    for (const parser of this.parsers) {
      if (parser.canParse(file, type)) {
        return parser;
      }
    }
    // Fallback: Default to spreadsheet or OCR parser
    if (type === 'IMAGE' || type === 'CAMERA' || type === 'PDF_SCANNED') {
      return new OcrImageParserAdapter();
    }
    return new SpreadsheetParserAdapter();
  }
}
