// src/features/purchases/services/smartImport/confidence/confidence.types.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Explainable Field-Level Confidence Types
 */

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';

export interface FieldConfidence {
  field: string;
  score: number; // 0.00 to 1.00
  level: ConfidenceLevel;
  reasons: string[];
  extractedValue?: any;
  resolvedValue?: any;
  isOverriddenByUser?: boolean;
  isHealed?: boolean;
  healingMethod?: string;
}

export interface RowConfidenceMap {
  rowNumber: number;
  productNameConfidence: FieldConfidence;
  quantityConfidence: FieldConfidence;
  unitPriceConfidence: FieldConfidence;
  totalConfidence: FieldConfidence;
  expiryDateConfidence: FieldConfidence;
  barcodeConfidence: FieldConfidence;
  batchNumberConfidence: FieldConfidence;
  compositeScore: number;
  compositeLevel: ConfidenceLevel;
  reasons: string[];
}

export interface DocumentConfidenceReport {
  supplierConfidence: FieldConfidence;
  invoiceNumberConfidence: FieldConfidence;
  invoiceDateConfidence: FieldConfidence;
  rows: Record<number, RowConfidenceMap>;
  overallScore: number;
  overallLevel: ConfidenceLevel;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  blockedCount: number;
  reasons: string[];
}
