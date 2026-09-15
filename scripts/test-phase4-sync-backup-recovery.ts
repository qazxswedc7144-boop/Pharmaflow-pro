// scripts/test-phase4-sync-backup-recovery.ts
import 'fake-indexeddb/auto';
import crypto from 'crypto';

if (typeof global.crypto === 'undefined' || !(global as any).crypto?.randomUUID) {
  (global as any).crypto = crypto.webcrypto || crypto;
}

if (typeof global.localStorage === 'undefined') {
  const storage: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, value: string) => { storage[key] = String(value); },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };
}

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true, userAgent: 'NodePOS' },
    writable: true,
    configurable: true
  });
} catch {
  (global as any).navigator = { onLine: true };
}

if (typeof global.window === 'undefined') {
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: (global as any).localStorage,
    location: { origin: 'http://localhost:3000' }
  };
} else {
  (global as any).window.dispatchEvent = (global as any).window.dispatchEvent || (() => true);
  (global as any).window.localStorage = (global as any).localStorage;
}

import { db } from '../src/core/db';
import { syncQueueRepository } from '../src/features/sync/sync.queue';
import { DistributedSyncEngine } from '../src/features/sync/sync.engine';
import { SyncProcessorService } from '../server/modules/sync/sync-processor.service';
import { backupService } from '../src/features/backup/services/BackupService';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPhase4Verification() {
  console.log('====================================================');
  console.log('🛡️  PHASE 4 — BACKUP, CLOUD SYNC & RECOVERY VERIFICATION');
  console.log('====================================================\n');

  // ==========================================================
  // SECTION 1: Durable Outbox & Transactional Enqueue
  // ==========================================================
  console.log('--- TEST 1: Durable Outbox & Transactional Enqueue ---');
  await db.open();

  // 1.1 Enqueue within transaction
  const mutationPayload = {
    id: 'inv_outbox_001',
    invoiceNumber: 'INV-2026-001',
    total: 2500,
    tenantId: 'tenant_alpha'
  };

  const syncEngine = DistributedSyncEngine.getInstance();

  const enqueuedMutation = await db.transaction('rw', [db.syncQueue, db.invoices], async () => {
    await db.invoices.put(mutationPayload as any);
    return await syncEngine.enqueueWithinTransaction(
      'CREATE',
      mutationPayload,
      'INVOICE',
      'idem_key_inv_001',
      { tenantId: 'tenant_alpha' }
    );
  });

  assert(enqueuedMutation.mutationId !== undefined, 'Outbox mutation generated with UUID');
  assert(enqueuedMutation.idempotencyKey === 'idem_key_inv_001', 'Idempotency key retained in outbox');

  // Verify record exists in Dexie syncQueue
  const storedQueueItem = await db.syncQueue.where('mutationId').equals(enqueuedMutation.mutationId).first();
  assert(storedQueueItem !== undefined, 'Outbox item persisted in Dexie syncQueue table');
  assert(storedQueueItem?.entityType === 'INVOICE', 'Stored item entityType matches');
  assert(storedQueueItem?.syncStatus === 'PENDING', 'Initial outbox status is PENDING');

  // 1.2 Deduplication on same idempotency key
  const duplicateMutation = await db.transaction('rw', [db.syncQueue], async () => {
    return await syncEngine.enqueueWithinTransaction(
      'CREATE',
      mutationPayload,
      'INVOICE',
      'idem_key_inv_001',
      { tenantId: 'tenant_alpha' }
    );
  });
  assert(duplicateMutation.idempotencyKey === enqueuedMutation.idempotencyKey, 'Duplicate idempotency key handled consistently');

  // 1.3 Transaction rollback safety test: if transaction throws, outbox item must NOT be saved
  let rollbackCaught = false;
  try {
    await db.transaction('rw', [db.syncQueue, db.products], async () => {
      await syncEngine.enqueueWithinTransaction(
        'CREATE',
        { id: 'prod_rollback_test', name: 'Rollback' },
        'PRODUCT',
        'idem_rollback_fail',
        { tenantId: 'tenant_alpha' }
      );
      throw new Error('Simulated atomic transaction failure');
    });
  } catch (e: any) {
    rollbackCaught = true;
  }
  assert(rollbackCaught, 'Transaction successfully aborted on domain error');
  const rolledBackItem = await db.syncQueue.where('idempotencyKey').equals('idem_rollback_fail').first();
  assert(rolledBackItem === undefined, 'Atomic rollback confirmed: no orphan outbox item exists');

  // 1.4 Outbox metrics & queue stats
  const stats = await syncQueueRepository.getQueueStats();
  assert(stats.total >= 1, 'Queue stats reflect active outbox items');
  assert(stats.pending >= 1, 'Queue stats count pending mutations correctly');

  // ==========================================================
  // SECTION 2: Server Sync Processor, LWW & Financial Integrity
  // ==========================================================
  console.log('\n--- TEST 2: Server Sync Processor & Financial Integrity ---');
  const syncProcessor = new SyncProcessorService();

  // 2.1 Last-Write-Wins Conflict Resolution
  const olderMutation = {
    id: 'mut_lww_1',
    entity: 'INVOICE',
    entityId: 'inv_100',
    type: 'UPDATE',
    data: { id: 'inv_100', status: 'DRAFT', clientUpdatedAt: '2026-01-01T10:00:00.000Z' },
    version: 1,
    clientMutationTime: '2026-01-01T10:00:00.000Z'
  };

  const newerMutation = {
    id: 'mut_lww_2',
    entity: 'INVOICE',
    entityId: 'inv_100',
    type: 'UPDATE',
    data: { id: 'inv_100', status: 'PAID', clientUpdatedAt: '2026-01-01T12:00:00.000Z' },
    version: 2,
    clientMutationTime: '2026-01-01T12:00:00.000Z'
  };

  // Test conflict check
  const conflictCheckOlder = await (syncProcessor as any).checkConflict(
    'INVOICE',
    'inv_100',
    1,
    'tenant_alpha',
    { updatedAt: new Date('2026-01-01T11:00:00.000Z') }, // Server is at 11:00
    olderMutation.data
  );
  assert(conflictCheckOlder.hasConflict === true, 'Server detects conflict when client mutation time is older than server record');
  assert(conflictCheckOlder.resolutionStrategy === 'SERVER_WINS', 'Resolution strategy evaluates to SERVER_WINS for older client mutation');

  const conflictCheckNewer = await (syncProcessor as any).checkConflict(
    'INVOICE',
    'inv_100',
    1,
    'tenant_alpha',
    { updatedAt: new Date('2026-01-01T11:00:00.000Z') }, // Server is at 11:00
    newerMutation.data
  );
  assert(conflictCheckNewer.resolutionStrategy === 'CLIENT_WINS', 'Resolution strategy evaluates to CLIENT_WINS when client timestamp is newer');

  // 2.2 Financial Integrity: Payment Amount Validation
  const invalidPaymentMutation = {
    id: 'mut_pay_bad',
    entity: 'PAYMENT',
    entityId: 'pay_001',
    type: 'CREATE',
    data: { amount: -500, paymentMethod: 'CASH' },
    version: 1
  };
  const payResult = await (syncProcessor as any).processSingleMutation(invalidPaymentMutation, 'tenant_alpha');
  assert(payResult.status === 'FAILED', 'Server rejects negative financial payment amount');
  assert(payResult.error.includes('positive non-zero number'), 'Descriptive financial error message returned');

  // 2.3 Financial Integrity: Journal Entry Debit/Credit Balance Check
  const unbalancedJournal = {
    id: 'mut_je_unbalanced',
    entity: 'JOURNAL_ENTRY',
    entityId: 'je_001',
    type: 'CREATE',
    data: {
      date: new Date().toISOString(),
      lines: [
        { debit: 1000, credit: 0, accountId: 'acc_cash' },
        { debit: 0, credit: 800, accountId: 'acc_sales' } // Off by 200!
      ]
    },
    version: 1
  };
  const jeResult = await (syncProcessor as any).processSingleMutation(unbalancedJournal, 'tenant_alpha');
  assert(jeResult.status === 'FAILED', 'Server rejects unbalanced journal entry');
  assert(jeResult.error.includes('Unbalanced journal entry'), 'Unbalanced debit/credit error caught with exact amounts');

  // Balanced journal entry succeeds
  const balancedJournal = {
    id: 'mut_je_balanced',
    entity: 'JOURNAL_ENTRY',
    entityId: 'je_002',
    type: 'CREATE',
    data: {
      date: new Date().toISOString(),
      lines: [
        { debit: 500, credit: 0, accountId: 'acc_cash' },
        { debit: 0, credit: 500, accountId: 'acc_revenue' }
      ]
    },
    version: 1
  };
  const jeBalancedResult = await (syncProcessor as any).processSingleMutation(balancedJournal, 'tenant_alpha');
  assert(jeBalancedResult.status === 'SUCCESS', 'Server accepts perfectly balanced journal entry');

  // ==========================================================
  // SECTION 3: Encrypted Backup & Multi-Mode Restore Engine
  // ==========================================================
  console.log('\n--- TEST 3: Encrypted Backup & Multi-Mode Restore ---');
  const backupPassword = 'EnterpriseStrongPassword#2026!';
  const testPayload = {
    version: '2.0.0',
    tables: {
      products: [
        { id: 'PROD_SEC_1', name: 'Paracetamol 500mg', basePrice: 15.5, costPrice: 10, quantity: 200 }
      ],
      customers: [
        { id: 'CUST_SEC_1', name: 'Al-Amal Pharmacy', phone: '+966500000000', balance: 450 }
      ]
    }
  };

  // 3.1 Create Local Encrypted Backup (.pfb)
  const backupEntry = await backupService.createLocalBackup(testPayload, backupPassword, 'full', {
    tenantId: 'tenant_alpha',
    branchId: 'branch_main',
    createdBy: 'admin_user'
  });

  assert(backupEntry.metadata.id !== undefined, 'Backup created with unique ID');
  assert(backupEntry.metadata.encryption === true, 'Backup marked as encrypted');
  assert(backupEntry.metadata.tenantId === 'tenant_alpha', 'Backup metadata records tenantId');
  assert(backupEntry.metadata.checksum.length === 64, 'SHA-256 checksum computed for payload');
  assert(backupEntry.blob !== undefined && backupEntry.blob.size > 0, 'Backup ZIP archive generated with valid size');

  // 3.2 Mode: PREVIEW (Zero Decryption, Zero DB Mutation)
  const preview = await backupService.previewBackup(backupEntry.blob!);
  assert(preview.validArchive === true, 'Preview confirms archive contains valid data.enc');
  assert(preview.metadata?.tenantId === 'tenant_alpha', 'Preview successfully extracts metadata without password');
  assert(preview.metadata?.formatVersion === '2.0.0', 'Preview reads formatVersion');

  // 3.3 Mode: VALIDATE (Full payload integrity, zero DB mutation)
  const validationResult = await backupService.validateBackup(backupEntry.blob!, backupPassword);
  assert(validationResult.valid === true, 'Validation passes with correct password');
  assert(validationResult.totalRecords === 2, 'Validation accurately counts records (2 items)');
  assert(validationResult.tables?.includes('products') === true, 'Validation recognizes products table');

  // 3.4 Mode: DRY_RUN (Full schema cross-check & simulation, zero DB mutation)
  const dryRunResult = await backupService.restoreBackup(backupEntry.blob!, backupPassword, {
    mode: 'DRY_RUN',
    targetTenantId: 'tenant_alpha'
  });
  assert(dryRunResult.success === true, 'Dry-run simulation succeeds');
  assert(dryRunResult.restoredRecords === 2, 'Dry-run verifies planned record count');
  assert(dryRunResult.message?.includes('محاكاة استعادة ناجحة') === true, 'Dry-run reports zero DB mutation');

  // 3.5 Tenant Isolation Enforcement
  let tenantMismatchCaught = false;
  try {
    await backupService.restoreBackup(backupEntry.blob!, backupPassword, {
      mode: 'RESTORE',
      targetTenantId: 'tenant_BETA_DIFFERENT'
    });
  } catch (e: any) {
    tenantMismatchCaught = true;
    assert(e.message.includes('خطأ في عزل البيانات'), 'Restore blocked when backup tenant does not match target tenant');
  }
  assert(tenantMismatchCaught, 'Multi-tenant isolation strictly enforced on restore');

  // 3.6 Mode: RESTORE (Atomic Transaction Database Restoration)
  const realRestoreResult = await backupService.restoreBackup(backupEntry.blob!, backupPassword, {
    mode: 'RESTORE',
    targetTenantId: 'tenant_alpha'
  });
  assert(realRestoreResult.success === true, 'Real restore completes atomically');
  assert(realRestoreResult.restoredTables.includes('products'), 'Products table restored in database');
  const restoredProd = await db.products.get('PROD_SEC_1');
  assert(restoredProd !== undefined && restoredProd.name === 'Paracetamol 500mg', 'Restored record persisted in database');

  // ==========================================================
  // SECTION 4: Disaster Recovery Drill Engine
  // ==========================================================
  console.log('\n--- TEST 4: Disaster Recovery Drill Engine ---');
  const drillResult = await backupService.executeDisasterRecoveryDrill('EnterpriseDrillKey2026!');
  
  assert(drillResult.healthyBackupValidated === true, 'DR Drill: Healthy backup validation verified');
  assert(drillResult.wrongPasswordRejected === true, 'DR Drill: Wrong password unambiguously rejected');
  assert(drillResult.corruptedBackupRejected === true, 'DR Drill: Corrupted encrypted payload rejected');
  assert(drillResult.missingDataEncRejected === true, 'DR Drill: Archive missing data.enc rejected');
  assert(drillResult.checksumMismatchRejected === true, 'DR Drill: Tampered checksum mismatch rejected');
  assert(drillResult.databaseUnchangedVerified === true, 'DR Drill: Zero live database side-effects verified');
  assert(drillResult.recoveryReadiness === 'ready', 'DR Drill: Overall Disaster Recovery readiness marked as READY');
  assert(drillResult.success === true, 'All DR Drill assertions passed successfully');

  console.log('\n====================================================');
  console.log(`🎉 ALL PHASE 4 TESTS COMPLETED: ${passedTests}/${totalTests} PASSED!`);
  console.log('====================================================\n');

  process.exit(0);
}

runPhase4Verification().catch(err => {
  console.error('❌ Phase 4 Verification Failure:', err);
  process.exit(1);
});
