// src/features/purchases/services/smartImport/providers/providerRegistry.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Document Extraction Provider Registry
 */

import { IDocumentExtractionProvider, ExtractionProviderType } from './provider.types';
import { LocalParserProvider } from './localParserProvider';
import { LocalOcrProvider } from './localOcrProvider';
import { AiExtractionProvider } from './aiExtractionProvider';
import { FallbackProvider } from './fallbackProvider';

export class ProviderRegistry {
  private static providers: Map<ExtractionProviderType, IDocumentExtractionProvider> = new Map();

  static {
    this.registerDefaultProviders();
  }

  private static registerDefaultProviders(): void {
    const localParser = new LocalParserProvider();
    const localOcr = new LocalOcrProvider();
    const aiExtractor = new AiExtractionProvider();
    const fallback = new FallbackProvider();

    this.providers.set('LOCAL_PARSER', localParser);
    this.providers.set('OCR', localOcr);
    this.providers.set('AI', aiExtractor);
    this.providers.set('FALLBACK', fallback);
  }

  public static getProvider(type: ExtractionProviderType): IDocumentExtractionProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      return this.providers.get('FALLBACK')!;
    }
    return provider;
  }

  public static registerProvider(provider: IDocumentExtractionProvider): void {
    this.providers.set(provider.type, provider);
  }

  public static getAllProviders(): IDocumentExtractionProvider[] {
    return Array.from(this.providers.values());
  }

  public static resetHealth(): void {
    const ai = this.providers.get('AI') as AiExtractionProvider;
    if (ai && typeof ai.resetCircuit === 'function') {
      ai.resetCircuit();
    }
  }
}
