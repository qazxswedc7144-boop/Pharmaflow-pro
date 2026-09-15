import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { Product } from '@/types';
import { InventoryService } from '@features/inventory/services/InventoryService';
import { AuditService } from '@/services/system/AuditService';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';

export interface ProductApplicationInput {
  product: Product;
  isNew?: boolean;
}

export interface ProductApplicationResult {
  success: boolean;
  productId: string;
}

export class ProductApplicationWorkflow implements BusinessWorkflow<ProductApplicationInput, ProductApplicationResult> {
  public id = 'catalog.product.save';
  public name = 'حفظ وتسجيل الصنف الدوائي';
  public operationType = 'PRODUCT_SAVE';
  public requiredPermissions = ['products.edit', 'products.manage'];
  public tables = ['products', 'auditLogs', 'idempotencyKeys', 'projectionEvents'];

  public async validateInput(input: ProductApplicationInput): Promise<void> {
    if (!input.product) {
      throw new Error('بيانات الصنف مطلوبة للحفظ');
    }
    const name = input.product.name || (input.product as any).Name;
    if (!name || !name.trim()) {
      throw new Error('اسم الصنف مطلوب');
    }
  }

  public async validateBusinessRules(_input: ProductApplicationInput): Promise<void> {
    // Standard business rule validations for product application
  }

  public async executeDomainSteps(
    input: ProductApplicationInput,
    ctx: WorkflowContext
  ): Promise<ProductApplicationResult> {
    const savedId = await InventoryService.saveProduct(input.product);

    await (AuditService.log as any)({
      action: input.isNew ? 'CREATE' : 'EDIT',
      module: 'CATALOG',
      transactionUuid: ctx.workflowId,
      recordId: savedId
    });

    await ProjectionEventBus.publish('PRODUCT_SAVED', savedId, {
      productId: savedId,
      correlationId: ctx.correlationId
    });

    return {
      success: true,
      productId: savedId
    };
  }
}

export const productApplicationWorkflow = new ProductApplicationWorkflow();
