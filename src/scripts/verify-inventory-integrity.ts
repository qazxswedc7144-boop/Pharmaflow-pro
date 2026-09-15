// src/scripts/verify-inventory-integrity.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Integration Verification Suite for Unified Inventory Mutation Engine
 */

import 'fake-indexeddb/auto';
import { db } from '../core/db';
import { unifiedInventoryMutationEngine } from '../features/inventory/services/UnifiedInventoryMutationEngine';
import { AutoJournalMapper } from '../features/accounting/services/AutoJournalMapper';
import { UnifiedBusinessWorkflowOrchestrator } from '../services/orchestration/UnifiedBusinessWorkflowOrchestrator';
import { configurationService } from '../services/config/configurationService';
import { TokenProvider } from '../services/auth/tokenProvider';
import { useAuthStore } from '../store/authStore';

const TEST_TENANT = 'TEN-TEST-001';
const TEST_BRANCH = 'BR-MAIN';
const TEST_USER = 'usr-verifier';

function setAuth() {
  const userObj = {
    id: TEST_USER,
    user_id: TEST_USER,
    User_Name: 'Integrity Verifier',
    User_Email: 'verifier@pharmaflow.test',
    Role: 'Admin',
    User_Role: 'Admin',
    tenantId: TEST_TENANT,
    branchId: TEST_BRANCH,
    permissions: ['ALL']
  };
  TokenProvider.setSession(userObj as any, 'mock-token', 'mock-refresh');
  useAuthStore.setState({
    user: userObj as any,
    token: 'mock-token',
    tenantId: TEST_TENANT,
    branchId: TEST_BRANCH,
    isAuthenticated: true
  });
}

async function setup() {
  await db.open();
  await Promise.all([
    db.products.clear(),
    db.inventoryTransactions.clear(),
    db.warehouseStock.clear(),
    db.stock_movements.clear(),
    db.inventory_layers.clear(),
    db.fifo_consumption_log.clear(),
    db.medicineBatches.clear(),
    db.invoices.clear(),
    db.journalEntries.clear(),
    db.journalLines.clear(),
    db.accounts.clear(),
    db.financialTransactions.clear(),
    db.idempotencyKeys.clear(),
    db.inventoryCorrectionCases.clear()
  ]);

  // Setup Accounts
  await db.accounts.bulkAdd([
    { id: 'ACC-INV', name: 'Inventory', code: '1200', type: 'Asset', balance: 0, tenantId: TEST_TENANT },
    { id: 'ACC-COGS', name: 'COGS', code: '5000', type: 'Expense', balance: 0, tenantId: TEST_TENANT },
    { id: 'ACC-REV', name: 'Sales Revenue', code: '4000', type: 'Revenue', balance: 0, tenantId: TEST_TENANT },
    { id: 'ACC-CASH', name: 'Cash', code: '1000', type: 'Asset', balance: 0, tenantId: TEST_TENANT }
  ] as any);

  // Setup Product
  await db.products.add({
    id: 'PROD-TEST',
    name: 'Test Medicine',
    stock: 0,
    StockQuantity: 0,
    costPrice: 10,
    price: 20,
    isActive: true,
    tenantId: TEST_TENANT
  } as any);

  // Setup Warehouse
  await db.warehouseStock.add({
    id: `WS-${TEST_TENANT}-WH-MAIN-PROD-TEST`,
    warehouseId: 'WH-MAIN',
    productId: 'PROD-TEST',
    quantity: 0,
    tenantId: TEST_TENANT
  } as any);

  await configurationService.set('inventory.allowNegativeStock', false);
  await configurationService.set('accounting.autoPosting', true);
}

