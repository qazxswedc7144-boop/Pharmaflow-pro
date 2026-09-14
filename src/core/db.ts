/* eslint-disable @typescript-eslint/no-unused-vars */
import Dexie, { type Table, type Transaction } from 'dexie';
import { useAuthStore } from '@/store/authStore';

function ensureItemPrimaryKey(table: any, item: any) {
  if (!item || typeof item !== 'object') return item;
  try {
    const schema = table?.schema;
    if (!schema || !schema.primKey) return item;
    
    const keyPath = schema.primKey.keyPath;
    const isAuto = schema.primKey.auto;

    if (keyPath && typeof keyPath === 'string' && !isAuto) {
      if (item[keyPath] === undefined || item[keyPath] === null || item[keyPath] === '') {
        const tableName = table.name || 'entity';
        const candidate = item.id || item.ID || item[`${tableName}Id`] || item[`${tableName}_id`] || 
                          item.key || item.code || item.invoice_number || item.invoiceNumber || 
                          item.Supplier_ID || item.Customer_ID || item.ProductID || item.productId || 
                          item.draftId || item.voucherId || item.linkId || item.transaction_id || 
                          item.Transaction_ID || item.errorId || item.AdjustmentID;
        item[keyPath] = candidate || `${tableName.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      }
    }
  } catch (e) {
    console.warn('[DexieGuard] Error ensuring primary key:', e);
  }
  return item;
}

if (typeof Dexie !== 'undefined' && (Dexie as any).Table) {
  const TableProto = (Dexie as any).Table.prototype;
  
  const originalPut = TableProto.put;
  if (originalPut) {
    TableProto.put = function(this: any, item: any, key?: any) {
      ensureItemPrimaryKey(this, item);
      return originalPut.call(this, item, key);
    };
  }

  const originalAdd = TableProto.add;
  if (originalAdd) {
    TableProto.add = function(this: any, item: any, key?: any) {
      ensureItemPrimaryKey(this, item);
      return originalAdd.call(this, item, key);
    };
  }

  const originalBulkPut = TableProto.bulkPut;
  if (originalBulkPut) {
    TableProto.bulkPut = function(this: any, items: any[], keys?: any, options?: any) {
      if (Array.isArray(items)) {
        items.forEach(item => ensureItemPrimaryKey(this, item));
      }
      return originalBulkPut.call(this, items, keys, options);
    };
  }

  const originalBulkAdd = TableProto.bulkAdd;
  if (originalBulkAdd) {
    TableProto.bulkAdd = function(this: any, items: any[], keys?: any, options?: any) {
      if (Array.isArray(items)) {
        items.forEach(item => ensureItemPrimaryKey(this, item));
      }
      return originalBulkAdd.call(this, items, keys, options);
    };
  }
}

export function getCurrentUserSession() {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('pharmaflow_user') : null;
    if (stored) {
      const userObj = JSON.parse(stored);
      return {
        tenantId: userObj?.tenantId || 'default-tenant',
        branchId: userObj?.branchId || null,
        userId: userObj?.id || 'default-user'
      };
    }
  } catch (e) {
    console.error('[DB] Error reading user session from localStorage:', e);
  }
  return {
    tenantId: 'default-tenant',
    branchId: null,
    userId: 'default-user'
  };
}
import { 
  Product, UnifiedInvoice, InvoiceItem, Account, AccountingEntry, JournalEntry, InvoiceStatus, Customer, Supplier, 
  JournalLine, InventoryTransaction, AccountingPeriod, SystemBackup, ValidationRule,
  VoucherInvoiceLink as Voucher, AuditLogEntry as AuditLog, Currency
} from '@/types';
import { 
  ProductReadModel, InventoryReadModel, InvoiceReadModel, 
  LedgerReadModel, AggregateSnapshot 
} from '@features/events/read.types';

/**
 * PharmaFlow PRO ERP Database Core
 * Robust, production-grade Dexie implementation with strict schema versioning.
 */

export class PharmaFlowDB extends Dexie {
  // Strongly typed tables
  products!: Table<Product>;
  invoices!: Table<UnifiedInvoice>;
  invoiceItems!: Table<InvoiceItem>;
  accounts!: Table<Account>;
  journalEntries!: Table<AccountingEntry>;
  journalLines!: Table<JournalLine>;
  inventoryTransactions!: Table<InventoryTransaction>;
  accountingPeriods!: Table<AccountingPeriod>;
  customers!: Table<any>;
  suppliers!: Table<any>;
  vouchers!: Table<Voucher>;
  auditLogs!: Table<AuditLog>;
  settings!: Table<{ key: string; value: any }>;
  systemSettings!: Table<{ key: string; value: any }>;
  medicineBatches!: Table<any>;
  exchangeRates!: Table<any>;
  systemBackups!: Table<SystemBackup>;

  // Multi-branch Tables
  branches!: Table<any>;
  branchSettings!: Table<any>;
  branchInventory!: Table<any>;
  branchTransfers!: Table<any>;
  branchTransferItems!: Table<any>;
  branchUsers!: Table<any>;
  
  // Legacy / Compatibility Tables (added to satisfy linter and services)
  sales!: Table<any>;
  purchases!: Table<any>;
  categories!: Table<any>;
  receipts!: Table<any>;
  payments!: Table<any>;
  settlements!: Table<any>;
  cashFlow!: Table<any>;
  priceHistory!: Table<any>;
  inventory!: Table<any>;
  invoiceAdjustments!: Table<any>;
  systemAlerts!: Table<any>;
  financialHealthSnapshots!: Table<any>;
  historicalMetrics!: Table<any>;
  voucherInvoiceLinks!: Table<any>;
  financialTransactions!: Table<any>;
  warehouseStock!: Table<any>;
  inventory_layers!: Table<any>;
  fifo_consumption_log!: Table<any>;
  itemUsageLog!: Table<any>;
  stock_movements!: Table<any>;
  inventory_logs!: Table<any>;
  Audit_Log!: Table<any>;
  Accounting_Periods!: Table<any>;
  purchasesByItem!: Table<any>;
  profitHealth!: Table<any>;
  aiInsights!: Table<any>;
  dailyAuditTasks!: Table<any>;
  auditProgress!: Table<any>;
  itemProfits!: Table<any>;
  supplierProfits!: Table<any>;
  profit_health!: Table<any>;
  systemPerformanceLog!: Table<any>;
  cash_logs!: Table<any>;
  System_Error_Log!: Table<any>;

  // Phase 3 Offline Sync Engine Tables
  sync_queue!: Table<any>;
  sync_logs!: Table<any>;
  sync_failures!: Table<any>;
  sync_conflicts!: Table<any>;
  sync_snapshots!: Table<any>;

  // Phase 3.2 camelCase Sync Engine Tables
  syncQueue!: Table<any>;
  syncEvents!: Table<any>;
  failedMutations!: Table<any>;
  outbox!: Table<any>;
  syncLogs!: Table<any>;

  // Phase 3.4 Event Sourcing Tables
  eventStore!: Table<any>;

  // Phase 3.5 CQRS Schema Tables
  readProducts!: Table<ProductReadModel, string>;
  readInventory!: Table<InventoryReadModel, string>;
  readInvoices!: Table<InvoiceReadModel, string>;
  readLedgers!: Table<LedgerReadModel, string>;
  aggregateSnapshots!: Table<AggregateSnapshot, [string, number]>;

  // Phase 5.2.1 tables
  system_errors!: Table<any>;
  drafts!: Table<any>;

  // Phase 5.2.5-C - Smart Auto Save Draft Engine
  draft_invoices!: Table<any>;

  // Phase 5.2.7-C - Invoice Posting Idempotency Engine
  idempotencyKeys!: Table<any>;

  // Phase 5.2.7-D - Event Driven Report Projections
  projectionCheckpoints!: Table<any>;
  projectionEvents!: Table<any>;

  // Legacy support for code that uses db.db
  get db(): PharmaFlowDB { return this; }

  constructor(dbName: string = 'PharmaFlowPRO') {
    super(dbName);

    // VERSION 12: Complete defensive schema with comprehensive indexes for all query casings (camel/snake/Pascal)
    this.version(12).stores({
      products: '&id, name, Name, barcode, categoryId, supplierId, stock, is_active, Is_Active, updated_at',
      invoices: '&id, invoice_number, date, Date, partner_id, partnerId, type, payment_status, financial_status, document_status, is_synced, createdAt',
      invoiceItems: '&id, parent_id, product_id, [parent_id+product_id]',
      accounts: '&id, code, name, type, parent_id, is_system, balance',
      journalEntries: '&id, date, source_id, sourceId, source_type, status, created_at, reference_id, referenceId, partnerId, partner_id',
      journalLines: '&id, entry_id, entryId, account_id, accountId, [entry_id+account_id], [entryId+accountId]',
      inventoryTransactions: '&id, product_id, productId, warehouse_id, source_doc_id, transaction_type, transaction_date',
      accountingPeriods: '&id, Start_Date, End_Date, Is_Locked, start_date, end_date, is_locked',
      customers: '&id, name, Name, phone, balance, is_active, Is_Active',
      suppliers: '&id, name, Name, phone, balance, is_active, Is_Active',
      vouchers: '&id, voucher_id, type, partner_id, partnerId, date, status, invoiceId, invoice_id',
      auditLogs: '&id, timestamp, user_id, action, target_type, target_id, Modified_At, Record_ID',
      settings: '&key',
      medicineBatches: '&id, productId, batchNumber, expiryDate',
      exchangeRates: '&id, fromCurrency, toCurrency, date',
      systemBackups: '&id, backupName, createdAt, backupType',
      
      // Compatibility Stores
      sales: '&id, invoice_number, date, Date, InvoiceStatus, hash, SaleID, createdAt, transactionUuid',
      purchases: '&id, invoice_number, date, Date, invoiceStatus, hash, createdAt, transactionUuid',
      categories: '&id, categoryId, categoryName',
      receipts: '&id, voucher_id',
      payments: '&id, voucher_id',
      settlements: '&id, voucherId',
      cashFlow: '&id, transaction_id, date',
      priceHistory: '&id, productId',
      inventory: '&id',
      invoiceAdjustments: '&id, InvoiceID',
      systemAlerts: '&id, type, timestamp, isRead',
      financialHealthSnapshots: '&id, date',
      historicalMetrics: '&id, month',
      voucherInvoiceLinks: '&id, voucherId, invoiceId',
      financialTransactions: '&id, Reference_ID, Entity_Name',
      warehouseStock: '&id, productId, warehouseId, [warehouseId+productId], [warehouse_id+product_id]',
      inventory_layers: '&id, productId, item_id, reference_id',
      fifo_consumption_log: '&id, saleId, sale_id',
      itemUsageLog: '&id, productId',
      stock_movements: '&id, product_id, item_id, reference_id',
      inventory_logs: '&id, product_id',
      Audit_Log: '&id, timestamp, user_id, action, target_type, target_id, Modified_At, Record_ID',
      Accounting_Periods: '&id, start_date, end_date',
      purchasesByItem: '&id, product_id, productId',
      profitHealth: '&id, date',
      aiInsights: '&id, date',
      dailyAuditTasks: '&id, date',
      auditProgress: '&id, taskId',
      itemProfits: '&id, product_id',
      supplierProfits: '&id, partner_id',
      profit_health: '&id, date',
      systemPerformanceLog: '&id, operation',
      cash_logs: '&id, type, date',
      System_Error_Log: '&id, Error_ID, Module_Name'
    });

    // Version 13: Phase 3 Offline Sync Engine schema update
    this.version(13).stores({
      sync_queue: '&id, type, priority, idempotencyKey, timestamp, status',
      sync_logs: '&id, timestamp, mutationId, idempotencyKey',
      sync_failures: '&id, mutationId, timestamp',
      sync_conflicts: '&id, type, timestamp',
      sync_snapshots: '&id, entityId, timestamp'
    });

    // Version 14: Phase 3.2 Offline Sync Engine camelCase table extensions
    this.version(14).stores({
      syncQueue: '++id,&idempotencyKey,mutationId,[syncStatus+createdAt],[entityType+createdAt]',
      syncEvents: '++id, eventId, sequence, createdAt',
      failedMutations: '++id, mutationId, createdAt'
    });

    // Version 15: Phase 3.4 Event Sourcing Tables
    this.version(15).stores({
      eventStore: '++id, eventId, aggregateId, aggregateType, eventType, createdAt, [aggregateType+aggregateId]'
    });

    // Version 16: Phase 3.5 CQRS Schema Extensions
    this.version(16).stores({
      readProducts: 'productId, sku, category',
      readInventory: 'batchId, productId, expiryDate, [productId+expiryDate]',
      readInvoices: 'invoiceId, invoiceNumber, status, createdAt',
      readLedgers: 'accountNumber, currentBalance',
      aggregateSnapshots: '[aggregateId+version], aggregateType',
    });

    // Version 17: Phase 4.1 Multi-Branch Architecture
    this.version(17).stores({
      branches: '&id, code, name, isActive',
      branchSettings: '&id, branchId',
      branchInventory: '&id, branchId, productId, [branchId+productId]',
      branchTransfers: '&id, transferNumber, sourceBranchId, targetBranchId, status, createdAt',
      branchTransferItems: '&id, transferId, productId, [transferId+productId]',
      branchUsers: '&id, branchId, userId, [branchId+userId]'
    });

    // Version 18: Phase 5.2.1 - Production Hardening & Play Readiness
    this.version(18).stores({
      system_errors: '&id, errorId, timestamp, severity, moduleName, screenName',
      drafts: '&id, moduleName, updatedAt',
      invoices: '&id, invoice_number, date, Date, partner_id, partnerId, type, payment_status, financial_status, document_status, is_synced, createdAt, transactionUuid'
    });

    // Version 19: Phase 5.2.5-C - Smart Auto Save Draft Engine
    this.version(19).stores({
      draft_invoices: '&draftId, invoiceType, updatedAt'
    });

    // Version 20: Phase 5.2.7-C - Invoice Posting Idempotency Engine
    this.version(20).stores({
      idempotencyKeys: '&id, status, createdAt, completedAt'
    });

    // Version 21: Phase 5.2.7-D - Event Driven Report Projections
    this.version(21).stores({
      projectionCheckpoints: '&id, sequence, lastProcessedEventId, updatedAt',
      projectionEvents: '++id, eventId, eventType, aggregateId, createdAt, status'
    });

    // Version 22: Security and local lifecycle settings persistence
    this.version(22).stores({
      systemSettings: '&key'
    });

    // Version 23: Production-Grade Sync Engine
    this.version(23).stores({
      outbox: '++id, &mutationId, &idempotencyKey, status, type, createdAt, [status+createdAt]',
      syncLogs: '++id, action, mutationId, timestamp'
    });

    // Version 24: Dexie Query Optimization - Compound Indexes for Invoices
    this.version(24).stores({
      invoices: '&id, invoice_number, invoiceNumber, date, Date, partner_id, partnerId, type, payment_status, financial_status, document_status, is_synced, createdAt, transactionUuid, [type+partner_id], [type+partnerId], [type+invoice_number], [type+invoiceNumber]'
    });

    // Version 25: Index transactionUuid on sales and purchases
    this.version(25).stores({
      sales: '&id, invoice_number, date, Date, InvoiceStatus, hash, SaleID, createdAt, transactionUuid',
      purchases: '&id, invoice_number, date, Date, invoiceStatus, hash, createdAt, transactionUuid'
    });

    // Version 26: Index productId, parentId, invoiceId on invoiceItems
    this.version(26).stores({
      invoiceItems: '&id, parent_id, parentId, invoice_id, invoiceId, product_id, productId, [parent_id+product_id], [parentId+productId], [invoice_id+product_id], [invoiceId+productId]'
    });

    // Version 27: Phase 8.1 - Offline Multi-Tenant Composite Key Architecture & Data Isolation
    this.version(27).stores({
      products: '&id, name, Name, barcode, sku, ProductID, categoryId, supplierId, is_active, Is_Active, stock, StockQuantity, updatedAt, tenantId, [tenantId+id], [tenantId+barcode], [tenantId+sku], [tenantId+categoryId]',
      invoices: '&id, invoice_number, invoiceNumber, date, Date, partner_id, partnerId, type, payment_status, financial_status, document_status, is_synced, createdAt, transactionUuid, tenantId, branchId, [tenantId+id], [tenantId+invoiceNumber], [tenantId+invoice_number], [tenantId+type], [tenantId+branchId], [tenantId+partnerId], [tenantId+partner_id], [type+partner_id], [type+partnerId], [type+invoice_number], [type+invoiceNumber]',
      sales: '&id, invoice_number, date, Date, InvoiceStatus, hash, SaleID, createdAt, transactionUuid, tenantId, branchId, [tenantId+id], [tenantId+invoice_number], [tenantId+branchId]',
      purchases: '&id, invoice_number, date, Date, invoiceStatus, hash, createdAt, transactionUuid, tenantId, branchId, [tenantId+id], [tenantId+invoice_number], [tenantId+branchId]',
      customers: '&id, name, Name, phone, email, is_active, Is_Active, tenantId, [tenantId+id], [tenantId+phone]',
      suppliers: '&id, name, Name, phone, email, is_active, Is_Active, tenantId, [tenantId+id], [tenantId+phone]',
      journalEntries: '&id, date, sourceId, sourceType, status, createdAt, tenantId, branchId, [tenantId+id], [tenantId+branchId], [tenantId+date]',
      accounts: '&id, code, name, type, parentId, tenantId, [tenantId+id], [tenantId+code]',
      syncQueue: '++id, &idempotencyKey, mutationId, syncStatus, tenantId, [tenantId+id], [tenantId+syncStatus], [syncStatus+createdAt], [entityType+createdAt]',
      outbox: '++id, &mutationId, &idempotencyKey, status, type, tenantId, createdAt, [tenantId+status], [status+createdAt]'
    });

    // Version 28: Defensive Product & Entity Schema Upgrade - Indexing Name, ProductID, Is_Active
    this.version(28).stores({
      products: '&id, name, Name, barcode, sku, ProductID, categoryId, supplierId, is_active, Is_Active, stock, StockQuantity, updatedAt, tenantId, [tenantId+id], [tenantId+barcode], [tenantId+sku], [tenantId+categoryId], [tenantId+name], [tenantId+Name]',
      customers: '&id, name, Name, phone, email, is_active, Is_Active, tenantId, [tenantId+id], [tenantId+phone]',
      suppliers: '&id, name, Name, phone, email, is_active, Is_Active, tenantId, [tenantId+id], [tenantId+phone]'
    });

    // Handle structural integrity and recovery
    this.on('versionchange', () => {
      console.warn("Database structure updated in another tab. Reloading...");
      this.close();
      if (typeof window !== 'undefined') window.location.reload();
    });

    // Register hooks to ensure tenantId and userId are set on specified tables
    const targetTables = [
      'invoices', 'products', 'customers', 'suppliers', 'journalEntries',
      'accounts', 'sales', 'purchases', 'syncQueue', 'sync_queue', 'outbox',
      'branchTransfers', 'branchInventory'
    ];
    targetTables.forEach(tableName => {
      try {
        const table = this.table(tableName);
        if (table) {
          table.hook('creating', (_primKey: any, obj: any) => {
            const session = getCurrentUserSession();
            if (obj && typeof obj === 'object') {
              obj.tenantId = obj.tenantId || session.tenantId;
              obj.userId = obj.userId || session.userId;
            }
          });
          table.hook('updating', (mods: any, _primKey: any, obj: any) => {
            const session = getCurrentUserSession();
            if (mods && typeof mods === 'object') {
              return {
                ...mods,
                tenantId: mods.tenantId || (obj ? obj.tenantId : undefined) || session.tenantId,
                userId: mods.userId || (obj ? obj.userId : undefined) || session.userId
              };
            }
          });
        }
      } catch (err) {
        console.warn(`[DB] Could not register hooks for table: ${tableName}`, err);
      }
    });
  }

  getExistingTableNames(): string[] {
    const actualTableNames = this.tables.map(t => t.name);
    const nativeDB = (this as any).idbdb;
    if (nativeDB && nativeDB.objectStoreNames) {
      const storeNames = Array.from(nativeDB.objectStoreNames) as string[];
      return actualTableNames.filter(t => storeNames.includes(t));
    }
    return actualTableNames;
  }

  /**
   * Safe Transaction Helper: Provides atomic operations with automatic rollback.
   */
  async safeTransaction<T>(
    mode: 'r' | 'rw', 
    tables: string[] = [], 
    operation: (trans: Transaction) => Promise<T>
  ): Promise<T> {
    try {
      if (!this.isOpen()) await this.open();
      
      const existingTableNames = this.getExistingTableNames();
      const safeTables = tables || [];
      const validTables = safeTables.filter(t => existingTableNames.includes(t));
      
      // If we are in 'rw' mode and missing tables, we might have strict Dexie errors.
      // We log but proceed with available tables.
      if (validTables.length < safeTables.length) {
         console.warn(`[DB] Transaction tables missing: ${safeTables.filter(t => !existingTableNames.includes(t))}`);
      }

      // 1. Detect Nested Transaction Execution
      if ((Dexie as any).currentTransaction) {
        console.log("[DB] Re-using parent active transaction zone to prevent early commit");
        return await operation((Dexie as any).currentTransaction);
      }

      // 2. Wrap block using Dexie's explicit transaction system and return via Dexie promise chain
      return await this.transaction(mode as any, validTables.length > 0 ? validTables : existingTableNames, async (trans) => {
        // 🚨 تم إزالة حلقة الـ keepAlive الـ recursive التي كانت تحتجز قاعدة البيانات
        return await operation(trans);
      });
    } catch (error: any) {
      console.error("[DB] Atomic Transaction Failed:", error);
      const msg = error?.message || String(error);
      const shouldStandardize = 
        msg.includes("committed too early") || 
        msg.includes("Transaction committed") ||
        msg.includes("TransactionCompleted") ||
        msg.includes("Transaction aborted") ||
        msg.includes("inactive") ||
        error?.name === "TransactionCommittedTooEarlyError" ||
        error?.name === "TransactionAbortedError";
      
      if (shouldStandardize) {
        const erpError = new Error("تعذر إكمال العملية حالياً، يرجى إعادة المحاولة.");
        (erpError as any).technicalDetails = msg;
        throw erpError;
      }
      throw error; 
    }
  }

  generateId(prefix: string = 'ID'): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  async emergencyReset() {
    console.error("🛑 PERFORMING EMERGENCY DATABASE RESET...");
    await this.delete();
    if (typeof window !== 'undefined') window.location.reload();
  }

  async ensureOpen() {
    if (!this.isOpen()) await this.open();
  }

  // --- COMPATIBILITY LAYER ---
  async getAccounts() { return await this.accounts.toArray(); }
  async getJournalEntries() { return await this.journalEntries.toArray(); }
  async getAccountingPeriods() { return await this.accountingPeriods.toArray(); }
  async getCustomers() { return await this.customers.toArray(); }
  async getSuppliers() { return await this.suppliers.toArray(); }
  async getCurrencies(): Promise<Currency[]> { return await this.getSetting('CURRENCIES', []) as Currency[]; }
  async getMedicineAlerts() { return await this.systemAlerts.where('type').equals('STOCK').toArray(); }
  async getDailyAuditTask(date: string) { return await this.dailyAuditTasks.where('date').equals(date).first(); }
  async createDailyAuditTask(task: any) { return await this.dailyAuditTasks.add(task); }
  async saveAuditProgress(progress: any) { return await this.auditProgress.put(progress); }
  async finalizeAudit(taskId: string, results: any) { return await this.dailyAuditTasks.update(taskId, { ...results, status: 'COMPLETED' }); }
  async clearOldAlerts() { return await this.systemAlerts.clear(); }
  
  async saveCustomer(customer: Customer) { return await this.customers.put(customer); }
  async saveSupplier(supplier: Supplier) { return await this.suppliers.put(supplier); }
  async saveProduct(product: Product) { return await this.products.put(product); }
  async softDeleteProduct(id: string) { return await this.products.update(id, { is_active: false }); }
  async saveAccount(account: Account) { return await this.accounts.put(account); }
  async deleteAccount(id: string) { return await this.accounts.delete(id); }
  async addJournalEntry(entry: JournalEntry) { return await this.journalEntries.add(entry); }
  async addJournalEntryLegacy(entry: JournalEntry) { return await this.journalEntries.add(entry); }
  async saveSettlement(settlement: Record<string, unknown>) { return await this.settlements.put(settlement); }
  async getCurrentBranchId() { return 'MAIN'; }
  async updatePurchaseNotes(id: string, notes: string) { return await this.invoices.update(id, { notes }); }
  async updatePurchaseAttachment(id: string, attachment: string) { return await this.invoices.update(id, { attachment }); }
  async updateSaleNotes(id: string, notes: string) { return await this.invoices.update(id, { notes }); }
  async updateSaleAttachment(id: string, attachment: string) { return await this.invoices.update(id, { attachment }); }
  async getInvoiceHistory(invoiceId: string) {
    const logs = await this.Audit_Log.where('target_id').equals(invoiceId).toArray();
    return logs.map((l: AuditLog) => ({
      id: l.id,
      invoiceId: l.target_id || '',
      userId: l.user_id || '',
      userName: (l as any).userName || (l as any).user_name || 'مستخدم النظام',
      timestamp: l.timestamp || new Date().toISOString(),
      action: (l.action === 'CREATE' ? 'CREATED' : l.action === 'POST' ? 'POSTED' : l.action) as 'CREATED' | 'POSTED' | string,
      details: l.details || `تمت عملية ${l.action} على المستند`
    }));
  }
  async addInvoiceHistory(log: { invoiceId: string; userId: string; userName: string; timestamp: string; action: string; details: string }) {
    return await this.Audit_Log.add({
      id: 'AUD-' + Date.now() + Math.random().toString(36).substring(3, 8),
      user_id: log.userId,
      userName: log.userName,
      action: (log.action === 'CREATED' ? 'CREATE' : log.action === 'POSTED' ? 'POST' : log.action) as 'CREATE' | 'POST' | string,
      target_type: 'SALE',
      target_id: log.invoiceId,
      timestamp: log.timestamp,
      details: log.details
    });
  }
  async saveMedicineAlert(alert: Record<string, unknown>) { return await this.systemAlerts.add(alert); }
  async persist() { return true; }
  
  async updateCustomerBalance(id: string, delta: number) {
    const cust = await this.customers.get(id);
    if (cust) await this.customers.update(id, { balance: (cust.balance || 0) + delta });
  }

  async updateSupplierBalance(id: string, delta: number) {
    const supp = await this.suppliers.get(id);
    if (supp) await this.suppliers.update(id, { balance: (supp.balance || 0) + delta });
  }

  async recordCashFlow(data: Record<string, unknown>) {
    return await this.cashFlow.add({ ...data, id: this.generateId('CF') });
  }

  async getCashFlow() {
    return await this.cashFlow.toArray();
  }

  async saveAccountingEntry(entry: JournalEntry) {
    return await this.journalEntries.put(entry);
  }

  async saveAccountingPeriod(period: AccountingPeriod) {
    return await this.accountingPeriods.put(period);
  }

  // --- LEGACY ORCHESTRATION HELPERS ---
  async processSale(
    customerId: string, items: InvoiceItem[], total: number, isReturn: boolean, id: string,
    _currency: string, paymentStatus: string, docStatus: InvoiceStatus, _auditScore: number,
    _riskLevel: string, _totalCost: number, refId: string, _attachment: string, date: string,
    transactionUuid?: string
  ) {
    const sale: UnifiedInvoice = {
      id: id || this.generateId('SALE'),
      invoiceNumber: this.generateId('INV'),
      date: date || new Date().toISOString(),
      partnerId: customerId,
      partnerName: 'Unknown Customer',
      type: 'SALE',
      subtotal: total,
      tax: 0,
      finalTotal: total,
      paidAmount: paymentStatus === 'Cash' ? total : 0,
      paymentStatus: paymentStatus as 'Cash' | 'Credit',
      financialStatus: paymentStatus === 'Cash' ? 'Paid' : 'Unpaid',
      documentStatus: docStatus,
      items: items,
      isReturn: isReturn,
      notes: `Ref: ${refId}`,
      transactionUuid: transactionUuid,
            isSynced: (typeof navigator !== 'undefined' && navigator.onLine),
      syncStatus: (typeof navigator !== 'undefined' && navigator.onLine) ? 'SYNCED' : 'PENDING',
      updatedAt: new Date().toISOString()
    };
    await this.invoices.put(sale);
    try { await this.sales.put(sale as any); } catch {}
    return sale;
  }

  async processPurchase(
    supplierId: string, items: InvoiceItem[], total: number, id: string,
    isCash: boolean, _currency: string, docStatus: InvoiceStatus, _auditScore: number,
    _riskLevel: string, refId: string, _attachment: string, isReturn: boolean, date: string,
    transactionUuid?: string
  ) {
    const purchase: UnifiedInvoice = {
      id: id || this.generateId('PUR'),
      invoiceNumber: this.generateId('PURCH'),
      date: date || new Date().toISOString(),
      partnerId: supplierId,
      partnerName: 'Unknown Supplier',
      type: 'PURCHASE',
      subtotal: total,
      tax: 0,
      finalTotal: total,
      paidAmount: isCash ? total : 0,
      paymentStatus: isCash ? 'Cash' : 'Credit',
      financialStatus: isCash ? 'Paid' : 'Unpaid',
      documentStatus: docStatus,
      items: items,
      isReturn: isReturn,
      notes: `Ref: ${refId}`,
      transactionUuid: transactionUuid,
            isSynced: (typeof navigator !== 'undefined' && navigator.onLine),
      syncStatus: (typeof navigator !== 'undefined' && navigator.onLine) ? 'SYNCED' : 'PENDING',
      updatedAt: new Date().toISOString()
    };
    await this.invoices.put(purchase);
    try { await this.purchases.put(purchase as any); } catch {}
    return purchase;
  }

  async getSales() { 
    return await this.invoices.where('type').equals('SALE').toArray(); 
  }

  async getValidationRules(): Promise<ValidationRule[]> {
    const rulesSetting = await this.getSetting('validation_rules', null);
    if (rulesSetting) {
      return rulesSetting;
    }
    const defaultRules: ValidationRule[] = [
      {
        id: 'rule-sale-cust',
        entityType: 'SALE',
        fieldName: 'customerId',
        operator: 'NOT_EMPTY',
        comparisonValue: '',
        errorMessage: 'يجب تحديد عميل صالح.',
        isActive: true,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'rule-sale-total',
        entityType: 'SALE',
        fieldName: 'total',
        operator: 'GREATER_THAN',
        comparisonValue: '0',
        errorMessage: 'يجب أن يكون إجمالي الفاتورة أكبر من صفر.',
        isActive: true,
        updatedAt: new Date().toISOString()
      }
    ];
    return defaultRules;
  }
  
  async getPurchases() { 
    return await this.invoices.where('type').equals('PURCHASE').toArray(); 
  }

  async getTransactions() {
    const all = await this.invoices.toArray();
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async updateAccountBalance(id: string, delta: number) {
    const acc = await this.accounts.get(id);
    if (acc) {
      await this.accounts.update(id, {
        balance: (acc.balance || 0) + delta,
        updatedAt: new Date().toISOString()
      });
    }
  }

  async isDateLocked(date: string) {
    const period = await this.accountingPeriods
      .where('Start_Date').belowOrEqual(date)
      .and(p => !!p.End_Date && p.End_Date >= date && !!p.Is_Locked)
      .first();
    return !!period;
  }

  // --- SETTINGS HELPERS ---
  async getSetting(key: string, defaultValue: any = null) {
    try {
      const item = await this.settings.get(key);
      return item ? item.value : defaultValue;
    } catch (e) {
      console.warn(`[DB] Failed to get setting ${key}:`, e);
      return defaultValue;
    }
  }

  async saveSetting(key: string, value: any) {
    await this.settings.put({ key, value });
  }

  // --- AUDIT LOG HELPERS ---
  async addAuditLog(userId: string, action: string, targetType: string, details: string) {
    await this.auditLogs.add({
      id: this.generateId('LOG'),
      timestamp: new Date().toISOString(),
      user_id: userId,
      action: action as any,
      target_type: targetType as any,
      target_id: details
    });
  }

  // --- PROTECTION HELPERS ---
  setBypassSecurity(status: boolean) {
    console.log(`[DB] Security Bypass: ${status}`);
    sessionStorage.setItem('PHARMAFLOW_DB_BYPASS', status ? 'true' : 'false');
  }

  // --- CURRENCY HELPERS ---
  async saveCurrency(currency: any) {
    // If the table doesn't exist yet, we store it in settings as a fallback or a dedicated table
    try {
       await (this as any).currencies?.put(currency) || await this.saveSetting(`CURRENCY_${currency.code}`, currency);
    } catch (e) {
       await this.saveSetting(`CURRENCY_${currency.code}`, currency);
    }
  }

  async getExchangeRates(date?: string) {
    if (date) return await this.exchangeRates.where('date').equals(date).toArray();
    return await this.exchangeRates.toArray();
  }

  // --- TRANSACTION HELPERS ---
  async runTransaction<T>(
    operation: (tx?: Transaction) => Promise<T>,
    tables: string[] = [],
    mode: 'rw' | 'r' = 'rw'
  ): Promise<T> {
    const existing = this.getExistingTableNames();
    const validTables = (tables.length ? tables : existing).filter(t => existing.includes(t));

    try {
      if ((Dexie as any).currentTransaction) {
        return await operation((Dexie as any).currentTransaction);
      }

      return await this.transaction(mode as any, validTables, async (tx) => {
        // 🚨 تم إزالة حلقة الـ keepAlive الـ recursive التي كانت تحتجز قاعدة البيانات
        return await operation(tx);
      });
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('committed too early') || msg.includes('inactive') || msg.includes('aborted')) {
        const erpError = new Error('تعذر إكمال العملية حالياً، يرجى إعادة المحاولة.');
        (erpError as any).technicalDetails = msg;
        throw erpError;
      }
      throw error;
    }
  }

  // --- TABLES HELPERS ---
  async getProducts() { return await this.products.toArray(); }

  // --- INITIALIZATION ---
  async init() {
    console.log("[DB] Initializing database seeds and defaults...");
    try {
      if (!this.isOpen()) await this.open();
      
      const count = await this.accounts.count();
      if (count === 0) {
        await this.accounts.bulkPut([
          { id: 'acc-cash', code: '101', name: 'الصندوق الرئيسي', type: 'ASSET', balance: 0, isSystem: true, isActive: true, balance_type: 'DEBIT', balanceType: 'DEBIT', debit: 0, credit: 0, updatedAt: new Date().toISOString() },
          { id: 'acc-sales', code: '401', name: 'إيرادات المبيعات', type: 'REVENUE', balance: 0, isSystem: true, isActive: true, balance_type: 'CREDIT', balanceType: 'CREDIT', debit: 0, credit: 0, updatedAt: new Date().toISOString() },
          { id: 'acc-cogs', code: '501', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', balance: 0, isSystem: true, isActive: true, balance_type: 'DEBIT', balanceType: 'DEBIT', debit: 0, credit: 0, updatedAt: new Date().toISOString() }
        ]).catch((err) => console.warn('[DB] Accounts seed warning:', err));
      }

      // Seed initial products for offline browsing if products table is empty
      const prodCount = await this.products.count();
      if (prodCount === 0) {
        await this.products.bulkPut([
          { id: 'PRD-101', name: 'بانادول إكسترا 500 ملجم', Name: 'Panadol Extra 500mg', barcode: '628100011001', categoryId: 'CAT-1', supplierId: 'SUP-1', stock: 150, is_active: true, Is_Active: true, price: 18.5, cost: 12.0, updatedAt: new Date().toISOString() },
          { id: 'PRD-102', name: 'أومول 500 ملجم أقراص', Name: 'Omol 500mg', barcode: '628100011002', categoryId: 'CAT-1', supplierId: 'SUP-1', stock: 200, is_active: true, Is_Active: true, price: 12.0, cost: 7.5, updatedAt: new Date().toISOString() },
          { id: 'PRD-103', name: 'فيتامين سي 1000 ملجم فوار', Name: 'Vitamin C 1000mg', barcode: '628100011003', categoryId: 'CAT-2', supplierId: 'SUP-2', stock: 85, is_active: true, Is_Active: true, price: 25.0, cost: 16.0, updatedAt: new Date().toISOString() },
          { id: 'PRD-104', name: 'أوجمنتين 1 جرام أقراص', Name: 'Augmentin 1g', barcode: '628100011004', categoryId: 'CAT-3', supplierId: 'SUP-2', stock: 60, is_active: true, Is_Active: true, price: 64.5, cost: 45.0, updatedAt: new Date().toISOString() },
          { id: 'PRD-105', name: 'بخاخ أنف أوتروفين', Name: 'Otrivin Nasal Spray', barcode: '628100011005', categoryId: 'CAT-4', supplierId: 'SUP-3', stock: 110, is_active: true, Is_Active: true, price: 16.0, cost: 10.5, updatedAt: new Date().toISOString() },
          { id: 'PRD-106', name: 'مرطب كيو في 500 جرام', Name: 'QV Cream 500g', barcode: '628100011006', categoryId: 'CAT-5', supplierId: 'SUP-3', stock: 40, is_active: true, Is_Active: true, price: 115.0, cost: 82.0, updatedAt: new Date().toISOString() }
        ] as any[]).catch((err) => console.warn('[DB] Products seed warning:', err));
      }

      // Seed initial invoices (sales & purchases history) for offline browsing if empty
      const invCount = await this.invoices.count();
      if (invCount === 0) {
        await this.invoices.bulkPut([
          {
            id: 'INV-1001',
            invoiceNumber: 'INV-1001',
            invoice_number: 'INV-1001',
            date: new Date(Date.now() - 86400000 * 2).toISOString(),
            partnerId: 'CUST-01',
            partnerName: 'صيدلية الأمل المركزية',
            type: 'SALE',
            subtotal: 185.0,
            tax: 0,
            finalTotal: 185.0,
            totalAmount: 185.0,
            paidAmount: 185.0,
            paymentStatus: 'Cash',
            financialStatus: 'Paid',
            documentStatus: 'POSTED',
            items: [{ id: 'ITEM-1', parent_id: 'INV-1001', product_id: 'PRD-101', quantity: 10, unitPrice: 18.5, totalPrice: 185.0 }],
            isReturn: false,
            notes: 'افتتاحي',
            is_synced: 1,
            isSynced: true,
            syncStatus: 'SYNCED',
            createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
            updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
          },
          {
            id: 'INV-1002',
            invoiceNumber: 'INV-1002',
            invoice_number: 'INV-1002',
            date: new Date(Date.now() - 86400000 * 1).toISOString(),
            partnerId: 'CUST-02',
            partnerName: 'مستشفى الحياة التخصصي',
            type: 'SALE',
            subtotal: 645.0,
            tax: 0,
            finalTotal: 645.0,
            totalAmount: 645.0,
            paidAmount: 0,
            paymentStatus: 'Credit',
            financialStatus: 'Unpaid',
            documentStatus: 'POSTED',
            items: [{ id: 'ITEM-2', parent_id: 'INV-1002', product_id: 'PRD-104', quantity: 10, unitPrice: 64.5, totalPrice: 645.0 }],
            isReturn: false,
            notes: 'توريد مستشفى',
            is_synced: 1,
            isSynced: true,
            syncStatus: 'SYNCED',
            createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
            updatedAt: new Date(Date.now() - 86400000 * 1).toISOString()
          },
          {
            id: 'PUR-2001',
            invoiceNumber: 'PUR-2001',
            invoice_number: 'PUR-2001',
            date: new Date(Date.now() - 86400000 * 5).toISOString(),
            partnerId: 'SUP-01',
            partnerName: 'شركة السقاف للخدمات الطبية',
            type: 'PURCHASE',
            subtotal: 2500.0,
            tax: 0,
            finalTotal: 2500.0,
            totalAmount: 2500.0,
            paidAmount: 2500.0,
            paymentStatus: 'Cash',
            financialStatus: 'Paid',
            documentStatus: 'POSTED',
            items: [{ id: 'ITEM-3', parent_id: 'PUR-2001', product_id: 'PRD-106', quantity: 20, unitPrice: 82.0, totalPrice: 1640.0 }],
            isReturn: false,
            notes: 'شحنة توريد عاجلة',
            is_synced: 1,
            isSynced: true,
            syncStatus: 'SYNCED',
            createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
            updatedAt: new Date(Date.now() - 86400000 * 5).toISOString()
          }
        ] as any[]).catch((err) => console.warn('[DB] Invoices seed warning:', err));
      }

      return true;
    } catch (e) {
      console.error("[DB] Init failed:", e);
      return false;
    }
  }

  private dataVersionCounter = 1;

  getDataVersion() {
    return this.dataVersionCounter;
  }

  incrementDataVersion() {
    this.dataVersionCounter += 1;
  }
}

/**
 * Legacy support for code that uses db.db
 */

let isDbBlocked = false;
const memDb: Record<string, Map<string, any>> = {};

function createMockCollection(results: any[]) {
  const coll: any = {
    toArray: () => Promise.resolve(results),
    count: () => Promise.resolve(results.length),
    first: () => Promise.resolve(results[0] || null),
    last: () => Promise.resolve(results[results.length - 1] || null),
    limit: (n: number) => createMockCollection(results.slice(0, n)),
    offset: (n: number) => createMockCollection(results.slice(n)),
    reverse: () => createMockCollection([...results].reverse()),
    filter: (fn: any) => createMockCollection(results.filter(fn)),
    and: (fn: any) => createMockCollection(results.filter(fn)),
  };
  return coll;
}

function getMockTable(tableName: string) {
  if (!memDb[tableName]) {
    memDb[tableName] = new Map();
  }
  const store = memDb[tableName];

  const whereMock = (indexOrProp?: string) => {
    return {
      equals: (val: any) => {
        const results = Array.from(store.values()).filter(item => {
          if (typeof item === 'object' && item !== null) {
            if (indexOrProp) {
              return String(item[indexOrProp]).toLowerCase() === String(val).toLowerCase();
            }
          }
          return false;
        });
        return createMockCollection(results);
      },
      above: (val: any) => {
        const results = Array.from(store.values()).filter(item => {
          if (typeof item === 'object' && item !== null && indexOrProp) {
            return item[indexOrProp] > val;
          }
          return false;
        });
        return createMockCollection(results);
      },
      below: (val: any) => {
        const results = Array.from(store.values()).filter(item => {
          if (typeof item === 'object' && item !== null && indexOrProp) {
            return item[indexOrProp] < val;
          }
          return false;
        });
        return createMockCollection(results);
      },
      belowOrEqual: (val: any) => {
        const results = Array.from(store.values()).filter(item => {
          if (typeof item === 'object' && item !== null && indexOrProp) {
            return item[indexOrProp] <= val;
          }
          return false;
        });
        return createMockCollection(results);
      },
      anyOf: (vals: any[]) => {
        const results = Array.from(store.values()).filter(item => {
          if (typeof item === 'object' && item !== null && indexOrProp) {
            return vals.includes(item[indexOrProp]);
          }
          return false;
        });
        return createMockCollection(results);
      },
      between: (a: any, b: any) => {
        const results = Array.from(store.values()).filter(item => {
          if (typeof item === 'object' && item !== null && indexOrProp) {
            return item[indexOrProp] >= a && item[indexOrProp] <= b;
          }
          return false;
        });
        return createMockCollection(results);
      }
    };
  };

  const mockTable = {
    toArray: () => Promise.resolve(Array.from(store.values())),
    get: (key: any) => {
      if (typeof key === 'object' && key !== null) {
        // Handle compound or query key search
        const found = Array.from(store.values()).find(item => {
          return Object.entries(key).every(([k, v]) => item[k] === v);
        });
        return Promise.resolve(found || null);
      }
      return Promise.resolve(store.get(String(key)) || null);
    },
    put: (item: any) => {
      const id = item.id || item.key || `mem-${Math.random().toString(36).substring(2, 10)}`;
      const activeItem = { ...item, id };
      store.set(String(id), activeItem);
      return Promise.resolve(id);
    },
    add: (item: any) => {
      const id = item.id || item.key || `mem-${Math.random().toString(36).substring(2, 10)}`;
      const activeItem = { ...item, id };
      store.set(String(id), activeItem);
      return Promise.resolve(id);
    },
    update: (key: any, changes: any) => {
      const existing = store.get(String(key));
      if (existing) {
        store.set(String(key), { ...existing, ...changes });
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    },
    delete: (key: any) => {
      store.delete(String(key));
      return Promise.resolve(null);
    },
    bulkAdd: (items: any[]) => {
      items.forEach(item => {
        const id = item.id || item.key || `mem-${Math.random().toString(36).substring(2, 10)}`;
        store.set(String(id), { ...item, id });
      });
      return Promise.resolve(items);
    },
    bulkPut: (items: any[]) => {
      items.forEach(item => {
        const id = item.id || item.key || `mem-${Math.random().toString(36).substring(2, 10)}`;
        store.set(String(id), { ...item, id });
      });
      return Promise.resolve(items);
    },
    bulkDelete: (keys: any[]) => {
      keys.forEach(k => store.delete(String(k)));
      return Promise.resolve();
    },
    clear: () => {
      store.clear();
      return Promise.resolve();
    },
    count: () => Promise.resolve(store.size),
    where: whereMock,
    orderBy: (prop: string) => {
      const results = Array.from(store.values()).sort((a, b) => {
        if (a[prop] < b[prop]) return -1;
        if (a[prop] > b[prop]) return 1;
        return 0;
      });
      return createMockCollection(results);
    },
    filter: (fn: any) => {
      const results = Array.from(store.values()).filter(fn);
      return createMockCollection(results);
    }
  };

  return mockTable;
}

export function getDatabaseName(tenantId?: string | null, userId?: string | null): string {
  const t = tenantId || 'default-tenant';
  const u = userId || 'default-user';
  return `PharmaFlowPRO_${t}_${u}`;
}

// Check initial user session to boot the correct database
const initialSession = getCurrentUserSession();
const storedUser = typeof window !== 'undefined' ? localStorage.getItem('pharmaflow_user') : null;
const initialDbName = storedUser ? getDatabaseName(initialSession.tenantId, initialSession.userId) : 'PharmaFlowPRO_Guest';

export let dbInstance = new PharmaFlowDB(initialDbName);

export async function openUserDatabase(tenantId: string, userId: string): Promise<PharmaFlowDB> {
  const newDbName = getDatabaseName(tenantId, userId);
  if (dbInstance && dbInstance.name === newDbName) {
    if (!dbInstance.isOpen()) {
      await dbInstance.open();
    }
    return dbInstance;
  }

  if (dbInstance) {
    console.log(`[DB] Closing previous database: ${dbInstance.name}`);
    dbInstance.close();
  }

  console.log(`[DB] Opening user-scoped database: ${newDbName}`);
  dbInstance = new PharmaFlowDB(newDbName);
  isDbBlocked = false;
  try {
    await dbInstance.open();
    console.log(`[DB] User-scoped database ${newDbName} opened successfully.`);
  } catch (error) {
    console.error(`[DB] Failed to open user-scoped database ${newDbName}:`, error);
    isDbBlocked = true;
  }
  return dbInstance;
}

export async function closeUserDatabase(): Promise<void> {
  if (dbInstance) {
    console.log(`[DB] Closing user database: ${dbInstance.name}`);
    dbInstance.close();
  }
  dbInstance = new PharmaFlowDB('PharmaFlowPRO_Guest');
  isDbBlocked = false;
  try {
    await dbInstance.open();
  } catch (e) {
    console.error('[DB] Failed to open Guest database on close:', e);
    isDbBlocked = true;
  }
}

// Subscribe to Auth state to automatically switch user databases!
if (typeof window !== 'undefined') {
  try {
    useAuthStore.subscribe((state, prevState) => {
      const prevUser = prevState?.user;
      const currUser = state?.user;

      if (currUser && (!prevUser || prevUser.id !== currUser.id)) {
        const tenantId = currUser.tenant_id || 'default-tenant';
        const userId = currUser.id || 'default-user';
        console.log(`[DB] Auth subscription detected login: tenant=${tenantId}, user=${userId}. Switching database...`);
        openUserDatabase(tenantId, userId).catch(err => {
          console.error('[DB] Error auto-switching DB on subscriber login:', err);
        });
      } else if (!currUser && prevUser) {
        console.log('[DB] Auth subscription detected logout. Closing user database...');
        closeUserDatabase().catch(err => {
          console.error('[DB] Error auto-closing DB on subscriber logout:', err);
        });
      }
    });
  } catch (err) {
    console.error('[DB] Failed to subscribe to useAuthStore:', err);
  }
}

/**
 * Export a Proxy to support legacy code while transitioning to the new schema.
 */
function wrapQueryChain(obj: any, tableName: string): any {
  if (!obj || typeof obj !== 'object') return obj;
  return new Proxy(obj, {
    get(targetObj, targetProp) {
      if (isDbBlocked) {
        const mockTable = getMockTable(tableName);
        const fallbackObj = (mockTable as any).where ? (mockTable as any).where() : createMockCollection([]);
        return typeof fallbackObj[targetProp] === 'function'
          ? fallbackObj[targetProp].bind(fallbackObj)
          : fallbackObj[targetProp];
      }
      const val = targetObj[targetProp];
      if (typeof val === 'function') {
        return (...args: any[]) => {
          try {
            const res = val.apply(targetObj, args);
            if (res && (res.then || typeof res === 'object')) {
              if (res.then) {
                return res.catch((err: any) => {
                  console.warn(`[DB RESILIENT] Query operation promised rejection in table "${tableName}":`, err);
                  isDbBlocked = true;
                  return Promise.resolve([]);
                });
              }
              return wrapQueryChain(res, tableName);
            }
            return res;
          } catch (err) {
            console.warn(`[DB RESILIENT] Query method "${String(targetProp)}" execution failed on table "${tableName}":`, err);
            isDbBlocked = true;
            const mockTable = getMockTable(tableName);
            const fallbackObj = (mockTable as any).where ? (mockTable as any).where() : createMockCollection([]);
            return typeof fallbackObj[targetProp] === 'function'
              ? fallbackObj[targetProp](...args)
              : undefined;
          }
        };
      }
      return val;
    }
  });
}

function wrapTable(realTable: any, tableName: string): any {
  if (!realTable) return getMockTable(tableName);
  return new Proxy(realTable, {
    get(tObj, tProp) {
      if (isDbBlocked) {
        return (getMockTable(tableName) as any)[tProp];
      }
      const realVal = tObj[tProp];
      if (typeof realVal === 'function') {
        const boundFn = realVal.bind(tObj);
        return (...args: any[]) => {
          try {
            const res = boundFn(...args);
            if (res && (res.then || typeof res === 'object')) {
              if (res.then) {
                return res.catch((err: any) => {
                  console.warn(`[DB RESILIENT] Promised operation failure on table "${tableName}":`, err);
                  isDbBlocked = true;
                  const mockTable = getMockTable(tableName);
                  const fallbackFn = (mockTable as any)[tProp];
                  return typeof fallbackFn === 'function' ? fallbackFn(...args) : Promise.resolve(null);
                });
              }
              return wrapQueryChain(res, tableName);
            }
            return res;
          } catch (err) {
            console.warn(`[DB RESILIENT] Table operation "${String(tProp)}" failed on table "${tableName}":`, err);
            isDbBlocked = true;
            const mockTable = getMockTable(tableName);
            const fallbackFn = (mockTable as any)[tProp];
            return typeof fallbackFn === 'function' ? fallbackFn(...args) : undefined;
          }
        };
      }
      return realVal;
    }
  });
}

export const dbProxy = new Proxy({} as any, {
  get(_dummy, prop) {
    const target = dbInstance;
    if (prop === 'db') return dbProxy;
    if (prop === 'init' && typeof target.init === 'function') return target.init.bind(target);

    // Overridden methods must resolve first even if the DB is blocked or closed
    if (prop === 'open') {
      return async () => {
        if (isDbBlocked) {
          console.warn("⚠️ Database is blocked. Resolving fake open() to prevent rejections.");
          return dbProxy;
        }
        try {
          return await dbInstance.open();
        } catch (e) {
          console.error("Failed to open db via proxy open():", e);
          isDbBlocked = true;
          return dbProxy;
        }
      };
    }

    if (prop === 'isOpen') {
      return () => {
        if (isDbBlocked) return true;
        return dbInstance.isOpen();
      };
    }

    if (prop === 'safeTransaction' || prop === 'runTransaction') {
      return async (modeOrOp: any, tablesOrOp: any, op?: any) => {
        if (isDbBlocked) {
          console.warn("Executing in-memory transaction fallback...");
          const operation = typeof modeOrOp === 'function' ? modeOrOp : op;
          return await operation({} as any);
        }
        return (target as any)[prop].bind(target)(modeOrOp, tablesOrOp, op);
      };
    }

    if (prop === 'getSetting') {
      return async (key: string, defaultValue: any = null) => {
        if (isDbBlocked) {
          const settingsTable = getMockTable('settings');
          const item = await settingsTable.get(key);
          return item ? item.value : defaultValue;
        }
        try {
          if (typeof target.getSetting === 'function') {
            return await target.getSetting(key, defaultValue);
          }
        } catch (err) {
          console.warn("[DB RESILIENT] Failed to run target.getSetting, falling back to mock:", err);
        }
        const settingsTable = getMockTable('settings');
        const item = await settingsTable.get(key);
        return item ? item.value : defaultValue;
      };
    }

    if (prop === 'saveSetting') {
      return async (key: string, value: any) => {
        if (isDbBlocked) {
          const settingsTable = getMockTable('settings');
          await settingsTable.put({ key, value });
          return;
        }
        try {
          if (typeof target.saveSetting === 'function') {
            return await target.saveSetting(key, value);
          }
        } catch (err) {
          console.warn("[DB RESILIENT] Failed to run target.saveSetting, falling back to mock:", err);
        }
        const settingsTable = getMockTable('settings');
        await settingsTable.put({ key, value });
      };
    }

    // Direct functions / methods on target should execute cleanly (like generateId)
    if (prop in target) {
      const val = (target as any)[prop];
      if (typeof val === 'function') {
        return val.bind(target);
      }
    }

    // If the database is blocked/failed to open, return robust mock tables with in-memory persistence
    if (isDbBlocked) {
      if (typeof prop === 'string') {
        const mappings: Record<string, string> = {
          'sale': 'invoices',
          'sales': 'invoices',
          'purchase': 'invoices',
          'purchases': 'invoices',
          'transaction': 'invoices',
          'transactions': 'invoices',
          'auditlog': 'auditLogs',
          'audit_log': 'auditLogs',
          'auditlogs': 'auditLogs',
          'medicinebatch': 'medicineBatches',
          'medicinebatches': 'medicineBatches',
          'voucherinvoicelink': 'vouchers',
          'voucher_invoice_links': 'vouchers',
          'draftinvoices': 'draft_in_voices',
          'draft_in_voices': 'draft_invoices'
        };
        const propStr = prop.toLowerCase().replace(/_/g, '');
        const mappedName = mappings[propStr] || prop;
        return getMockTable(mappedName);
      }
    }

    // 1. Direct table reference if it exists on target
    if (prop in target) {
      const pVal = (target as any)[prop];
      if (pVal && typeof pVal === 'object' && typeof pVal.where === 'function') {
        return wrapTable(pVal, String(prop));
      }
      return pVal;
    }

    // 2. Normalization for common variations
    const propStr = String(prop).toLowerCase().replace(/_/g, '');
    
    // Check tables collection directly
    const foundTable = target.tables.find(t => {
      const tableName = t.name.toLowerCase().replace(/_/g, '');
      return tableName === propStr || tableName === propStr + 's' || tableName + 's' === propStr;
    });

    if (foundTable) {
      return wrapTable(foundTable, foundTable.name);
    }

    // 3. Plural vs Singular Mappings
    const mappings: Record<string, string> = {
      'sale': 'invoices',
      'sales': 'invoices',
      'purchase': 'invoices',
      'purchases': 'invoices',
      'transaction': 'invoices',
      'transactions': 'invoices',
      'auditlog': 'auditLogs',
      'audit_log': 'auditLogs',
      'auditlogs': 'auditLogs',
      'medicinebatch': 'medicineBatches',
      'medicinebatches': 'medicineBatches',
      'voucherinvoicelink': 'vouchers',
      'voucher_invoice_links': 'vouchers'
    };

    const mappedName = mappings[propStr];
    if (mappedName && (target as any)[mappedName]) {
      return wrapTable((target as any)[mappedName], mappedName);
    }

    // 4. Safe mock for missing properties to prevent UI crashes
    console.warn(`⚠️ Property or Table "${String(prop)}" missing in DB Proxy. Using safe fallback.`);
    const mockTable: any = {
      toArray: () => Promise.resolve([]),
      get: () => Promise.resolve(null),
      put: (item: any) => Promise.resolve(item?.id || null),
      add: (item: any) => Promise.resolve(item?.id || null),
      update: () => Promise.resolve(1),
      delete: () => Promise.resolve(null),
      bulkAdd: () => Promise.resolve([]),
      bulkPut: () => Promise.resolve([]),
      bulkDelete: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      count: () => Promise.resolve(0),
      where: () => ({
        equals: () => createMockCollection([]),
        above: () => createMockCollection([]),
        below: () => createMockCollection([]),
        anyOf: () => createMockCollection([]),
        between: () => createMockCollection([])
      }),
      orderBy: () => createMockCollection([]),
      filter: () => createMockCollection([])
    };

    return mockTable;
  }
});

export const db = dbProxy;

// Initialization with recovery logic
(async () => {
    try {
        await dbInstance.open();
        console.log("✅ PharmaFlow PRO DB Engine started successfully.");
    } catch (e: any) {
        console.error("❌ Dexie Database Engine failed to open, switching to robust in-memory database:", e);
        isDbBlocked = true;
        if (e.name === 'VersionError' || e.name === 'SchemaError') {
            console.error("Database version mismatch. Recovering...");
            try {
                await dbInstance.emergencyReset();
            } catch (resetErr) {
                console.error("Emergency reset failed", resetErr);
            }
        }
    }
})();
