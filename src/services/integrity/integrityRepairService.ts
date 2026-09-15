import { IntegrityRepairEngine } from '@/core/integrity/integrityRepair';
import { RepairPlan, RepairResult } from '@/core/integrity/types';
import { IntegrityAuditService } from './integrityAuditService';
import { DataConsistencyService } from './dataConsistencyService';

export class IntegrityRepairService {
  /**
   * Generates a repair plan for an inconsistent transaction or entity
   */
  public static async createPlanForInconsistency(
    domain: 'SALES' | 'PURCHASES',
    referenceId: string
  ): Promise<RepairPlan> {
    const report =
      domain === 'SALES'
        ? await DataConsistencyService.verifySaleConsistency(referenceId)
        : await DataConsistencyService.verifyPurchaseConsistency(referenceId);

    const steps: string[] = [];
    if (!report.hasInventoryMovement) steps.push('إعادة إنشاء حركات المخزون المفقودة');
    if (!report.hasJournalEntry) steps.push('إعادة توليد القيد المحاسبي المزدوج المتوازن');
    if (!report.hasLedgerUpdate) steps.push('تحديث سجلات الحسابات والذمم المتممة');

    return IntegrityRepairEngine.createRepairPlan({
      tenantId: 'default',
      branchId: 'main',
      inconsistencyType: `انحراف في اتساق بيانات [${domain}] للمستند #${referenceId}`,
      affectedEntities: [{ entityType: domain, entityId: referenceId }],
      beforeState: report,
      proposedAfterState: { expectedState: 'VALID', stepsToApply: steps },
      repairSteps: steps,
      requiresHumanReview: true
    });
  }

  /**
   * Executes a repair plan safely with pre and post validation checks
   */
  public static async executeRepairSafely(
    plan: RepairPlan,
    executedBy: string,
    repairHandler: (plan: RepairPlan) => Promise<any>
  ): Promise<RepairResult> {
    const result = await IntegrityRepairEngine.executeRepair(plan, executedBy, repairHandler);

    await IntegrityAuditService.logAudit({
      operationType: 'INTEGRITY_REPAIR',
      entityType: plan.affectedEntities[0]?.entityType || 'UNKNOWN',
      entityId: plan.affectedEntities[0]?.entityId || 'UNKNOWN',
      userId: executedBy,
      status: 'COMMITTED',
      resultReference: plan.repairId
    });

    return result;
  }
}
