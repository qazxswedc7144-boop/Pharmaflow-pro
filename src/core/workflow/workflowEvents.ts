import { WorkflowContext } from './workflow.types';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';

export type WorkflowEventType =
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_ROLLED_BACK';

export class WorkflowEventBus {
  public static async emit(
    eventType: WorkflowEventType,
    ctx: WorkflowContext,
    payload?: Record<string, unknown>
  ): Promise<void> {
    try {
      await ProjectionEventBus.publish(eventType, ctx.workflowId, {
        correlationId: ctx.correlationId,
        idempotencyKey: ctx.idempotencyKey,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        operationType: ctx.operationType,
        ...payload
      });
    } catch (err) {
      console.warn(`[WorkflowEventBus] Failed to publish event [${eventType}]:`, err);
    }
  }
}
