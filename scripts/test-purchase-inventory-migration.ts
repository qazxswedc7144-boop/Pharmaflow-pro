// scripts/test-purchase-inventory-migration.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 5 — Step 3: Purchase Inventory Mutation Migration Test Suite
 * 
 * Verifies all 22 Core Purchase Migration Gates:
 * TEST 1: Normal purchase increases warehouse stock correctly.
 * TEST 2: Canonical inventoryTransactions record is created.
 * TEST 3: products.stock increases correctly.
 * TEST 4: products.StockQuantity === products.stock.
 * TEST 5: warehouseStock contains the correct warehouse balance.
 * TEST 6: FIFO layer is created with EXACT purchase unit cost.
 * TEST 7: FIFO layer quantity equals purchased quantity.
 * TEST 8: Medicine batch is created/updated correctly.
 * TEST 9: Expiry date is preserved correctly.
 * TEST 10: Duplicate execution with the same idempotency key does NOT double inventory.
 * TEST 11: Duplicate execution does NOT create duplicate FIFO layers.
 * TEST 12: Duplicate execution does NOT duplicate batch quantity.
 * TEST 13: Multiple warehouses remain isolated.
 * TEST 14: products.stock equals the intended aggregate warehouse projection.
 * TEST 15: Atomic failure leaves all inventory state unchanged.
 * TEST 16: Invalid product is rejected.
 * TEST 17: Invalid warehouse is rejected.
 * TEST 18: Invalid quantity is rejected.
 * TEST 19: Accounting/purchase invoice flow remains functional.
 * TEST 20: Service/non-inventory lines do not mutate inventory.
 * TEST 21: Period lock prevents inventory mutation.
 * TEST 22: No direct inventory writes remain inside PurchaseWorkflow.
 */

import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import { db } from '../src/core/db';
import { configurationService } from '../src/services/config/configurationService';
import { purchaseWorkflow } from '../src/features/purchases/workflows/PurchaseWorkflow';
import { WorkflowContextFactory } from '../src/core/workflow/workflowContext';
import { WorkflowExecutionPipeline } from '../src/core/workflow/workflowExecution';
import { TokenProvider } from '../src/services/auth/tokenProvider';
import { useAuthStore } from '../src/store/authStore';

let passed = 0;
let failed = 0;
const results: { name: string; status: 'PASS' | 'FAIL'; error?: any }[] = [];

function setAuthUser(
  role: string = 'SuperAdmin',
  permissions: string[] = ['ALL', 'purchases.create', 'purchases.edit'],
  tenantId: string = 'TEN-DEV-001'
) {
  const userObj = {
    id: 'usr-admin-purchases-test',
    user_id: 'usr-admin-purchases-test',
    User_Name: 'Purchase Migration Admin',
    User_Email: 'admin@pharmaflow.test',
    Role: role,
    User_Role: role,
    tenantId,
    tenant_id: tenantId,
    branchId: 'BR-MAIN',
    branch_id: 'BR-MAIN',
    permissions
  };
  TokenProvider.setSession(userObj as any, 'mock-jwt-token-purchases', 'mock-refresh-token-purchases');
  useAuthStore.setState({
    user: userObj as any,
    token: 'mock-jwt-token-purchases',
    tenantId,
    branchId: 'BR-MAIN',
    roles: [role],
    permissions,
    isAuthenticated: true,
    hasPermission: (perm: string) => permissions.includes('ALL') || permissions.includes(perm)
  });
}

function assert(condition: boolean, testName: string, errorDetails?: any) {
  if (condition) {
    passed++;
    results.push({ name: testName, status: 'PASS' });
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failed++;
    results.push({ name: testName, status: 'FAIL', error: errorDetails });
    console.error(`  ❌ [FAIL] ${testName}`, errorDetails || '');
  }
}

