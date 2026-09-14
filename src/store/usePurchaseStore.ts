import { create } from 'zustand';
import { Purchase } from '@/types';
import { PurchaseRepository } from '@/database/repositories/PurchaseRepository';

interface PurchaseState {
  purchases: Purchase[];
  setPurchases: (purchases: Purchase[]) => void;
  loadPurchases: () => Promise<void>;
}

export const usePurchaseStore = create<PurchaseState>((set) => ({
  purchases: [],
  setPurchases: (purchases) => set({ purchases }),
  loadPurchases: async () => {
    const purchases = await PurchaseRepository.getAll();
    set({ purchases });
  },
}));
