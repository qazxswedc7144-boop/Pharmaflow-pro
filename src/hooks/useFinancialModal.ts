import { create } from 'zustand';
import { db } from '@/core/db';
import { useCustomerStore } from '@/store/useCustomerStore';
import { useSupplierStore } from '@/store/useSupplierStore';
import { useAccountingStore } from '@/store/accountingStore';

export type FinancialModalMode = 'sales_invoice' | 'purchase_invoice' | 'receipt_voucher' | 'payment_voucher';

export interface FinancialFormData {
  amount: string;
  partnerId: string;
  description: string;
  date: string;
  referenceNumber: string;
}

const initialFormData: FinancialFormData = {
  amount: '',
  partnerId: '',
  description: '',
  date: new Date().toISOString().split('T')[0] || '',
  referenceNumber: '',
};

interface FinancialModalStore {
  isOpen: boolean;
  mode: FinancialModalMode | null;
  formData: FinancialFormData;
  errors: Record<string, string>;
  isSaving: boolean;
  
  // Actions
  openModal: (mode: FinancialModalMode) => void;
  closeModal: () => void;
  updateField: <K extends keyof FinancialFormData>(key: K, value: FinancialFormData[K]) => void;
  validateForm: () => boolean;
  saveForm: (addToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void) => Promise<boolean>;
  resetForm: () => void;
}

export const useFinancialModal = create<FinancialModalStore>((set, get) => ({
  isOpen: false,
  mode: null,
  formData: { ...initialFormData },
  errors: {},
  isSaving: false,

  openModal: (mode) => {
    set({
      isOpen: true,
      mode,
      errors: {},
    });
  },

  closeModal: () => {
    set({ isOpen: false });
  },

  updateField: (key, value) => {
    set((state) => ({
      formData: {
        ...state.formData,
        [key]: value,
      },
      // Clear error as the user types
      errors: {
        ...state.errors,
        [key]: '',
      },
    }));
  },

  validateForm: () => {
    const { formData, mode } = get();
    const errors: Record<string, string> = {};

    if (!formData.amount || isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) {
      errors.amount = 'يرجى إدخال مبلغ صحيح أكبر من الصفر';
    }

    if (!formData.partnerId) {
      errors.partnerId =
        mode === 'sales_invoice' || mode === 'receipt_voucher'
          ? 'يرجى اختيار العميل'
          : 'يرجى اختيار المورد';
    }

    if (!formData.date) {
      errors.date = 'تاريخ المستند مطلوب';
    }

    set({ errors });
    return Object.keys(errors).length === 0;
  },

  saveForm: async (addToast) => {
    const { validateForm, formData, mode, resetForm, closeModal } = get();
    
    // 1. Validation check
    if (!validateForm()) {
      addToast('يرجى مراجعة وتعديل الحقول المطلوبة', 'warning');
      return false;
    }

    set({ isSaving: true });

    // Derive proper type prefixes and descriptive strings
    let dbType: 'PV' | 'SV' | 'RV' | 'PAY' = 'RV';
    let modeLabel = '';
    
    switch (mode) {
      case 'sales_invoice':
        dbType = 'SV';
        modeLabel = 'فاتورة مبيعات';
        break;
      case 'purchase_invoice':
        dbType = 'PV';
        modeLabel = 'فاتورة مشتريات';
        break;
      case 'receipt_voucher':
        dbType = 'RV';
        modeLabel = 'سند قبض';
        break;
      case 'payment_voucher':
        dbType = 'PAY';
        modeLabel = 'سند صرف';
        break;
    }

    // Determine target partner name for transaction audit trail
    const customers = useCustomerStore.getState().customers;
    const suppliers = useSupplierStore.getState().suppliers;
    const journalEntries = useAccountingStore.getState().journalEntries;
    
    const partnerList = dbType === 'SV' || dbType === 'RV' ? customers : suppliers;
    const selectedPartner = partnerList.find(p => p.id === formData.partnerId || p.Supplier_ID === formData.partnerId);
    const partnerName = selectedPartner ? selectedPartner.Supplier_Name : formData.partnerId;

    const autoDesc = formData.description.trim() 
      ? formData.description.trim() 
      : `${modeLabel} - ${partnerName} ${formData.referenceNumber ? `(رقم: ${formData.referenceNumber})` : ''}`;

    // 2. Optimistic UI updates
    const originalJournalEntries = [...journalEntries];
    const tempEntryId = `TEMP-${Date.now()}`;
    const optimisticEntry = {
      id: tempEntryId,
      type: dbType,
      amount: Number(formData.amount),
      TotalAmount: Number(formData.amount),
      description: autoDesc,
      date: formData.date,
      createdAt: new Date(),
      status: 'Posted' as const,
      sourceId: tempEntryId,
      sourceType: dbType,
      lines: [],
    };

    // Apply optimistic updates to app state
    useAccountingStore.setState({ journalEntries: [optimisticEntry, ...originalJournalEntries] });

    try {
      // Simulate real asynchronous latency to show loading state nicely
      await new Promise((resolve) => setTimeout(resolve, 800));

      const finalId = `ENT-${Date.now()}`;
      
      // 3. Persistent Dexie operations
      await db.journalEntries.add({
        id: finalId,
        type: dbType as 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'TRANSFER',
        amount: Number(formData.amount),
        description: autoDesc,
        createdAt: new Date().toISOString(),
        date: formData.date,
        status: 'Posted',
        sourceId: `SRC-${Date.now()}`,
        sourceType: dbType,
        lines: [
          {
            lineId: `L1-${Date.now()}`,
            entryId: finalId,
            accountId: formData.partnerId,
            accountName: partnerName,
            debit: dbType === 'SV' || dbType === 'RV' ? Number(formData.amount) : 0,
            credit: dbType === 'PV' || dbType === 'PAY' ? Number(formData.amount) : 0,
            type: dbType === 'PV' || dbType === 'PAY' ? 'CREDIT' : 'DEBIT',
            amount: Number(formData.amount),
          }
        ]
      });

      // Audit Log logging
      await db.addAuditLog(
        'INSERT',
        'JOURNAL',
        finalId,
        `تطبيق محرك المستندات الموحد: تم تسجيل ${modeLabel} بمبلغ ${formData.amount} للطرف ${partnerName}`
      );

      // 4. Update the actual data by running refresh
      await useAccountingStore.getState().loadAccounting();

      // Form is only cleaned and closed on SUCCESS save!
      resetForm();
      closeModal();
      
      addToast(`تم حفظ وتأكيد ${modeLabel} بنجاح ✅`, 'success');
      set({ isSaving: false });
      return true;
    } catch (err: unknown) {
      console.error('[UnifiedModal] Async Save failed:', err);
      
      // Rollback optimistic state in case of failure!
      useAccountingStore.setState({ journalEntries: originalJournalEntries });
      
      const errMsg = err instanceof Error ? err.message : 'خطأ غير معروف';
      addToast(`خطأ في معالجة الحفظ: ${errMsg} ❌`, 'error');
      set({ isSaving: false });
      // Keep form fields populated so the user does not lose data!
      return false;
    }
  },

  resetForm: () => {
    set({
      formData: { ...initialFormData },
      errors: {},
    });
  },
}));
