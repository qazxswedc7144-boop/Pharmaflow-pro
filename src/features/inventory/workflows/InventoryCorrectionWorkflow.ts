// src/features/inventory/workflows/InventoryCorrectionWorkflow.ts
/**
 * PharmaFlow PRO ERP — Phase 3.3: Controlled Inventory Correction Workflow
 * Central orchestration facade implementing:
 * Workflow → Services → Repositories → DB
 * 
 * Strict enterprise rules:
 * - No automatic fixes or silent corrections.
 * - Every correction originates from a human decision.
 * - Atomic transactions with automatic post-execution reconciliation.
 * - Tenant and branch isolation.
 * - Role-based authorization: Employee cannot approve/execute, Manager proposes/reviews, Owner/Admin approves/executes.
 */

import { InventoryCorrectionService } from '../services/InventoryCorrectionService';
import { InventoryCorrectionRepository } from '../repositories/InventoryCorrectionRepository';
import { 
  InventoryReconciliationService, 
  AuditFilterCriteria, 
  SystemReconciliationSummary 
} from '../services/InventoryReconciliationService';
import { 
  InventoryCorrectionCase, 
  CorrectionProposal, 
  CorrectionCaseStatus, 
  UserSecurityContext, 
  CaseFilterOptions 
} from '../types/correction.types';

export class InventoryCorrectionWorkflow {

  /**
   * Performs an audit across inventory and registers any detected discrepancies as OPEN cases.
   * STRICT: Read-only detection and case creation. Does NOT auto-fix.
   */
  static async scanAndRegisterDiscrepancies(
    criteria: AuditFilterCriteria = {},
    userContext?: Partial<UserSecurityContext>
  ): Promise<{
    summary: SystemReconciliationSummary;
    createdCasesCount: number;
    newCases: InventoryCorrectionCase[];
  }> {
    // 1. Run Read-Only Ledger Audit
    const summary = await InventoryReconciliationService.auditAllProducts(criteria);

    const newCases: InventoryCorrectionCase[] = [];

    // 2. Register detected discrepancies as human-reviewed OPEN cases
    const audits = summary.productAudits || (summary as any).results || [];
    for (const report of audits) {
      if (report.discrepancies.length > 0) {
        const cases = await InventoryCorrectionService.registerDiscrepancyCases(report, userContext);
        newCases.push(...cases);
      }
    }

    return {
      summary,
      createdCasesCount: newCases.length,
      newCases
    };
  }

  /**
   * Assigns or marks a case as UNDER_REVIEW by an authorized manager or reviewer.
   */
  static async startCaseReview(
    caseId: string,
    user: UserSecurityContext,
    notes?: string
  ): Promise<InventoryCorrectionCase> {
    return await InventoryCorrectionService.startReview(caseId, user, notes);
  }

  /**
   * Submits a formal, human-designed correction proposal with mandatory reason and targets.
   * State: UNDER_REVIEW / OPEN -> PROPOSED
   */
  static async submitCorrectionProposal(
    caseId: string,
    proposal: Omit<CorrectionProposal, 'proposedBy' | 'proposedRole' | 'proposedAt'>,
    user: UserSecurityContext
  ): Promise<InventoryCorrectionCase> {
    return await InventoryCorrectionService.submitProposal(caseId, proposal, user);
  }

  /**
   * Authorizes and approves a proposed correction.
   * Strictly restricted to Owner / Admin roles.
   * State: PROPOSED -> APPROVED
   */
  static async approveCorrection(
    caseId: string,
    approver: UserSecurityContext,
    notes?: string
  ): Promise<InventoryCorrectionCase> {
    return await InventoryCorrectionService.approveCase(caseId, approver, notes);
  }

  /**
   * Rejects a proposed correction with a mandatory rejection explanation.
   * State: PROPOSED / UNDER_REVIEW -> REJECTED
   */
  static async rejectCorrection(
    caseId: string,
    approver: UserSecurityContext,
    rejectionReason: string
  ): Promise<InventoryCorrectionCase> {
    return await InventoryCorrectionService.rejectCase(caseId, approver, rejectionReason);
  }

  /**
   * Executes an approved correction inside an atomic transaction with post-reconciliation verification.
   * Strictly restricted to Owner / Admin roles.
   * State: APPROVED -> EXECUTED -> RECONCILED (or rollback)
   */
  static async executeCorrection(
    caseId: string,
    executor: UserSecurityContext,
    idempotencyKey?: string
  ): Promise<InventoryCorrectionCase> {
    return await InventoryCorrectionService.executeCorrection(caseId, executor, idempotencyKey);
  }

  /**
   * Retrieves a single correction case by ID.
   */
  static async getCase(caseId: string, tenantId?: string): Promise<InventoryCorrectionCase | null> {
    return await InventoryCorrectionRepository.findById(caseId, tenantId);
  }

  /**
   * Queries correction cases with filtering, searching, and pagination support.
   */
  static async listCases(filters: CaseFilterOptions = {}): Promise<InventoryCorrectionCase[]> {
    return await InventoryCorrectionRepository.queryCases(filters);
  }

  /**
   * Retrieves dashboard status counts and metrics for inventory resolution.
   */
  static async getSummaryMetrics(
    tenantId?: string, 
    branchId?: string | null
  ): Promise<Record<CorrectionCaseStatus, number>> {
    return await InventoryCorrectionRepository.countByStatus(tenantId, branchId);
  }
}
