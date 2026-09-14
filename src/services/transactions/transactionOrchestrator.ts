
import { InvoiceStatus, InvoiceItem } from '@/types';
import { UnifiedBusinessWorkflowOrchestrator } from '@/services/orchestration/UnifiedBusinessWorkflowOrchestrator';

export interface SaleOptions {
  isCash: boolean;
  paymentStatus: 'Cash' | 'Credit';
  currency: string;
  isReturn?: boolean;
  invoiceStatus?: InvoiceStatus; 
  date?: string;
  originalInvoiceId?: string;
}

export interface InvoiceRequest {
  type: 'SALE' | 'PURCHASE';
  payload: {
    customerId?: string;
    supplierId?: string;
    items: InvoiceItem[];
    total: number;
    invoiceId?: string; 
    id?: string; 
    date?: string;
    notes?: string;
    attachment?: string;
  };
  options?: SaleOptions | { isCash: boolean; isReturn: boolean; invoiceStatus?: InvoiceStatus; date?: string; originalInvoiceId?: string };
}

export interface TransactionPayload {
  supplierId?: string;
  customerId?: string;
  items: InvoiceItem[];
  total: number;
  date?: string;
  notes?: string;
  invoiceId?: string;
  amount?: number;
  type?: string;
}

export interface VoucherPayload {
  supplierId?: string;
  customerId?: string;
  amount: number;
  notes?: string;
  date?: string;
}

export const transactionOrchestrator = {
  async processInvoiceTransaction(invoice: InvoiceRequest): Promise<{ success: boolean; refId?: string }> {
    if (invoice.type === 'PURCHASE') {
      return await UnifiedBusinessWorkflowOrchestrator.processPurchase(invoice.payload, invoice.options);
    } else {
      return await UnifiedBusinessWorkflowOrchestrator.processSale(invoice.payload, invoice.options);
    }
  },

  async unpostInvoice(invoiceId: string, type: 'SALE' | 'PURCHASE'): Promise<{ success: boolean }> {
    return await UnifiedBusinessWorkflowOrchestrator.unpostInvoice(invoiceId, type);
  },

  async deleteInvoice(invoiceId: string, type: 'SALE' | 'PURCHASE'): Promise<{ success: boolean }> {
    return await UnifiedBusinessWorkflowOrchestrator.deleteInvoice(invoiceId, type);
  },

  /**
   * Central execution layer for ERP transactions.
   */
  async processTransaction(
    type: 'purchase' | 'purchase_return' | 'sale' | 'sale_return' | 'supplier_payment' | 'customer_payment', 
    data: TransactionPayload | VoucherPayload
  ): Promise<{ success: boolean; refId?: string }> {
    switch(type) {
      case 'purchase':
        return await this.handlePurchase(data as TransactionPayload);
      case 'purchase_return':
        return await this.handlePurchaseReturn(data as TransactionPayload);
      case 'sale':
        return await this.handleSale(data as TransactionPayload);
      case 'sale_return':
        return await this.handleSalesReturn(data as TransactionPayload);
      case 'supplier_payment':
        return await this.settleSupplier(data as VoucherPayload);
      case 'customer_payment':
        return await this.settleCustomer(data as VoucherPayload);
      default:
        throw new Error(`Unknown transaction type: ${type}`);
    }
  },

  async handlePurchase(data: TransactionPayload) {
    return await UnifiedBusinessWorkflowOrchestrator.processPurchase(
      {
        supplierId: data.supplierId,
        items: data.items,
        total: data.total,
        date: data.date,
        notes: data.notes,
        id: data.invoiceId
      },
      {
        isCash: data.type === 'cash',
        paymentStatus: data.type === 'cash' ? 'Cash' : 'Credit'
      }
    );
  },

  async handlePurchaseReturn(data: TransactionPayload) {
    return await UnifiedBusinessWorkflowOrchestrator.processPurchase(
      {
        supplierId: data.supplierId,
        items: data.items,
        total: data.total,
        date: data.date,
        notes: data.notes,
        id: data.invoiceId
      },
      {
        isReturn: true,
        isCash: data.type === 'cash',
        paymentStatus: data.type === 'cash' ? 'Cash' : 'Credit'
      }
    );
  },

  async handleSale(data: TransactionPayload) {
    return await UnifiedBusinessWorkflowOrchestrator.processSale(
      {
        customerId: data.customerId,
        items: data.items,
        total: data.total,
        date: data.date,
        notes: data.notes,
        id: data.invoiceId
      },
      {
        isCash: data.type === 'cash',
        paymentStatus: data.type === 'cash' ? 'Cash' : 'Credit'
      }
    );
  },

  async handleSalesReturn(data: TransactionPayload) {
    return await UnifiedBusinessWorkflowOrchestrator.processSale(
      {
        customerId: data.customerId,
        items: data.items,
        total: data.total,
        date: data.date,
        notes: data.notes,
        id: data.invoiceId
      },
      {
        isReturn: true,
        isCash: data.type === 'cash',
        paymentStatus: data.type === 'cash' ? 'Cash' : 'Credit'
      }
    );
  },

  async settleSupplier(data: VoucherPayload) {
    const res = await UnifiedBusinessWorkflowOrchestrator.processSupplierPayment({
      partnerId: data.supplierId || '',
      amount: data.amount,
      notes: data.notes,
      date: data.date
    });
    return { success: true, refId: res.payment.id };
  },

  async settleCustomer(data: VoucherPayload) {
    const res = await UnifiedBusinessWorkflowOrchestrator.processCustomerReceipt({
      partnerId: data.customerId || '',
      amount: data.amount,
      notes: data.notes,
      date: data.date
    });
    return { success: true, refId: res.receipt.id };
  }
};

