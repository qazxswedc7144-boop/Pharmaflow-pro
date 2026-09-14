// src/features/purchases/services/smartImport/batchProcessing/types.ts
/**
 * Types & Data Contracts for PharmaFlow Enterprise Smart Import Batch Processing Center (Phase 2.2)
 */

import { ImportSourceType, ImportDiagnostic } from '../types';
import { InvoiceItem, Product, Supplier } from '@/types';

export enum BatchProcessingStatus {
  ANALYZING = 'ANALYZING',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  PROCESSING = 'PROCESSING',
  PARTIALLY_RESOLVED = 'PARTIALLY_RESOLVED',
  READY_TO_APPLY = 'READY_TO_APPLY',
  APPLIED = 'APPLIED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED'
}

export enum SupplierResolutionStatus {
  EXACT_MATCH = 'EXACT_MATCH',
  HIGH_CONFIDENCE_MATCH = 'HIGH_CONFIDENCE_MATCH',
  POSSIBLE_MATCH = 'POSSIBLE_MATCH',
  NEW_SUPPLIER = 'NEW_SUPPLIER',
  AMBIGUOUS = 'AMBIGUOUS',
  UNRESOLVED = 'UNRESOLVED'
}

export enum SupplierResolutionAction {
  AUTO_MATCH = 'AUTO_MATCH',
  LINK_EXISTING = 'LINK_EXISTING',
  CREATE_NEW = 'CREATE_NEW',
  SKIP = 'SKIP',
  UNRESOLVED = 'UNRESOLVED'
}

export interface SupplierCandidate {
  id: string;
  name: string;
  phone?: string;
  taxNumber?: string;
  score: number;
}

export interface SupplierDecision {
  importedSupplierName: string;
  matchedSupplierId?: string;
  matchedSupplierName?: string;
  status: SupplierResolutionStatus;
  confidence: number;
  action: SupplierResolutionAction;
  suggestedSuppliers: SupplierCandidate[];
  newSupplierData?: {
    name: string;
    phone?: string;
    taxNumber?: string;
    address?: string;
  };
  reason?: string;
  isSkipped?: boolean;
}

export enum ProductResolutionAction {
  AUTO_MATCH = 'AUTO_MATCH',
  LINK_EXISTING = 'LINK_EXISTING',
  CREATE_NEW = 'CREATE_NEW',
  SKIP = 'SKIP',
  UNRESOLVED = 'UNRESOLVED'
}

export interface ProductCandidate {
  id: string;
  name: string;
  score: number;
  barcode?: string;
  costPrice?: number;
  unitPrice?: number;
  stockQuantity?: number;
  categoryName?: string;
}

export interface ProductDecision {
  sourceRowId: number;
  importedProductName: string;
  matchedProductId?: string;
  matchedProductName?: string;
  confidence: number;
  action: ProductResolutionAction;
  reason?: string;
  barcode?: string;
  supplierProductCode?: string;
  quantity: number;
  unitPrice: number;
  total?: number;
  expiryDate?: string;
  batchNumber?: string;
  discountPercent?: number;
  tax?: number;
  bonusQty?: number;
  unit?: string;
  notes?: string;
  suggestedProducts: ProductCandidate[];
  newProductData?: {
    name: string;
    barcode?: string;
    categoryId?: string;
    categoryName?: string;
    unitPrice?: number;
    costPrice?: number;
  };
  isNewProductCandidate?: boolean;
  isDuplicate?: boolean;
  duplicateReason?: string;
  isSkipped?: boolean;
  validationIssues: string[];
}

export interface BatchProcessingSummary {
  totalRows: number;
  autoMatchedCount: number;
  manualLinkedCount: number;
  createNewCount: number;
  skippedCount: number;
  unresolvedCount: number;
  totalAmount: number;
  detectedSupplier?: string;
  detectedInvoiceNumber?: string;
  detectedDate?: string;
}

export interface BatchProcessingSession {
  sessionId: string;
  tenantId: string;
  branchId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  sourceType: ImportSourceType;
  importDocumentId?: string;
  fileName?: string;
  supplierDecision: SupplierDecision;
  productDecisions: ProductDecision[];
  diagnostics: ImportDiagnostic[];
  summary: BatchProcessingSummary;
  status: BatchProcessingStatus;
  idempotencyKey?: string;
  appliedAt?: string;
  cancelledAt?: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  sourceRowId?: number;
  severity: 'ERROR' | 'WARNING';
}

export interface DecisionValidationResult {
  isValid: boolean;
  canApply: boolean;
  unresolvedCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface CanonicalResolutionResult {
  success: boolean;
  sessionId: string;
  tenantId: string;
  branchId: string;
  createdSupplier?: Supplier;
  createdSupplierId?: string;
  createdProducts: Product[];
  createdProductIds: string[];
  createdAliases: Array<{ sourceName: string; targetId: string; targetName: string }>;
  invoiceItems: InvoiceItem[];
  appliedSupplierId: string;
  appliedSupplierName: string;
  appliedInvoiceNumber: string;
  appliedDate: string;
  executionTimeMs: number;
  idempotentReplay?: boolean;
}

export interface BatchApplyContext {
  tenantId: string;
  branchId: string;
  userId: string;
  idempotencyKey: string;
  masterData?: {
    products?: Product[];
    suppliers?: Supplier[];
  };
}
