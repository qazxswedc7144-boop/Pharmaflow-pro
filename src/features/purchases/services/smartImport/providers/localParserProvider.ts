// src/features/purchases/services/smartImport/providers/localParserProvider.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Deterministic Local Parser Provider (Excel, CSV, DOCX, Structured PDF)
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
  CanonicalImportDocument 
} from '../types';
import { ParserRegistry } from '../parsers';

export class LocalParserProvider implements IDocumentExtractionProvider {
  public readonly name = 'LocalDeterministicParser';
  public readonly type: ExtractionProviderType = 'LOCAL_PARSER';
  public healthStatus: ProviderHealthStatus = 'HEALTHY';

  public canExtract(file: File | string, sourceType: ImportSourceType): boolean {
    return (
      sourceType === 'EXCEL' ||
      sourceType === 'CSV' ||
      sourceType === 'TSV' ||
      sourceType === 'DOCX' ||
      sourceType === 'PDF_TEXT' ||
      (sourceType === 'PDF' && typeof file !== 'string')
    );
  }

  public async extract(
    file: File | string, 
    context: ImportParseContext
  ): Promise<ExtractionProviderResult> {
    const startTime = Date.now();
    const { onProgress } = context;

    onProgress?.(25, 'جاري القراءة المباشرة والتحليل الحتمي للجداول بدون ذكاء اصطناعي...');

    try {
      const parser = ParserRegistry.getParser(file);
      const canonicalDoc: CanonicalImportDocument = await parser.parse(file, context);

      const executionTimeMs = Date.now() - startTime;
      const confidence = canonicalDoc.metadata.confidence ?? 0.95;

      return {
        canonicalDoc,
        providerType: this.type,
        providerName: this.name,
        executionTimeMs,
        diagnostics: canonicalDoc.diagnostics || [],
        confidence,
        isFallbackUsed: false
      };
    } catch (err: any) {
      this.healthStatus = 'DEGRADED';
      throw new Error(`فشل المحلل الحتمي المحلي: ${err?.message || 'خطأ غير معروف'}`);
    }
  }
}
