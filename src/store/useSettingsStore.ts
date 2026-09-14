import { create } from 'zustand';
import { db } from '@/core/db';
import { CurrencyService } from '@/services/localization/CurrencyService';
import { BackupCredentialVault } from '@/features/backup/services/BackupCredentialVault';

interface SettingsState {
  currency: string;
  isSettingsOpen: boolean;
  autoBackupEnabled: boolean;
  backupPassword: string;
  setCurrency: (currency: string, label?: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  setSettingsOpen: (isOpen: boolean) => void;
  setAutoBackupEnabled: (enabled: boolean) => Promise<void>;
  setBackupPassword: (password: string) => Promise<void>;
}

const initialCurrency = typeof window !== 'undefined'
  ? (localStorage.getItem('pharmaflow_currency') || localStorage.getItem('pharma_currency') || 'YER')
  : 'YER';

export const useSettingsStore = create<SettingsState>((set) => ({
  currency: initialCurrency,
  isSettingsOpen: false,
  autoBackupEnabled: false,
  backupPassword: '',
  loadSettings: async () => {
    try {
      const savedCurrencyRecord = await db.db.settings.get('currency') || await db.db.settings.get('ACTIVE_CURRENCY');
      if (savedCurrencyRecord?.value) {
        const val = String(savedCurrencyRecord.value).toUpperCase();
        localStorage.setItem('pharmaflow_currency', val);
        localStorage.setItem('pharma_currency', val);
        if (typeof window !== 'undefined') {
          (window as Window & typeof globalThis & { currentSystemCurrency?: string }).currentSystemCurrency = val;
        }
        set({ currency: val });
      } else {
        const active = await CurrencyService.getActiveCurrency();
        if (active?.code) {
          set({ currency: active.code });
        } else {
          set({ currency: 'YER' });
        }
      }
      const autoBackupRecord = await db.db.settings.get('autoBackupEnabled');
      if (autoBackupRecord && typeof autoBackupRecord.value === 'boolean') {
        set({ autoBackupEnabled: autoBackupRecord.value });
      }

      // Safe migration of legacy plaintext password if present
      await BackupCredentialVault.migrateLegacyPlaintextCredential();

      // Load protected credential from vault
      const vaultPassword = await BackupCredentialVault.getCredential();
      if (vaultPassword) {
        set({ backupPassword: vaultPassword });
      }
    } catch (e) {
      console.error("[useSettingsStore] Failed to load settings:", e);
      set({ currency: 'YER' });
    }
  },
  setCurrency: async (currency, label) => {
    const code = currency.toUpperCase();
    const currencyLabel = label || CurrencyService.getCurrencyName(code);
    
    // Instant UI update in state & localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('pharmaflow_currency', code);
      localStorage.setItem('pharma_currency', code);
      (window as Window & typeof globalThis & { currentSystemCurrency?: string }).currentSystemCurrency = code;
    }
    set({ currency: code });
    
    // Background persistence & event notification
    try {
      await db.db.settings.put({ key: 'currency', value: code });
      await db.db.settings.put({ key: 'ACTIVE_CURRENCY', value: code });
      await db.db.settings.put({ key: 'currencyLabel', value: currencyLabel });
      await db.db.settings.put({ key: 'ACTIVE_CURRENCY_NAME', value: currencyLabel });
      await CurrencyService.setGlobalCurrency(code, currencyLabel);
    } catch (e) {
      console.error("[useSettingsStore] Error saving currency in background:", e);
    }
  },
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setAutoBackupEnabled: async (enabled) => {
    await db.db.settings.put({ key: 'autoBackupEnabled', value: enabled });
    set({ autoBackupEnabled: enabled });
  },
  setBackupPassword: async (password) => {
    await BackupCredentialVault.saveCredential(password);
    set({ backupPassword: password });
  },
}));


