import { BusinessWorkflow, WorkflowContext } from './workflow.types';
import { WorkflowExecutionError } from './workflowError';

export class WorkflowValidation {
  /**
   * Executes input validation and domain business rules
   */
  public static async validate<TInput, TResult>(
    workflow: BusinessWorkflow<TInput, TResult>,
    input: TInput,
    ctx: WorkflowContext
  ): Promise<void> {
    // 1. Input Validation
    if (workflow.validateInput) {
      try {
        await workflow.validateInput(input, ctx);
      } catch (err: any) {
        throw new WorkflowExecutionError(
          `فشل التحقق من مدخلات العملية [${workflow.name}]: ${err.message || String(err)}`,
          'VALIDATION_FAILED',
          { originalError: err }
        );
      }
    }

    // 2. Business Rules Validation
    if (workflow.validateBusinessRules) {
      try {
        await workflow.validateBusinessRules(input, ctx);
      } catch (err: any) {
        throw new WorkflowExecutionError(
          `فشل التحقق من قواعد العمل للعملية [${workflow.name}]: ${err.message || String(err)}`,
          'BUSINESS_RULE_FAILED',
          { originalError: err }
        );
      }
    }
  }
}
