
import { db } from '@/core/db';
import { StockMovement, Sale, Purchase, UnifiedInvoice } from '@/types';
import { PeriodLockEngine } from '@/services/transactions/PeriodLockEngine';
import { InventoryEngine } from './inventoryEngine';
import { normalizeToISODate } from '@/utils/expiryUtils';

export class StockMovementEngine {

  /**
   * CREATE STOCK MOVEMENT
   */
  static async createStockMovement(data: Omit<StockMovement, 'id' | 'created_at' | 'lastModified'> & { date?: string }): Promise<void> {
    // 8. PROTECT DATA: Block stock changes if period is locked
    const date = data.date || new Date().toISOString();
    await PeriodLockEngine.validateOperation(date, 'تعديل المخزون');

    // Check if item exists in Dexie or auto-register missing product
    let product = await db.products.get(data.item_id).catch(() => null);
    if (!product && data.item_id) {
      product = await db.products.where('ProductID').equals(data.item_id).first().catch(() => null);
    }

    if (!product) {
      const fallbackId = data.item_id || `PROD-${Date.now()}`;
      const autoProduct = {
        id: fallbackId,
        ProductID: fallbackId,
        Name: (data as any).itemName || (data as any).productName || `منتج-${fallbackId}`,
        name: (data as any).itemName || (data as any).productName || `منتج-${fallbackId}`,
        StockQuantity: 0,
        stock: 0,
        UnitPrice: data.unit_cost || 0,
        price: data.unit_cost || 0,
        CostPrice: data.unit_cost || 0,
        cost: data.unit_cost || 0,
        Is_Active: 1,
        created_at: new Date().toISOString()
      };
      try {
        await db.products.put(autoProduct);
        product = autoProduct;
      } catch (e) {
        console.warn(`Failed to auto-create missing product ${data.item_id}:`, e);
        product = autoProduct;
      }
    }

    const movement: StockMovement = {
      ...data,
      id: `MOV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      created_at: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      tenant_id: 'TEN-DEV-001'
    };

    // VALIDATION: Reject if quantity_after < 0 - bypassed to support flexible offline selling
    const qtyAfter = movement.quantity_after ?? 0;
    if (qtyAfter < 0) {
      console.warn(`Insufficient stock for item ${movement.item_id}. Resulting stock would be ${qtyAfter}. Allowed warning-only.`);
    }

    try {
      await db.stock_movements.add(movement);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Stock Movement Error: ${errMsg}`);
    }

    // Update Product StockQuantity (Sync) in Dexie
    const qtyChange = movement.quantity_change ?? 0;
    const unitCost = movement.unit_cost ?? 0;
    const { product: updatedProduct, log } = qtyChange > 0 
      ? InventoryEngine.addStock(product, Math.abs(qtyChange), unitCost)
      : InventoryEngine.removeStock(product, Math.abs(qtyChange));

    try {
      const newStock = updatedProduct.stock ?? updatedProduct.StockQuantity ?? 0;
      await db.products.put({
        ...product,
        stock: newStock,
        StockQuantity: newStock
      });
    } catch (error: unknown) {
      console.warn(`Product Stock Sync Warning:`, error);
    }

