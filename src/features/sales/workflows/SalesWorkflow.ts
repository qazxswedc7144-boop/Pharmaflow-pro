import { BusinessWorkflow, WorkflowContext } from '@/core/workflow';
import { InvoiceItem, InvoiceStatus, Sale } from '@/types';
import { ValidationService as validationService } from '@/services/integrity/ValidationService';
import { UnifiedInventoryMutationEngine } from '@features/inventory/services/UnifiedInventoryMutationEngine';
import { InvoiceRepository } from '@/database/repositories/invoice.repository';
import { FinancialTransactionRepository } from '@/database/repositories/FinancialTransactionRepository';
import { AccountingEngine as accountingEngine } from '@features/accounting/services/AccountingEngine';
import { CurrencyService } from '@/services/localization/CurrencyService';
import { db } from '@/core/db';
import { ProjectionEventBus } from '@/services/system/ProjectionEventBus';
import { configurationService } from '@/services/config/configurationService';

export interface SalesWorkflowInput {
  customerId?: string;
  items: InvoiceItem[];
  total: number;
  id?: string;
  date?: string;
  notes?: string;
  attachment?: string;
  isCash?: boolean;
  isReturn?: boolean;
  invoiceStatus?: InvoiceStatus;
  currency?: string;
  isEdit?: boolean;
  warehouseId?: string;
  originalSaleId?: string;
}

export interface SalesWorkflowResult {
  refId: string;
  sale: Sale | any;
}

export class SalesWorkflow implements BusinessWorkflow<SalesWorkflowInput, SalesWorkflowResult> {
  public id = 'sales.invoice.process';
  public name = 'معالجة فاتورة مبيعات';
  public operationType = 'SALE';
  public requiredPermissions = ['sales.create', 'sales.edit'];
  public tables = [
    'invoices', 'invoiceItems', 'products', 'inventoryTransactions',
    'inventory_layers', 'fifo_consumption_log', 'warehouseStock',
    'branchInventory',
    'medicineBatches', 'stock_movements', 'customers', 'journalEntries',
    'journalLines', 'accounts', 'financialTransactions', 'auditLogs',
    'idempotencyKeys', 'projectionEvents', 'projectionCheckpoints',
    'accountingPeriods', 'sales', 'settings', 'systemSettings'
  ];

  public async validateInput(input: SalesWorkflowInput): Promise<void> {
    if (!input.items || input.items.length === 0) {
      throw new Error('يجب إضافة صنف واحد على الأقل بفاتورة المبيعات');
    }
    if (input.total < 0) {
      throw new Error('إجمالي الفاتورة يجب أن يكون أكبر من أو يساوي الصفر');
    }
  }

  public async validateBusinessRules(input: SalesWorkflowInput): Promise<void> {
    await validationService.validateInvoice(input, 'SALE');

    if (!input.isEdit && input.id) {
      await validationService.validateInvoiceIdUniqueness(input.id, 'invoices', db.db);
    }
  }

