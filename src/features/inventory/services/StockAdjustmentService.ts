
import { UnifiedBusinessWorkflowOrchestrator } from '@/services/orchestration/UnifiedBusinessWorkflowOrchestrator';

export class StockAdjustmentService {
  
  static async performPhysicalCount(params: {
    productId: string,
    warehouseId: string,
    actualQty: number,
    userId: string,
    notes?: string
  }) {
    await UnifiedBusinessWorkflowOrchestrator.processInventoryAdjustment(params);
  }
}