    try {
      await db.inventory_logs.add({ ...log, id: `LOG-${Date.now()}` });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Inventory Log Error: ${errMsg}`);
    }
  }

  /**
   * GET CURRENT STOCK (Calculated from movements)
   */
  static async getCurrentStock(item_id: string): Promise<number> {
    if (!item_id) return 0;
    
    try {
      const movements = await db.stock_movements
        .where('item_id')
        .equals(item_id)
        .toArray();
      
      return (movements || []).reduce((sum: number, m: StockMovement) => sum + (m.quantity_change ?? 0), 0);
    } catch (error) {
      return 0;
    }
  }

  /**
   * ON PURCHASE MOVEMENT
   */
  static async recordPurchaseMovement(item_id: string, qty: number, unit_cost: number, reference_id: string): Promise<void> {
    const currentStock = await this.getCurrentStock(item_id);
    
    await this.createStockMovement({
      item_id,
      type: 'purchase',
      quantity_before: currentStock,
      quantity_change: qty,
      quantity_after: currentStock + qty,
      unit_cost,
      total_cost: qty * unit_cost,
      reference_id
    });
  }

  /**
   * ON SALE MOVEMENT
   */
  static async recordSaleMovement(item_id: string, qty: number, total_cost: number, reference_id: string): Promise<void> {
    const currentStock = await this.getCurrentStock(item_id);
    const unit_cost = qty > 0 ? total_cost / qty : 0;

    await this.createStockMovement({
      item_id,
      type: 'sale',
      quantity_before: currentStock,
      quantity_change: -qty,
      quantity_after: currentStock - qty,
      unit_cost,
      total_cost,
      reference_id
    });
  }

  /**
   * ON UNPOST: Reverse movements
   */
  static async reverseMovements(reference_id: string): Promise<void> {
    if (!reference_id) return;
    
    try {
      const movements = await db.stock_movements
        .where('reference_id')
        .equals(reference_id)
        .toArray();

      if (movements && movements.length > 0) {
        // 8. PROTECT DATA: Block stock changes if period is locked
        const date = (movements[0] as StockMovement & { date?: string }).date || movements[0].created_at || new Date().toISOString();
        await PeriodLockEngine.validateOperation(date, 'إلغاء حركات المخزون');
      }

      for (const movement of (movements || [])) {
        const currentProduct = await db.products.get(movement.item_id);

        if (currentProduct) {
          await db.products.update(movement.item_id, {
            StockQuantity: (currentProduct.StockQuantity || 0) - movement.quantity_change
          });
        }
        
        await db.stock_movements.delete(movement.id);
      }

      // Reverse medicine batches associated with this purchase invoice
      const batches = await db.medicineBatches
        .filter((b: any) => b.sourceInvoiceId === reference_id || b.reference_id === reference_id)
        .toArray()
        .catch(() => []);
      for (const b of batches) {
        await db.medicineBatches.delete(b.id);
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Reverse Movements Error: ${errMsg}`);
    }
  }

  /**
   * APPLY STOCK MOVEMENT
   */
  static async apply(invoice: Sale | Purchase | UnifiedInvoice | { type?: string; customerId?: string; items?: Array<Record<string, any>>; invoiceId?: string; id?: string; isReturn?: boolean; invoiceType?: string }): Promise<void> {
    const invAny = invoice as Record<string, unknown>;
    const type = (invAny.type as string) || (invAny.customerId ? 'SALE' : 'PURCHASE');
    const items = (invAny.items as Array<Record<string, any>>) || [];
    const invoiceId = (invAny.invoiceId as string) || (invAny.id as string) || '';
    const isReturn = Boolean(invAny.isReturn) || invAny.invoiceType === 'مرتجع';

    for (const item of items) {
      const itemId = item.product_id || item.productId || item.id;
      const qty = Number(item.qty ?? item.quantity ?? 0);
      const price = Number(item.price ?? item.unitPrice ?? 0);
      if (!itemId || qty === 0) continue;

      if (type === 'SALE') {
        if (isReturn) {
          // Sale Return: Increase stock
          await this.recordPurchaseMovement(itemId, qty, price, invoiceId);
        } else {
          // Sale: Decrease stock
          await this.recordSaleMovement(itemId, qty, 0, invoiceId);
        }
      } else if (type === 'PURCHASE') {
        if (isReturn) {
          // Purchase Return: Decrease stock
          await this.recordSaleMovement(itemId, qty, 0, invoiceId);
        } else {
          // Purchase: Increase stock
          await this.recordPurchaseMovement(itemId, qty, price, invoiceId);

          // Record pharmaceutical inventory batch
          const rawExp = item.expiryDate || item.ExpiryDate || item.expiry_date || item.expirationDate;
          const expDate = normalizeToISODate(String(rawExp || ''));
          if (expDate || item.batchNumber || item.batchId) {
            try {
              const batchNum = String(item.batchNumber || item.batchId || (expDate ? `B-${expDate.replace(/[^0-9]/g, '')}` : `BATCH-${invoiceId.slice(-4)}`));
              const batchId = item.batchId || `BATCH_${invoiceId}_${itemId}_${batchNum}`;
              const existingBatch = await db.medicineBatches.get(batchId).catch(() => null);

              const batchRecord = {
                id: batchId,
                batchId: batchNum,
                batchNumber: batchNum,
                productId: itemId,
                quantity: existingBatch ? (existingBatch.quantity || 0) + qty : qty,
                expiryDate: expDate || existingBatch?.expiryDate || '',
                unitCost: price,
                cost: price,
                sourceInvoiceId: invoiceId,
                reference_id: invoiceId,
                tenantId: 'TEN-DEV-001',
                tenant_id: 'TEN-DEV-001',
                branchId: 'BR-MAIN',
                branch_id: 'BR-MAIN',
                created_at: existingBatch?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                lastModified: new Date().toISOString()
              };
              await db.medicineBatches.put(batchRecord);
            } catch (batchErr) {
              console.warn("Failed to persist medicine batch:", batchErr);
            }
          }
        }
      }
    }
  }
}
