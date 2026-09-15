// server/modules/sync/compensating-transaction.service.ts
// Phase 5 — Immutable Financial Events & Compensating Transactions Engine
// Strict enforcement of the One Financial Effect principle: Never overwrite committed ledger entries;
// All corrections must occur via traceable, balanced compensating events.

export interface ReversingJournalEntryParams {
  originalEntryId?: string;
  originalJournalEntryId?: string;
  originalEntryNumber?: string;
  originalLines?: Array<{ accountId?: string; accountCode?: string; accountName?: string; debit: number; credit: number; description?: string }>;
  lines?: Array<{ accountId?: string; accountCode?: string; accountName?: string; debit: number; credit: number; description?: string }>;
  reason: string;
  actorId: string;
  tenantId: string;
  branchId?: string | null;
  effectiveDate?: string;
}

export interface CreditNoteParams {
  originalInvoiceId: string;
  originalInvoiceNumber?: string;
  returnAmount?: number;
  subtotal?: number;
  customerId?: string;
  returnedItems?: Array<{ productId: string; productName?: string; quantity: number; unitPrice: number; total?: number; batchId?: string }>;
  items?: Array<{ productId: string; productName?: string; quantity: number; unitPrice: number; total?: number; batchId?: string }>;
  reason: string;
  actorId: string;
  tenantId: string;
  branchId?: string | null;
}

export interface InventoryReconciliationParams {
  batchId?: string;
  batchNumber?: string;
  productId: string;
  systemQuantity: number;
  physicalQuantity?: number;
  actualQuantity?: number;
  unitCost: number;
  reason: string;
  actorId: string;
  tenantId: string;
  branchId?: string | null;
}

export class CompensatingTransactionService {
  /**
   * Generates a balanced Reversing Journal Entry that cancels or adjusts an original entry
   * Debit and Credit lines are exactly swapped to guarantee mathematical zero-sum ledger cancellation.
   */
  static generateReversingJournalEntry(params: ReversingJournalEntryParams): {
    id: string;
    type: "REVERSING_JOURNAL_ENTRY";
    sourceType: "COMPENSATING_REVERSAL";
    originalEntryId: string;
    originalEntryNumber?: string;
    tenantId: string;
    branchId?: string | null;
    status: "POSTED";
    date: string;
    reason: string;
    lines: Array<{ accountId?: string; accountCode?: string; accountName?: string; debit: number; credit: number; description: string }>;
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  } {
    const id = `REV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const date = params.effectiveDate || new Date().toISOString();
    const originalEntryId = params.originalEntryId || params.originalJournalEntryId || "unknown-je";

    let totalDebit = 0;
    let totalCredit = 0;

    const sourceLines = params.originalLines || params.lines || [];

    // Invert debits and credits: Original Debit becomes Credit, Original Credit becomes Debit
    const reversedLines = sourceLines.map((line) => {
      const debit = Number(line.credit || 0);
      const credit = Number(line.debit || 0);
      totalDebit += debit;
      totalCredit += credit;

      return {
        accountId: line.accountId || line.accountCode,
        accountCode: line.accountCode || line.accountId,
        accountName: line.accountName,
        debit,
        credit,
        description: `قيد عكسي تعويضي للقيد [${originalEntryId}]: ${params.reason}`
      };
    });

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

    return {
      id,
      type: "REVERSING_JOURNAL_ENTRY",
      sourceType: "COMPENSATING_REVERSAL",
      originalEntryId,
      originalEntryNumber: params.originalEntryNumber,
      tenantId: params.tenantId,
      branchId: params.branchId,
      status: "POSTED",
      date,
      reason: params.reason,
      lines: reversedLines,
      totalDebit,
      totalCredit,
      isBalanced
    };
  }

  /**
   * Generates a formal Credit Note / Return Document that compensates an original sales invoice
   * without mutating the immutable original invoice.
   */
  static generateCreditNote(params: CreditNoteParams): {
    id: string;
    creditNoteNumber: string;
    originalInvoiceId: string;
    originalInvoiceNumber: string;
    type: "CREDIT_NOTE";
    documentStatus: "ACTIVE";
    totalAmount: number;
    subtotal: number;
    customerId?: string;
    items: Array<{ productId: string; productName?: string; quantity: number; unitPrice: number; total?: number; batchId?: string }>;
    tenantId: string;
    branchId?: string | null;
    createdAt: string;
    reason: string;
  } {
    const id = `CN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const originalInvoiceNumber = params.originalInvoiceNumber || `INV-${Date.now()}`;
    const creditNoteNumber = `CN-${originalInvoiceNumber.replace(/^INV-/, "")}`;
    const itemsList = params.returnedItems || params.items || [];
    
    const computedTotal = itemsList.reduce((acc, it) => acc + (it.total || (it.quantity * it.unitPrice)), 0);
    const totalAmount = params.returnAmount !== undefined ? params.returnAmount : (params.subtotal !== undefined ? params.subtotal : computedTotal);

    return {
      id,
      creditNoteNumber,
      originalInvoiceId: params.originalInvoiceId,
      originalInvoiceNumber,
      type: "CREDIT_NOTE",
      documentStatus: "ACTIVE",
      totalAmount,
      subtotal: totalAmount,
      customerId: params.customerId,
      items: itemsList,
      tenantId: params.tenantId,
      branchId: params.branchId,
      createdAt: new Date().toISOString(),
      reason: params.reason
    };
  }

  /**
   * Generates an Inventory Adjustment/Reconciliation event to reconcile physical vs system stock
   * using immutable inventory movements.
   */
  static generateInventoryReconciliation(params: InventoryReconciliationParams): {
    id: string;
    type: "INVENTORY_RECONCILIATION";
    batchId: string;
    batchNumber?: string;
    productId: string;
    deltaQuantity: number;
    varianceQuantity: number;
    varianceValue: number;
    movementType: "IN" | "OUT";
    costPerUnit: number;
    totalValuationChange: number;
    tenantId: string;
    branchId?: string | null;
    createdAt: string;
    reason: string;
  } {
    const id = `ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const physical = params.physicalQuantity !== undefined ? params.physicalQuantity : (params.actualQuantity !== undefined ? params.actualQuantity : params.systemQuantity);
    const varianceQuantity = physical - params.systemQuantity;
    const movementType = varianceQuantity >= 0 ? "IN" : "OUT";
    const deltaQuantity = Math.abs(varianceQuantity);
    const totalValuationChange = deltaQuantity * params.unitCost;
    const varianceValue = varianceQuantity * params.unitCost;
    const batchId = params.batchId || params.batchNumber || "DEFAULT-BATCH";

    return {
      id,
      type: "INVENTORY_RECONCILIATION",
      batchId,
      batchNumber: params.batchNumber || batchId,
      productId: params.productId,
      deltaQuantity,
      varianceQuantity,
      varianceValue,
      movementType,
      costPerUnit: params.unitCost,
      totalValuationChange,
      tenantId: params.tenantId,
      branchId: params.branchId,
      createdAt: new Date().toISOString(),
      reason: params.reason
    };
  }
}
