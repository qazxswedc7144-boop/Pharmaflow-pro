// src/domain/services.contracts.ts
import { JournalEntry, Voucher } from "./accounting.domain";
import { SalesInvoice, SalesReturn } from "./sales.domain";
import { PurchaseInvoice, PurchaseReturn } from "./purchases.domain";
import { StockMovement, InventoryAdjustment } from "./inventory.domain";

export interface IAccountingService {
  postJournalEntry(entry: JournalEntry): Promise<void>;
  createVoucher(voucher: Voucher): Promise<string>;
  getAccountBalance(accountId: string): Promise<number>;
}

export interface ISalesService {
  createSalesInvoice(invoice: SalesInvoice): Promise<string>;
  processSalesReturn(salesReturn: SalesReturn): Promise<string>;
  cancelInvoice(invoiceId: string, reason?: string): Promise<void>;
}

export interface IPurchaseService {
  createPurchaseInvoice(invoice: PurchaseInvoice): Promise<string>;
  processPurchaseReturn(purchaseReturn: PurchaseReturn): Promise<string>;
  cancelPurchase(purchaseId: string, reason?: string): Promise<void>;
}

export interface IInventoryService {
  adjustStock(adjustment: InventoryAdjustment): Promise<void>;
  recordMovement(movement: StockMovement): Promise<string>;
  checkStockAvailability(productId: string, requestedQuantity: number): Promise<boolean>;
}

export interface ITransactionOrchestrator {
  executeAtomicSale(invoice: SalesInvoice): Promise<{ invoiceId: string; journalEntryId: string }>;
  executeAtomicPurchase(invoice: PurchaseInvoice): Promise<{ invoiceId: string; journalEntryId: string }>;
  executeAtomicAdjustment(adjustment: InventoryAdjustment): Promise<{ adjustmentId: string; journalEntryId?: string }>;
}