  public async executeDomainSteps(
    input: SalesWorkflowInput,
    ctx: WorkflowContext
  ): Promise<SalesWorkflowResult> {
    const finalStatus: InvoiceStatus = input.invoiceStatus || 'POSTED';
    const isPosting = finalStatus === 'POSTED' || finalStatus === 'LOCKED';
    const effectiveDate = input.date || ctx.startedAt;
    const isReturn = !!input.isReturn;

    const docId = input.id || db.generateId('SALE');

    const savedDoc = await InvoiceRepository.saveSale(
      input.customerId!,
      input.items,
      input.total,
      docId,
      input.isCash || false,
      input.currency || CurrencyService.getCurrentCurrencyCode(),
      finalStatus,
      0,
      'LOW',
      docId,
      input.attachment,
      isReturn,
      effectiveDate,
      ctx.idempotencyKey
    );

    const refId = (savedDoc as any)?.id || docId;
    let costResult = { totalCost: 0, itemCosts: {} as Record<string, number> };

    if (isPosting) {
      // 1. Resolve Warehouse (Explicit priority: input -> context -> configuration -> default WH-MAIN)
      const warehouseId =
        input.warehouseId ||
        (ctx.metadata?.warehouseId as string) ||
        configurationService.getSync<string>('inventory.defaultWarehouseId') ||
        'WH-MAIN';

      // 2. Extract Inventory Items (Exclude service / non-inventory items)
      const inventoryItems = (input.items || [])
        .filter((item) => {
          const productId = item.productId || (item as any).product_id;
          if (!productId) return false;

          // Defensive service / non-inventory detection
          const isService = (item as any).isService === true;
          const trackStock = (item as any).trackStock === false;
          const isServiceType = (item as any).type === 'SERVICE' || (item as any).itemType === 'SERVICE';
          if (isService || trackStock || isServiceType) {
            return false;
          }

          const qty = Number(item.quantity ?? (item as any).qty ?? 0);
          return qty > 0;
        })
        .map((item) => ({
          productId: (item.productId || (item as any).product_id)!,
          quantity: Number(item.quantity ?? (item as any).qty ?? 0),
          unitPrice: Number(item.unitPrice ?? (item as any).price ?? 0),
          batchId: item.batchId,
          batchNumber: (item as any).batchNumber,
          expiryDate: item.expiryDate
        }));

      // 3. Delegate Inventory Mutation Exclusively to UnifiedInventoryMutationEngine
      if (inventoryItems.length > 0) {
        const engine = UnifiedInventoryMutationEngine.getInstance();
        const tenantId = ctx.tenantId || 'TEN-DEV-001';
        const userId = ctx.userId || 'system';
        const branchId = ctx.branchId || 'BR-MAIN';
        const transactionUuid = ctx.idempotencyKey;

        if (isReturn) {
          const mutationResults = await engine.executeSalesReturn({
            returnInvoiceId: refId,
            originalSaleId: input.originalSaleId,
            warehouseId,
            items: inventoryItems,
            transactionUuid,
            userId,
            tenantId,
            branchId,
            notes: input.notes || `مرتجع مبيعات فاتورة #${refId}`
          });

          const totalCost = mutationResults.reduce((sum, r) => sum + (r.calculatedCost || 0), 0);
          const itemCosts: Record<string, number> = {};
          for (const r of mutationResults) {
            itemCosts[r.productId] = r.calculatedCost || 0;
          }
          costResult = { totalCost, itemCosts };
        } else {
          const mutationResults = await engine.executeIssueSale({
            invoiceId: refId,
            warehouseId,
            items: inventoryItems,
            transactionUuid,
            userId,
            tenantId,
            branchId,
            notes: input.notes || `صرف مبيعات فاتورة #${refId}`
          });

          const totalCost = mutationResults.reduce((sum, r) => sum + (r.calculatedCost || 0), 0);
          const itemCosts: Record<string, number> = {};
          for (const r of mutationResults) {
            itemCosts[r.productId] = r.calculatedCost || 0;
          }
          costResult = { totalCost, itemCosts };
        }
      }

      // 4. Financial & Accounting Ledger Execution
      const custId = input.customerId;
      if (custId && custId !== 'عميل نقدي') {
        const balanceDelta = isReturn ? -input.total : input.total;
        await db.updateCustomerBalance(custId, balanceDelta);
      }

      await FinancialTransactionRepository.record({
        id: db.generateId('FT'),
        Transaction_Type: isReturn ? 'Refund' : (input.isCash ? 'Payment' : 'Invoice'),
        Reference_ID: refId,
        Reference_Table: 'Sales_Invoices',
        Entity_Type: 'Customer',
        Entity_Name: input.customerId || 'عميل نقدي',
        Amount: input.total,
        Direction: isReturn ? 'Credit' : 'Debit',
        Transaction_Date: effectiveDate,
        Notes: `فاتورة مبيعات #${refId}`
      });

      await accountingEngine.postInvoice(
        { ...input, type: 'SALE', id: refId, transactionUuid: ctx.idempotencyKey },
        costResult
      );

      await ProjectionEventBus.publish('INVOICE_POSTED', refId, {
        type: 'SALE',
        transactionUuid: ctx.idempotencyKey,
        correlationId: ctx.correlationId
      });
    }

    return {
      refId,
      sale: savedDoc
    };
  }
}

export const salesWorkflow = new SalesWorkflow();