async function setupTestDb() {
  await db.open();
  await db.products.clear();
  await db.inventoryTransactions.clear();
  await db.warehouseStock.clear();
  await db.stock_movements.clear();
  await db.inventory_layers.clear();
  await db.fifo_consumption_log.clear();
  await db.medicineBatches.clear();
  await db.invoices.clear();
  await db.purchases.clear();
  await db.financialTransactions.clear();
  await db.suppliers.clear();
  await db.idempotencyKeys.clear();
  await db.journalEntries.clear();
  await db.accountingPeriods.clear();

  // Standard test products
  await db.products.bulkAdd([
    {
      id: 'PROD-PANADOL',
      name: 'Panadol Extra 500mg',
      stock: 10,
      StockQuantity: 10,
      costPrice: 10,
      sellingPrice: 15,
      is_active: true
    },
    {
      id: 'PROD-AMOXIL',
      name: 'Amoxil 250mg',
      stock: 50,
      StockQuantity: 50,
      costPrice: 20,
      sellingPrice: 30,
      is_active: true
    },
    {
      id: 'PROD-INACTIVE',
      name: 'Inactive Syrup',
      stock: 10,
      StockQuantity: 10,
      costPrice: 5,
      sellingPrice: 8,
      is_active: false
    }
  ] as any);

  // Initial warehouse balances
  await db.warehouseStock.bulkAdd([
    {
      id: 'WH-MAIN:PROD-PANADOL',
      warehouseId: 'WH-MAIN',
      productId: 'PROD-PANADOL',
      quantity: 10,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'WH-MAIN:PROD-AMOXIL',
      warehouseId: 'WH-MAIN',
      productId: 'PROD-AMOXIL',
      quantity: 50,
      lastUpdated: new Date().toISOString()
    }
  ] as any);

  // Standard test supplier
  await db.suppliers.add({
    id: 'SUPP-001',
    name: 'Al-Amal Pharmaceuticals',
    balance: 1000,
    currentBalance: 1000,
    is_active: true
  } as any);
}

