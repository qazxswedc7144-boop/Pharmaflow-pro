import { WorkflowContext, WorkflowResult, WorkflowError, WorkflowErrorCode } from './workflow.types';

export class WorkflowResultBuilder {
  public static success<TResult>(
    data: TResult,
    ctx: WorkflowContext,
    options?: {
      warnings?: string[];
      auditReference?: string;
      syncStatus?: 'ENQUEUED' | 'SYNCED' | 'FAILED' | 'LOCAL_ONLY';
    }
  ): WorkflowResult<TResult> {
    return {
      success: true,
      data,
      workflowId: ctx.workflowId,
      correlationId: ctx.correlationId,
      idempotencyKey: ctx.idempotencyKey,
      warnings: options?.warnings || [],
      auditReference: options?.auditReference,
      syncStatus: options?.syncStatus || 'ENQUEUED',
      metadata: { correlationId: ctx.correlationId, ...ctx.metadata }
    };
  }

  public static failure<TResult = any>(
    error: WorkflowError | Error | string,
    code: WorkflowErrorCode,
    ctx: WorkflowContext,
    options?: {
      warnings?: string[];
      auditReference?: string;
    }
  ): WorkflowResult<TResult> {
    let errObj: WorkflowError;

    if (typeof error === 'string') {
      errObj = { code, message: error };
    } else if (error instanceof Error && 'code' in error) {
      errObj = {
        code: (error as any).code || code,
        message: error.message,
        details: (error as any).details
      };
    } else if (error instanceof Error) {
      errObj = { code, message: error.message };
    } else {
      errObj = error;
    }

    return {
      success: false,
      workflowId: ctx.workflowId,
      correlationId: ctx.correlationId,
      idempotencyKey: ctx.idempotencyKey,
      warnings: options?.warnings || [],
      error: errObj,
      auditReference: options?.auditReference,
      syncStatus: 'FAILED'
    };
  }
}
