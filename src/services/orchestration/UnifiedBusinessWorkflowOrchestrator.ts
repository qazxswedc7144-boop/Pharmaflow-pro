import { db } from '@/core/db';
import { InvoiceItem, InvoiceStatus, Sale, Purchase, Receipt, Payment, Voucher, TransferStatus, AccountingEntry, JournalLine } from '@/types';
import { ValidationService as validationService } from '@/services/integrity/ValidationService';
import { TransactionService } from '@/services/transactions/TransactionService';
import { FaultService } from '@/services/integrity/FaultService';
import { FIFOEngine as fifoEngine } from '@features/inventory/services/fifoEngine';
import { StockMovementEngine as stockEngine } from '@features/inventory/services/stockMovementEngine';
import { InventoryService } from '@features/inventory/services/InventoryService';
import { AccountingEngine as accountingEngine } from '@features/accounting/services/AccountingEngine';
import { CurrencyService } from '@/services/localization/CurrencyService';
import { InvoiceRepository } from '@/database/repositories/invoice.repository';
import { PurchaseRepository } from '@/database/repositories/PurchaseRepository';
import { SalesRepository } from '@/database/repositories/SalesRepository';
import { AccountingRepository } from '@/database/repositories/AccountingRepository';
import { FinancialTransactionRepository } from '@/database/repositories/FinancialTransactionRepository';
import { SupplierRepository } from '@/database/repositories/SupplierRepository';
import { authService } from '@features/auth/services/authService';
import { GlobalGuard } from '@/services/security/GlobalGuard';
import { BackupService } from '@/services/backupService';
import { useUIStore } from '@/store/useUIStore';
import { SubscriptionService } from '@/services/saas/subscriptionService';
import { generateTransactionUuid } from '@/utils/uuid';
import { AuditService } from '@/services/system/AuditService';
import { ErrorTrackingService } from '@/services/system/ErrorTrackingService';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';
import { LockService } from '@features/locking/lock.service';

export interface WorkflowSalePayload {
  customerId?: string;
  items: InvoiceItem[];
  total: number;
  id?: string;
  date?: string;
  notes?: string;
  attachment?: string;
  transactionUuid?: string;
}

export interface WorkflowPurchasePayload {
  supplierId?: string;
  items: InvoiceItem[];
  total: number;
  id?: string;
  date?: string;
  notes?: string;
  attachment?: string;
  transactionUuid?: string;
}

export interface WorkflowInvoiceOptions {
  isCash?: boolean;
  isReturn?: boolean;
  invoiceStatus?: InvoiceStatus;
  warehouseId?: string;
  currency?: string;
  paymentStatus?: 'Cash' | 'Credit';
  date?: string;
}

export interface WorkflowVoucherParams {
  partnerId: string;
  amount: number;
  notes?: string;
  date?: string;
  paymentMethod?: 'CASH' | 'TRANSFER';
  allocations?: Record<string, number | { amount: number; note?: string }>;
  transactionUuid?: string;
}

export interface WorkflowStockAdjustmentParams {
  productId: string;
  warehouseId: string;
  actualQty: number;
  userId: string;
  notes?: string;
  transactionUuid?: string;
}

export interface WorkflowStockTransferCreateParams {
  sourceBranchId: string;
  targetBranchId: string;
  notes?: string;
  items: Array<{ productId: string; qty: number; batchNumber?: string; expiryDate?: string }>;
  transactionUuid?: string;
}

export interface WorkflowStockTransferStatusParams {
  transferId: string;
  newStatus: TransferStatus;
  updatedBy: string;
  receivedQuantities?: Record<string, number>;
}

const PURCHASE_WORKFLOW_TABLES = [
  'invoices', 'invoiceItems', 'products', 'inventoryTransactions', 
  'inventory_layers', 'suppliers', 'journalEntries', 'journalLines', 
  'accounts', 'financialTransactions', 'auditLogs', 'idempotencyKeys', 
  'projectionEvents', 'customers', 'vouchers'
];

const SALES_WORKFLOW_TABLES = [
  'invoices', 'invoiceItems', 'products', 'inventoryTransactions', 
  'inventory_layers', 'fifo_consumption_log', 'customers', 'journalEntries', 
  'journalLines', 'accounts', 'financialTransactions', 'auditLogs', 
  'idempotencyKeys', 'projectionEvents', 'vouchers', 'suppliers'
];

const ADJUSTMENT_WORKFLOW_TABLES = [
  'inventoryTransactions', 'products', 'journalEntries', 'journalLines', 
  'accounts', 'auditLogs', 'idempotencyKeys', 'projectionEvents'
];

const VOUCHER_WORKFLOW_TABLES = [
  'vouchers', 'invoices', 'suppliers', 'customers', 'financialTransactions', 
  'journalEntries', 'journalLines', 'accounts', 'auditLogs', 
  'idempotencyKeys', 'projectionEvents'
];

const STOCK_TRANSFER_WORKFLOW_TABLES = [
  'branchTransfers', 'branchTransferItems', 'branchInventory', 
  'auditLogs', 'idempotencyKeys', 'projectionEvents'
];