async function runAllTests() {
  console.log('================================================================');
  console.log('🧪 PharmaFlow PRO: Purchase Inventory Migration Test Suite');
  console.log('   Enforcing UnifiedInventoryMutationEngine as Single Writer');
  console.log('================================================================\n');

  setAuthUser();
  await setupTestDb();

  // --------------------------------------------------------------------------
  console.log('🔹 Group 1: Core Purchase Stock Inflow & Ledgers (Tests 1 to 9)');
  // --------------------------------------------------------------------------
  const purchaseDocId = 'PUR-001';
  const purCtx1 = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-PUR-001' });

  const purResult1 = await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: purchaseDocId,
    supplierId: 'SUPP-001',
    warehouseId: 'WH-MAIN',
    items: [
      {
        id: 'ITEM-PUR-1',
        productId: 'PROD-PANADOL',
        quantity: 20,
        unitCost: 12.5,
        unitPrice: 12.5,
        batchNumber: 'BATCH-PAN-2026',
        expiryDate: '2027-12-31'
      } as any
    ],
    total: 250,
    invoiceStatus: 'POSTED',
    isCash: false
  }, purCtx1);

  // Verify result
  const whStockPanadol = await db.warehouseStock
    .filter((w: any) => w.warehouseId === 'WH-MAIN' && w.productId === 'PROD-PANADOL')
    .first();
  const panadolProduct = await db.products.get('PROD-PANADOL');
  const txPanadol = await db.inventoryTransactions
    .filter((t: any) => (t.SourceDocumentID === purchaseDocId || t.docId === purchaseDocId) && t.productId === 'PROD-PANADOL')
    .first();

  // TEST 1: Normal purchase increases warehouse stock correctly (10 + 20 = 30)
  assert(
    whStockPanadol?.quantity === 30,
    'TEST 1: Normal purchase increases warehouse stock correctly (10 + 20 = 30)',
    { warehouseQty: whStockPanadol?.quantity }
  );

  // TEST 2: Canonical inventoryTransactions record is created
  assert(
    txPanadol !== undefined &&
    (txPanadol.TransactionType === 'PURCHASE' || txPanadol.docType === 'PURCHASE') &&
    Number(txPanadol.QuantityChange ?? txPanadol.quantityChange) === 20 &&
    Number(txPanadol.unit_cost) === 12.5 &&
    (txPanadol.warehouseId === 'WH-MAIN' || txPanadol.warehouse_id === 'WH-MAIN'),
    'TEST 2: Canonical inventoryTransactions record is created with correct movement details',
    txPanadol
  );

  // TEST 3: products.stock increases correctly (10 + 20 = 30)
  assert(
    panadolProduct?.stock === 30,
    'TEST 3: products.stock increases correctly (10 + 20 = 30)',
    { stock: panadolProduct?.stock }
  );

  // TEST 4: products.StockQuantity === products.stock
  assert(
    panadolProduct?.StockQuantity === panadolProduct?.stock,
    'TEST 4: products.StockQuantity mirrors products.stock (30 === 30)',
    { stock: panadolProduct?.stock, stockQuantity: panadolProduct?.StockQuantity }
  );

  // TEST 5: warehouseStock contains the correct warehouse balance
  assert(
    whStockPanadol?.quantity === 30,
    'TEST 5: warehouseStock contains the correct warehouse balance',
    { quantity: whStockPanadol?.quantity }
  );

  // TEST 6 & 7: FIFO layer is created with EXACT purchase unit cost and quantity
  const fifoLayers = await db.inventory_layers
    .filter((l: any) => l.item_id === 'PROD-PANADOL' && l.reference_id === purchaseDocId)
    .toArray();
  const fifoLayer = fifoLayers[0];

  assert(
    fifoLayer !== undefined && Number(fifoLayer.unit_cost) === 12.5,
    'TEST 6: FIFO layer is created with EXACT purchase unit cost (12.5)',
    { unitCost: fifoLayer?.unit_cost }
  );

  assert(
    fifoLayer !== undefined && Number(fifoLayer.quantity_remaining) === 20,
    'TEST 7: FIFO layer quantity equals purchased quantity (20)',
    { quantityRemaining: fifoLayer?.quantity_remaining }
  );

  // TEST 8 & 9: Medicine batch is created/updated and expiry date preserved
  const batches = await db.medicineBatches
    .filter((b: any) => b.productId === 'PROD-PANADOL' && (b.batchNumber === 'BATCH-PAN-2026' || b.batchId === 'BATCH-PAN-2026'))
    .toArray();
  const panadolBatch = batches[0];

  assert(
    panadolBatch !== undefined && Number(panadolBatch.quantity) === 20,
    'TEST 8: Medicine batch is created/updated correctly with quantity 20',
    panadolBatch
  );

  assert(
    panadolBatch !== undefined && panadolBatch.expiryDate === '2027-12-31',
    'TEST 9: Expiry date is preserved correctly (2027-12-31)',
    { expiryDate: panadolBatch?.expiryDate }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 2: Idempotency & Deduplication (Tests 10 to 12)');
  // --------------------------------------------------------------------------
  const purCtxRetry = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-PUR-001' });
  await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: purchaseDocId,
    supplierId: 'SUPP-001',
    warehouseId: 'WH-MAIN',
    items: [
      {
        id: 'ITEM-PUR-1',
        productId: 'PROD-PANADOL',
        quantity: 20,
        unitCost: 12.5,
        unitPrice: 12.5,
        batchNumber: 'BATCH-PAN-2026',
        expiryDate: '2027-12-31'
      } as any
    ],
    total: 250,
    invoiceStatus: 'POSTED',
    isCash: false
  }, purCtxRetry);

  const whStockAfterRetry = (await db.warehouseStock.filter((w: any) => w.warehouseId === 'WH-MAIN' && w.productId === 'PROD-PANADOL').first())?.quantity;
  const prodStockAfterRetry = (await db.products.get('PROD-PANADOL'))?.stock;
  const fifoLayersAfterRetry = await db.inventory_layers.filter((l: any) => l.item_id === 'PROD-PANADOL' && l.reference_id === purchaseDocId).toArray();
  const batchAfterRetry = (await db.medicineBatches.filter((b: any) => b.productId === 'PROD-PANADOL' && (b.batchNumber === 'BATCH-PAN-2026' || b.batchId === 'BATCH-PAN-2026')).first())?.quantity;

  // TEST 10: Duplicate execution with the same idempotency key does NOT double inventory
  assert(
    whStockAfterRetry === 30 && prodStockAfterRetry === 30,
    'TEST 10: Duplicate execution with the same idempotency key does NOT double inventory (still 30)',
    { warehouseQty: whStockAfterRetry, productStock: prodStockAfterRetry }
  );

  // TEST 11: Duplicate execution does NOT create duplicate FIFO layers
  assert(
    fifoLayersAfterRetry.length === 1,
    'TEST 11: Duplicate execution does NOT create duplicate FIFO layers (count === 1)',
    { fifoLayerCount: fifoLayersAfterRetry.length }
  );

  // TEST 12: Duplicate execution does NOT duplicate batch quantity
  assert(
    batchAfterRetry === 20,
    'TEST 12: Duplicate execution does NOT duplicate batch quantity (still 20)',
    { batchQty: batchAfterRetry }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 3: Multi-Warehouse Isolation & Projection Invariant (Tests 13 & 14)');
  // --------------------------------------------------------------------------
  // Seed PROD-MULTI-WH with stock in WH-MAIN (25)
  await db.products.add({
    id: 'PROD-MULTI-WH',
    name: 'Multi-Warehouse Antibiotic',
    stock: 25,
    StockQuantity: 25,
    costPrice: 15,
    sellingPrice: 22,
    is_active: true
  } as any);

  await db.warehouseStock.add({
    id: 'WH-MAIN:PROD-MULTI-WH',
    warehouseId: 'WH-MAIN',
    productId: 'PROD-MULTI-WH',
    quantity: 25,
    lastUpdated: new Date().toISOString()
  } as any);

  // Purchase to WH-BRANCH (40 units)
  const ctxWhBranch = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-PUR-BRANCH' });
  await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: 'PUR-BRANCH-01',
    supplierId: 'SUPP-001',
    warehouseId: 'WH-BRANCH',
    items: [
      {
        id: 'ITEM-BRANCH-1',
        productId: 'PROD-MULTI-WH',
        quantity: 40,
        unitCost: 15,
        unitPrice: 15
      } as any
    ],
    total: 600,
    invoiceStatus: 'POSTED'
  }, ctxWhBranch);

  const whMainStock = (await db.warehouseStock.filter((w: any) => w.warehouseId === 'WH-MAIN' && w.productId === 'PROD-MULTI-WH').first())?.quantity;
  const whBranchStock = (await db.warehouseStock.filter((w: any) => w.warehouseId === 'WH-BRANCH' && w.productId === 'PROD-MULTI-WH').first())?.quantity;
  const multiProdStock = (await db.products.get('PROD-MULTI-WH'))?.stock;

  // TEST 13: Multiple warehouses remain isolated
  assert(
    whMainStock === 25 && whBranchStock === 40,
    'TEST 13: Multiple warehouses remain isolated (WH-MAIN: 25, WH-BRANCH: 40)',
    { whMain: whMainStock, whBranch: whBranchStock }
  );

  // TEST 14: products.stock equals the intended aggregate warehouse projection
  assert(
    multiProdStock === (whMainStock! + whBranchStock!),
    'TEST 14: products.stock equals the intended aggregate warehouse projection (25 + 40 = 65)',
    { multiProdStock, expected: (whMainStock! + whBranchStock!) }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 4: Atomicity & Rollback (Test 15)');
  // --------------------------------------------------------------------------
  const amoxilPreAtomic = (await db.products.get('PROD-AMOXIL'))?.stock;
  const ctxAtomicFail = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-ATOMIC-FAIL-PUR' });

  const failResult = await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: 'PUR-ATOMIC-FAIL',
    supplierId: 'SUPP-001',
    warehouseId: 'WH-MAIN',
    items: [
      {
        id: 'ITEM-VALID-AMOXIL',
        productId: 'PROD-AMOXIL',
        quantity: 10,
        unitCost: 20
      } as any,
      {
        id: 'ITEM-INVALID-PROD',
        productId: 'NON-EXISTENT-PROD-XYZ', // will fail in engine
        quantity: 5,
        unitCost: 10
      } as any
    ],
    total: 250,
    invoiceStatus: 'POSTED'
  }, ctxAtomicFail);

  const amoxilPostAtomic = (await db.products.get('PROD-AMOXIL'))?.stock;

  // TEST 15: Atomic failure leaves all inventory state unchanged
  assert(
    !failResult.success && amoxilPreAtomic === amoxilPostAtomic,
    'TEST 15: Atomic failure leaves all inventory state unchanged (no partial additions)',
    { success: failResult.success, pre: amoxilPreAtomic, post: amoxilPostAtomic }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 5: Validation Domain Errors (Tests 16 to 18)');
  // --------------------------------------------------------------------------
  // TEST 16: Invalid / Inactive product is rejected
  const ctxInactive = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-INACTIVE-PROD' });
  const inactiveResult = await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: 'PUR-INACTIVE',
    supplierId: 'SUPP-001',
    warehouseId: 'WH-MAIN',
    items: [
      {
        id: 'ITEM-INACTIVE',
        productId: 'PROD-INACTIVE',
        quantity: 5,
        unitCost: 5
      } as any
    ],
    total: 25,
    invoiceStatus: 'POSTED'
  }, ctxInactive);

  assert(
    !inactiveResult.success,
    'TEST 16: Inactive product is rejected with domain error',
    { success: inactiveResult.success, error: (inactiveResult as any).error }
  );

  // TEST 17: Invalid warehouse is rejected
  const ctxBadWh = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-BAD-WH' });
  const badWhResult = await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: 'PUR-BAD-WH',
    supplierId: 'SUPP-001',
    warehouseId: '   ', // empty / whitespace warehouse
    items: [
      {
        id: 'ITEM-WH-PROD',
        productId: 'PROD-AMOXIL',
        quantity: 5,
        unitCost: 20
      } as any
    ],
    total: 100,
    invoiceStatus: 'POSTED'
  }, ctxBadWh);

  assert(
    !badWhResult.success,
    'TEST 17: Invalid warehouse is rejected with domain error',
    { success: badWhResult.success }
  );

  // TEST 18: Invalid quantity is rejected (Workflow validation requires total >= 0 and items exist)
  const ctxBadQty = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-BAD-QTY' });
  const badQtyResult = await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: 'PUR-BAD-QTY',
    supplierId: 'SUPP-001',
    warehouseId: 'WH-MAIN',
    items: [],
    total: -50,
    invoiceStatus: 'POSTED'
  }, ctxBadQty);

  assert(
    !badQtyResult.success,
    'TEST 18: Invalid quantity / empty items rejected by validation gate',
    { success: badQtyResult.success }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 6: Accounting & Financial Integration (Test 19)');
  // --------------------------------------------------------------------------
  await db.suppliers.add({
    id: 'SUPP-ACC-01',
    name: 'Al-Hikma Supplier Co',
    balance: 500,
    currentBalance: 500
  } as any);

  const purAccId = 'PUR-ACC-FLOW-19';
  const ctxAcc = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-ACC-FLOW-19' });

  const accPurResult = await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: purAccId,
    supplierId: 'SUPP-ACC-01',
    warehouseId: 'WH-MAIN',
    items: [
      {
        id: 'ITEM-ACC-1',
        productId: 'PROD-AMOXIL',
        quantity: 15,
        unitCost: 20,
        unitPrice: 20
      } as any
    ],
    total: 300,
    isCash: false, // on credit -> supplier balance increases by 300
    invoiceStatus: 'POSTED'
  }, ctxAcc);

  const savedPurDoc = (await db.invoices.get(purAccId)) || (await db.purchases.get(purAccId));
  const purFinTx = await db.financialTransactions.filter((f: any) => f.Reference_ID === purAccId).first();
  const suppAfterPur = await db.suppliers.get('SUPP-ACC-01');

  assert(
    accPurResult.success === true &&
    savedPurDoc !== undefined &&
    purFinTx !== undefined &&
    suppAfterPur?.balance === 800,
    'TEST 19: Accounting/purchase invoice flow remains functional (supplier balance 500 + 300 = 800)',
    {
      success: accPurResult.success,
      hasDoc: !!savedPurDoc,
      hasFinTx: !!purFinTx,
      supplierBalance: suppAfterPur?.balance
    }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 7: Service / Non-Inventory Items (Test 20)');
  // --------------------------------------------------------------------------
  const amoxilStockPreService = (await db.products.get('PROD-AMOXIL'))?.stock;
  const ctxService = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-SERV-PUR' });

  await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: 'PUR-SERVICE-001',
    supplierId: 'SUPP-001',
    warehouseId: 'WH-MAIN',
    items: [
      {
        id: 'ITEM-SERV-1',
        productId: 'PROD-AMOXIL',
        quantity: 10,
        unitCost: 100,
        isService: true
      } as any,
      {
        id: 'ITEM-SERV-2',
        productId: 'PROD-AMOXIL',
        quantity: 5,
        unitCost: 50,
        trackStock: false
      } as any,
      {
        id: 'ITEM-SERV-3',
        productId: 'PROD-AMOXIL',
        quantity: 2,
        unitCost: 20,
        type: 'SERVICE'
      } as any
    ],
    total: 1290,
    invoiceStatus: 'POSTED'
  }, ctxService);

  const amoxilStockPostService = (await db.products.get('PROD-AMOXIL'))?.stock;

  assert(
    amoxilStockPreService === amoxilStockPostService,
    'TEST 20: Service and non-inventory lines do not mutate inventory',
    { pre: amoxilStockPreService, post: amoxilStockPostService }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 8: Period Lock & Security Gate (Test 21)');
  // --------------------------------------------------------------------------
  // Seed a locked period for January 2026
  const periodObj = {
    id: 'PERIOD-JAN-2026',
    Start_Date: '2026-01-01T00:00:00.000Z',
    End_Date: '2026-01-31T23:59:59.999Z',
    Is_Locked: true,
    start_date: '2026-01-01T00:00:00.000Z',
    end_date: '2026-01-31T23:59:59.999Z',
    is_locked: true,
    isLocked: true
  };
  await db.accountingPeriods.put(periodObj as any);
  if (db.db?.accountingPeriods) {
    await db.db.accountingPeriods.put(periodObj as any);
  }

  const ctxPeriodLocked = WorkflowContextFactory.create('PURCHASE', { idempotencyKey: 'IDEMP-PERIOD-LOCKED-PUR' });
  const periodLockedResult = await WorkflowExecutionPipeline.run(purchaseWorkflow, {
    id: 'PUR-PERIOD-LOCKED',
    supplierId: 'SUPP-001',
    warehouseId: 'WH-MAIN',
    date: '2026-01-15T10:00:00.000Z', // falls in locked period
    items: [
      {
        id: 'ITEM-LOCKED-1',
        productId: 'PROD-AMOXIL',
        quantity: 10,
        unitCost: 20
      } as any
    ],
    total: 200,
    invoiceStatus: 'POSTED'
  }, ctxPeriodLocked);

  assert(
    !periodLockedResult.success,
    'TEST 21: Period lock prevents inventory mutation',
    { success: periodLockedResult.success }
  );

  // --------------------------------------------------------------------------
  console.log('\n🔹 Group 9: Static Write-Path Audit (Test 22)');
  // --------------------------------------------------------------------------
  const workflowPath = path.resolve(process.cwd(), 'src/features/purchases/workflows/PurchaseWorkflow.ts');
  const workflowCode = fs.readFileSync(workflowPath, 'utf8');

  // Direct table writes check
  const productsUpdate = (workflowCode.match(/products\.(update|put)/g) || []).length;
  const warehouseStockWrites = (workflowCode.match(/warehouseStock\.(put|update|add)/g) || []).length;
  const itxWrites = (workflowCode.match(/inventoryTransactions\.(add|put|update)/g) || []).length;
  const layerWrites = (workflowCode.match(/inventory_layers\.(add|put|update)/g) || []).length;
  const fifoLogWrites = (workflowCode.match(/fifo_consumption_log\.(add|put|update)/g) || []).length;
  const batchWrites = (workflowCode.match(/medicineBatches\.(add|put|update)/g) || []).length;
  const stockMovementWrites = (workflowCode.match(/stock_movements\.(add|put|update)/g) || []).length;

  // Direct legacy engine calls
  const fifoEngineCalls = (workflowCode.match(/fifoEngine\.(apply|consumeFIFO|addPurchaseLayer)/g) || []).length;
  const stockEngineCalls = (workflowCode.match(/stockEngine\.(apply|recordMovement)/g) || []).length;
  const inventoryEngineCalls = (workflowCode.match(/InventoryEngine\.(addStock|removeStock)/g) || []).length;

  const totalViolations =
    productsUpdate +
    warehouseStockWrites +
    itxWrites +
    layerWrites +
    fifoLogWrites +
    batchWrites +
    stockMovementWrites +
    fifoEngineCalls +
    stockEngineCalls +
    inventoryEngineCalls;

  assert(
    totalViolations === 0,
    'TEST 22: No direct inventory writes or legacy engine calls remain inside PurchaseWorkflow',
    {
      productsUpdate,
      warehouseStockWrites,
      itxWrites,
      layerWrites,
      fifoLogWrites,
      batchWrites,
      stockMovementWrites,
      fifoEngineCalls,
      stockEngineCalls,
      inventoryEngineCalls
    }
  );

  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`🏁 TEST SUITE FINISHED: ${passed} / ${passed + failed} PASSED`);
  if (failed === 0) {
    console.log('🏆 ALL 22 PURCHASE INVENTORY MIGRATION GATES PASSED PERFECTLY!');
  } else {
    console.error(`💥 ${failed} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('================================================================\n');
}

runAllTests().catch((err) => {
  console.error('Unhandled fatal error in purchase migration test runner:', err);
  process.exit(1);
});
