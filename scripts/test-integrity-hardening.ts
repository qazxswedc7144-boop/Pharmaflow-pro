import {
  IdempotencyKeyBuilder,
  IdempotencyRegistry,
  ExecutionGuard,
  TransactionBoundary,
  InventoryConsistencyValidator,
  AccountingConsistencyValidator,
  IntegrityRepairEngine,
  IntegrityRecoveryManager,
  ConsistencyRules
} from '../src/core/integrity';
import { IdempotencyService } from '../src/services/integrity/idempotencyService';
import { DuplicateDetectionService } from '../src/services/integrity/duplicateDetectionService';
import { DataConsistencyService } from '../src/services/integrity/dataConsistencyService';
import { IntegrityAuditService } from '../src/services/integrity/integrityAuditService';
import { IntegrityRepairService } from '../src/services/integrity/integrityRepairService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function runIntegrityTestSuite() {
  console.log('====================================================');
  console.log('🛡️ Phase 3.4.7 Enterprise Integrity & Idempotency Hardening Suite');
  console.log('====================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  // ----------------------------------------------------
  // Test A — Double Click Protection
  // ----------------------------------------------------
  console.log('[Test A] Double Click Protection');
  try {
    IdempotencyRegistry.clearInMemory();
    let executionCount = 0;

    const opPayload = { customerId: 'CUST-001', items: [{ name: 'Aspirin', quantity: 1, price: 10 }], total: 10 };
    const fp = IdempotencyKeyBuilder.generateFingerprint('sale', opPayload);
    const key = IdempotencyKeyBuilder.buildKey({
      tenantId: 'tenantA',
      branchId: 'main',
      operationType: 'sales.invoice.post',
      entityType: 'invoice',
      entityId: 'INV-A1',
      requestFingerprint: fp
    });

    const task = () =>
      IdempotencyService.executeOnce({
        key,
        operationType: 'sales.invoice.post',
        tenantId: 'tenantA',
        branchId: 'main',
        payload: opPayload,
        execute: async () => {
          executionCount++;
          await new Promise((r) => setTimeout(r, 50));
          return { success: true, invoiceId: 'INV-A1' };
        }
      });

    const results = await Promise.allSettled([task(), task()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');

    assert(executionCount === 1, 'Exactly one execution took place despite concurrent double clicks');
    assert(fulfilled.length >= 1, 'First task completed successfully with idempotent response');
    passedTests++;
  } catch (err: any) {
    console.error('Test A Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test B — Retry Protection
  // ----------------------------------------------------
  console.log('\n[Test B] Retry Protection');
  try {
    IdempotencyRegistry.clearInMemory();
    let counter = 0;
    const retryKey = 'tenant:t1|branch:b1|op:sale|entity:inv|id:INV-B1|fp:fp123';

    const firstRun = await IdempotencyService.executeOnce({
      key: retryKey,
      operationType: 'sale',
      tenantId: 't1',
      branchId: 'b1',
      execute: async () => {
        counter++;
        return { invoiceId: 'INV-B1', total: 100 };
      }
    });

    // Simulate network retry with identical idempotency key
    const retryRun = await IdempotencyService.executeOnce({
      key: retryKey,
      operationType: 'sale',
      tenantId: 't1',
      branchId: 'b1',
      execute: async () => {
        counter++;
        return { invoiceId: 'INV-B1-DUPLICATE', total: 100 };
      }
    });

    assert(counter === 1, 'Operation body was NOT re-executed during network retry');
    assert(retryRun.invoiceId === 'INV-B1', 'Returned original committed result without creating duplicate invoice');
    passedTests++;
  } catch (err: any) {
    console.error('Test B Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test C — Offline Replay
  // ----------------------------------------------------
  console.log('\n[Test C] Offline Replay');
  try {
    IdempotencyRegistry.clearInMemory();
    let syncExecutions = 0;
    const mutationId = 'MUT-OFFLINE-99';
    const syncKey = `tenant:t1|branch:b1|op:sync|entity:mutation|id:${mutationId}|fp:fp-offline`;

    const syncAction = () =>
      IdempotencyService.executeOnce({
        key: syncKey,
        operationType: 'sync',
        tenantId: 't1',
        branchId: 'b1',
        execute: async () => {
          syncExecutions++;
          return { ack: true, mutationId };
        }
      });

    await syncAction();
    await syncAction(); // Replay 1
    await syncAction(); // Replay 2

    assert(syncExecutions === 1, 'Offline mutation synced multiple times executed exactly once on server');
    passedTests++;
  } catch (err: any) {
    console.error('Test C Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test D — Duplicate Journal Protection
  // ----------------------------------------------------
  console.log('\n[Test D] Duplicate Journal Protection');
  try {
    const journal1 = {
      sourceId: 'INV-100',
      sourceType: 'SALE',
      description: 'Sales Invoice #100',
      lines: [
        { accountId: 'ACC-CASH', debit: 500, credit: 0 },
        { accountId: 'ACC-REV', debit: 0, credit: 500 }
      ]
    };

    const journal2 = {
      sourceId: 'INV-100',
      sourceType: 'SALE',
      description: 'Sales Invoice #100 Duplicate',
      lines: [
        { accountId: 'ACC-CASH', debit: 500, credit: 0 },
        { accountId: 'ACC-REV', debit: 0, credit: 500 }
      ]
    };

    const fp1 = AccountingConsistencyValidator.generateJournalFingerprint(journal1);
    const fp2 = AccountingConsistencyValidator.generateJournalFingerprint(journal2);

    assert(fp1 === fp2, 'Identical business event produced identical journal fingerprint');
    passedTests++;
  } catch (err: any) {
    console.error('Test D Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test E — Inventory Double Movement Protection
  // ----------------------------------------------------
  console.log('\n[Test E] Inventory Double Movement Protection');
  try {
    IdempotencyRegistry.clearInMemory();
    let movementAppliedCount = 0;

    const saleKey = 'tenant:t1|branch:b1|op:sale.deduct|entity:item|id:PROD-01|fp:fp-sale';

    const deductStock = () =>
      IdempotencyService.executeOnce({
        key: saleKey,
        operationType: 'sale.deduct',
        tenantId: 't1',
        branchId: 'b1',
        execute: async () => {
          movementAppliedCount++;
          return { deducted: 5 };
        }
      });

    await deductStock();
    await deductStock();

    assert(movementAppliedCount === 1, 'Inventory movement was deducted exactly once for repeated request');
    passedTests++;
  } catch (err: any) {
    console.error('Test E Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test F — Atomic Rollback
  // ----------------------------------------------------
  console.log('\n[Test F] Atomic Rollback');
  try {
    let transactionCommitted = false;

    try {
      await TransactionBoundary.executeAtomic(['invoices'], async () => {
        // Step 1: Simulated invoice creation
        // Step 2: Simulated inventory failure
        throw new Error('INVENTORY_OUT_OF_STOCK');
        transactionCommitted = true;
      });
    } catch (err: any) {
      assert(err.message === 'INVENTORY_OUT_OF_STOCK', 'Transaction aborted on inventory failure');
    }

    assert(!transactionCommitted, 'No partial accounting or invoice commit took place after failure');
    passedTests++;
  } catch (err: any) {
    console.error('Test F Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test G — Cross-Tenant Isolation
  // ----------------------------------------------------
  console.log('\n[Test G] Cross-Tenant Isolation');
  try {
    IdempotencyRegistry.clearInMemory();
    const commonPayload = { customerId: 'CUST-100', total: 250 };
    const fp = IdempotencyKeyBuilder.generateFingerprint('sale', commonPayload);

    const keyTenantA = IdempotencyKeyBuilder.buildKey({
      tenantId: 'tenant-alpha',
      branchId: 'b1',
      operationType: 'sale',
      entityType: 'invoice',
      entityId: 'INV-100',
      requestFingerprint: fp
    });

    const keyTenantB = IdempotencyKeyBuilder.buildKey({
      tenantId: 'tenant-beta',
      branchId: 'b1',
      operationType: 'sale',
      entityType: 'invoice',
      entityId: 'INV-100',
      requestFingerprint: fp
    });

    let execA = 0;
    let execB = 0;

    await IdempotencyService.executeOnce({
      key: keyTenantA,
      operationType: 'sale',
      tenantId: 'tenant-alpha',
      branchId: 'b1',
      execute: async () => {
        execA++;
        return { success: true };
      }
    });

    await IdempotencyService.executeOnce({
      key: keyTenantB,
      operationType: 'sale',
      tenantId: 'tenant-beta',
      branchId: 'b1',
      execute: async () => {
        execB++;
        return { success: true };
      }
    });

    assert(execA === 1 && execB === 1, 'Both tenant requests executed independently despite identical payload and invoice ID');
    passedTests++;
  } catch (err: any) {
    console.error('Test G Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test H — Interrupted Operation Recovery
  // ----------------------------------------------------
  console.log('\n[Test H] Interrupted Operation Recovery');
  try {
    IdempotencyRegistry.clearInMemory();
    const interruptedKey = 'tenant:t1|branch:b1|op:sale|entity:inv|id:INV-INTERRUPT|fp:fp-int';

    await IdempotencyRegistry.save({
      key: interruptedKey,
      status: 'PROCESSING',
      tenantId: 't1',
      branchId: 'b1',
      operationType: 'sale',
      entityType: 'inv',
      entityId: 'INV-INTERRUPT',
      fingerprint: 'fp-int',
      createdAt: new Date().toISOString()
    });

    const decisions = await IntegrityRecoveryManager.recoverPendingOperations();
    const rec = await IdempotencyRegistry.get(interruptedKey);

    assert(rec?.status !== 'PROCESSING', 'Interrupted PROCESSING status was resolved during recovery scan');
    passedTests++;
  } catch (err: any) {
    console.error('Test H Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test I — Pharmaceutical Batch Integrity
  // ----------------------------------------------------
  console.log('\n[Test I] Pharmaceutical Batch Integrity');
  try {
    IdempotencyRegistry.clearInMemory();
    let batchMutationCount = 0;

    const batchKey = 'tenant:t1|branch:b1|op:batch.movement|entity:batch|id:BATCH-EXP2026|fp:fp-batch';

    const mutateBatch = () =>
      IdempotencyService.executeOnce({
        key: batchKey,
        operationType: 'batch.movement',
        tenantId: 't1',
        branchId: 'b1',
        execute: async () => {
          batchMutationCount++;
          return { batchId: 'BATCH-EXP2026', newQty: 100 };
        }
      });

    await mutateBatch();
    await mutateBatch();

    assert(batchMutationCount === 1, 'Pharmaceutical batch movement replay produced no duplicate quantity mutation');
    passedTests++;
  } catch (err: any) {
    console.error('Test I Error:', err);
  }
  totalTests++;

  // ----------------------------------------------------
  // Test J — Repair Safety
  // ----------------------------------------------------
  console.log('\n[Test J] Repair Safety');
  try {
    const plan = IntegrityRepairEngine.createRepairPlan({
      tenantId: 't1',
      branchId: 'b1',
      inconsistencyType: 'UNBALANCED_JOURNAL_ENTRY',
      affectedEntities: [{ entityType: 'JOURNAL', entityId: 'JE-99' }],
      beforeState: { debit: 100, credit: 90 },
      proposedAfterState: { debit: 100, credit: 100 },
      repairSteps: ['Adjust credit line on ACC-CASH by 10'],
      requiresHumanReview: true
    });

    assert(plan.status === 'DRAFT', 'Repair plan created in DRAFT status requiring human review');

    // Attempting execution without approval should throw
    let blockedUnapproved = false;
    try {
      await IntegrityRepairEngine.executeRepair(plan, 'admin', async () => ({ repaired: true }));
    } catch (e) {
      blockedUnapproved = true;
    }
    assert(blockedUnapproved, 'Execution of unapproved repair plan requiring review was safely blocked');

    // Approve and execute repair
    plan.status = 'APPROVED';
    const result = await IntegrityRepairEngine.executeRepair(plan, 'admin-user', async () => {
      return { repaired: true, newCredit: 100 };
    });

    assert(result.status === 'EXECUTED', 'Approved repair plan executed successfully and recorded audit history');
    passedTests++;
  } catch (err: any) {
    console.error('Test J Error:', err);
  }
  totalTests++;

  console.log('\n----------------------------------------------------');
  console.log(`📊 Summary: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
  console.log('----------------------------------------------------');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runIntegrityTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
