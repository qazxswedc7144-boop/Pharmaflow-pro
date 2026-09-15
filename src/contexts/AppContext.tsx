
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { usePurchaseStore } from '@/store/usePurchaseStore';
import { useSalesStore } from '@/store/useSalesStore';
import { useCustomerStore } from '@/store/useCustomerStore';
import { useSupplierStore } from '@/store/useSupplierStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useUIStore } from '@/store/useUIStore';
import { useAccountingStore } from '@/store/accountingStore';
import { eventBus } from '@/services/eventBus';
import { db } from '@/core/db';

import { CurrencyService } from '@/services/localization/CurrencyService';
import { Customer, Supplier } from '@/types';

export const refreshAllAppData = async () => {
  await Promise.allSettled([
    useInventoryStore.getState().loadInventory().catch(e => console.warn('[Refresh] Inventory load warning:', e)),
    usePurchaseStore.getState().loadPurchases().catch(e => console.warn('[Refresh] Purchase load warning:', e)),
    useSalesStore.getState().loadSales().catch(e => console.warn('[Refresh] Sales load warning:', e)),
    useAccountingStore.getState().loadAccounting().catch(e => console.warn('[Refresh] Accounting load warning:', e)),
    useCustomerStore.getState().loadCustomers().catch(e => console.warn('[Refresh] Customer load warning:', e)),
    useSupplierStore.getState().loadSuppliers().catch(e => console.warn('[Refresh] Supplier load warning:', e)),
  ]);
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => { 
    const init = async () => {
      try {
        await db.init();
      } catch (e) {
        console.warn("[AppContext] DB init notice:", e);
      }
      try {
        await useSettingsStore.getState().loadSettings();
      } catch (e) {
        console.warn("[AppContext] Settings load notice:", e);
      }
      try {
        await refreshAllAppData();
      } catch (e) {
        console.warn("[AppContext] Refresh data notice:", e);
      }
    };
    init();
  }, []);
  return <>{children}</>;
};

export const useUI = () => {
  const currency = useSettingsStore((s) => s.currency) || 'YER';
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const version = useUIStore((s) => s.version);
  const toasts = useUIStore((s) => s.toasts);
  const addToast = useUIStore((s) => s.addToast);
  const removeToast = useUIStore((s) => s.removeToast);
  const headerAction = useUIStore((s) => s.headerAction);
  const setHeaderAction = useUIStore((s) => s.setHeaderAction);
  const isSyncing = useUIStore((s) => s.isSyncing);
  const setSyncing = useUIStore((s) => s.setSyncing);

  const refreshGlobal = useCallback(refreshAllAppData, []);

  const formatCurrency = useCallback(
    (amount: number | string | null | undefined, customCode?: string) =>
      CurrencyService.formatAmount(amount, customCode || currency),
    [currency]
  );

  const currencySymbol = useMemo(() => CurrencyService.getCurrencySymbol(currency), [currency]);

  return useMemo(
    () => ({
      currency,
      currencySymbol,
      formatCurrency,
      setCurrency,
      version,
      toasts,
      addToast,
      removeToast,
      headerAction,
      setHeaderAction,
      refreshGlobal,
      isSyncing,
      setSyncing,
      isSettingsOpen,
      setSettingsOpen
    }),
    [
      currency,
      currencySymbol,
      formatCurrency,
      setCurrency,
      version,
      toasts,
      addToast,
      removeToast,
      headerAction,
      setHeaderAction,
      refreshGlobal,
      isSyncing,
      setSyncing,
      isSettingsOpen,
      setSettingsOpen
    ]
  );
};

export const useInventory = () => {
  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const updateStock = useInventoryStore((s) => s.updateStockDirectly);
  const addCategory = useInventoryStore((s) => s.addCategory);

  const refreshInventory = useCallback(async () => {
    await useInventoryStore.getState().loadInventory();
  }, []);

  return useMemo(
    () => ({
      products,
      categories,
      updateStock,
      addCategory,
      refreshInventory
    }),
    [products, categories, updateStock, addCategory, refreshInventory]
  );
};

export const useAccounting = () => {
  const products = useInventoryStore((s) => s.products);
  const sales = useSalesStore((s) => s.sales);
  const purchases = usePurchaseStore((s) => s.purchases);
  const journalEntries = useAccountingStore((s) => s.journalEntries);
  const accounts = useAccountingStore((s) => s.accounts);
  const addInvoice = useAccountingStore((s) => s.addInvoice);
  const suppliers = useSupplierStore((s) => s.suppliers);
  const customers = useCustomerStore((s) => s.customers);

  const addCustomer = useCallback((c: Customer) => useAccountingStore.getState().addPartner(c, 'C'), []);
  const addSupplier = useCallback((s: Supplier) => useAccountingStore.getState().addPartner(s, 'S'), []);

  const refreshAccounting = useCallback(async () => {
    await Promise.all([
      useAccountingStore.getState().loadAccounting(),
      useSalesStore.getState().loadSales(),
      usePurchaseStore.getState().loadPurchases(),
      useSupplierStore.getState().loadSuppliers(),
      useCustomerStore.getState().loadCustomers()
    ]);
  }, []);

  return useMemo(
    () => ({
      products,
      sales,
      purchases,
      journalEntries,
      suppliers,
      customers,
      accounts,
      addInvoice,
      addCustomer,
      addSupplier,
      refreshAccounting
    }),
    [
      products,
      sales,
      purchases,
      journalEntries,
      suppliers,
      customers,
      accounts,
      addInvoice,
      addCustomer,
      addSupplier,
      refreshAccounting
    ]
  );
};

export const useInvoice = () => {
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  return { generatedHtml, setGeneratedHtml, isGenerating, setIsGenerating };
};

export const useEventBus = (event: string, callback: (data: unknown) => void) => {
  useEffect(() => {
    return eventBus.subscribe(event, callback);
  }, [event, callback]);
};
