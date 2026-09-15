import { WorkflowContext } from './workflow.types';
import { generateTransactionUuid } from '@/utils/uuid';
import { authService } from '@features/auth/services/authService';

export class WorkflowContextFactory {
  /**
   * Creates a standardized, unified WorkflowContext instance.
   */
  public static create(
    operationType: string,
    options?: Partial<WorkflowContext>
  ): WorkflowContext {
    const user = authService.getCurrentUser?.() || null;

    const workflowId = options?.workflowId || `WF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const correlationId = options?.correlationId || `CORR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const tenantId = options?.tenantId || (user as any)?.tenantId || 'default';
    const branchId = options?.branchId || (user as any)?.branchId || 'main';
    const userId = options?.userId || user?.id || 'system';
    const deviceId = options?.deviceId || 'browser-client';
    const idempotencyKey =
      options?.idempotencyKey ||
      generateTransactionUuid(operationType.toUpperCase().replace(/[^A-Z0-9]/g, '_') as any);

    return {
      workflowId,
      correlationId,
      idempotencyKey,
      tenantId,
      branchId,
      userId,
      deviceId,
      operationType,
      startedAt: options?.startedAt || new Date().toISOString(),
      metadata: options?.metadata || {}
    };
  }
}
