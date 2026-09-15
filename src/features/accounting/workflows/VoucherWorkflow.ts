import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { db } from '@/core/db';
import { Payment, Receipt, Voucher } from '@/types';
import { PurchaseRepository } from '@/database/repositories/PurchaseRepository';
import { SalesRepository } from '@/database/repositories/SalesRepository';
import { SupplierRepository } from '@/database/repositories/SupplierRepository';
import { FinancialTransactionRepository } from '@/database/repositories/FinancialTransactionRepository';
import { AccountingEngine as accountingEngine } from '@features/accounting/services/AccountingEngine';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';

export interface VoucherWorkflowInput {
  type: 'RECEIPT' | 'PAYMENT';
  partnerId: string;
  amount: number;
  notes?: string;
  date?: string;
  paymentMethod?: 'CASH' | 'TRANSFER';
  allocations?: Record<string, number | { amount: number; note?: string }>;
}

export interface VoucherWorkflowResult {
  id: string;
  voucher: Voucher;
  document: Receipt | Payment;
}

export class VoucherWorkflow implements BusinessWorkflow<VoucherWorkflowInput, VoucherWorkflowResult> {
  public id = 'accounting.voucher.process';
  public name = 'معالجة سند قبض / صرف';
  public operationType = 'VOUCHER';
  public requiredPermissions = ['vouchers.create', 'vouchers.manage'];
  public tables = [
    'vouchers', 'invoices', 'suppliers', 'customers', 'financialTransactions',
    'journalEntries', 'journalLines', 'accounts', 'auditLogs',
    'idempotencyKeys', 'projectionEvents'
  ];

  public async validateInput(input: VoucherWorkflowInput): Promise<void> {
    if (input.amount <= 0) {
      throw new Error('مبلغ السند يجب أن يكون أكبر من الصفر');
    }
    if (!input.partnerId) {
      throw new Error('يرجى تحديد الشريك (عميل أو مورد)');
    }
  }

  public async validateBusinessRules(_input: VoucherWorkflowInput): Promise<void> {
    // Standard validation passed
  }

  public async executeDomainSteps(
    input: VoucherWorkflowInput,
    ctx: WorkflowContext
  ): Promise<VoucherWorkflowResult> {
    const isPayment = input.type === 'PAYMENT';
    const prefix = isPayment ? 'PYMT' : 'RCPT';
    const id = `${prefix}-${Date.now()}`;
    const date = input.date || ctx.startedAt;

    const voucherRecord: Voucher = {
      id,
      voucherId: id,
      type: input.type,
      amount: input.amount,
      partnerId: input.partnerId,
      notes: input.notes,
      date,
      Created_At: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      syncStatus: 'NEW'
    };

    await db.db.vouchers.put(voucherRecord);

    if (isPayment) {
      // Process Purchase allocations
      if (input.allocations) {
        for (const invoiceId in input.allocations) {
          const item = input.allocations[invoiceId];
          const allocAmount = typeof item === 'number' ? item : item?.amount || 0;
          if (allocAmount > 0) {
            await PurchaseRepository.updatePaidAmount(invoiceId, allocAmount);
          }
        }
      }

      if (input.partnerId && input.partnerId !== 'مورد نقدي') {
        await db.updateSupplierBalance(input.partnerId, -input.amount);
        await SupplierRepository.postToLedger({
          id: db.generateId('PL'),
          partnerId: input.partnerId,
          date,
          description: `سند صرف للمورد #${id}`,
          debit: input.amount,
          credit: 0,
          referenceId: id
        });
      }

      await FinancialTransactionRepository.record({
        id: db.generateId('FT'),
        Transaction_Type: 'Payment',
        Reference_ID: id,
        Reference_Table: 'Vouchers',
        Entity_Type: 'Supplier',
        Entity_Name: input.partnerId,
        Amount: input.amount,
        Direction: 'Debit',
        Transaction_Date: date,
        Notes: input.notes || `سند صرف للمورد #${id}`
      });

      const entry = await accountingEngine.generateVoucherEntry({
        type: 'PAYMENT',
        amount: input.amount,
        partnerId: input.partnerId,
        date,
        refId: id,
        notes: input.notes,
        paymentMethod: input.paymentMethod
      });
      await db.addJournalEntry(entry);

      await ProjectionEventBus.publish('SUPPLIER_PAYMENT_PROCESSED', id, {
        supplierId: input.partnerId,
        amount: input.amount,
        correlationId: ctx.correlationId
      });

      const doc: Payment = {
        id,
        date,
        supplier_id: input.partnerId,
        amount: input.amount,
        notes: input.notes,
        paymentMethod: input.paymentMethod || 'CASH',
        created_at: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };

      return { id, voucher: voucherRecord, document: doc };

    } else {
      // Receipt
      if (input.allocations) {
        for (const saleId in input.allocations) {
          const item = input.allocations[saleId];
          const allocAmount = typeof item === 'number' ? item : item?.amount || 0;
          if (allocAmount > 0) {
            await SalesRepository.updatePaidAmount(saleId, allocAmount);
          }
        }
      }

      if (input.partnerId && input.partnerId !== 'عميل نقدي') {
        await db.updateCustomerBalance(input.partnerId, -input.amount);
      }

      await FinancialTransactionRepository.record({
        id: db.generateId('FT'),
        Transaction_Type: 'Receipt',
        Reference_ID: id,
        Reference_Table: 'Vouchers',
        Entity_Type: 'Customer',
        Entity_Name: input.partnerId,
        Amount: input.amount,
        Direction: 'Credit',
        Transaction_Date: date,
        Notes: input.notes || `سند قبض من العميل #${id}`
      });

      const entry = await accountingEngine.generateVoucherEntry({
        type: 'RECEIPT',
        amount: input.amount,
        partnerId: input.partnerId,
        date,
        refId: id,
        notes: input.notes,
        paymentMethod: input.paymentMethod
      });
      await db.addJournalEntry(entry);

      await ProjectionEventBus.publish('CUSTOMER_RECEIPT_PROCESSED', id, {
        customerId: input.partnerId,
        amount: input.amount,
        correlationId: ctx.correlationId
      });

      const doc: Receipt = {
        id,
        date,
        customer_id: input.partnerId,
        amount: input.amount,
        notes: input.notes,
        paymentMethod: input.paymentMethod || 'CASH',
        created_at: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };

      return { id, voucher: voucherRecord, document: doc };
    }
  }
}

export const voucherWorkflow = new VoucherWorkflow();
