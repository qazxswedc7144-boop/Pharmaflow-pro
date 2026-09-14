
import { db } from '@/core/db';
import { Sale } from '@/types';

export const SalesRepository = {
  getAll: async (): Promise<Sale[]> => {
    const raw = await db.invoices.where('type').equals('SALE').toArray();
    return raw as unknown as Sale[];
  },

  getById: async (id: string): Promise<Sale | undefined> => {
    return await db.invoices.get(id) as unknown as Sale;
  },

  save: async (sale: Sale): Promise<string> => {
    const key = await db.invoices.put({
      ...sale,
      type: 'SALE',
      updatedAt: new Date().toISOString()
    });
    return String(key);
  },

  delete: async (id: string): Promise<void> => {
    await db.invoices.delete(id);
  },

  getUnpaidByCustomer: async (partnerId: string): Promise<Sale[]> => {
    const [bySnake, byCamel] = await Promise.all([
      db.invoices.where('[type+partner_id]').equals(['SALE', partnerId]).toArray(),
      db.invoices.where('[type+partnerId]').equals(['SALE', partnerId]).toArray()
    ]);
    const map = new Map<string, any>();
    for (const item of [...bySnake, ...byCamel]) {
      if (item && item.id) map.set(item.id, item);
    }
    return Array.from(map.values()).filter(s => {
      const total = s.finalTotal ?? s.totalAmount ?? 0;
      const paid = s.paidAmount ?? 0;
      return paid < total;
    }) as unknown as Sale[];
  },

  updatePaidAmount: async (id: string, amount: number): Promise<void> => {
    await db.safeTransaction('rw', ['invoices'], async () => {
      const sale = await db.invoices.get(id);
      if (!sale) return;
      await db.invoices.update(id, {
        paidAmount: (sale.paidAmount || 0) + amount,
        updatedAt: new Date().toISOString()
      });
    });
  }
};
