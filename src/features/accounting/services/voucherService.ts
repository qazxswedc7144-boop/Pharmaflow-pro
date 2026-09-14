
import { UnifiedBusinessWorkflowOrchestrator } from '@/services/orchestration/UnifiedBusinessWorkflowOrchestrator';

export const voucherService = {
  createReceipt: async (data: { customer_id: string; amount: number; notes?: string; date?: string; paymentMethod?: 'CASH' | 'TRANSFER' }) => {
    const res = await UnifiedBusinessWorkflowOrchestrator.processCustomerReceipt({
      partnerId: data.customer_id,
      amount: data.amount,
      notes: data.notes,
      date: data.date,
      paymentMethod: data.paymentMethod
    });
    return res.receipt;
  },

  createPayment: async (data: { supplier_id: string; amount: number; notes?: string; date?: string; paymentMethod?: 'CASH' | 'TRANSFER' }) => {
    const res = await UnifiedBusinessWorkflowOrchestrator.processSupplierPayment({
      partnerId: data.supplier_id,
      amount: data.amount,
      notes: data.notes,
      date: data.date,
      paymentMethod: data.paymentMethod
    });
    return res.payment;
  }
};

