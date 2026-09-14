
import { db } from '@/core/db';
import { Sale, Purchase } from '@/types';

export const InvoiceRepository = {
  getUnifiedInvoice: async (id: string): Promise<(Sale | Purchase | Record<string, unknown>) | null> => {
    // Try to find in sales then purchases
    const sale = await db.sales.get(id);
    if (sale) return { ...sale, finalTotal: sale.finalTotal || 0, paidAmount: sale.paidAmount || 0 };
    
    const purchase = await db.purchases.get(id);
    if (purchase) return { ...purchase, finalTotal: purchase.totalAmount || 0, paidAmount: purchase.paidAmount || 0 };
    
    return null;
  },

  getSaleById: async (id: string): Promise<Sale | undefined> => {
    return (await db.sales.get(id) || await db.invoices.get(id)) as unknown as Sale | undefined;
  },

  getPurchaseById: async (id: string): Promise<Purchase | undefined> => {
    return (await db.purchases.get(id) || await db.invoices.get(id)) as unknown as Purchase | undefined;
  },

  saveSale: async (...args: any[]): Promise<unknown> => {
    const sale = await (db.processSale as any)(...args);
    return sale;
  },

  savePurchase: async (...args: any[]): Promise<unknown> => {
    const purchase = await (db.processPurchase as any)(...args);
    return purchase;
  },

  generateInvoiceNumber: async (type: 'SALE' | 'PURCHASE' = 'SALE'): Promise<string> => {
    const prefix = type === 'SALE' ? 'INV' : 'PUR';
    const last = await db[type === 'SALE' ? 'sales' : 'purchases']
      .orderBy('createdAt')
      .last();
    
    if (!last) return `${prefix}-1001`;
    
    const lastNumMatch = last.SaleID || last.invoiceId || last.invoice_number;
    const match = String(lastNumMatch).match(/\d+$/);
    const nextNum = match ? parseInt(match[0]) + 1 : 1001;
    return `${prefix}-${nextNum}`;
  },

  isNumberDuplicate: async (num: string, type: 'SALE' | 'PURCHASE', excludeId?: string | null): Promise<boolean> => {
    const table = type === 'SALE' ? db.sales : db.purchases;
    const field = type === 'SALE' ? 'SaleID' : 'invoiceId';
    
    const matches = await table.where(field).equals(num).toArray();
    if (excludeId) {
      return matches.some(m => m.id !== excludeId);
    }
    return matches.length > 0;
  },

  getArchiveSales: async (): Promise<Sale[]> => {
    return await db.sales.where('InvoiceStatus').equals('POSTED').toArray();
  },

  getArchivePurchases: async (): Promise<Purchase[]> => {
    return await db.purchases.where('invoiceStatus').equals('POSTED').toArray();
  },

  getSavedInvoices: async (): Promise<Sale[]> => {
    return await db.sales.where('InvoiceStatus').equals('DRAFT').toArray();
  },

  getRecentInvoices: async (): Promise<Array<(Sale | Purchase) & { entityType: 'SALE' | 'PURCHASE' }>> => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const sales = await db.sales
      .where('Date')
      .above(ninetyDaysAgo.toISOString())
      .toArray();
      
    const purchases = await db.purchases
      .where('date')
      .above(ninetyDaysAgo.toISOString())
      .toArray();
      
    return [
      ...sales.map(s => ({ ...s, entityType: 'SALE' as const })),
      ...purchases.map(p => ({ ...p, entityType: 'PURCHASE' as const }))
    ].sort((a,b) => new Date((a as Sale).Date || (a as Sale).date || (a as Purchase).date || Date.now()).getTime() - new Date((b as Sale).Date || (b as Sale).date || (b as Purchase).date || Date.now()).getTime());
  },

  getInvoicesArchive: async (): Promise<Array<(Sale | Purchase) & { entityType: 'SALE' | 'PURCHASE' }>> => {
    const sales = await db.getSales();
    const purchases = await db.getPurchases();
    return [
      ...sales.map(s => ({ ...s, entityType: 'SALE' as const })),
      ...purchases.map(p => ({ ...p, entityType: 'PURCHASE' as const }))
    ];
  },

  checkHasDependencies: async (_invoiceId: string, _type: 'SALE' | 'PURCHASE'): Promise<boolean> => {
    return false; 
  }
};
