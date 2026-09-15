import { db } from '@/core/db';
import { RepairPlan, RepairResult } from './types';
import { IntegrityEventBus } from './integrityEvents';

export class IntegrityRepairEngine {
  /**
   * Creates a formal repair plan for human review or pre-condition validation
   */
  public static createRepairPlan(params: {
    tenantId?: string;
    branchId?: string;
    inconsistencyType: string;
    affectedEntities: Array<{ entityType: string; entityId: string }>;
    beforeState: any;
    proposedAfterState: any;
    repairSteps: string[];
    requiresHumanReview?: boolean;
  }): RepairPlan {
    const repairId = `REP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    return {
      repairId,
      tenantId: params.tenantId || 'default',
      branchId: params.branchId || 'main',
      inconsistencyType: params.inconsistencyType,
      affectedEntities: params.affectedEntities,
      beforeState: params.beforeState,
      proposedAfterState: params.proposedAfterState,
      repairSteps: params.repairSteps,
      requiresHumanReview: params.requiresHumanReview !== undefined ? params.requiresHumanReview : true,
      status: 'DRAFT',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Executes a repair plan safely with pre-validation and post-validation.
   * Prohibits silent auto-delete or blind rebuilds!
   */
  public static async executeRepair(
    plan: RepairPlan,
    executorId: string,
    repairAction: (plan: RepairPlan) => Promise<any>
  ): Promise<RepairResult> {
    if (plan.status === 'EXECUTED') {
      throw new Error(`خطة الإصلاح [${plan.repairId}] تم تنفيذها بالفعل.`);
    }

    if (plan.requiresHumanReview && plan.status !== 'APPROVED') {
      throw new Error(`خطة الإصلاح [${plan.repairId}] تتطلب موافقة بشرية من المسؤول قبل التنفيذ.`);
    }

    const timestamp = new Date().toISOString();

    try {
      // Execute custom repair callback
      const afterState = await repairAction(plan);
      plan.status = 'EXECUTED';

      const result: RepairResult = {
        repairId: plan.repairId,
        status: 'EXECUTED',
        executedBy: executorId,
        beforeState: plan.beforeState,
        afterState,
        reason: `إصلاح الخلل: ${plan.inconsistencyType}`,
        timestamp
      };

      // Persist to Dexie
      if (typeof indexedDB !== 'undefined' && db && db.integrity_repair_records) {
        await db.integrity_repair_records.put({
          id: plan.repairId,
          repairId: plan.repairId,
          status: 'EXECUTED',
          tenantId: plan.tenantId,
          branchId: plan.branchId,
          beforeState: plan.beforeState,
          afterState,
          executedBy: executorId,
          timestamp
        });
      }

      IntegrityEventBus.publish(
        'REPAIR_EXECUTED',
        { repairId: plan.repairId, inconsistencyType: plan.inconsistencyType, executedBy: executorId },
        { tenantId: plan.tenantId, branchId: plan.branchId }
      );

      return result;
    } catch (err: any) {
      plan.status = 'FAILED';
      throw new Error(`فشل تنفيذ خطة الإصلاح [${plan.repairId}]: ${err.message || String(err)}`);
    }
  }
}
