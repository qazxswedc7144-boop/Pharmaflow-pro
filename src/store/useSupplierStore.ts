import { create } from 'zustand';
import { Supplier } from '@/types';
import { SupplierRepository } from '@/database/repositories/SupplierRepository';

interface SupplierState {
  suppliers: Supplier[];
  setSuppliers: (suppliers: Supplier[]) => void;
  loadSuppliers: () => Promise<void>;
}

export const useSupplierStore = create<SupplierState>((set) => ({
  suppliers: [],
  setSuppliers: (suppliers) => set({ suppliers }),
  loadSuppliers: async () => {
    const suppliers = await SupplierRepository.getSuppliers();
    set({ suppliers });
  },
}));
