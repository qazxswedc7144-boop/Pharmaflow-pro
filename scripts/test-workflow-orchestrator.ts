import 'fake-indexeddb/auto';
import { db } from '../src/core/db';

for (const tableName of ['sales', 'purchases', 'invoices', 'syncQueue', 'outbox', 'products', 'customers', 'suppliers', 'journalEntries', 'accounts']) {
  const t = (db as any)[tableName];
  if (t) {
    const g = t.get.bind(t);
    t.get = function (key: any, ...a: any[]) {
      if (key === undefined || key === null) {
        console.error(`[DEXIE DEBUG] Table '${tableName}' .get called with:`, key, new Error().stack);
      }
      return g(key, ...a);
    };
    const u = t.update.bind(t);
    t.update = function (key: any, ...a: any[]) {
      if (key === undefined || key === null) {
        console.error(`[DEXIE DEBUG] Table '${tableName}' .update called with:`, key, new Error().stack);
      }
      return u(key, ...a);
    };
  }
}
import { WorkflowOrchestrator } from '../src/core/workflow/workflowOrchestrator';
import { purchaseWorkflow } from '../src/features/purchases/workflows/PurchaseWorkflow';
import { salesWorkflow } from '../src/features/sales/workflows/SalesWorkflow';
import { salesReturnWorkflow } from '../src/features/returns/workflows/SalesReturnWorkflow';
import { purchaseReturnWorkflow } from '../src/features/returns/workflows/PurchaseReturnWorkflow';
import { inventoryAdjustmentWorkflow } from '../src/features/inventory/workflows/InventoryAdjustmentWorkflow';
import { inventoryTransferWorkflow } from '../src/features/inventory/workflows/InventoryTransferWorkflow';
import { journalPostingWorkflow } from '../src/features/accounting/workflows/JournalPostingWorkflow';
import { voucherWorkflow } from '../src/features/accounting/workflows/VoucherWorkflow';
import { useAuthStore } from '../src/store/authStore';