const UNPOST_WORKFLOW_TABLES = [
  'invoices', 'invoiceItems', 'products', 'inventoryTransactions', 
  'inventory_layers', 'fifo_consumption_log', 'suppliers', 'customers', 
  'journalEntries', 'journalLines', 'accounts', 'financialTransactions', 
  'auditLogs', 'projectionEvents'
];

/**
 * Unified Business Workflow Orchestrator
 * Top-level central execution engine enforcing Atomic, Idempotent, Rollback-Safe,
 * Event-Driven, and Audit-Logged transaction processing across all ERP workflows.
 */
export class UnifiedBusinessWorkflowOrchestrator {

  /**
   * Check Trial plan usage bounds
   */
  private static async checkTrialLimit(isEdit = false): Promise<void> {
    const plan = localStorage.getItem('saas_active_plan') || 'TRIAL';
    if (plan === 'TRIAL') {
      const usage = await SubscriptionService.getLocalUsageCount();
      if (usage >= 200 && !isEdit) {
        useUIStore.getState().setTrialBlockedModalOpen(true);
        throw new Error("تم الوصول للحد التجريبي 200 عملية. يرجى الاشتراك للمتابعة.");
      }
    }
  }

  /**
   * Manage idempotency lifecycle before entering critical execution section
   */
  private static async acquireIdempotencyKey(key: string): Promise<void> {
    if (!key) return;
    const existing = await db.idempotencyKeys.get(key);
    if (existing) {
      if (existing.status === 'COMPLETED') {
        return;
      }
      if (existing.status === 'PROCESSING') {
        throw new Error("⚠️ العملية قيد المعالجة حالياً، يرجى الانتظار... ⏳");
      }
    } else {
      await db.idempotencyKeys.add({
        id: key,
        status: 'PROCESSING',
        createdAt: new Date().toISOString()
      });
    }

    try {
      await TransactionService.ensureIdempotency(key);
    } catch (err) {
      await db.idempotencyKeys.delete(key).catch(() => null);
      throw err;
    }
  }

