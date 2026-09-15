// src/features/inventory/repositories/InventoryCorrectionRepository.ts
/**
 * PharmaFlow PRO ERP — Phase 3.3: Controlled Inventory Correction Repository
 * Sovereign multi-tenant and multi-branch data access layer for correction cases.
 */

import { db, getCurrentUserSession } from '@/core/db';
import { 
  InventoryCorrectionCase, 
  CaseFilterOptions, 
  CorrectionCaseStatus, 
  DiscrepancyType 
} from '../types/correction.types';

export class InventoryCorrectionRepository {
  private static getTable() {
    try {
      if (db.inventoryCorrectionCases) {
        return db.inventoryCorrectionCases;
      }
      return db.table('inventoryCorrectionCases');
    } catch {
      return db.table('inventoryCorrectionCases');
    }
  }

  /**
   * Persists or updates an inventory correction case.
   */
  static async save(caseData: InventoryCorrectionCase): Promise<InventoryCorrectionCase> {
    const session = getCurrentUserSession();
    const resolvedTenantId = caseData.tenantId || session.tenantId || 'default-tenant';
    
    const record: InventoryCorrectionCase = {
      ...caseData,
      tenantId: resolvedTenantId,
      updatedAt: new Date().toISOString()
    };

    const table = this.getTable();
    await table.put(record);
    return record;
  }

  /**
   * Retrieves a single correction case by its primary ID, with strict tenant verification.
   */
  static async findById(id: string, tenantId?: string): Promise<InventoryCorrectionCase | null> {
    if (!id) return null;
    const session = getCurrentUserSession();
    const activeTenant = tenantId || session.tenantId || 'default-tenant';
    
    const table = this.getTable();
    const item = await table.get(id);
    if (!item) return null;

    // Strict tenant isolation guard
    if (item.tenantId && activeTenant && item.tenantId !== activeTenant) {
      return null;
    }

    return item as InventoryCorrectionCase;
  }

  /**
   * Retrieves a case by its human-readable case number (e.g. CORR-2026-0001).
   */
  static async findByCaseNumber(caseNumber: string, tenantId?: string): Promise<InventoryCorrectionCase | null> {
    if (!caseNumber) return null;
    const session = getCurrentUserSession();
    const activeTenant = tenantId || session.tenantId || 'default-tenant';

    const table = this.getTable();
    const all = await table.toArray();
    const found = all.find((c: InventoryCorrectionCase) => 
      c.caseNumber === caseNumber && (!activeTenant || c.tenantId === activeTenant)
    );

    return found ? (found as InventoryCorrectionCase) : null;
  }

  /**
   * Finds an existing unresolved case for a given product and discrepancy type.
   * Prevents duplicate open cases for the same discrepancy.
   */
  static async findExistingOpenCase(
    productId: string,
    discrepancyType: DiscrepancyType,
    tenantId?: string,
    branchId?: string | null
  ): Promise<InventoryCorrectionCase | null> {
    const session = getCurrentUserSession();
    const activeTenant = tenantId || session.tenantId || 'default-tenant';

    const table = this.getTable();
    const all = await table.toArray();

    const openStatuses: CorrectionCaseStatus[] = ['OPEN', 'UNDER_REVIEW', 'PROPOSED', 'APPROVED'];

    const match = all.find((c: InventoryCorrectionCase) => {
      if (c.tenantId !== activeTenant) return false;
      if (branchId !== undefined && branchId !== null && c.branchId && c.branchId !== branchId) return false;
      if (c.productId !== productId) return false;
      if (c.discrepancyType !== discrepancyType) return false;
      return openStatuses.includes(c.status);
    });

    return match ? (match as InventoryCorrectionCase) : null;
  }

  /**
   * Queries correction cases based on filtering options with tenant and branch scoping.
   */
  static async queryCases(filters: CaseFilterOptions = {}): Promise<InventoryCorrectionCase[]> {
    const session = getCurrentUserSession();
    const activeTenant = filters.tenantId || session.tenantId || 'default-tenant';

    const table = this.getTable();
    let items = (await table.toArray()) as InventoryCorrectionCase[];

    // Tenant Isolation
    if (activeTenant) {
      items = items.filter(c => c.tenantId === activeTenant);
    }

    // Branch Isolation
    if (filters.branchId) {
      items = items.filter(c => !c.branchId || c.branchId === filters.branchId);
    }

    // Status Filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        items = items.filter(c => (filters.status as CorrectionCaseStatus[]).includes(c.status));
      } else {
        items = items.filter(c => c.status === filters.status);
      }
    }

    // Product Filter
    if (filters.productId) {
      items = items.filter(c => c.productId === filters.productId);
    }

    // Discrepancy Type Filter
    if (filters.discrepancyType) {
      items = items.filter(c => c.discrepancyType === filters.discrepancyType);
    }

    // Text Search
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      items = items.filter(c => 
        c.caseNumber.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.productId.toLowerCase().includes(q) ||
        c.details?.diagnosticMessage?.toLowerCase().includes(q) ||
        c.proposedAction?.reason?.toLowerCase().includes(q)
      );
    }

    // Date Range
    if (filters.startDate) {
      items = items.filter(c => c.createdAt >= filters.startDate!);
    }
    if (filters.endDate) {
      items = items.filter(c => c.createdAt <= filters.endDate!);
    }

    // Sort by createdAt descending
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Generates a sequential and formatted human-readable Case Number.
   */
  static async getNextCaseNumber(tenantId?: string): Promise<string> {
    const session = getCurrentUserSession();
    const activeTenant = tenantId || session.tenantId || 'default-tenant';

    const table = this.getTable();
    const count = await table.where('tenantId').equals(activeTenant).count().catch(() => table.count());
    const year = new Date().getFullYear();
    const padded = String(count + 1).padStart(4, '0');
    return `CORR-${year}-${padded}`;
  }

  /**
   * Aggregates case count by status for dashboard metrics.
   */
  static async countByStatus(
    tenantId?: string, 
    branchId?: string | null
  ): Promise<Record<CorrectionCaseStatus, number>> {
    const cases = await this.queryCases({ tenantId, branchId: branchId || undefined });
    
    const summary: Record<CorrectionCaseStatus, number> = {
      OPEN: 0,
      UNDER_REVIEW: 0,
      PROPOSED: 0,
      APPROVED: 0,
      REJECTED: 0,
      EXECUTED: 0,
      RECONCILED: 0,
      ROLLBACK_FAILED: 0
    };

    for (const c of cases) {
      if (summary[c.status] !== undefined) {
        summary[c.status]++;
      }
    }

    return summary;
  }

  /**
   * Permanently deletes a case (strictly guarded).
   */
  static async delete(id: string, tenantId?: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return;
    const table = this.getTable();
    await table.delete(id);
  }
}
