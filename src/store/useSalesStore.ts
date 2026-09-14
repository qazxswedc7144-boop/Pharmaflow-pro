import { create } from 'zustand';
import { Sale } from '@/types';
import { SalesRepository } from '@/database/repositories/SalesRepository';

interface SalesState {
  sales: Sale[];
  editingInvoiceId: string | null;
  setSales: (sales: Sale[]) => void;
  setEditingInvoiceId: (id: string | null) => void;
  loadSales: () => Promise<void>;
}

export const useSalesStore = create<SalesState>((set) => ({
  sales: [],
  editingInvoiceId: null,
  setSales: (sales) => set({ sales }),
  setEditingInvoiceId: (id) => set({ editingInvoiceId: id }),
  loadSales: async () => {
    const sales = await SalesRepository.getAll();
    set({ sales });
  },
}));
