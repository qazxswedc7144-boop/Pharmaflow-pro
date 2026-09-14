// src/features/purchases/services/smartImport/aliasLearning/aliasLearning.types.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Supplier & Product Alias Learning System — Core Type Definitions
 */

export enum AliasSource {
  MANUAL_DECISION = 'MANUAL_DECISION',
  IMPORT_CONFIRMATION = 'IMPORT_CONFIRMATION',
  SYSTEM_SEED = 'SYSTEM_SEED',
  CATALOG_SYNC = 'CATALOG_SYNC'
}

export enum AliasScope {
  GLOBAL = 'GLOBAL',
  SUPPLIER_SPECIFIC = 'SUPPLIER_SPECIFIC'
}

export interface SupplierAlias {
  id: string;
  tenantId: string;
  branchId?: string;
  supplierId: string;
  aliasRaw: string;
  aliasNormalized: string;
  source: AliasSource;
  confidence: number;
  usageCount: number;
  confirmedCount: number;
  rejectedCount: number;
  lastUsedAt: string;
  lastConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ProductAlias {
  id: string;
  tenantId: string;
  branchId?: string;
  supplierId?: string; // If undefined or 'GLOBAL', alias applies globally to the tenant
  productId: string;
  aliasRaw: string;
  aliasNormalized: string;
  isGlobal: boolean;
  source: AliasSource;
  confidence: number;
  usageCount: number;
  confirmedCount: number;
  rejectedCount: number;
  lastUsedAt: string;
  lastConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface SupplierProductReference {
  id: string;
  tenantId: string;
  supplierId: string;
  productId: string;
  supplierProductCode: string;
  supplierProductName: string;
  normalizedName: string;
  barcode?: string;
  lastPurchasePrice?: number;
  lastSeenAt: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RejectedCandidate {
  id: string;
  tenantId: string;
  supplierId?: string;
  aliasRaw: string;
  aliasNormalized: string;
  rejectedProductId?: string;
  rejectedSupplierId?: string;
  rejectionCount: number;
  lastRejectedAt: string;
  reason?: string;
  rejectedBy?: string;
}

export type AliasAuditAction =
  | 'SUPPLIER_ALIAS_CONFIRMED'
  | 'SUPPLIER_ALIAS_REJECTED'
  | 'PRODUCT_ALIAS_CONFIRMED'
  | 'PRODUCT_ALIAS_REJECTED'
  | 'SUPPLIER_PRODUCT_REFERENCE_LEARNED'
  | 'ALIAS_CONFLICT_DETECTED'
  | 'ALIAS_OVERRIDDEN';

export interface AliasAuditLog {
  id: string;
  tenantId: string;
  branchId?: string;
  userId: string;
  timestamp: string;
  action: AliasAuditAction;
  aliasType: 'SUPPLIER' | 'PRODUCT' | 'CATALOG_REF' | 'REJECTION';
  aliasId?: string;
  supplierId?: string;
  productId?: string;
  rawImportedValue: string;
  normalizedValue: string;
  decision: string;
  previousMapping?: string;
  newMapping?: string;
  confidence: number;
  sourceImportId?: string;
  details?: string;
}

export interface NormalizedPharmaceuticalInfo {
  rawText: string;
  normalizedText: string;
  dosage?: {
    value: number;
    unit: 'mg' | 'g' | 'mcg' | 'ml' | 'iu' | 'percent' | string;
    raw: string;
  };
  form?: 'tab' | 'cap' | 'syrup' | 'inj' | 'susp' | 'drops' | 'cream' | 'oint' | 'sachet' | 'supp' | 'spray' | string;
  packSize?: number;
}

export interface DosageFormSafetyResult {
  isSafe: boolean;
  reason?: string;
  severity?: 'CRITICAL' | 'WARNING' | 'INFO';
  importedInfo?: NormalizedPharmaceuticalInfo;
  targetProductInfo?: NormalizedPharmaceuticalInfo;
}

export interface AliasMatchCandidateResult {
  productId: string;
  productName: string;
  matchType: 
    | 'SUPPLIER_ALIAS' 
    | 'GLOBAL_ALIAS' 
    | 'SUPPLIER_CATALOG_REF' 
    | 'BARCODE' 
    | 'CODE' 
    | 'EXACT' 
    | 'NORMALIZED' 
    | 'FUZZY';
  confidence: number;
  aliasId?: string;
  isSupplierSpecific: boolean;
  safetyCheck: DosageFormSafetyResult;
}

export interface PreloadedAliasContext {
  supplierAliases: Map<string, SupplierAlias>; // key: aliasNormalized
  supplierSpecificProductAliases: Map<string, ProductAlias>; // key: `${supplierId}::${aliasNormalized}`
  globalProductAliases: Map<string, ProductAlias>; // key: aliasNormalized
  catalogReferences: Map<string, SupplierProductReference>; // key: `${supplierId}::${supplierProductCode}`
  rejections: Set<string>; // key: `${tenantId}::${supplierId || 'GLOBAL'}::${aliasNormalized}::${productId}`
}
