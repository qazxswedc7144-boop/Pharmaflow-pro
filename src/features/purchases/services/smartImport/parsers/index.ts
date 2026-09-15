// src/features/purchases/services/smartImport/parsers/index.ts
import { ImportSourceParser, ImportSourceType } from '../types';
import { SourceDetector } from '../sourceDetector';
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
  static getParser(file: File | string, type?: ImportSourceType): ImportSourceParser {
    const resolvedType = type || SourceDetector.detectSourceType(file);
    for (const parser of this.parsers) {
      if (parser.canParse(file, resolvedType)) {
        return parser;
      }
    }
    // Fallback: Default to spreadsheet or OCR parser
    if (resolvedType === 'IMAGE' || resolvedType === 'CAMERA' || resolvedType === 'PDF_SCANNED') {
      return new OcrImageParserAdapter();
    }
    return new SpreadsheetParserAdapter();
  }
}
