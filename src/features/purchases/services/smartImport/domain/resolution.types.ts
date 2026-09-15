// src/features/purchases/services/smartImport/domain/resolution.types.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.4: Unified Resolution Domain Model & Contracts
 */

import { ImportDiagnostic } from '../types';
import { NormalizedPharmaceuticalInfo } from '../aliasLearning/aliasLearning.types';

export type ResolutionStatus =
  | 'AUTO_RESOLVED'
  | 'PENDING_REVIEW'
  | 'USER_RESOLVED'
  | 'SKIPPED'
  | 'BLOCKED'
  | 'REJECTED';

export type ResolutionCategory =
  | 'SUPPLIER'
  | 'PRODUCT'
  | 'CONFLICT'
  | 'VALIDATION';

export type ResolutionDecision =
  | 'ACCEPT_AUTO_MATCH'
  | 'LINK_EXISTING'
  | 'CREATE_NEW'
  | 'EDIT_AND_CREATE'
  | 'SKIP'
  | 'REJECT'
  | 'KEEP_MANUAL'
  | 'RESOLVE_CONFLICT';

export type ConflictSource =
  | 'IMPORT'
  | 'SYNC'
  | 'DATABASE'
  | 'BUSINESS_WORKFLOW';

export type ConflictType =
  | 'DOSAGE_SAFETY_CONFLICT'
  | 'SAME_RECORD_CONFLICT'
  | 'VERSION_CONFLICT'
  | 'STOCK_CONFLICT'
  | 'ACCOUNTING_CONFLICT'
  | 'DUPLICATE_MUTATION'
  | 'BRANCH_CONFLICT'
  | 'TENANT_CONFLICT'
  | 'PERMISSION_CONFLICT'
  | 'DELETED_RECORD_CONFLICT'
  | 'SCHEMA_VERSION_CONFLICT';

export interface ResolutionCandidate {
  id: string;
  name: string;
  score: number;
  barcode?: string;
  supplierProductCode?: string;
  costPrice?: number;
  unitPrice?: number;
  stockQuantity?: number;
  categoryName?: string;
  phone?: string;
  taxNumber?: string;
  address?: string;
  pharmaceuticalInfo?: NormalizedPharmaceuticalInfo;
  matchTier?: string;
  explanation?: string;
}

export interface DosageSafetyReport {
  isConflict: boolean;
  conflictType?: ConflictType | string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  reason?: string;
  sourceStrength?: string;
  sourceForm?: string;
  matchedStrength?: string;
  matchedForm?: string;
  importedInfo?: NormalizedPharmaceuticalInfo;
  targetProductInfo?: NormalizedPharmaceuticalInfo;
}

export interface ResolutionItem {
  id: string;
  tenantId: string;
  branchId: string;
  category: ResolutionCategory;
  status: ResolutionStatus;
  sourceValue: string;
  normalizedValue: string;
  confidence: number;
  candidateMatches: ResolutionCandidate[];
  selectedCandidate?: ResolutionCandidate;
  reason?: string;
  diagnostics?: ImportDiagnostic[];
  originalRowReference?: {
    rowIndex: number;
    rawText?: string;
    barcode?: string;
    supplierProductCode?: string;
    quantity?: number;
    unitPrice?: number;
    total?: number;
    expiryDate?: string;
    batchNumber?: string;
    discountPercent?: number;
    bonusQty?: number;
    notes?: string;
  };
  userDecision?: ResolutionDecision;
  resolvedBy?: string;
  resolvedAt?: string;
  dosageSafety?: DosageSafetyReport;
  conflictSource?: ConflictSource;
  conflictType?: ConflictType;
  newEntityDraft?: {
    name: string;
    barcode?: string;
    categoryId?: string;
    categoryName?: string;
    unitPrice?: number;
    costPrice?: number;
    phone?: string;
    taxNumber?: string;
    address?: string;
    pharmaceuticalInfo?: NormalizedPharmaceuticalInfo;
  };
}

export interface ResolutionSummaryMetrics {
  totalItems: number;
  autoResolvedCount: number;
  pendingReviewCount: number;
  userResolvedCount: number;
  newProductsCount: number;
  supplierPendingCount: number;
  criticalConflictsCount: number;
  skippedCount: number;
  totalAmount: number;
  detectedSupplier?: string;
  detectedInvoiceNumber?: string;
  detectedDate?: string;
}

export interface ResolutionValidationReport {
  canApply: boolean;
  isValid: boolean;
  blockingReasons: string[];
  warnings: string[];
  unresolvedCount: number;
  criticalConflictCount: number;
}
