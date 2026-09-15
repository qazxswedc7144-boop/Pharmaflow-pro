import { BusinessWorkflow, WorkflowContext, WorkflowResult } from './workflow.types';
import { WorkflowContextFactory } from './workflowContext';
import { WorkflowExecutionPipeline } from './workflowExecution';
import { workflowRegistry } from './workflowRegistry';
import { WorkflowExecutionError } from './workflowError';
import { WorkflowResultBuilder } from './workflowResult';

export class WorkflowOrchestrator {
  /**
   * Central execution method for any business workflow.
   *
   * @param workflowOrId Registered workflow ID or BusinessWorkflow instance
   * @param input Domain input parameters
   * @param contextOptions Optional override for workflow context
   */
  public static async execute<TInput = any, TResult = any>(
    workflowOrId: string | BusinessWorkflow<TInput, TResult>,
    input: TInput,
    contextOptions?: Partial<WorkflowContext>
  ): Promise<WorkflowResult<TResult>> {
    let workflow: BusinessWorkflow<TInput, TResult> | undefined;

    if (typeof workflowOrId === 'string') {
      workflow = workflowRegistry.get<TInput, TResult>(workflowOrId);
      if (!workflow) {
        const ctx = WorkflowContextFactory.create('UNKNOWN', contextOptions);
        return WorkflowResultBuilder.failure(
          new WorkflowExecutionError(`لم يتم العثور على سير العمل المسجل بـ [${workflowOrId}]`, 'VALIDATION_FAILED'),
          'VALIDATION_FAILED',
          ctx
        );
      }
    } else {
      workflow = workflowOrId;
      if (!workflowRegistry.has(workflow.id)) {
        workflowRegistry.register(workflow as BusinessWorkflow);
      }
    }

    const ctx = WorkflowContextFactory.create(workflow.operationType, contextOptions);
    return await WorkflowExecutionPipeline.run(workflow, input, ctx);
  }

  /**
   * Registers a workflow instance in the orchestrator registry.
   */
  public static registerWorkflow(workflow: BusinessWorkflow): void {
    workflowRegistry.register(workflow);
  }

  /**
   * Returns all registered workflow instances.
   */
  public static getRegisteredWorkflows(): BusinessWorkflow[] {
    return workflowRegistry.getAll();
  }
}
