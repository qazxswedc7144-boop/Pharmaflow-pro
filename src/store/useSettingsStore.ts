import { create } from 'zustand';
import { configurationService } from '@/services/config/configurationService';
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

export const useSettingsStore = create<SettingsState>((set) => ({
  currency: configurationService.getSync<string>('system.currency') || 'YER',
  isSettingsOpen: false,
  autoBackupEnabled: false,
  backupPassword: '',
  loadSettings: async () => {
    try {
      await configurationService.initialize();
      const curr = await configurationService.get<string>('system.currency');
      if (curr) {
        const val = String(curr).toUpperCase();
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

      const autoBackup = await configurationService.get<boolean>('system.auto_backup');
      if (typeof autoBackup === 'boolean') {
        set({ autoBackupEnabled: autoBackup });
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

    if (typeof window !== 'undefined') {
      (window as Window & typeof globalThis & { currentSystemCurrency?: string }).currentSystemCurrency = code;
    }
    set({ currency: code });

    try {
      await configurationService.set('system.currency', code);
      await configurationService.set('system.currency_label', currencyLabel);
      await CurrencyService.setGlobalCurrency(code, currencyLabel);
    } catch (e) {
      console.error("[useSettingsStore] Error saving currency in background:", e);
    }
  },
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setAutoBackupEnabled: async (enabled) => {
    await configurationService.set('system.auto_backup', enabled);
    set({ autoBackupEnabled: enabled });
  },
  setBackupPassword: async (password) => {
    await BackupCredentialVault.saveCredential(password);
    set({ backupPassword: password });
  },
}));



