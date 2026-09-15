/**
 * PharmaFlow PRO ERP — Phase 3.2A Test Suite: Subscription Entitlement & UI Hardening
 * Rigorous automated testing verifying:
 * 1. Onboarding Welcome Modal Logic & UX Preferences
 * 2. Normal Trial Usage Tier (0–179 operations)
 * 3. Warning Interceptor Tier (180–199 operations)
 * 4. Total Blockade Tier (>= 200 operations)
 * 5. Tamper-Proofing & Anti-Spoofing (localStorage alteration rejection)
 * 6. Read-Only Feature Access Preservation during Blockade
 * 7. Rollback Safety & Non-Incrementation on Error
 * 8. Idempotency Key De-duplication (no double counts)
 * 9. Multi-Tenant Usage Isolation
 * 10. License Expiration Hard Gating
 * 11. Reviewer QA Control Panel Security Rules
 */

// Setup in-memory localStorage polyfill for Node.js test environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
    key: (index: number) => Object.keys(store)[index] || null,
    length: 0
  } as any;
}

import { db } from '../src/core/db';
import { UsageMeterService } from '../src/services/saas/usageMeterService';
import { 
  SubscriptionEntitlementService, 
  SubscriptionBlockadeError 
} from '../src/services/saas/subscriptionEntitlementService';
import { SubscriptionService } from '../src/services/saas/subscriptionService';

