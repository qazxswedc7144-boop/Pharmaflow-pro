import { WorkflowContext } from './workflow.types';
import { IntegrityRecoveryManager } from '@/core/integrity/integrityRecovery';

export class WorkflowRecovery {
  /**
   * Registers a failed or interrupted workflow for recovery processing
   */
  public static async registerFailure(
    ctx: WorkflowContext,
    error: Error
  ): Promise<string> {
    try {
      const incidentId = await IntegrityRecoveryManager.registerFailure(
        ctx.workflowId,
        ctx.operationType,
        error,
        {
          correlationId: ctx.correlationId,
          idempotencyKey: ctx.idempotencyKey,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: ctx.deviceId
        }
      );
      return incidentId;
    } catch (err) {
      console.warn('[WorkflowRecovery] Failed to register failure incident:', err);
      return `INCIDENT-FALLBACK-${Date.now()}`;
    }
  }
}
