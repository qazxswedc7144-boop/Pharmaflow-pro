// src/features/purchases/services/smartImport/providers/provider.types.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Provider Isolation & Multi-Stage Extraction Pipeline Types
 */

import { 
  CanonicalImportDocument, 
  ImportDiagnostic, 
  ImportParseContext, 
  ImportSourceType 
} from '../types';

export type ExtractionProviderType = 
  | 'LOCAL_PARSER' 
  | 'OCR' 
  | 'AI' 
  | 'FALLBACK';

export type ProviderHealthStatus = 
  | 'HEALTHY' 
  | 'DEGRADED' 
  | 'CIRCUIT_OPEN' 
  | 'OFFLINE';

export interface ExtractionProviderResult {
  canonicalDoc: CanonicalImportDocument;
  providerType: ExtractionProviderType;
  providerName: string;
  executionTimeMs: number;
  rawText?: string;
  diagnostics: ImportDiagnostic[];
  confidence: number;
  isFallbackUsed?: boolean;
  fallbackReason?: string;
}

export interface IDocumentExtractionProvider {
  readonly name: string;
  readonly type: ExtractionProviderType;
  healthStatus: ProviderHealthStatus;
  
  canExtract(file: File | string, sourceType: ImportSourceType): boolean;
  extract(file: File | string, context: ImportParseContext): Promise<ExtractionProviderResult>;
}

export interface CircuitBreakerConfig {
  failureThreshold?: number; // default 3
  cooldownMs?: number;       // default 15000ms
  halfOpenSuccessThreshold?: number; // default 1
}
