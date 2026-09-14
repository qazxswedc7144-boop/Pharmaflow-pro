import { db } from "@/core/db";
import { UnifiedBusinessWorkflowOrchestrator } from "@/services/orchestration/UnifiedBusinessWorkflowOrchestrator";

export interface InvoiceItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

/**
 * محرك الفواتير المطور لربط PharmaFlow بالمخدم المركزي عبر UnifiedBusinessWorkflowOrchestrator
 */
export const invoiceService = {
  /**
   * جلب الفواتير (من النسخة المحلية Dexie)
   */
  async getInvoices() {
    return await db.getSales();
  },

  /**
   * إنشاء فاتورة جديدة مأمنة عبر UnifiedBusinessWorkflowOrchestrator
   */
  async createInvoice(customerId: string, items: InvoiceItem[], total: number) {
    try {
      const result = await UnifiedBusinessWorkflowOrchestrator.processSale({
        customerId,
        items: items.map(it => ({
          id: `ITEM_${Date.now()}_${it.product_id}`,
          productId: it.product_id,
          productName: 'Item from service',
          quantity: it.quantity,
          unitPrice: it.unit_price,
          subtotal: it.quantity * it.unit_price,
          product_id: it.product_id,
          qty: it.quantity,
          price: it.unit_price,
          name: 'Item from service'
        })),
        total
      }, {
        invoiceStatus: 'POSTED',
        isCash: true
      });

      return { success: true, localId: result.refId || '', synced: false };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("Database Error:", errMsg);
      return { success: false, error: errMsg };
    }
  }
};
