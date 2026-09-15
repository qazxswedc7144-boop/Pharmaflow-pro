// src/features/purchases/services/smartImport/selfHealing/selfHealing.types.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Self-Healing & Field-Level Cross-Validation Types
 */

export type HealingMethod = 
  | 'MATH_RECONSTRUCTION' 
  | 'DATE_NORMALIZATION' 
  | 'BARCODE_CHECKSUM_CLEANUP' 
  | 'TEXT_SANITIZATION' 
  | 'NONE';

export interface FieldHealingResult<T = any> {
  field: string;
  originalValue: T;
  healedValue: T;
  isHealed: boolean;
  healingMethod: HealingMethod;
  explanation: string;
  confidenceDelta: number; // e.g. +0.25
}

export interface RowHealingResult {
  rowNumber: number;
  isModified: boolean;
  healedFields: FieldHealingResult[];
  explanations: string[];
}
