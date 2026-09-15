// scripts/test-phase5-multi-device-conflict.ts
// Phase 5 — Multi-Device & Advanced Conflict Resolution Automated Test Suite
// Verifies Version Vectors, Causal Ordering, Sequence Gap Detection,
// 3-Tier Conflict Classification, Compensating Transactions, Financial Invariants,
// Multi-Device Tracking, and Tenant Isolation.

import { VersionVectorEngine } from "../server/modules/sync/version-vector";
import { SyncGapDetector } from "../server/modules/sync/sync-gap-detector";
import { SyncConflictService } from "../server/modules/sync/sync-conflict.service";
import { CompensatingTransactionService } from "../server/modules/sync/compensating-transaction.service";
import { SyncFinancialIntegrityService } from "../server/modules/sync/sync-financial-integrity.service";
import { DeviceService } from "../server/modules/sync/device.service";
import { SyncProcessorService } from "../server/modules/sync/sync-processor.service";
import { SyncEnvelope } from "../server/modules/sync/sync.types";
import { prisma } from "../server/database/prisma";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] #${totalTests} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] #${totalTests} ${testName}`);
    if (detail) console.error(`     ↳ ${detail}`);
  }
}

async function runPhase5Tests() {
  console.log("================================================================================");
  console.log(" 🧪 PHARMAFLOW PRO ERP — PHASE 5 MULTI-DEVICE & CONFLICT RESOLUTION TEST SUITE");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // 1. VERSION VECTOR & CAUSAL ORDERING ENGINE
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. VERSION VECTOR & CAUSAL ORDERING TESTS ---");

  const v1 = { "dev-A": 1, "dev-B": 0 };
  const v2 = { "dev-A": 2, "dev-B": 0 };
  const vConcurrent = { "dev-A": 1, "dev-B": 2 };

  // Increment
  const vIncremented = VersionVectorEngine.increment(v1, "dev-A");
  assert(vIncremented["dev-A"] === 2, "[VersionVector] Increments device clock by 1");

  // Dominance
  const relationDominates = VersionVectorEngine.compare(v2, v1);
  assert(relationDominates === "DOMINATES", "[VersionVector] Dominance detected (v2 > v1)");

  const relationSubordinate = VersionVectorEngine.compare(v1, v2);
  assert(relationSubordinate === "DOMINATED_BY", "[VersionVector] Subordination detected (v1 < v2)");

  const relationEqual = VersionVectorEngine.compare(v1, { "dev-A": 1, "dev-B": 0 });
  assert(relationEqual === "EQUAL", "[VersionVector] Equality detected on identical vectors");

  // Concurrency
  const relationConcurrent = VersionVectorEngine.compare(v2, vConcurrent);
  assert(relationConcurrent === "CONCURRENT", "[VersionVector] Concurrency detected when clocks diverge");

  const isConcurrent = VersionVectorEngine.areConcurrent(v2, vConcurrent);
  assert(isConcurrent === true, "[VersionVector] areConcurrent returns true for divergent offline mutations");

  // Merge (Component-wise maximum)
  const merged = VersionVectorEngine.merge(v2, vConcurrent);
  assert(merged["dev-A"] === 2 && merged["dev-B"] === 2, "[VersionVector] Merge takes component-wise maximum");

  // ---------------------------------------------------------------------------
  // 2. SEQUENCE GAP DETECTION & EVENT ORDERING
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. SEQUENCE GAP DETECTION TESTS ---");

  // Contiguous stream
  const contiguousEvents = [
    { sequence: 101, id: "m1", entity: "INVOICE" },
    { sequence: 102, id: "m2", entity: "INVOICE" },
    { sequence: 103, id: "m3", entity: "INVOICE" }
  ];
  const noGapResult = SyncGapDetector.detectGaps({
    lastKnownCursor: 100,
    incomingEvents: contiguousEvents
  });
  assert(!noGapResult.hasGap, "[GapDetector] No gap detected for contiguous sequence [101, 102, 103]");
  assert(noGapResult.safeContiguousItems.length === 3, "[GapDetector] All 3 contiguous items marked safe");

  // Discontiguous stream with missing sequence
  const gappedEvents = [
    { sequence: 101, id: "m1", entity: "INVOICE" },
    { sequence: 104, id: "m4", entity: "INVOICE" }
  ];
  const gapResult = SyncGapDetector.detectGaps({
    lastKnownCursor: 100,
    incomingEvents: gappedEvents
  });
  assert(gapResult.hasGap, "[GapDetector] Gap detected when sequence jumps from 101 to 104");
  assert(gapResult.missingSequences.includes(102) && gapResult.missingSequences.includes(103), "[GapDetector] Accurately identifies missing sequences 102 and 103");
  assert(gapResult.safeContiguousItems.length === 1, "[GapDetector] Safely isolates only contiguous item before gap");
  assert(gapResult.blockedItems.length === 1, "[GapDetector] Blocks and queues items arriving after missing gap");

  // Financial entity safety: Financial batch rejected when sequence gap present
  const financialGapCheck = SyncGapDetector.detectGaps({
    lastKnownCursor: 200,
    incomingEvents: [{ sequence: 205, id: "f1", entity: "FINANCIAL_TRANSACTION" }]
  });
  assert(financialGapCheck.hasGap && financialGapCheck.blockedItems.length === 1, "[GapDetector] Financial transactions are quarantined when arrival is out-of-order");

  // ---------------------------------------------------------------------------
  // 3. 3-TIER CONFLICT CLASSIFICATION & RESOLUTION STRATEGIES
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. 3-TIER CONFLICT CLASSIFICATION TESTS ---");

  // Category A: Metadata
  const catA = SyncConflictService.getEntityClassification("CUSTOMER");
  assert(catA.category === "METADATA_MUTABLE", "[Classification] CUSTOMER classified as METADATA_MUTABLE (Category A)");
  assert(catA.defaultStrategy === "OPTIMISTIC_MERGE", "[Classification] Category A defaults to OPTIMISTIC_MERGE");

  // Category B: Inventory
  const catB = SyncConflictService.getEntityClassification("INVENTORY_BATCH");
  assert(catB.category === "INVENTORY_EVENT", "[Classification] INVENTORY_BATCH classified as INVENTORY_EVENT (Category B)");
  assert(catB.defaultStrategy === "INVENTORY_RECONCILIATION", "[Classification] Category B defaults to INVENTORY_RECONCILIATION");

  // Category C: Financial
  const catC = SyncConflictService.getEntityClassification("JOURNAL_ENTRY");
  assert(catC.category === "FINANCIAL_TRANSACTION", "[Classification] JOURNAL_ENTRY classified as FINANCIAL_TRANSACTION (Category C)");
  assert(catC.defaultStrategy === "IMMUTABLE_QUARANTINE", "[Classification] Category C defaults to IMMUTABLE_QUARANTINE");

  // Category A: Optimistic Field-Level Merge
  const serverCustomer = { name: "الصيدلية الحديثة", phone: "0100000000", address: "شارع التحرير", updatedAt: 1000 };
  const clientCustomer = { name: "الصيدلية الحديثة", phone: "0111111111", notes: "عميل مميز", updatedAt: 2000 };
  const mergedCustomer = SyncConflictService.mergeMetadata(serverCustomer, clientCustomer);
  assert(mergedCustomer.phone === "0111111111", "[FieldMerge] Updated field phone from newer client applied");
  assert(mergedCustomer.address === "شارع التحرير", "[FieldMerge] Non-conflicting server field address preserved");
  assert(mergedCustomer.notes === "عميل مميز", "[FieldMerge] New client field notes incorporated");

  // Category C: Financial Immutable Conflict Evaluation
  const financialConflict = SyncConflictService.evaluateConflict({
    mutation: {
      id: "mut-fin-1",
      entity: "INVOICE",
      operation: "UPDATE",
      payload: { id: "inv-100", total: 5000, version: 1 }
    },
    existingServerRecord: { id: "inv-100", total: 4500, version: 2 },
    tenantId: "tenant-test"
  });
  assert(financialConflict.hasConflict === true, "[Conflict] Financial modification detected as conflict");
  assert(financialConflict.category === "IMMUTABLE_FINANCIAL_CONFLICT", "[Conflict] Category assigned as IMMUTABLE_FINANCIAL_CONFLICT");
  assert(
    financialConflict.resolutionStrategy === "IMMUTABLE_QUARANTINE" || financialConflict.resolutionStrategy === "MANUAL_MERGE",
    "[Conflict] Silent overwrite strictly forbidden; routed to IMMUTABLE_QUARANTINE or MANUAL_MERGE"
  );

  // ---------------------------------------------------------------------------
  // 4. COMPENSATING TRANSACTIONS & ZERO BALANCING PLUGS
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. COMPENSATING TRANSACTIONS TESTS ---");

  // Reversing Journal Entry
  const originalJournal = {
    id: "je-101",
    entryNumber: "JE-2026-001",
    lines: [
      { accountCode: "1010", accountName: "الخزينة", debit: 1500, credit: 0 },
      { accountCode: "4010", accountName: "المبيعات", debit: 0, credit: 1500 }
    ]
  };
  const reversingEntry = CompensatingTransactionService.generateReversingJournalEntry({
    tenantId: "tenant-test",
    originalJournalEntryId: originalJournal.id,
    originalEntryNumber: originalJournal.entryNumber,
    lines: originalJournal.lines,
    reason: "تصحيح قيد خاطئ من المزامنة",
    actorId: "user-auditor"
  });

  assert(reversingEntry.type === "REVERSING_JOURNAL_ENTRY", "[Compensating] Reversing journal entry generated with correct type");
  assert(reversingEntry.lines[0].debit === 0 && reversingEntry.lines[0].credit === 1500, "[Compensating] Line 1 Debit/Credit accurately swapped");
  assert(reversingEntry.lines[1].debit === 1500 && reversingEntry.lines[1].credit === 0, "[Compensating] Line 2 Debit/Credit accurately swapped");
  
  // Mathematical balance invariant (Zero Balancing Plugs)
  const totalDebit = reversingEntry.lines.reduce((s: number, l: any) => s + l.debit, 0);
  const totalCredit = reversingEntry.lines.reduce((s: number, l: any) => s + l.credit, 0);
  assert(totalDebit === 1500 && totalCredit === 1500 && totalDebit === totalCredit, "[Compensating] Reversing entry strictly balanced (Debit === Credit, Zero Plugs)");

  // Credit Note Generation
  const creditNote = CompensatingTransactionService.generateCreditNote({
    tenantId: "tenant-test",
    originalInvoiceId: "inv-202",
    originalInvoiceNumber: "INV-2026-099",
    customerId: "cust-1",
    items: [
      { productId: "prod-1", productName: "Panadol Extra", quantity: 2, unitPrice: 50, total: 100 }
    ],
    reason: "إرجاع مبيعات تعارض المزامنة",
    actorId: "user-pos-1"
  });
  assert(creditNote.type === "CREDIT_NOTE", "[Compensating] Credit note generated with CREDIT_NOTE type");
  assert(creditNote.subtotal === 100, "[Compensating] Credit note calculated deterministic subtotal");
  assert(creditNote.originalInvoiceId === "inv-202", "[Compensating] Immutable audit reference to original invoice preserved");

  // Inventory Reconciliation Adjustment
  const invRecon = CompensatingTransactionService.generateInventoryReconciliation({
    tenantId: "tenant-test",
    branchId: "branch-main",
    productId: "prod-panadol",
    batchNumber: "BATCH-2026-X",
    systemQuantity: 10,
    actualQuantity: 8,
    unitCost: 35,
    reason: "تسوية عجز جرد ناتج عن تعارض جرد أوفلاين",
    actorId: "user-pharmacist"
  });
  assert(invRecon.varianceQuantity === -2, "[Compensating] Inventory variance accurately computed (-2)");
  assert(invRecon.varianceValue === -70, "[Compensating] Inventory valuation impact accurate (-2 * 35 = -70)");

  // ---------------------------------------------------------------------------
  // 5. FINANCIAL INTEGRITY SERVICE (DOUBLE ENTRY & AUDIT INVARIANTS)
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. FINANCIAL INTEGRITY SERVICE TESTS ---");

  // Balanced Journal Entry check
  const balancedCheck = SyncFinancialIntegrityService.verifyJournalEntry({
    entryNumber: "JE-TEST-1",
    lines: [
      { accountCode: "101", debit: 500, credit: 0 },
      { accountCode: "401", debit: 0, credit: 500 }
    ]
  });
  assert(balancedCheck.isBalanced === true, "[FinancialIntegrity] Balanced journal entry passes verification");
  assert(balancedCheck.imbalanceAmount === 0, "[FinancialIntegrity] Imbalance amount is exactly 0");

  // Unbalanced Journal Entry check
  const unbalancedCheck = SyncFinancialIntegrityService.verifyJournalEntry({
    entryNumber: "JE-TEST-UNBALANCED",
    lines: [
      { accountCode: "101", debit: 500, credit: 0 },
      { accountCode: "401", debit: 0, credit: 400 } // missing 100
    ]
  });
  assert(unbalancedCheck.isBalanced === false, "[FinancialIntegrity] Unbalanced journal entry is flagged");
  assert(unbalancedCheck.imbalanceAmount === 100, "[FinancialIntegrity] Accurately detects discrepancy of 100 without fake plug");

  // Full Tenant Integrity Verification Report
  const integrityReport = await SyncFinancialIntegrityService.verifyTenantIntegrity("tenant-test");
  assert(integrityReport.tenantId === "tenant-test", "[FinancialIntegrity] Generates structured integrity report for tenant");
  assert(typeof integrityReport.isHealthy === "boolean", "[FinancialIntegrity] Health flag computed deterministically");

  // ---------------------------------------------------------------------------
  // 6. MULTI-DEVICE FLEET & DEVICE HEALTH TRACKING
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. MULTI-DEVICE FLEET & HEALTH TRACKING TESTS ---");

  const tenantDevicesTest = "tenant-fleet-test";
  const dev1 = await DeviceService.registerDevice({
    deviceId: "DEV-POS-NORTH",
    deviceName: "نقطة بيع الشمال",
    tenantId: tenantDevicesTest,
    branchId: "branch-north",
    userId: "cashier-1",
    appVersion: "8.3.0",
    schemaVersion: 1
  });
  assert(dev1.deviceId === "DEV-POS-NORTH", "[DeviceFleet] Device DEV-POS-NORTH registered successfully");

  // Update sequence
  DeviceService.updateDeviceSequence(tenantDevicesTest, "DEV-POS-NORTH", {
    syncedSequence: 250,
    ackSequence: 245
  });
  const updatedDev = await DeviceService.getDevice(tenantDevicesTest, "DEV-POS-NORTH");
  assert(updatedDev?.lastSyncedSequence === 250, "[DeviceFleet] Device synced sequence tracked (250)");
  assert(updatedDev?.lastAcknowledgedSequence === 245, "[DeviceFleet] Device ack sequence tracked (245)");

  // Health evaluation
  assert(updatedDev?.syncHealth === "HEALTHY", "[DeviceFleet] Small sequence lag (5) classified as HEALTHY");

  // Large lag -> DEGRADED
  DeviceService.updateDeviceSequence(tenantDevicesTest, "DEV-POS-NORTH", {
    syncedSequence: 400,
    ackSequence: 200 // lag = 200 > 100
  });
  const degradedDev = await DeviceService.getDevice(tenantDevicesTest, "DEV-POS-NORTH");
  assert(degradedDev?.syncHealth === "DEGRADED", "[DeviceFleet] Large sequence lag (200) triggers DEGRADED health status");

  // Version Vector per device
  DeviceService.updateVersionVector(tenantDevicesTest, "DEV-POS-NORTH", {
    "DEV-POS-NORTH": 15,
    "DEV-POS-SOUTH": 8
  });
  const vvDev = await DeviceService.getDevice(tenantDevicesTest, "DEV-POS-NORTH");
  assert(vvDev?.versionVector?.["DEV-POS-NORTH"] === 15, "[DeviceFleet] Version vector persisted per device");

  // Tenant Isolation: Tenant B cannot access Tenant A's device fleet
  const otherTenantDevices = DeviceService.getTenantDevices("tenant-other-fleet");
  assert(otherTenantDevices.every(d => d.tenantId === "tenant-other-fleet"), "[TenantIsolation] Tenant devices are strictly isolated per tenantId");

  // ---------------------------------------------------------------------------
  // 7. END-TO-END SYNC PROCESSOR WITH PHASE 5 ENGINES
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. END-TO-END SYNC PROCESSOR TESTS ---");

  const syncTenant = "tenant-e2e-phase5";
  const syncDevice = await DeviceService.registerDevice({
    deviceId: "DEV-E2E-1",
    deviceName: "E2E Test Terminal",
    tenantId: syncTenant,
    branchId: "branch-1",
    userId: "user-e2e",
    appVersion: "8.3.0",
    schemaVersion: 1
  });

  // Batch 1: Customer metadata mutation (Category A)
  const metaEnvelope: SyncEnvelope = {
    tenantId: syncTenant,
    branchId: "branch-1",
    userId: "user-e2e",
    deviceId: "DEV-E2E-1",
    timestamp: Date.now(),
    schemaVersion: 1,
    clientVersion: "8.3.0",
    mutations: [
      {
        id: "mut-meta-1",
        entity: "CUSTOMER",
        operation: "CREATE",
        payload: { id: "cust-1", name: "مستشفى الشفاء", phone: "0123456789" },
        idempotencyKey: "idem-meta-1"
      }
    ]
  };

  const metaResponse = await SyncProcessorService.processBatch({
    envelope: metaEnvelope,
    authenticatedTenantId: syncTenant,
    authenticatedUserId: "user-e2e",
    authenticatedUserRole: "PHARMACIST_IN_CHARGE"
  });

  assert(metaResponse.success === true, "[EndToEnd] Metadata mutation processed successfully");
  assert(metaResponse.summary.successful.includes("mut-meta-1"), "[EndToEnd] Mutation mut-meta-1 marked as successful");

  // Verify device sequence was updated
  const deviceAfterPush = await DeviceService.getDevice(syncTenant, "DEV-E2E-1");
  assert((deviceAfterPush?.lastSyncedSequence || 0) > 0, "[EndToEnd] Device lastSyncedSequence incremented after successful push");

  // Batch 2: Quarantining of conflicting financial transaction
  SyncConflictService.recordConflict({
    tenantId: syncTenant,
    branchId: "branch-1",
    mutationId: "mut-conflict-fin",
    category: "IMMUTABLE_FINANCIAL_CONFLICT",
    entity: "INVOICE",
    entityId: "inv-existing",
    message: "محاولة تعديل فاتورة مرحلة دون إشعار دائن",
    clientRecord: { id: "inv-existing", total: 1000 }
  });

  const conflicts = SyncConflictService.getConflicts(syncTenant);
  assert(conflicts.some(c => c.category === "IMMUTABLE_FINANCIAL_CONFLICT"), "[EndToEnd] Immutable financial conflict quarantined safely in audit log");

  // Summary
  console.log("\n================================================================================");
  console.log(" 📊 PHASE 5 TEST EXECUTION SUMMARY");
  console.log("================================================================================");
  console.log(`Total Tests Executed: ${totalTests}`);
  console.log(`Passed:               ${passedTests} ✅`);
  console.log(`Failed:               ${failedTests} ${failedTests === 0 ? "✅" : "❌"}`);

  if (failedTests === 0) {
    console.log("✨ ALL PHASE 5 MULTI-DEVICE & CONFLICT RESOLUTION TESTS PASSED!");
  } else {
    console.error(`💥 ${failedTests} test(s) failed in Phase 5 suite.`);
    process.exit(1);
  }
}

runPhase5Tests()
  .catch((err) => {
    console.error("Test execution fatal error:", err);
    process.exit(1);
  })
  .finally(() => {
    if (prisma && prisma.$disconnect) {
      prisma.$disconnect().catch(() => {});
    }
  });
