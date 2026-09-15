// src/features/purchases/services/smartImport/feedback/correctionFeedback.types.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Human Correction Feedback Types
 */

import { ImportSourceType } from '../types';

export interface CorrectionFeedbackRecord {
  id: string;
  tenantId: string;
  branchId?: string;
  sourceType: ImportSourceType;
  field: string;
  originalExtractedValue?: any;
  correctedValue?: any;
  provider: string;
  confidenceBefore: number;
  correctionReason?: string;
  timestamp: string;
  isAppliedToCatalog?: boolean; // strictly false by default to prevent alias pollution
}
