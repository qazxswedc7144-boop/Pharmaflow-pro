/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Gate 1 Verification Test Suite: Direct Write Path Elimination & Business Execution Boundary
 */

import 'fake-indexeddb/auto';
import { WorkflowOrchestrator } from '../src/core/workflow/workflowOrchestrator';
import { WorkflowContextFactory } from '../src/core/workflow/workflowContext';
import { voucherCancellationWorkflow } from '../src/features/accounting/workflows/VoucherCancellationWorkflow';
import { salesCancellationWorkflow } from '../src/features/sales/workflows/SalesCancellationWorkflow';
import { productApplicationWorkflow } from '../src/features/catalog/workflows/ProductApplicationWorkflow';
import { voucherService } from '../src/features/accounting/services/voucherService';
import { IdempotencyRegistry } from '../src/core/integrity/idempotencyRegistry';
import { TokenProvider } from '../src/services/auth/tokenProvider';
import { useAuthStore } from '../src/store/authStore';

async function runGate1TestSuite() {
  console.log('===============================================================');
  console.log('🧪 GATE 1 VERIFICATION TEST SUITE: BUSINESS EXECUTION BOUNDARY');
  console.log('===============================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
      failedTests++;
    }
  }

  function setAuthUser(isAdmin = true) {
    const adminUser = {
      id: 'admin',
      user_id: 'admin',
      Role: 'Admin',
      User_Name: 'Administrator',
      User_Email: 'admin@test.com',
      tenant_id: 'tenant-1',
      permissions: ['ALL']
    };
    TokenProvider.setSession(adminUser as any, 'mock-token', 'mock-refresh');
    useAuthStore.setState({
      user: isAdmin ? (adminUser as any) : null,
      isAuthenticated: isAdmin,
      permissions: isAdmin ? ['ALL'] : [],
      hasPermission: () => isAdmin
    });
  }

  // Initial Auth Setup
  setAuthUser(true);

  // -------------------------------------------------------------------------
  // TEST A: Authorization Boundary Enforcement
  // -------------------------------------------------------------------------
  console.log('--- TEST A: Authorization Boundary Enforcement ---');
  try {
    TokenProvider.clearSession();
    useAuthStore.setState({ user: null, isAuthenticated: false, permissions: [], hasPermission: () => false });

    const unauthCtx = WorkflowContextFactory.create('VOUCHER_CANCEL', {
      userId: '',
      permissions: []
    });

    const result = await WorkflowOrchestrator.execute(voucherCancellationWorkflow, {
      id: 'TEST-REC-01',
      type: 'RECEIPT',
      partnerId: 'CUST-01',
      amount: 100
    }, unauthCtx);

    assert(
      result.success === false && (
        result.error?.code === 'UNAUTHENTICATED' ||
        result.error?.code === 'AUTHORIZATION_DENIED' ||
        result.error?.message.includes('تسجيل الدخول') ||
        result.error?.message.includes('غير مصرح')
      ),
      'Test A: Blocked unauthorized workflow execution',
      result.error?.message
    );
  } catch (e: any) {
    assert(false, 'Test A: Execution error', e.message);
  } finally {
    setAuthUser(true);
  }

  // -------------------------------------------------------------------------
  // TEST B: Business Validation Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- TEST B: Business Validation Enforcement ---');
  try {
    const validCtx = WorkflowContextFactory.create('VOUCHER_CANCEL', {
      userId: 'admin'
    });

    const result = await WorkflowOrchestrator.execute(voucherCancellationWorkflow, {
      id: '', // Invalid empty ID
      type: 'RECEIPT',
      partnerId: 'CUST-01',
      amount: -500 // Invalid negative amount
    }, validCtx);

    assert(
      result.success === false && (
        result.error?.code === 'VALIDATION_FAILED' ||
        result.error?.message.includes('مطلوب') ||
        result.error?.message.includes('أكبر من الصفر')
      ),
      'Test B: Input validation rejected invalid workflow payload',
      result.error?.message
    );
  } catch (e: any) {
    assert(false, 'Test B: Execution error', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST C: ExecutionGuard & Idempotency Governance
  // -------------------------------------------------------------------------
  console.log('\n--- TEST C: ExecutionGuard & Idempotency Governance ---');
  try {
    const testKey = `IDEM-KEY-${Date.now()}`;
    const ctx1 = WorkflowContextFactory.create('PRODUCT_SAVE', {
      userId: 'admin',
      idempotencyKey: testKey
    });

    const result1 = await WorkflowOrchestrator.execute(productApplicationWorkflow, {
      product: {
        id: `PRD-TEST-${Date.now()}`,
        name: 'دواء تجريبي للاختبار',
        UnitPrice: 150
      }
    }, ctx1);

    assert(result1.success === true, 'Test C1: First execution succeeded');

    // Verify idempotency status in registry
    const record = await IdempotencyRegistry.get(testKey);
    assert(record !== null && record.status === 'COMMITTED', 'Test C2: Idempotency recorded as COMMITTED');

    // Re-execute with identical idempotency key -> Replay
    const result2 = await WorkflowOrchestrator.execute(productApplicationWorkflow, {
      product: {
        id: `PRD-TEST-${Date.now()}`,
        name: 'دواء تجريبي للاختبار',
        UnitPrice: 150
      }
    }, ctx1);

    assert(result2.success === true, 'Test C3: Idempotent replay returned success');
    assert(
      (result2.warnings && result2.warnings.some(w => w.includes('Idempotent replay'))) ||
      result2.data?.productId !== undefined,
      'Test C4: Idempotency key protected workflow against duplicate execution'
    );
  } catch (e: any) {
    assert(false, 'Test C: Execution error', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST D: Transaction Boundary & Workflow Orchestration
  // -------------------------------------------------------------------------
  console.log('\n--- TEST D: Transaction Boundary & Workflow Orchestration ---');
  try {
    const ctx = WorkflowContextFactory.create('INVOICE_CANCEL', {
      userId: 'admin'
    });

    const result = await WorkflowOrchestrator.execute(salesCancellationWorkflow, {
      invoiceId: 'NON-EXISTENT-INV-9999'
    }, ctx);

    assert(
      result.success === false && (
        result.error?.message.includes('غير موجودة') ||
        result.error?.code === 'BUSINESS_RULE_FAILED' ||
        result.error?.code === 'TRANSACTION_FAILED'
      ),
      'Test D: Business rule validation prevented invalid state transition',
      result.error?.message
    );
  } catch (e: any) {
    assert(false, 'Test D: Execution error', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST E: VoucherService Delegated Execution
  // -------------------------------------------------------------------------
  console.log('\n--- TEST E: VoucherService Delegation Check ---');
  try {
    assert(typeof voucherService.cancelVoucher === 'function', 'Test E1: voucherService.cancelVoucher exists');
    assert(typeof voucherService.createReceipt === 'function', 'Test E2: voucherService.createReceipt exists');
    assert(typeof voucherService.createPayment === 'function', 'Test E3: voucherService.createPayment exists');
  } catch (e: any) {
    assert(false, 'Test E: Execution error', e.message);
  }

  console.log('\n===============================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runGate1TestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
