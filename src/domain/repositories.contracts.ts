// src/domain/repositories.contracts.ts
import { Account, JournalEntry, JournalLine } from "./accounting.domain";
import { SalesInvoice } from "./sales.domain";
import { PurchaseInvoice } from "./purchases.domain";
import { Product, StockMovement } from "./inventory.domain";
import { Customer, Supplier } from "./partners.domain";
import { AuditLog } from "./system.domain";

export interface IAccountRepository {
  getById(id: string): Promise<Account | undefined>;
  getByCode(code: string): Promise<Account | undefined>;
  getAll(): Promise<Account[]>;
  save(account: Account): Promise<string>;
  updateBalance(id: string, delta: number): Promise<void>;
}

export interface IJournalRepository {
  getById(id: string): Promise<JournalEntry | undefined>;
  getLinesByEntryId(entryId: string): Promise<JournalLine[]>;
  saveEntry(entry: JournalEntry): Promise<string>;
  getEntriesByDateRange(startDate: string, endDate: string): Promise<JournalEntry[]>;
}

export interface ISalesRepository {
  getById(id: string): Promise<SalesInvoice | undefined>;
  getByInvoiceNumber(num: string): Promise<SalesInvoice | undefined>;
  save(invoice: SalesInvoice): Promise<string>;
  updateStatus(id: string, status: string): Promise<void>;
}

export interface IPurchaseRepository {
  getById(id: string): Promise<PurchaseInvoice | undefined>;
  getByInvoiceNumber(num: string): Promise<PurchaseInvoice | undefined>;
  save(invoice: PurchaseInvoice): Promise<string>;
  updateStatus(id: string, status: string): Promise<void>;
}

export interface IProductRepository {
  getById(id: string): Promise<Product | undefined>;
  getByBarcode(barcode: string): Promise<Product | undefined>;
  getAll(): Promise<Product[]>;
  save(product: Product): Promise<string>;
  updateStock(id: string, quantityDelta: number): Promise<void>;
}

export interface IStockMovementRepository {
  save(movement: StockMovement): Promise<string>;
  getByProductId(productId: string): Promise<StockMovement[]>;
  getByReferenceId(referenceId: string): Promise<StockMovement[]>;
}

export interface IPartnerRepository {
  getCustomerById(id: string): Promise<Customer | undefined>;
  getSupplierById(id: string): Promise<Supplier | undefined>;
  saveCustomer(customer: Customer): Promise<string>;
  saveSupplier(supplier: Supplier): Promise<string>;
  updateBalance(partnerId: string, partnerType: 'CUSTOMER' | 'SUPPLIER', delta: number): Promise<void>;
}

export interface IAuditRepository {
  log(entry: Partial<AuditLog>): Promise<string>;
  getByEntity(entityType: string, entityId: string): Promise<AuditLog[]>;
}
