import { create } from 'zustand';
import { ToastMessage, SystemStatus } from '@/types';
import { NotificationService } from '@/context/NotificationContext';

export interface UIState {
  toasts: ToastMessage[];
  isSyncing: boolean;
  syncStatus: 'SYNCED' | 'PENDING' | 'CONFLICT' | 'ERROR';
  systemStatus: SystemStatus;
  isTrialBlockedModalOpen: boolean;
  version: number;
  headerAction: React.ReactNode | null;
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  setSyncing: (isSyncing: boolean) => void;
  setSyncStatus: (syncStatus: 'SYNCED' | 'PENDING' | 'CONFLICT' | 'ERROR') => void;
  setSystemStatus: (systemStatus: SystemStatus) => void;
  setTrialBlockedModalOpen: (isOpen: boolean) => void;
  setHeaderAction: (action: React.ReactNode | null) => void;
  incrementVersion: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  isSyncing: false,
  syncStatus: 'SYNCED',
  systemStatus: 'ACTIVE',
  isTrialBlockedModalOpen: false,
  version: 0,
  headerAction: null,
  addToast: (message, type = 'info') => {
    NotificationService.show(message, type);
    set((state) => ({ toasts: [...state.toasts, { id: Date.now().toString(), message, type }] }));
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setTrialBlockedModalOpen: (isTrialBlockedModalOpen) => set({ isTrialBlockedModalOpen }),
  setHeaderAction: (headerAction) => set({ headerAction }),
  incrementVersion: () => set((state) => ({ version: state.version + 1 })),
}));
