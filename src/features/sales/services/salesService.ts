
import { SalesRepository } from '@/database/repositories/SalesRepository';
import { Sale, InvoiceItem, TransactionOptions } from '@/types';
import { transactionOrchestrator } from '@/services/transactions/transactionOrchestrator';

/**
 * Sales Service - واجهة إدارة المبيعات
 */
export const salesService = {
  // Fix: Returns Promise<Sale[]> instead of Sale[]
  getSales: async (): Promise<Sale[]> => {
    return await SalesRepository.getAll();
  },

  /**
   * معالجة مبيعة جديدة: التوجيه الإلزامي للمنسق الذري
   */
  processNewSale: async (customerId: string, cart: InvoiceItem[], total: number, options: TransactionOptions) => {
    return transactionOrchestrator.processInvoiceTransaction({
      type: 'SALE',
      payload: { customerId, items: cart, total },
      options: options as any
    });
  }
};
