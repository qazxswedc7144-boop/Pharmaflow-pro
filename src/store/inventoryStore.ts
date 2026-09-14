
import { create } from 'zustand';
import { Product } from '@/types';

interface InventoryState {
  items: Product[];
  isLoading: boolean;
  setItems: (items: Product[]) => void;
  updateStock: (productId: string, quantity: number) => void;
}

export const useInventoryStore = create<InventoryState>((set) => ({
  items: [],
  isLoading: false,
  setItems: (items) => set({ items }),
  updateStock: (productId, quantity) => set((state) => ({
    items: state.items.map(item => item.id === productId ? { ...item, stock: quantity } : item)
  })),
}));
