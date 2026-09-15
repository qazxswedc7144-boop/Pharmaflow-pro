// src/features/inventory/types/correction.types.ts
/**
 * PharmaFlow PRO ERP — Phase 3.3: Controlled Inventory Correction & Human Resolution
 * Strongly-typed domain models and contracts for human-governed inventory discrepancy resolution.
 */

import { DiscrepancyType, ReconciliationStatus } from '../services/InventoryReconciliationService';

export type { DiscrepancyType, ReconciliationStatus };

export type CorrectionCaseStatus = 
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'RECONCILED'
  | 'ROLLBACK_FAILED';

export type CorrectionActionType =
  | 'PHYSICAL_COUNT_ADJUSTMENT'
  | 'ALIGN_LAYERS_ADJUSTMENT'
  | 'QUARANTINE_EXPIRED_BATCH'
  | 'RESOLVE_NEGATIVE_STOCK'
  | 'LINK_ORPHAN_DOCUMENT'
  | 'RECONCILE_UNLINKED_RETURN'
  | 'BATCH_EXPIRY_REHABILITATION'
  | 'MANUAL_LEDGER_SYNC';

export interface CorrectionProposal {
  actionType: CorrectionActionType;
  proposedQty: number;
  targetWarehouseId: string;
  targetLayerId?: string;
  targetBatchNumber?: string;
  targetExpiryDate?: string;
  referenceDocId?: string;
  reason: string; // MANDATORY: Detailed justification required
  costImpact?: number;
  supportingNotes?: string;
  proposedBy: string; // User ID / Email
  proposedRole: string; // Role of proposing user
  proposedAt: string; // ISO Timestamp
}

export interface CorrectionApproval {
  decision: 'APPROVED' | 'REJECTED';
  approvedBy: string; // User ID / Email of authorized approver
  approvalRole: string; // Must be ADMIN | OWNER | SUPER_ADMIN | ADMINISTRATOR
  approvedAt: string; // ISO Timestamp
  approvalNotes?: string;
}

export interface PostReconciliationVerification {
  isReconciled: boolean;
  postAuditStatus: ReconciliationStatus;
  remainingDiscrepanciesCount: number;
  verifiedAt: string;
  diagnostics?: string;
}

export interface CorrectionExecution {
  executedBy: string;
  executionRole: string;
  executedAt: string;
  idempotencyKey: string;
  refId: string;
  journalEntryId?: string;
  stockMovementId?: string;
  inventoryTransactionId?: string;
  reconciliationResult: PostReconciliationVerification;
}

export interface CorrectionAuditItem {
  id: string;
  timestamp: string;
  action: string;
  userId: string;
  userName: string;
  userRole: string;
  previousStatus: CorrectionCaseStatus;
  newStatus: CorrectionCaseStatus;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface InventoryCorrectionCase {
  id: string; // e.g. CASE-2026-XXXX
  caseNumber: string; // e.g. CORR-0001
  tenantId: string;
  branchId?: string | null;
  productId: string;
  productName: string;
  categoryName?: string;
  discrepancyType: DiscrepancyType;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: CorrectionCaseStatus;
  
  details: {
    expectedQty: number;
    actualQty: number;
    variance: number;
    sourceDocId?: string;
    batchNumber?: string;
    expiryDate?: string;
    layerId?: string;
    rawDiscrepancy?: any;
    diagnosticMessage: string;
  };

  assignedTo?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;

  proposedAction?: CorrectionProposal;
  approval?: CorrectionApproval;
  execution?: CorrectionExecution;

  auditTrail: CorrectionAuditItem[];

  createdAt: string;
  updatedAt: string;
}

export interface UserSecurityContext {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  tenantId: string;
  branchId?: string | null;
}

export interface CaseFilterOptions {
  tenantId?: string;
  branchId?: string;
  status?: CorrectionCaseStatus | CorrectionCaseStatus[];
  productId?: string;
  discrepancyType?: DiscrepancyType;
  search?: string;
  startDate?: string;
  endDate?: string;
}