async function runTests() {
  setAuth();
  await setup();

  console.log('\n--- Scenario 1: Purchase Invoice (Receipt -> FIFO -> Accounting) ---');
  const purchaseId = 'PUR-001';
  await AutoJournalMapper.processUnifiedFinancialTransaction({
    type: 'PURCHASE',
    payload: {
      id: purchaseId,
      items: [{ productId: 'PROD-TEST', qty: 100, price: 10, batchId: 'BATCH-001' }] as any,
      total: 1000,
      date: new Date().toISOString()
    },
    options: { isCash: true, invoiceStatus: 'POSTED' }
  });

  const stockAfterPur = (await db.products.get('PROD-TEST'))?.stock;
  const layersAfterPur = await db.inventory_layers.where('item_id').equals('PROD-TEST').toArray();
  const journalAfterPur = await db.journalEntries.where('reference_id').equals(purchaseId).first();
  
  console.log(`Inventory: ${stockAfterPur} (Expected: 100)`);
  console.log(`FIFO Layers: ${layersAfterPur.length} (Expected: 1)`);
  console.log(`Journal: ${journalAfterPur ? 'CREATED' : 'MISSING'}`);

  console.log('\n--- Scenario 2: Sales Invoice (Consumption -> Deduction -> Accounting) ---');
  const saleId = 'SAL-001';
  await AutoJournalMapper.processUnifiedFinancialTransaction({
    type: 'SALE',
    payload: {
      id: saleId,
      items: [{ productId: 'PROD-TEST', qty: 40, price: 20 }] as any,
      total: 800,
      date: new Date().toISOString()
    },
    options: { isCash: true, invoiceStatus: 'POSTED' }
  });

  const stockAfterSale = (await db.products.get('PROD-TEST'))?.stock;
  const consumed = await db.fifo_consumption_log.where('out_doc_id').equals(saleId).toArray();
  const journalAfterSale = await db.journalEntries.where('reference_id').equals(saleId).first();

  console.log(`Inventory: ${stockAfterSale} (Expected: 60)`);
  console.log(`Consumed Layers: ${consumed.length} (Expected: 1)`);
  console.log(`Journal: ${journalAfterSale ? 'CREATED' : 'MISSING'}`);

  console.log('\n--- Scenario 7: Unposting (Append-only Reversal) ---');
  await UnifiedBusinessWorkflowOrchestrator.unpostInvoice(saleId, 'SALE');
  
  const stockAfterUnpost = (await db.products.get('PROD-TEST'))?.stock;
  const movementsAfterUnpost = await db.inventoryTransactions.where('source_doc_id').equals(saleId).toArray();
  const reversalFound = movementsAfterUnpost.some(m => m.movement_type === 'REVERSAL' || m.movementType === 'REVERSAL');
  
  console.log(`Inventory: ${stockAfterUnpost} (Expected: 100)`);
  console.log(`Total Movements for SAL-001: ${movementsAfterUnpost.length} (Expected: > 1)`);
  console.log(`Reversal Movement Found: ${reversalFound}`);

  console.log('\n--- Scenario 8: Idempotency Verification ---');
  const opId = 'OP-IDEMP-001';
  const command = {
    productId: 'PROD-TEST',
    fromWarehouseId: 'WH-MAIN',
    toWarehouseId: 'WH-TARGET',
    quantity: 10,
    transactionUuid: opId,
    userId: TEST_USER,
    tenantId: TEST_TENANT
  };

  // Add target warehouse stock record
  await db.warehouseStock.add({
    id: `WS-${TEST_TENANT}-WH-TARGET-PROD-TEST`,
    warehouseId: 'WH-TARGET',
    productId: 'PROD-TEST',
    quantity: 0,
    tenantId: TEST_TENANT
  } as any);

  await unifiedInventoryMutationEngine.executeTransfer(command as any);
  const stockAfterFirst = (await db.products.get('PROD-TEST'))?.stock;
  
  await unifiedInventoryMutationEngine.executeTransfer(command as any);
  const stockAfterSecond = (await db.products.get('PROD-TEST'))?.stock;

  console.log(`Stock after first transfer: ${stockAfterFirst}`);
  console.log(`Stock after second transfer (idempotent): ${stockAfterSecond}`);
  console.log(`Idempotency OK: ${stockAfterFirst === stockAfterSecond}`);

  console.log('\n--- Scenario 9: Atomic Rollback (Mutation Failure) ---');
  const preFailureStock = (await db.products.get('PROD-TEST'))?.stock || 0;
  try {
    await db.safeTransaction('rw', ['products', 'inventoryTransactions'], async () => {
      await unifiedInventoryMutationEngine.executeMutation({
        productId: 'PROD-TEST',
        warehouseId: 'WH-MAIN',
        delta: -10,
        docType: 'FAIL_TEST',
        docId: 'FAIL-001',
        movementType: 'SALE',
        userId: TEST_USER,
        tenantId: TEST_TENANT,
        transactionUuid: 'FAIL-KEY-1'
      });
      
      throw new Error('INTENTIONAL_FAILURE_FOR_ROLLBACK');
    });
  } catch (e) {
    console.log('Caught expected error for rollback test');
  }

  const postFailureStock = (await db.products.get('PROD-TEST'))?.stock;
  console.log(`Stock after rollback: ${postFailureStock} (Expected: ${preFailureStock})`);
  console.log(`Rollback OK: ${preFailureStock === postFailureStock}`);

  console.log('\n--- Final Verification Summary ---');
}

runTests().catch(console.error);