  /**
   * Finalize idempotency key status to COMPLETED
   */
  private static async markIdempotencyCompleted(key: string): Promise<void> {
    if (!key) return;
    TransactionService.registerCompletedUuid(key);
    await db.idempotencyKeys.update(key, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString()
    }).catch(() => null);
  }

  /**
   * Release processing idempotency key on error
   */
  private static async releaseIdempotencyKey(key: string): Promise<void> {
    if (!key) return;
    try {
      const rec = await db.idempotencyKeys.get(key);
      if (rec && rec.status === 'PROCESSING') {
        await db.idempotencyKeys.delete(key);
      }
    } catch (e) {
      console.warn('[WorkflowOrchestrator] Failed to release idempotency key:', e);
    }
  }

  // =========================================================================
  // 1. PURCHASE WORKFLOW
  // =========================================================================
  public static async processPurchase(
    payload: WorkflowPurchasePayload,
    options?: WorkflowInvoiceOptions
  ): Promise<{ success: boolean; refId: string }> {
    const isEdit = !!payload.id;
    const transactionUuid = payload.transactionUuid || generateTransactionUuid('PURCHASE');
    payload.transactionUuid = transactionUuid;

    await this.acquireIdempotencyKey(transactionUuid);
    await this.checkTrialLimit(isEdit);

    const effectiveDate = payload.date || options?.date || new Date().toISOString();
    const resourceId = payload.id || `NEW_PURCHASE_${Date.now()}`;
    const finalStatus: InvoiceStatus = options?.invoiceStatus || 'POSTED';
    const isPosting = finalStatus === 'POSTED' || finalStatus === 'LOCKED';

    await GlobalGuard.checkSystemState(isEdit ? 'تعديل فاتورة مشتريات' : 'إنشاء فاتورة مشتريات', effectiveDate);

    let beforeState: Purchase | null = null;
    if (isEdit) {
      beforeState = (await InvoiceRepository.getPurchaseById(resourceId)) || null;
    }

    try {
      return await TransactionService.runSafe(resourceId, async () => {
        try {
          if (isEdit && beforeState) {
            const status = (beforeState as any).invoiceStatus || (beforeState as any).InvoiceStatus;
            if (status === 'POSTED') {
              await this.unpostInvoice(resourceId, 'PURCHASE');
            }
          }

          // Validation
          await validationService.validateInvoice(payload, 'PURCHASE');
          if (!isEdit && payload.id) {
            await validationService.validateInvoiceIdUniqueness(payload.id, 'purchases', db.db);
          }

          // Costing & Stock
          let costResult = { totalCost: 0, itemCosts: {} };
          if (isPosting) {
            costResult = await fifoEngine.apply({ ...payload, subtotal: payload.total, finalTotal: payload.total, type: 'PURCHASE' } as unknown as Sale);
            await stockEngine.apply({ ...payload, subtotal: payload.total, finalTotal: payload.total, type: 'PURCHASE' } as unknown as Sale);
          }

          // Save purchase document
          const result = await InvoiceRepository.savePurchase(
            payload.supplierId!,
            payload.items,
            payload.total,
            payload.id || '',
            options?.isCash || false,
            options?.currency || CurrencyService.getCurrentCurrencyCode(),
            finalStatus,
            0,
            'LOW',
            payload.id,
            payload.attachment,
            !!options?.isReturn,
            payload.date,
            transactionUuid
          );

          const refId = (result as any).id;

          // Partner balance & financial ledger
          if (isPosting) {
            const suppId = payload.supplierId;
            if (suppId && suppId !== 'مورد نقدي') {
              const balanceDelta = options?.isReturn ? -payload.total : payload.total;
              await db.updateSupplierBalance(suppId, balanceDelta);
            }
            await FinancialTransactionRepository.record({
              id: db.generateId('FT'),
              Transaction_Type: options?.isReturn ? 'Refund' : (options?.isCash ? 'Payment' : 'Invoice'),
              Reference_ID: refId,
              Reference_Table: 'Purchase_Invoices',
              Entity_Type: 'Supplier',
              Entity_Name: payload.supplierId || 'مورد نقدي',
              Amount: payload.total,
              Direction: options?.isReturn ? 'Debit' : 'Credit',
              Transaction_Date: effectiveDate,
              Notes: `فاتورة مشتريات #${refId}`
            });

            // Accounting Entry
            await accountingEngine.postInvoice({ ...payload, type: 'PURCHASE', id: refId, transactionUuid }, costResult);
            await ProjectionEventBus.publish('INVOICE_POSTED', refId, { type: 'PURCHASE', transactionUuid });
          }

          // Central Audit
          await AuditService.log({
            action: isEdit ? 'EDIT' : 'CREATE',
            module: 'PURCHASE',
            transactionUuid,
            before: beforeState,
            after: result,
            recordId: refId
          });

          await this.markIdempotencyCompleted(transactionUuid);
          return { success: true, refId };
        } catch (err: any) {
          await ErrorTrackingService.log({
            moduleName: 'PURCHASE',
            screenName: 'توريد مشتريات',
            errorMessage: err.message || String(err),
            stackTrace: err.stack,
            severity: 'ERROR'
          });
          FaultService.log({
            type: 'ORCHESTRATOR_FATAL',
            module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
            message: `Purchase workflow failed: ${err.message || String(err)}`,
            payload: { payload, resourceId },
            stack: err.stack
          });
          throw err;
        }
      }, transactionUuid, PURCHASE_WORKFLOW_TABLES);
    } catch (outerErr) {
      await this.releaseIdempotencyKey(transactionUuid);
      throw outerErr;
    }
  }

  // =========================================================================
  // 2. SALES WORKFLOW
  // =========================================================================
  public static async processSale(
    payload: WorkflowSalePayload,
    options?: WorkflowInvoiceOptions
  ): Promise<{ success: boolean; refId: string }> {
    const isEdit = !!payload.id;
    const transactionUuid = payload.transactionUuid || generateTransactionUuid('SALE');
    payload.transactionUuid = transactionUuid;

    await this.acquireIdempotencyKey(transactionUuid);
    await this.checkTrialLimit(isEdit);

    const effectiveDate = payload.date || options?.date || new Date().toISOString();
    const resourceId = payload.id || `NEW_SALE_${Date.now()}`;
    const finalStatus: InvoiceStatus = options?.invoiceStatus || 'POSTED';
    const isPosting = finalStatus === 'POSTED' || finalStatus === 'LOCKED';

    await GlobalGuard.checkSystemState(isEdit ? 'تعديل فاتورة مبيعات' : 'إنشاء فاتورة مبيعات', effectiveDate);

    let beforeState: Sale | null = null;
    if (isEdit) {
      beforeState = (await InvoiceRepository.getSaleById(resourceId)) || null;
    }

    try {
      return await TransactionService.runSafe(resourceId, async () => {
        try {
          if (isEdit && beforeState) {
            const status = (beforeState as any).InvoiceStatus || (beforeState as any).invoiceStatus;
            if (status === 'POSTED') {
              await this.unpostInvoice(resourceId, 'SALE');
            }
          }

          // Validation
          await validationService.validateInvoice(payload, 'SALE');
          if (!isEdit && payload.id) {
            await validationService.validateInvoiceIdUniqueness(payload.id, 'sales', db.db);
          }

          // Costing & Stock
          let costResult = { totalCost: 0, itemCosts: {} };
          if (isPosting) {
            costResult = await fifoEngine.apply({ ...payload, subtotal: payload.total, finalTotal: payload.total, type: 'SALE' } as unknown as Sale);
            await stockEngine.apply({ ...payload, subtotal: payload.total, finalTotal: payload.total, type: 'SALE' } as unknown as Sale);
          }

          // Save Sale Document
          const result = await InvoiceRepository.saveSale(
            payload.customerId!,
            payload.items,
            payload.total,
            !!options?.isReturn,
            payload.id || '',
            options?.currency || CurrencyService.getCurrentCurrencyCode(),
            options?.paymentStatus || 'Cash',
            finalStatus,
            0,
            'LOW',
            costResult.totalCost,
            payload.id,
            payload.attachment,
            payload.date,
            transactionUuid
          );

          const refId = (result as any).id;

          // Customer Balance & Financial Ledger
          if (isPosting) {
            const custId = payload.customerId;
            if (custId && custId !== 'عميل نقدي') {
              const balanceDelta = options?.isReturn ? -payload.total : payload.total;
              await db.updateCustomerBalance(custId, balanceDelta);
            }
            await FinancialTransactionRepository.record({
              id: db.generateId('FT'),
              Transaction_Type: options?.isReturn ? 'Refund' : (options?.paymentStatus === 'Cash' || options?.isCash ? 'Receipt' : 'Invoice'),
              Reference_ID: refId,
              Reference_Table: 'Sales_Invoices',
              Entity_Type: 'Customer',
              Entity_Name: payload.customerId || 'عميل نقدي',
              Amount: payload.total,
              Direction: options?.isReturn ? 'Credit' : 'Debit',
              Transaction_Date: effectiveDate,
              Notes: `فاتورة مبيعات #${refId}`
            });

            // Accounting Entry
            await accountingEngine.postInvoice({ ...payload, type: 'SALE', id: refId, transactionUuid }, costResult);
            await ProjectionEventBus.publish('INVOICE_POSTED', refId, { type: 'SALE', transactionUuid });
          }

          // Audit Logging
          await AuditService.log({
            action: isEdit ? 'EDIT' : 'CREATE',
            module: 'SALE',
            transactionUuid,
            before: beforeState,
            after: result,
            recordId: refId
          });

          await this.markIdempotencyCompleted(transactionUuid);
          return { success: true, refId };
        } catch (err: any) {
          await ErrorTrackingService.log({
            moduleName: 'SALE',
            screenName: 'كاشير المبيعات',
            errorMessage: err.message || String(err),
            stackTrace: err.stack,
            severity: 'ERROR'
          });
          FaultService.log({
            type: 'ORCHESTRATOR_FATAL',
            module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
            message: `Sales workflow failed: ${err.message || String(err)}`,
            payload: { payload, resourceId },
            stack: err.stack
          });
          throw err;
        }
      }, transactionUuid, SALES_WORKFLOW_TABLES);
    } catch (outerErr) {
      await this.releaseIdempotencyKey(transactionUuid);
      throw outerErr;
    }
  }

  // =========================================================================
  // 3. INVENTORY ADJUSTMENT WORKFLOW
  // =========================================================================
  public static async processInventoryAdjustment(
    params: WorkflowStockAdjustmentParams
  ): Promise<{ success: boolean; refId: string }> {
    await this.checkTrialLimit();
    const transactionUuid = params.transactionUuid || generateTransactionUuid('ADJUSTMENT' as any);
    await this.acquireIdempotencyKey(transactionUuid);

    const { productId, warehouseId, actualQty, userId, notes } = params;
    const currentQty = await InventoryService.getWarehouseStock(warehouseId, productId);
    const diff = actualQty - currentQty;

    if (diff === 0) {
      await this.releaseIdempotencyKey(transactionUuid);
      return { success: true, refId: 'NO_CHANGE' };
    }

    const refId = `ADJ-${Date.now()}`;

    try {
      return await TransactionService.runSafe(refId, async () => {
        // 1. Inventory movement
        await InventoryService.recordMovement({
          type: 'ADJUSTMENT',
          productId,
          warehouseId,
          quantity: diff,
          sourceDocId: refId,
          sourceDocType: 'ADJUSTMENT',
          userId
        });

        // 2. Accounting entry
        const invAcc = await accountingEngine.getCoreAccount('INVENTORY');
        const gainAcc = 'ACC-INV-GAIN';
        const lossAcc = 'ACC-INV-LOSS';

        const product = await db.db.products.get(productId);
        const cost = product?.CostPrice || product?.cost || 0;
        const totalValue = Math.abs(diff * cost);

        const entryId = db.generateId('JE');
        const lines: JournalLine[] = [];

        if (diff > 0) {
          lines.push(this.createJournalLine(entryId, invAcc, totalValue, 0));
          lines.push(this.createJournalLine(entryId, gainAcc, 0, totalValue));
        } else {
          lines.push(this.createJournalLine(entryId, lossAcc, totalValue, 0));
          lines.push(this.createJournalLine(entryId, invAcc, 0, totalValue));
        }

        const entry: AccountingEntry = {
          id: entryId,
          date: new Date().toISOString(),
          description: notes || `تسوية جردية للصنف ${product?.Name || product?.name} | فرق: ${diff}`,
          TotalAmount: totalValue,
          status: 'Posted',
          sourceId: productId,
          sourceType: 'ADJUSTMENT',
          lines,
          lastModified: new Date().toISOString()
        };

        await db.saveAccountingEntry(entry);

        for (const line of entry.lines) {
          await db.updateAccountBalance(line.accountId, line.debit - line.credit);
        }

        // Event and Audit
        await ProjectionEventBus.publish('INVENTORY_ADJUSTED', refId, { productId, warehouseId, diff, totalValue });
        await AuditService.log({
          action: 'CREATE',
          module: 'INVENTORY',
          transactionUuid,
          after: { refId, productId, warehouseId, diff, actualQty },
          recordId: refId
        });

        await this.markIdempotencyCompleted(transactionUuid);
        return { success: true, refId };
      }, transactionUuid, ADJUSTMENT_WORKFLOW_TABLES);
    } catch (err: any) {
      await this.releaseIdempotencyKey(transactionUuid);
      FaultService.log({
        type: 'ADJUSTMENT_FATAL',
        module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
        message: `Inventory adjustment failed: ${err.message || String(err)}`,
        payload: params,
        stack: err.stack
      });
      throw err;
    }
  }

  // =========================================================================
  // 4. SUPPLIER PAYMENT WORKFLOW
  // =========================================================================
  public static async processSupplierPayment(
    params: WorkflowVoucherParams
  ): Promise<{ success: boolean; payment: Payment }> {
    await this.checkTrialLimit();
    if (params.amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
    if (!params.partnerId) throw new Error('يرجى اختيار المورد');

    const transactionUuid = params.transactionUuid || generateTransactionUuid('PAYMENT');
    await this.acquireIdempotencyKey(transactionUuid);

    const id = `PAY-${Date.now()}`;
    const date = params.date || new Date().toISOString();

    const payment: Payment = {
      id,
      date,
      supplier_id: params.partnerId,
      amount: params.amount,
      notes: params.notes,
      paymentMethod: params.paymentMethod || 'CASH',
      created_at: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    try {
      return await TransactionService.runSafe(id, async () => {
        const voucherRecord: Voucher = {
          id,
          voucherId: id,
          type: 'PAYMENT',
          amount: params.amount,
          partnerId: params.partnerId,
          notes: params.notes,
          date,
          Created_At: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          syncStatus: 'NEW'
        };
        await db.db.vouchers.put(voucherRecord);

        // Process invoice allocations if provided
        if (params.allocations) {
          for (const invoiceId in params.allocations) {
            const item = params.allocations[invoiceId];
            const allocAmount = typeof item === 'number' ? item : item?.amount || 0;
            if (allocAmount > 0) {
              await PurchaseRepository.updatePaidAmount(invoiceId, allocAmount);
            }
          }
        }

        // Update supplier balance
        if (params.partnerId && params.partnerId !== 'مورد نقدي') {
          await db.updateSupplierBalance(params.partnerId, -params.amount);
          await SupplierRepository.postToLedger({
            id: db.generateId('PL'),
            partnerId: params.partnerId,
            date,
            description: `سند صرف للمورد #${id}`,
            debit: params.amount,
            credit: 0,
            referenceId: id
          });
        }

        // Financial transaction
        await FinancialTransactionRepository.record({
          id: db.generateId('FT'),
          Transaction_Type: 'Payment',
          Reference_ID: id,
          Reference_Table: 'Vouchers',
          Entity_Type: 'Supplier',
          Entity_Name: params.partnerId,
          Amount: params.amount,
          Direction: 'Debit',
          Transaction_Date: date,
          Notes: params.notes || `سند صرف للمورد #${id}`
        });

        // Accounting entry
        const entry = await accountingEngine.generateVoucherEntry({
          type: 'PAYMENT',
          amount: params.amount,
          partnerId: params.partnerId,
          date,
          refId: id,
          notes: params.notes,
          paymentMethod: params.paymentMethod
        });
        await db.addJournalEntry(entry);

        await ProjectionEventBus.publish('SUPPLIER_PAYMENT_PROCESSED', id, { supplierId: params.partnerId, amount: params.amount });
        await AuditService.log({
          action: 'CREATE',
          module: 'SUPPLIER_PAYMENT',
          transactionUuid,
          after: payment,
          recordId: id
        });

        await this.markIdempotencyCompleted(transactionUuid);
        return { success: true, payment };
      }, transactionUuid, VOUCHER_WORKFLOW_TABLES);
    } catch (err: any) {
      await this.releaseIdempotencyKey(transactionUuid);
      FaultService.log({
        type: 'PAYMENT_FATAL',
        module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
        message: `Supplier payment workflow failed: ${err.message || String(err)}`,
        payload: params,
        stack: err.stack
      });
      throw err;
    }
  }

  // =========================================================================
  // 5. CUSTOMER RECEIPT WORKFLOW
  // =========================================================================
  public static async processCustomerReceipt(
    params: WorkflowVoucherParams
  ): Promise<{ success: boolean; receipt: Receipt }> {
    await this.checkTrialLimit();
    if (params.amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
    if (!params.partnerId) throw new Error('يرجى اختيار العميل');

    const transactionUuid = params.transactionUuid || generateTransactionUuid('RECEIPT');
    await this.acquireIdempotencyKey(transactionUuid);

    const id = `RCPT-${Date.now()}`;
    const date = params.date || new Date().toISOString();

    const receipt: Receipt = {
      id,
      date,
      customer_id: params.partnerId,
      amount: params.amount,
      notes: params.notes,
      paymentMethod: params.paymentMethod || 'CASH',
      created_at: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    try {
      return await TransactionService.runSafe(id, async () => {
        const voucherRecord: Voucher = {
          id,
          voucherId: id,
          type: 'RECEIPT',
          amount: params.amount,
          partnerId: params.partnerId,
          notes: params.notes,
          date,
          Created_At: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          syncStatus: 'NEW'
        };
        await db.db.vouchers.put(voucherRecord);

        // Process invoice allocations if provided
        if (params.allocations) {
          for (const saleId in params.allocations) {
            const item = params.allocations[saleId];
            const allocAmount = typeof item === 'number' ? item : item?.amount || 0;
            if (allocAmount > 0) {
              await SalesRepository.updatePaidAmount(saleId, allocAmount);
            }
          }
        }

        // Update customer balance
        if (params.partnerId && params.partnerId !== 'عميل نقدي') {
          await db.updateCustomerBalance(params.partnerId, -params.amount);
        }

        // Financial transaction
        await FinancialTransactionRepository.record({
          id: db.generateId('FT'),
          Transaction_Type: 'Receipt',
          Reference_ID: id,
          Reference_Table: 'Vouchers',
          Entity_Type: 'Customer',
          Entity_Name: params.partnerId,
          Amount: params.amount,
          Direction: 'Credit',
          Transaction_Date: date,
          Notes: params.notes || `سند قبض من العميل #${id}`
        });

        // Accounting Entry
        const entry = await accountingEngine.generateVoucherEntry({
          type: 'RECEIPT',
          amount: params.amount,
          partnerId: params.partnerId,
          date,
          refId: id,
          notes: params.notes,
          paymentMethod: params.paymentMethod
        });
        await db.addJournalEntry(entry);

        await ProjectionEventBus.publish('CUSTOMER_RECEIPT_PROCESSED', id, { customerId: params.partnerId, amount: params.amount });
        await AuditService.log({
          action: 'CREATE',
          module: 'CUSTOMER_RECEIPT',
          transactionUuid,
          after: receipt,
          recordId: id
        });

        await this.markIdempotencyCompleted(transactionUuid);
        return { success: true, receipt };
      }, transactionUuid, VOUCHER_WORKFLOW_TABLES);
    } catch (err: any) {
      await this.releaseIdempotencyKey(transactionUuid);
      FaultService.log({
        type: 'RECEIPT_FATAL',
        module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
        message: `Customer receipt workflow failed: ${err.message || String(err)}`,
        payload: params,
        stack: err.stack
      });
      throw err;
    }
  }

  // =========================================================================
  // 6. STOCK TRANSFER WORKFLOW
  // =========================================================================
  public static async processStockTransferCreate(
    params: WorkflowStockTransferCreateParams
  ): Promise<{ success: boolean; transferId: string }> {
    await this.checkTrialLimit();
    if (!params.sourceBranchId || !params.targetBranchId) throw new Error("يجب تحديد فرع المصدر وفرع الوجهة");
    if (params.sourceBranchId === params.targetBranchId) throw new Error("لا يمكن تحويل المخزون لنفس الفرع");

    const transactionUuid = params.transactionUuid || generateTransactionUuid('INVENTORY');
    await this.acquireIdempotencyKey(transactionUuid);

    const transferId = `TRF-${Date.now()}`;
    const now = new Date().toISOString();
    const currentUserId = authService.getCurrentUser()?.User_Email || "مشرف النظام";

    try {
      return await TransactionService.runSafe(transferId, async () => {
        const transferRecord = {
          id: transferId,
          sourceBranchId: params.sourceBranchId,
          targetBranchId: params.targetBranchId,
          status: "DRAFT" as TransferStatus,
          createdBy: currentUserId,
          notes: params.notes || "تحويل مخزني بين الفروع",
          createdAt: now,
          updatedAt: now,
        };

        await db.db.branchTransfers.put(transferRecord);

        const transferItems = params.items.map(item => ({
          id: `TRFI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          transferId,
          productId: item.productId,
          qty: item.qty,
          receivedQty: 0,
          batchNumber: item.batchNumber || "BATCH-GEN",
          expiryDate: item.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: now,
        }));

        await db.db.branchTransferItems.bulkAdd(transferItems);

        await ProjectionEventBus.publish('STOCK_TRANSFER_CREATED', transferId, { source: params.sourceBranchId, target: params.targetBranchId });
        await AuditService.log({
          action: 'CREATE',
          module: 'STOCK_TRANSFER',
          transactionUuid,
          after: { transferRecord, transferItems },
          recordId: transferId
        });

        await this.markIdempotencyCompleted(transactionUuid);
        return { success: true, transferId };
      }, transactionUuid, STOCK_TRANSFER_WORKFLOW_TABLES);
    } catch (err: any) {
      await this.releaseIdempotencyKey(transactionUuid);
      FaultService.log({
        type: 'TRANSFER_FATAL',
        module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
        message: `Stock transfer creation failed: ${err.message || String(err)}`,
        payload: params,
        stack: err.stack
      });
      throw err;
    }
  }

  public static async processStockTransferStatusUpdate(
    params: WorkflowStockTransferStatusParams
  ): Promise<{ success: boolean }> {
    const { transferId, newStatus, updatedBy, receivedQuantities } = params;
    const rawTransfer = await db.db.branchTransfers.get(transferId);
    if (!rawTransfer) throw new Error("لم يتم العثور على طلب النقل");

    if (rawTransfer.status === newStatus) return { success: true };

    const branchId = rawTransfer.sourceBranchId || "BRH-MAIN-001";
    const lockKey = `transfer:${transferId}`;

    return await LockService.withLock(
      lockKey,
      { branchId, lockType: "BRANCH_TRANSFER", ownerId: updatedBy, ttl: 15000 },
      async () => {
        return await TransactionService.runSafe(transferId, async () => {
          const rawItems = await db.db.branchTransferItems.where("transferId").equals(transferId).toArray();
          const previousStatus = rawTransfer.status;
          const now = new Date().toISOString();

          if (newStatus === "APPROVED") {
            rawTransfer.approvedBy = updatedBy;
          } else if (newStatus === "IN_TRANSIT") {
            rawTransfer.shippedBy = updatedBy;
            rawTransfer.shippedAt = now;

            for (const item of rawItems) {
              await this.updateBranchStockQty(rawTransfer.sourceBranchId, item.productId, -item.qty);
            }
          } else if (newStatus === "RECEIVED") {
            rawTransfer.receivedBy = updatedBy;
            rawTransfer.receivedAt = now;

            for (const item of rawItems) {
              const recQty = receivedQuantities && receivedQuantities[item.id] !== undefined
                ? receivedQuantities[item.id]
                : item.qty;

              await db.db.branchTransferItems.update(item.id, { receivedQty: recQty });
              await this.updateBranchStockQty(rawTransfer.targetBranchId, item.productId, recQty);
            }
          } else if (newStatus === "CANCELLED") {
            if (previousStatus === "IN_TRANSIT") {
              for (const item of rawItems) {
                await this.updateBranchStockQty(rawTransfer.sourceBranchId, item.productId, item.qty);
              }
            }
          }

          rawTransfer.status = newStatus;
          rawTransfer.updatedAt = now;
          await db.db.branchTransfers.put(rawTransfer);

          await ProjectionEventBus.publish('STOCK_TRANSFER_STATUS_CHANGED', transferId, { newStatus, previousStatus });
          await AuditService.log({
            action: 'EDIT',
            module: 'INVENTORY',
            transactionUuid: transferId,
            after: { transferId, newStatus, updatedBy },
            recordId: transferId
          });

          return { success: true };
        }, transferId, STOCK_TRANSFER_WORKFLOW_TABLES);
      }
    );
  }

  // =========================================================================
  // UNPOST & DELETE UTILITIES
  // =========================================================================
  public static async unpostInvoice(invoiceId: string, type: 'SALE' | 'PURCHASE'): Promise<{ success: boolean }> {
    const user = authService.getCurrentUser();
    if (user?.Role !== 'Admin') {
      throw new Error("Only administrators can unpost invoices.");
    }

    await BackupService.createBackup(`Auto Backup before Unpost #${invoiceId}`, 'PRE_UNPOST', true);

    return await TransactionService.runSafe(invoiceId, async () => {
      try {
        await GlobalGuard.checkSystemState('إلغاء ترحيل');

        const invoice = type === 'SALE' 
          ? await InvoiceRepository.getSaleById(invoiceId)
          : await InvoiceRepository.getPurchaseById(invoiceId);

        if (!invoice) throw new Error("Invoice not found.");

        const status = (invoice as any).InvoiceStatus || (invoice as any).invoiceStatus;
        if (status !== 'POSTED') {
          throw new Error("Only POSTED invoices can be unposted.");
        }

        await AccountingRepository.deleteEntriesBySource(invoiceId);

        await stockEngine.reverseMovements(invoiceId);
        await fifoEngine.reverseFIFO(invoiceId);

        const total = (invoice as any).finalTotal || (invoice as any).totalAmount;
        const partnerId = type === 'SALE' ? (invoice as any).customerId : (invoice as any).partnerId;

        const ftId = db.generateId('FT');
        await FinancialTransactionRepository.record({
          id: ftId,
          Transaction_Type: 'Refund',
          Reference_ID: invoiceId,
          Reference_Table: type === 'SALE' ? 'Sales_Invoices' : 'Purchase_Invoices',
          Entity_Name: partnerId || 'عميل نقدي',
          Amount: total,
          Direction: type === 'SALE' ? 'Debit' : 'Credit',
          Transaction_Date: new Date().toISOString(),
          Notes: `[UNPOST REVERSAL] Invoice #${invoiceId}`
        });

        if (partnerId && partnerId !== 'عميل نقدي' && partnerId !== 'مورد نقدي') {
          if (type === 'SALE') {
            await db.updateCustomerBalance(partnerId, -total);
          } else {
            await db.updateSupplierBalance(partnerId, -total);
          }
          await SupplierRepository.postToLedger({
            id: db.generateId('PL'),
            partnerId,
            date: new Date().toISOString(),
            description: `عكس قيد فاتورة #${invoiceId}`,
            debit: type === 'SALE' ? 0 : total,
            credit: type === 'SALE' ? total : 0,
            referenceId: invoiceId
          });
        }

        if (type === 'SALE') {
          await db.db.sales.update(invoiceId, { InvoiceStatus: 'DRAFT_EDIT', lastModified: new Date().toISOString() });
        } else {
          await db.db.purchases.update(invoiceId, { invoiceStatus: 'DRAFT_EDIT', lastModified: new Date().toISOString() });
        }

        await AuditService.log({
          action: 'EDIT',
          module: type,
          transactionUuid: invoiceId,
          recordId: invoiceId,
          after: { invoiceId, type, unpostedBy: user?.User_Email }
        });

        await ProjectionEventBus.publish('INVOICE_UNPOSTED', invoiceId, { type });
        return { success: true };
      } catch (err: any) {
        FaultService.log({
          type: 'UNPOST_FATAL',
          module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
          message: `Failed to unpost invoice ${invoiceId}: ${err.message || String(err)}`,
          payload: { invoiceId, type },
          stack: err.stack
        });
        throw err;
      }
    }, invoiceId, UNPOST_WORKFLOW_TABLES);
  }

  public static async deleteInvoice(invoiceId: string, type: 'SALE' | 'PURCHASE'): Promise<{ success: boolean }> {
    const invoice = type === 'SALE' 
      ? await InvoiceRepository.getSaleById(invoiceId)
      : await InvoiceRepository.getPurchaseById(invoiceId);

    if (!invoice) throw new Error("Invoice not found.");

    const invoiceDate = (invoice as any).date || new Date().toISOString();
    await GlobalGuard.checkSystemState('حذف فاتورة', invoiceDate);

    const hasDeps = await InvoiceRepository.checkHasDependencies(invoiceId, type);
    if (hasDeps) {
      throw new Error("لا يمكن حذف الفاتورة لوجود مستندات مرتبطة بها. يرجى حذف الارتباطات أولاً.");
    }

    await BackupService.createBackup(`Auto Backup before Delete #${invoiceId}`, 'PRE_DELETE', true);

    return await TransactionService.runSafe(invoiceId, async () => {
      try {
        const status = (invoice as any).InvoiceStatus || (invoice as any).invoiceStatus;
        if (status === 'POSTED') {
          await this.unpostInvoice(invoiceId, type);
        }

        if (type === 'SALE') {
          await db.db.sales.update(invoiceId, { InvoiceStatus: 'VOID', isDeleted: true, lastModified: new Date().toISOString() });
        } else {
          await db.db.purchases.update(invoiceId, { invoiceStatus: 'VOID', isDeleted: true, lastModified: new Date().toISOString() });
        }

        await AuditService.log({
          action: 'DELETE',
          module: type,
          transactionUuid: invoiceId,
          recordId: invoiceId,
          after: { invoiceId, type, deletedBy: authService.getCurrentUser()?.User_Email }
        });

        await ProjectionEventBus.publish('INVOICE_DELETED', invoiceId, { type });
        return { success: true };
      } catch (err: any) {
        FaultService.log({
          type: 'DELETE_FATAL',
          module: 'UNIFIED_WORKFLOW_ORCHESTRATOR',
          message: `Failed to delete invoice ${invoiceId}: ${err.message || String(err)}`,
          payload: { invoiceId, type },
          stack: err.stack
        });
        throw err;
      }
    }, invoiceId, UNPOST_WORKFLOW_TABLES);
  }

  // Helper methods
  private static createJournalLine(entryId: string, accountId: string, debit: number, credit: number): JournalLine {
    const id = db.generateId('JL');
    return {
      id,
      lineId: id,
      entryId,
      accountId,
      accountName: '',
      debit,
      credit,
      type: debit > 0 ? 'DEBIT' : 'CREDIT',
      amount: debit > 0 ? debit : credit
    };
  }

  private static async updateBranchStockQty(branchId: string, productId: string, deltaQty: number): Promise<void> {
    const inv = await db.db.branchInventory
      .where('[branchId+productId]')
      .equals([branchId, productId])
      .first();

    const now = new Date().toISOString();
    if (inv && inv.id) {
      const newQty = Math.max(0, inv.stockQuantity + deltaQty);
      await db.db.branchInventory.update(inv.id, {
        stockQuantity: newQty,
        updatedAt: now
      });
    } else {
      await db.db.branchInventory.add({
        id: `INV-${branchId}-${productId}`,
        branchId,
        productId,
        stockQuantity: Math.max(0, deltaQty),
        reorderPoint: 10,
        reorderQuantity: 50,
        createdAt: now,
        updatedAt: now
      });
    }
  }
}
