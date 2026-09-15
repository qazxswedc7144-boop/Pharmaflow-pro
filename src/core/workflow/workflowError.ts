import { WorkflowErrorCode, WorkflowError } from './workflow.types';

export class WorkflowExecutionError extends Error {
  public readonly code: WorkflowErrorCode;
  public readonly details?: Record<string, unknown> | any;

  constructor(message: string, code: WorkflowErrorCode = 'UNKNOWN_ERROR', details?: any) {
    super(message);
    this.name = 'WorkflowExecutionError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, WorkflowExecutionError.prototype);
  }

  public toWorkflowError(): WorkflowError {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}
