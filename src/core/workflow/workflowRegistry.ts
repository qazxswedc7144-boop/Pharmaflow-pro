import { BusinessWorkflow } from './workflow.types';

export class WorkflowRegistry {
  private static instance: WorkflowRegistry;
  private workflows: Map<string, BusinessWorkflow> = new Map();

  private constructor() {}

  public static getInstance(): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry();
    }
    return WorkflowRegistry.instance;
  }

  public register(workflow: BusinessWorkflow): void {
    if (this.workflows.has(workflow.id)) {
      console.warn(`[WorkflowRegistry] Workflow [${workflow.id}] is already registered. Overwriting.`);
    }
    this.workflows.set(workflow.id, workflow);
  }

  public get<TInput = any, TResult = any>(id: string): BusinessWorkflow<TInput, TResult> | undefined {
    return this.workflows.get(id) as BusinessWorkflow<TInput, TResult> | undefined;
  }

  public has(id: string): boolean {
    return this.workflows.has(id);
  }

  public list(): string[] {
    return Array.from(this.workflows.keys());
  }

  public getAll(): BusinessWorkflow[] {
    return Array.from(this.workflows.values());
  }

  public clear(): void {
    this.workflows.clear();
  }
}

export const workflowRegistry = WorkflowRegistry.getInstance();
