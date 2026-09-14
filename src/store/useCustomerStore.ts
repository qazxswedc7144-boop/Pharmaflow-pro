import { create } from 'zustand';
import { Supplier } from '@/types';
import { SupplierRepository } from '@/database/repositories/SupplierRepository';

interface CustomerState {
  customers: Supplier[];
  setCustomers: (customers: Supplier[]) => void;
  loadCustomers: () => Promise<void>;
}

export const useCustomerStore = create<CustomerState>((set) => ({
  customers: [],
  setCustomers: (customers) => set({ customers }),
  loadCustomers: async () => {
    const customers = await SupplierRepository.getCustomers();
    set({ customers });
  },
}));
