import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { db } from '@/core/db';
import { AuditService } from '@/services/system/AuditService';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';

export interface VoucherCancellationInput {
  id: string;
  type: 'RECEIPT' | 'PAYMENT';
  partnerId: string;
  amount: number;
  reason?: string;
}

export interface VoucherCancellationResult {
  success: boolean;
  id: string;
}

export class VoucherCancellationWorkflow implements BusinessWorkflow<VoucherCancellationInput, VoucherCancellationResult> {
  public id = 'accounting.voucher.cancel';
  public name = 'إلغاء وحذف سند قبض / صرف';
  public operationType = 'VOUCHER_CANCEL';
  public requiredPermissions = ['vouchers.delete', 'vouchers.manage'];
  public tables = [
    'vouchers', 'receipts', 'payments', 'suppliers', 'customers',
    'journalEntries', 'journalLines', 'accounts', 'financialTransactions',
    'auditLogs', 'idempotencyKeys', 'projectionEvents'
  ];

  public async validateInput(input: VoucherCancellationInput): Promise<void> {
    if (!input.id) {
      throw new Error('معرف السند مطلوب للإلغاء');
    }
    if (!input.partnerId) {
      throw new Error('معرف الشريك مطلوب للإلغاء');
    }
    if (input.amount <= 0) {
      throw new Error('مبلغ السند يجب أن يكون أكبر من الصفر');
    }
  }

  public async validateBusinessRules(input: VoucherCancellationInput): Promise<void> {
    const voucher = await db.vouchers.get(input.id);
    if (!voucher) {
      // Also check fallback if needed
      const existsInReceipts = input.type === 'RECEIPT' ? await db.receipts.get(input.id) : null;
      const existsInPayments = input.type === 'PAYMENT' ? await db.payments.get(input.id) : null;
      if (!existsInReceipts && !existsInPayments) {
        throw new Error(`السند رقم [${input.id}] غير موجود أو تم إلغاؤه سابقاً`);
      }
    }
  }

  public async executeDomainSteps(
    input: VoucherCancellationInput,
    ctx: WorkflowContext
  ): Promise<VoucherCancellationResult> {
    if (input.type === 'RECEIPT') {
      await db.receipts.delete(input.id);
      if (input.partnerId && input.partnerId !== 'عميل نقدي') {
        await db.updateCustomerBalance(input.partnerId, -input.amount);
      }
    } else {
      await db.payments.delete(input.id);
      if (input.partnerId && input.partnerId !== 'مورد نقدي') {
        await db.updateSupplierBalance(input.partnerId, -input.amount);
      }
    }

    // Reverse journal entries linked
    const entries = await db.journalEntries.where('reference_id').equals(input.id).toArray();
    for (const entry of entries) {
      for (const line of (entry.lines || [])) {
        await db.updateAccountBalance(line.accountId, line.type === 'DEBIT' ? -line.amount : line.amount);
      }
      await db.journalEntries.delete(entry.id);
    }

    // Delete or update status in vouchers table
    await db.db.vouchers.delete(input.id).catch(() => null);

    await (AuditService.log as any)({
      action: 'DELETE',
      module: 'VOUCHERS',
      transactionUuid: ctx.workflowId,
      recordId: input.id,
      details: `تم إلغاء السند [${input.id}] بقيمة ${input.amount}`
    });

    await ProjectionEventBus.publish('VOUCHER_CANCELLED', input.id, {
      type: input.type,
      partnerId: input.partnerId,
      amount: input.amount,
      correlationId: ctx.correlationId
    });

    return {
      success: true,
      id: input.id
    };
  }
}

export const voucherCancellationWorkflow = new VoucherCancellationWorkflow();