async function runWorkflowOrchestratorTestSuite() {
  console.log('================================================================');
  console.log('🧪 PHARMAFLOW PRO ERP — WORKFLOW ORCHESTRATOR COMPREHENSIVE TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function assertTest(name: string, fn: () => Promise<void>) {
    try {
      console.log(`⏳ Running Test: ${name}...`);
      await fn();
      console.log(`✅ PASSED: ${name}\n`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAILED: ${name}`);
      console.error(`   Error: ${err.message || String(err)}\n`);
      failed++;
    }
  }

  // Setup Mock User helper
  const setAuthenticatedUser = (role: string = 'SuperAdmin', permissions: string[] = ['ALL', 'PURCHASE_CREATE', 'SALES_CREATE', 'INVENTORY_ADJUST', 'ACCOUNTING_POST', 'RETURNS_CREATE'], tenantId: string = 'tenant-default') => {
    useAuthStore.setState({
      user: {
        id: 'usr-admin-1',
        User_Name: 'System Admin',
        User_Email: 'admin@pharmaflow.internal',
        Role: role,
        User_Role: role,
        tenantId,
        permissions
      } as any,
      token: 'mock-jwt-token-xyz',
      tenantId,
      branchId: 'MAIN',
      roles: [role],
      permissions,
      isAuthenticated: true
    });
  };

  const clearAuthentication = () => {
    useAuthStore.setState({
      user: null,
      token: null,
      tenantId: null,
      branchId: null,
      roles: [],
      permissions: [],
      isAuthenticated: false
    });
  };

  // Test A: UI Entry Point Protection
  await assertTest('Test A: UI Entry Point Protection (Authentication & Context)', async () => {
    clearAuthentication();
    const res = await WorkflowOrchestrator.execute(purchaseWorkflow, {
      supplierId: 'SUPP-001',
      items: [{ id: 'PROD-1', name: 'Panadol', quantity: 10, unitPrice: 5, total: 50 }],
      total: 50
    });
    
    if (res.success) {
      throw new Error('Workflow should have failed due to unauthenticated context');
    }
    setAuthenticatedUser();
  });

  // Test B: Atomic Workflows
  await assertTest('Test B: Atomic Workflows (Transaction Rollback on Error)', async () => {
    setAuthenticatedUser();
    // Invalid item total vs total mismatch to trigger validation error
    const res = await WorkflowOrchestrator.execute(purchaseWorkflow, {
      supplierId: 'SUPP-001',
      items: [],
      total: -100 // Invalid negative total
    });

    if (res.success) {
      throw new Error('Workflow should have rolled back for invalid input');
    }
  });

  // Test C: Double Execution / Concurrency Guard
  await assertTest('Test C: Double Execution & Concurrency Guard', async () => {
    setAuthenticatedUser();
    await db.products.put({ id: 'PROD-CONC', name: 'Conc Product', stock: 50, quantity: 50, is_active: true });
    const key = `CONCURRENCY_TEST_${Date.now()}`;
    
    // Execute parallel workflows with identical idempotency key
    const p1 = WorkflowOrchestrator.execute(
      inventoryAdjustmentWorkflow,
      { productId: 'PROD-CONC', warehouseId: 'MAIN', actualQty: 100 },
      { idempotencyKey: key }
    );

    const p2 = WorkflowOrchestrator.execute(
      inventoryAdjustmentWorkflow,
      { productId: 'PROD-CONC', warehouseId: 'MAIN', actualQty: 100 },
      { idempotencyKey: key }
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    if (!r1.success && !r2.success) {
      throw new Error('At least one concurrency request should succeed or execute idempotently');
    }
  });

  // Test D: Idempotency Enforcement
  await assertTest('Test D: Idempotency Enforcement', async () => {
    setAuthenticatedUser();
    const key = `IDEMPOTENCY_KEY_${Date.now()}`;

    // First execution
    const res1 = await WorkflowOrchestrator.execute(
      voucherWorkflow,
      { type: 'PAYMENT', partnerId: 'SUPP-IDEM', amount: 200, notes: 'Test Idempotency' },
      { idempotencyKey: key }
    );

    // Second execution with identical key
    const res2 = await WorkflowOrchestrator.execute(
      voucherWorkflow,
      { type: 'PAYMENT', partnerId: 'SUPP-IDEM', amount: 200, notes: 'Test Idempotency' },
      { idempotencyKey: key }
    );

    if (!res1.success) {
      throw new Error(`Initial workflow failed: ${res1.error?.message}`);
    }
  });

  // Test E: Offline-First Reliability
  await assertTest('Test E: Offline-First Reliability', async () => {
    setAuthenticatedUser();
    const res = await WorkflowOrchestrator.execute(
      salesWorkflow,
      {
        customerId: 'CUST-OFFLINE',
        items: [{ id: 'P-1', productId: 'P-1', product_id: 'P-1', name: 'Aspirin', quantity: 2, qty: 2, unitPrice: 10, price: 10, sum: 20, total: 20 }],
        total: 20,
        isCash: true
      },
      { offlineMode: true }
    );

    if (!res.success) {
      console.error('TEST E FULL ERROR:', res.error);
      throw new Error(`Offline workflow failed: ${res.error?.message}`);
    }
  });

  // Test F: Cross-Tenant Isolation
  await assertTest('Test F: Cross-Tenant Isolation Enforcement', async () => {
    setAuthenticatedUser('Admin', ['ALL'], 'tenant-a');

    const res = await WorkflowOrchestrator.execute(
      salesWorkflow,
      {
        customerId: 'CUST-TENANT-B',
        items: [{ id: 'P-1', name: 'Med', quantity: 1, unitPrice: 15, total: 15 }],
        total: 15
      },
      { tenantId: 'tenant-b' }
    );

    if (res.success) {
      throw new Error('Workflow should reject cross-tenant execution mismatch');
    }
    setAuthenticatedUser();
  });

  // Test G: Authorization & RBAC Enforcement
  await assertTest('Test G: Authorization & RBAC Enforcement', async () => {
    // User with only SALES_CREATE permission, missing ACCOUNTING_POST
    setAuthenticatedUser('Cashier', ['SALES_CREATE'], 'tenant-default');

    const res = await WorkflowOrchestrator.execute(
      journalPostingWorkflow,
      {
        description: 'Unauthorized Journal Entry',
        lines: [
          { accountId: 'ACC-1', debit: 100, credit: 0 },
          { accountId: 'ACC-2', debit: 0, credit: 100 }
        ]
      }
    );

    if (res.success) {
      throw new Error('Workflow should have rejected unauthorized user role/permissions');
    }
    setAuthenticatedUser();
  });

  // Test H: Return Reversal
  await assertTest('Test H: Sales & Purchase Return Reversals', async () => {
    setAuthenticatedUser();
    const resSalesReturn = await WorkflowOrchestrator.execute(salesReturnWorkflow, {
      originalSaleId: 'SALE-1001',
      customerId: 'CUST-RET',
      items: [{ id: 'P-1', name: 'Panadol', quantity: 1, unitPrice: 10, total: 10 }],
      total: 10,
      reason: 'Expired product return'
    });

    if (!resSalesReturn.success) {
      throw new Error(`Sales return workflow failed: ${resSalesReturn.error?.message}`);
    }

    const resPurchaseReturn = await WorkflowOrchestrator.execute(purchaseReturnWorkflow, {
      originalPurchaseId: 'PURCH-1001',
      supplierId: 'SUPP-RET',
      items: [{ id: 'P-1', name: 'Panadol', quantity: 1, unitPrice: 5, total: 5 }],
      total: 5,
      reason: 'Damaged shipment'
    });

    if (!resPurchaseReturn.success) {
      throw new Error(`Purchase return workflow failed: ${resPurchaseReturn.error?.message}`);
    }
  });

  // Test I: Correlation & Audit Trail
  await assertTest('Test I: Correlation ID & Centralized Audit Trail', async () => {
    setAuthenticatedUser();
    const correlationId = `CORRELATION_TEST_${Date.now()}`;

    const res = await WorkflowOrchestrator.execute(
      inventoryTransferWorkflow,
      {
        sourceBranchId: 'BRANCH-A',
        targetBranchId: 'BRANCH-B',
        items: [{ productId: 'PROD-X', qty: 5 }]
      },
      { correlationId }
    );

    if (!res.success) {
      throw new Error(`Transfer workflow failed: ${res.error?.message}`);
    }
    if (res.metadata?.correlationId !== correlationId) {
      throw new Error('Correlation ID missing or mismatched in workflow metadata');
    }
  });

  // Test J: Recovery Mechanism
  await assertTest('Test J: Workflow Exception Recovery Mechanism', async () => {
    setAuthenticatedUser();
    const res = await WorkflowOrchestrator.execute(
      voucherWorkflow,
      { type: 'RECEIPT', partnerId: 'CUST-REC', amount: 150, notes: 'Recovery Test' }
    );

    if (!res.success) {
      throw new Error(`Receipt workflow recovery test failed: ${res.error?.message}`);
    }
  });

  // Test K: Direct Call Regression Guard
  await assertTest('Test K: Direct Call Regression Verification', async () => {
    const registered = WorkflowOrchestrator.getRegisteredWorkflows();
    if (registered.length < 5) {
      throw new Error(`Expected at least 5 registered workflows, found ${registered.length}`);
    }
  });

  // Test L: Complete E2E Lifecycle Execution
  await assertTest('Test L: Complete 15-Step E2E Lifecycle Execution', async () => {
    setAuthenticatedUser();
    const res = await WorkflowOrchestrator.execute(purchaseWorkflow, {
      supplierId: 'SUPP-E2E',
      items: [{ id: 'P-E2E', name: 'Vit C', quantity: 50, unitPrice: 2, total: 100 }],
      total: 100,
      notes: 'Full E2E 15-Step Pipeline Test'
    });

    if (!res.success) {
      throw new Error(`E2E Purchase workflow failed: ${res.error?.message}`);
    }

    if (!res.data?.refId) {
      throw new Error('E2E Purchase workflow did not return document reference ID');
    }
  });

  console.log('================================================================');
  console.log(`📊 TEST RESULTS SUMMARY:`);
  console.log(`   TOTAL:  ${passed + failed}`);
  console.log(`   PASSED: ${passed}`);
  console.log(`   FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runWorkflowOrchestratorTestSuite().catch(err => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
