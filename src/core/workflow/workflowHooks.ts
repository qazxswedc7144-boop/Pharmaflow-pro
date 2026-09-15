import { WorkflowContext, WorkflowHooks } from './workflow.types';

export class WorkflowHooksRunner {
  public static async runHook<T = any>(
    hookFn: ((param: T, ctx: WorkflowContext) => Promise<void>) | undefined,
    param: T,
    ctx: WorkflowContext,
    hookName: keyof WorkflowHooks
  ): Promise<void> {
    if (!hookFn) return;
    try {
      await hookFn(param, ctx);
    } catch (err: any) {
      console.warn(`[WorkflowHooksRunner] Warning: Hook [${hookName}] failed for workflow [${ctx.workflowId}]:`, err.message || err);
      // Hooks do not throw unless explicitly critical, but log via observability
    }
  }
}
