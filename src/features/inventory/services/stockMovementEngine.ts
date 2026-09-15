
import { db } from '@/core/db';
import { StockMovement, Sale, Purchase, UnifiedInvoice } from '@/types';
import { PeriodLockEngine } from '@/services/transactions/PeriodLockEngine';
import { unifiedInventoryMutationEngine } from './UnifiedInventoryMutationEngine';

/**
 * @deprecated Use UnifiedInventoryMutationEngine for all inventory mutations.
 * This class is maintained for legacy compatibility ONLY.
 */
export class StockMovementEngine {

  /**
   * CREATE STOCK MOVEMENT
   * 🚨 REDIRECTED to UnifiedInventoryMutationEngine
   */
  static async createStockMovement(data: Omit<StockMovement, 'id' | 'created_at' | 'lastModified'> & { date?: string }): Promise<void> {
    console.warn(`[LEGACY BYPASS] StockMovementEngine.createStockMovement called for ${data.item_id}. Redirecting to canonical engine.`);
    
    const date = data.date || new Date().toISOString();
    await PeriodLockEngine.validateOperation(date, 'تعديل المخزون (Legacy)');

    // Map legacy movement types to canonical ones
    const movementType = data.type === 'purchase' ? 'RECEIVE' : data.type === 'sale' ? 'DISPATCH' : 'ADJUSTMENT';

    await unifiedInventoryMutationEngine.executeMutation({
      productId: data.item_id || '',
      warehouseId: 'WH-MAIN', // Default for legacy movements
      delta: data.quantity_change || 0,
      docType: 'LEGACY_ADAPTED',
      docId: data.reference_id || `LEG-${Date.now()}`,
      movementType: movementType as any,
      userId: 'system-adapter',
      tenantId: 'TEN-DEV-001',
      branchId: 'BR-MAIN',
      transactionUuid: `ADAPT-${Date.now()}-${data.item_id}`,
      notes: `Legacy movement adapted: ${data.type}`
    });
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
   * 🚨 REDIRECTED to UnifiedInventoryMutationEngine
   */
  static async reverseMovements(reference_id: string): Promise<void> {
    if (!reference_id) return;
    console.warn(`[LEGACY BYPASS] StockMovementEngine.reverseMovements called for ${reference_id}. Redirecting to canonical engine.`);
    
    await unifiedInventoryMutationEngine.executeReversal({
      originalDocumentId: reference_id,
      originalDocumentType: 'UNKNOWN_LEGACY',
      reason: `Legacy reversal adaptation for #${reference_id}`,
      userId: 'system-adapter',
      tenantId: 'TEN-DEV-001',
      transactionUuid: `REVERSE-LEG-${reference_id}-${Date.now()}`
    });
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
        }
      }
    }
  }
}
