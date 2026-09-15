import { workflowRegistry } from './workflowRegistry';
import { purchaseWorkflow } from '@/features/purchases/workflows/PurchaseWorkflow';
import { salesWorkflow } from '@/features/sales/workflows/SalesWorkflow';
import { salesReturnWorkflow } from '@/features/returns/workflows/SalesReturnWorkflow';
import { purchaseReturnWorkflow } from '@/features/returns/workflows/PurchaseReturnWorkflow';
import { inventoryAdjustmentWorkflow } from '@/features/inventory/workflows/InventoryAdjustmentWorkflow';
import { inventoryTransferWorkflow } from '@/features/inventory/workflows/InventoryTransferWorkflow';
import { journalPostingWorkflow } from '@/features/accounting/workflows/JournalPostingWorkflow';
import { voucherWorkflow } from '@/features/accounting/workflows/VoucherWorkflow';
import { voucherCancellationWorkflow } from '@/features/accounting/workflows/VoucherCancellationWorkflow';
import { salesCancellationWorkflow } from '@/features/sales/workflows/SalesCancellationWorkflow';
import { productApplicationWorkflow } from '@/features/catalog/workflows/ProductApplicationWorkflow';

export function bootstrapCoreWorkflows(): void {
  const coreWorkflows = [
    purchaseWorkflow,
    salesWorkflow,
    salesReturnWorkflow,
    purchaseReturnWorkflow,
    inventoryAdjustmentWorkflow,
    inventoryTransferWorkflow,
    journalPostingWorkflow,
    voucherWorkflow,
    voucherCancellationWorkflow,
    salesCancellationWorkflow,
    productApplicationWorkflow
  ];

  for (const wf of coreWorkflows) {
    if (wf && wf.id) {
      workflowRegistry.register(wf);
    }
  }
}

// Auto-run bootstrap upon module load
bootstrapCoreWorkflows();