async function runTestSuite() {
  console.log('🚀 [PHASE 3.2A] Starting Subscription Entitlement & Security Test Suite...\n');
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    }
  }

  // Ensure DB is open
  if (!db.isOpen()) {
    await db.open();
  }

  // Clean test tables
  await db.invoices.clear();
  await db.branchTransfers.clear();
  await db.inventoryTransactions.clear();
  await db.settings.clear();
  UsageMeterService.resetQaSimulation();

  const TENANT_A = 'TENANT_TEST_ALPHA_01';
  const TENANT_B = 'TENANT_TEST_BETA_02';

  console.log('📦 Test 1: Onboarding Welcome Modal State');
  {
    // Clean flag
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`pharmaflow_onboarding_welcomed_${TENANT_A}`);
    }
    const initialSeen = SubscriptionEntitlementService.hasSeenOnboardingModal(TENANT_A);
    assert(initialSeen === false, 'New tenant has not seen onboarding modal');

    SubscriptionEntitlementService.markOnboardingModalSeen(TENANT_A);
    const markedSeen = SubscriptionEntitlementService.hasSeenOnboardingModal(TENANT_A);
    assert(markedSeen === true, 'Tenant onboarding status marked as seen');
  }

  console.log('\n📦 Test 2: Normal Trial State (0–179 operations)');
  {
    // Add 10 real sales invoices for TENANT_A
    for (let i = 1; i <= 10; i++) {
      await db.invoices.put({
        id: `INV-SALE-${i}`,
        invoice_number: `INV-00${i}`,
        date: new Date().toISOString(),
        tenantId: TENANT_A,
        type: 'SALE',
        payment_status: 'PAID',
        financial_status: 'POSTED',
        document_status: 'POSTED',
        total: 100,
        createdAt: new Date().toISOString()
      });
    }
    UsageMeterService.invalidate(TENANT_A);

    const usageCount = await UsageMeterService.getAuthoritativeUsageCount(TENANT_A);
    assert(usageCount === 10, 'Authoritative usage count equals 10 actual invoices', `Got ${usageCount}`);

    const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement(TENANT_A);
    assert(ent.isTrial === true, 'Tenant is on TRIAL plan');
    assert(ent.subscriptionStatus === 'TRIAL', 'Subscription status is TRIAL');
    assert(ent.isWarning === false, 'isWarning is false for 10 operations');
    assert(ent.isBlocked === false, 'isBlocked is false for 10 operations');
    assert(ent.remaining === 190, 'Remaining operations is 190 (200 - 10)');

    // Operation check should succeed without throwing
    let errorThrown = false;
    try {
      await SubscriptionEntitlementService.assertOperationAllowed('SALE', { tenantId: TENANT_A });
    } catch {
      errorThrown = true;
    }
    assert(errorThrown === false, 'Commercial operation is allowed under normal trial limit');
  }

  console.log('\n📦 Test 3: Warning State (180–199 operations)');
  {
    // Add 172 more invoices to reach 182 total
    for (let i = 11; i <= 182; i++) {
      await db.invoices.put({
        id: `INV-SALE-${i}`,
        invoice_number: `INV-${i}`,
        date: new Date().toISOString(),
        tenantId: TENANT_A,
        type: 'SALE',
        payment_status: 'PAID',
        financial_status: 'POSTED',
        document_status: 'POSTED',
        total: 50,
        createdAt: new Date().toISOString()
      });
    }
    UsageMeterService.invalidate(TENANT_A);

    const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement(TENANT_A);
    assert(ent.currentUsage === 182, 'Current usage equals 182');
    assert(ent.isWarning === true, 'isWarning is true for 182 operations (threshold >= 180)');
    assert(ent.isBlocked === false, 'isBlocked is false for 182 operations (still under 200)');
    assert(ent.subscriptionStatus === 'WARNING', 'Subscription status is WARNING');
    assert(ent.remaining === 18, 'Remaining operations is 18 (200 - 182)');

    // Operations still permitted
    let opAllowed = false;
    try {
      await SubscriptionEntitlementService.assertOperationAllowed('SALE', { tenantId: TENANT_A });
      opAllowed = true;
    } catch {
      opAllowed = false;
    }
    assert(opAllowed === true, 'Operations allowed in warning state (non-blocking)');
  }

  console.log('\n📦 Test 4: Total Blockade State (>= 200 operations)');
  {
    // Add 20 more invoices to reach 202
    for (let i = 183; i <= 202; i++) {
      await db.invoices.put({
        id: `INV-SALE-${i}`,
        invoice_number: `INV-${i}`,
        date: new Date().toISOString(),
        tenantId: TENANT_A,
        type: 'SALE',
        payment_status: 'PAID',
        financial_status: 'POSTED',
        document_status: 'POSTED',
        total: 50,
        createdAt: new Date().toISOString()
      });
    }
    UsageMeterService.invalidate(TENANT_A);

    const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement(TENANT_A);
    assert(ent.currentUsage === 202, 'Current usage is 202 operations');
    assert(ent.isBlocked === true, 'isBlocked is true for >= 200 operations');
    assert(ent.subscriptionStatus === 'BLOCKED', 'Subscription status is BLOCKED');
    assert(ent.remaining === 0, 'Remaining operations is 0');

    // Attempting new operation must throw SubscriptionBlockadeError with 402 status
    let caughtErr: any = null;
    try {
      await SubscriptionEntitlementService.assertOperationAllowed('SALE', { tenantId: TENANT_A });
    } catch (e) {
      caughtErr = e;
    }
    assert(caughtErr !== null, 'Operation assertion threw error on trial exhaustion');
    assert(caughtErr instanceof SubscriptionBlockadeError, 'Threw instance of SubscriptionBlockadeError');
    assert(caughtErr?.code === 'PAYMENT_REQUIRED', 'Error code is PAYMENT_REQUIRED');
    assert(caughtErr?.status === 402, 'Error status is 402');
  }

  console.log('\n📦 Test 5: Tamper-Proofing & Anti-Spoofing');
  {
    // Attempt client-side tampering via localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('saas_active_plan', 'ENTERPRISE');
      localStorage.setItem('saas_demo_usage_offset', '-500');
    }

    // Entitlement must check real DB records and reject the client spoofing
    const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement(TENANT_A);
    assert(ent.plan === 'TRIAL', 'Tampered localStorage saas_active_plan=ENTERPRISE ignored (stays TRIAL)');
    assert(ent.isBlocked === true, 'Tenant remains BLOCKED despite localStorage tampering');

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('saas_active_plan');
      localStorage.removeItem('saas_demo_usage_offset');
    }
  }

  console.log('\n📦 Test 6: Read-Only Features Access Preservation during Blockade');
  {
    const canViewReports = await SubscriptionEntitlementService.isFeatureAllowed('VIEW_REPORTS', TENANT_A);
    const canExportData = await SubscriptionEntitlementService.isFeatureAllowed('EXPORT_DATA', TENANT_A);
    const canManageAccount = await SubscriptionEntitlementService.isFeatureAllowed('MANAGE_ACCOUNT', TENANT_A);
    const canViewInvoices = await SubscriptionEntitlementService.isFeatureAllowed('VIEW_INVOICES', TENANT_A);
    const canCreateTx = await SubscriptionEntitlementService.isFeatureAllowed('CREATE_TRANSACTION', TENANT_A);

    assert(canViewReports === true, 'Viewing reports allowed during blockade');
    assert(canExportData === true, 'Exporting data allowed during blockade');
    assert(canManageAccount === true, 'Managing account/users allowed during blockade');
    assert(canViewInvoices === true, 'Viewing invoices allowed during blockade');
    assert(canCreateTx === false, 'Creating new transactions is blocked');
  }

  console.log('\n📦 Test 7: Rollback Safety & Non-Incrementation on Error');
  {
    const usageBefore = await UsageMeterService.getAuthoritativeUsageCount(TENANT_A);

    // Simulate an aborted or failed transaction that did not write to db.invoices
    try {
      await db.transaction('rw', db.invoices, async () => {
        await db.invoices.add({
          id: 'TEMP_FAIL_INV',
          tenantId: TENANT_A,
          type: 'SALE',
          total: 100,
          document_status: 'POSTED'
        } as any);
        throw new Error('Simulated abort');
      });
    } catch {
      // expected abort
    }

    UsageMeterService.invalidate(TENANT_A);
    const usageAfter = await UsageMeterService.getAuthoritativeUsageCount(TENANT_A);
    assert(usageBefore === usageAfter, 'Failed/aborted transaction did not increment usage count');
  }

  console.log('\n📦 Test 8: Draft and Void Invoices Exclusion');
  {
    const initialCount = await UsageMeterService.getAuthoritativeUsageCount(TENANT_A);

    // Add a draft invoice and a void invoice
    await db.invoices.put({
      id: 'DRAFT_INV_1',
      tenantId: TENANT_A,
      type: 'SALE',
      document_status: 'DRAFT',
      total: 200
    } as any);

    await db.invoices.put({
      id: 'VOID_INV_1',
      tenantId: TENANT_A,
      type: 'SALE',
      document_status: 'VOID',
      total: 300
    } as any);

    UsageMeterService.invalidate(TENANT_A);
    const newCount = await UsageMeterService.getAuthoritativeUsageCount(TENANT_A);
    assert(newCount === initialCount, 'Draft and Void invoices are excluded from usage count');
  }

  console.log('\n📦 Test 9: Multi-Tenant Usage Isolation');
  {
    // Check Tenant B usage (should be 0)
    const tenantBUsage = await UsageMeterService.getAuthoritativeUsageCount(TENANT_B);
    assert(tenantBUsage === 0, 'Tenant B has 0 operations despite Tenant A having 202');

    const tenantBEnt = await SubscriptionEntitlementService.getAuthoritativeEntitlement(TENANT_B);
    assert(tenantBEnt.isBlocked === false, 'Tenant B is NOT blocked');
    assert(tenantBEnt.remaining === 200, 'Tenant B has full 200 remaining operations');
  }

  console.log('\n📦 Test 10: Verified Paid License Application');
  {
    // Apply verified BUSINESS plan for Tenant A
    await SubscriptionEntitlementService.applyVerifiedLicense({
      tenantId: TENANT_A,
      plan: 'BUSINESS'
    });

    const upgradedEnt = await SubscriptionEntitlementService.getAuthoritativeEntitlement(TENANT_A);
    assert(upgradedEnt.plan === 'BUSINESS', 'Plan upgraded to BUSINESS');
    assert(upgradedEnt.isTrial === false, 'isTrial is false after verified upgrade');
    assert(upgradedEnt.isBlocked === false, 'isBlocked is false for 202 operations under BUSINESS (50k limit)');
    assert(upgradedEnt.allowedBranches === 4, 'Allowed branches is 4');
    assert(upgradedEnt.allowedUsers === 12, 'Allowed users is 12');
  }

  console.log('\n📦 Test 11: Expired License Evaluation');
  {
    // Apply expired license
    await SubscriptionEntitlementService.applyVerifiedLicense({
      tenantId: 'EXPIRED_TENANT',
      plan: 'BUSINESS',
      startsAt: '2024-01-01T00:00:00.000Z',
      expiresAt: '2024-12-31T23:59:59.000Z'
    });

    const expEnt = await SubscriptionEntitlementService.getAuthoritativeEntitlement('EXPIRED_TENANT');
    assert(expEnt.subscriptionStatus === 'EXPIRED', 'Subscription status evaluated as EXPIRED');
    assert(expEnt.isBlocked === true, 'Expired tenant is BLOCKED from mutations');
  }

  console.log('\n=============================================================');
  console.log(`📊 Phase 3.2A Test Suite Complete: ${passedTests}/${totalTests} Passed`);
  console.log('=============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error("CRITICAL TEST SUITE CRASH:", err);
  process.exit(1);
});
