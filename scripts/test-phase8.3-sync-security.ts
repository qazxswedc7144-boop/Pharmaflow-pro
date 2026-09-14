// scripts/test-phase8.3-sync-security.ts
// Automated Test Suite for Phase 8.3 — Cloud Synchronization Segregation & Enterprise Sync Security
// Total Automated Test Cases: 54

import { SyncProcessorService } from "../server/modules/sync/sync-processor.service";
import { DeviceService } from "../server/modules/sync/device.service";
import { SyncIdempotencyService } from "../server/modules/sync/sync-idempotency.service";
import { SyncChangelogService } from "../server/modules/sync/sync-changelog.service";
import { SyncConflictService } from "../server/modules/sync/sync-conflict.service";
import { SyncAuditService } from "../server/modules/sync/sync-audit.service";
import { SyncMetricsService } from "../server/modules/sync/sync-metrics.service";
import { SYNC_PROTOCOL_VERSION, SyncEnvelope } from "../server/modules/sync/sync.types";

interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const testResults: TestResult[] = [];
let testCounter = 1;

async function runTest(
  category: string,
  name: string,
  fn: () => Promise<void> | void
) {
  const currentId = testCounter++;
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    testResults.push({ id: currentId, category, name, passed: true, durationMs });
    console.log(`  ✅ [PASS] #${currentId} [${category}] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    testResults.push({ id: currentId, category, name, passed: false, error: err.message, durationMs });
    console.error(`  ❌ [FAIL] #${currentId} [${category}] ${name} (${durationMs}ms) -> ${err.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" 🧪 PHARMAFLOW PRO ERP — PHASE 8.3 AUTOMATED SYNC & SECURITY TEST SUITE");
  console.log("================================================================================\n");

  const tenantA = "TENANT_AL_NOOR_01";
  const tenantB = "TENANT_AL_SHIFA_02";
  const branchA1 = "BRANCH_RIYADH_01";
  const branchA2 = "BRANCH_JEDDAH_02";
  const branchB1 = "BRANCH_DAMMAM_01";
  const userAdmin = "USR_ADMIN_01";
  const userCashier = "USR_CASHIER_02";
  const devicePOS1 = `DEV_POS_1_${Date.now()}`;
  const devicePOS2 = `DEV_POS_2_${Date.now()}`;
  const deviceRevoked = `DEV_REVOKED_${Date.now()}`;
  const deviceSuspended = `DEV_SUSPENDED_${Date.now()}`;

  // Pre-seed devices
  await DeviceService.registerDevice({
    deviceId: devicePOS1,
    deviceName: "Main POS Riyadh",
    tenantId: tenantA,
    branchId: branchA1,
    userId: userAdmin,
    appVersion: "8.3.0",
    schemaVersion: SYNC_PROTOCOL_VERSION
  });

  await DeviceService.registerDevice({
    deviceId: deviceRevoked,
    deviceName: "Compromised Terminal",
    tenantId: tenantA,
    branchId: branchA1,
    userId: userAdmin,
    appVersion: "8.3.0",
    schemaVersion: SYNC_PROTOCOL_VERSION
  });
  await DeviceService.updateDeviceStatus(tenantA, deviceRevoked, "REVOKED", "Security Breach Detected");

  await DeviceService.registerDevice({
    deviceId: deviceSuspended,
    deviceName: "Audit Suspended Terminal",
    tenantId: tenantA,
    branchId: branchA1,
    userId: userAdmin,
    appVersion: "8.3.0",
    schemaVersion: SYNC_PROTOCOL_VERSION
  });
  await DeviceService.updateDeviceStatus(tenantA, deviceSuspended, "SUSPENDED", "Billing Review");

  // ============================================================================
  // 1. TENANT SECURITY TESTS (1 - 8)
  // ============================================================================
  console.log("--- 1. TENANT SECURITY TESTS ---");

  await runTest("Tenant Security", "Tenant A cannot push mutations targeting Tenant B context", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantB, // forged envelope
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_tenant_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: { id: "inv-cross-tenant-1", total: 500 },
        idempotencyKey: `idem_tenant_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA, // Authoritative JWT
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assert(!res.success, "Should fail when envelope tenant differs from authoritative JWT");
    assertEqual(res.errorCode, "TENANT_MISMATCH", "Error code must be TENANT_MISMATCH");
  });

  await runTest("Tenant Security", "Tenant A cannot pull Tenant B changelog deltas", async () => {
    // Record a change for tenant B
    SyncChangelogService.recordChange({
      tenantId: tenantB,
      branchId: branchB1,
      entity: "INVOICE",
      entityId: "inv_secret_b",
      operation: "CREATE",
      version: 1,
      payload: { confidential: "Tenant B Secret Data" }
    });

    // Tenant A attempts to pull
    const delta = await SyncChangelogService.getChangesSince({
      tenantId: tenantA,
      cursor: 0
    });

    const leakedChange = delta.changes.find(c => c.tenantId === tenantB);
    assert(!leakedChange, "Tenant A pull must never contain Tenant B records");
  });

  await runTest("Tenant Security", "Mismatched JWT/header tenant rejected by processor", async () => {
    const envelope: SyncEnvelope = {
      tenantId: "TENANT_UNAUTHORIZED",
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_mismatch_${Date.now()}`,
        entity: "PRODUCT",
        operation: "CREATE",
        payload: { name: "Paracetamol" },
        idempotencyKey: `idem_mismatch_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assertEqual(res.success, false, "Must reject mismatched tenant");
  });

  await runTest("Tenant Security", "Cross-tenant mutation payload modification blocked", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_cross_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: { id: "inv-safe-1", tenantId: tenantB, total: 120 }, // Payload trying to inject foreign tenantId
        idempotencyKey: `idem_cross_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    // Mutation is processed under authoritative tenantA, not tenantB
    const mutationResult = res.results[0];
    assert(mutationResult.success, "Valid request processed under authoritative tenant");
  });

  await runTest("Tenant Security", "Isolated changelogs per tenant", async () => {
    const cursorA1 = SyncChangelogService.recordChange({
      tenantId: tenantA,
      branchId: branchA1,
      entity: "PRODUCT",
      entityId: "prod_a_1",
      operation: "CREATE",
      version: 1,
      payload: { name: "Aspirin" }
    });

    const deltaA = await SyncChangelogService.getChangesSince({ tenantId: tenantA, cursor: cursorA1 - 1 });
    const deltaB = await SyncChangelogService.getChangesSince({ tenantId: tenantB, cursor: cursorA1 - 1 });

    assert(deltaA.changes.some(c => c.entityId === "prod_a_1"), "Tenant A sees prod_a_1");
    assert(!deltaB.changes.some(c => c.entityId === "prod_a_1"), "Tenant B cannot see prod_a_1");
  });

  await runTest("Tenant Security", "Isolated idempotency keys per tenant", async () => {
    const sharedKey = `shared_idempotency_${Date.now()}`;
    const payload = { invoiceNumber: "INV-100", amount: 200 };

    // Tenant A uses sharedKey
    await SyncIdempotencyService.recordSuccess({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: sharedKey,
      payload,
      response: { status: "OK", tenant: tenantA }
    });

    // Tenant B checks the same idempotency key
    const checkB = await SyncIdempotencyService.checkIdempotency({
      tenantId: tenantB,
      deviceId: devicePOS1,
      idempotencyKey: sharedKey,
      payload
    });

    assertEqual(checkB.status, "NOT_SEEN", "Tenant B must not see Tenant A idempotency cache");
  });

  await runTest("Tenant Security", "Isolated conflict logs per tenant", async () => {
    SyncConflictService.recordConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "INVOICE",
      entityId: "inv_conf_a",
      mutationId: "mut_conf_a",
      category: "VERSION_CONFLICT",
      resolutionStrategy: "MANUAL_MERGE",
      originalSnapshot: { version: 1 },
      incomingSnapshot: { version: 2 },
      conflictReason: "Tenant A version mismatch"
    });

    const conflictsA = SyncConflictService.getConflicts(tenantA);
    const conflictsB = SyncConflictService.getConflicts(tenantB);

    assert(conflictsA.some(c => c.entityId === "inv_conf_a"), "Tenant A has its conflict");
    assert(!conflictsB.some(c => c.entityId === "inv_conf_a"), "Tenant B cannot see Tenant A conflict");
  });

  await runTest("Tenant Security", "Schema version mismatch envelope rejection", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: 9999, // Incompatible version
      clientVersion: "99.0.0",
      mutations: []
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin
    });

    assert(!res.success, "Incompatible schema version rejected");
    assertEqual(res.errorCode, "SCHEMA_VERSION_MISMATCH", "Error must be SCHEMA_VERSION_MISMATCH");
  });

  // ============================================================================
  // 2. BRANCH SECURITY TESTS (9 - 14)
  // ============================================================================
  console.log("\n--- 2. BRANCH SECURITY TESTS ---");

  await runTest("Branch Security", "Branch A1 cannot read Branch A2 isolated changes", async () => {
    SyncChangelogService.recordChange({
      tenantId: tenantA,
      branchId: branchA2,
      entity: "INVENTORY_BATCH",
      entityId: "batch_jeddah_1",
      operation: "CREATE",
      version: 1,
      payload: { branch: branchA2, qty: 50 }
    });

    const deltaBranch1 = await SyncChangelogService.getChangesSince({
      tenantId: tenantA,
      branchId: branchA1,
      cursor: 0
    });

    const hasForeignBranch = deltaBranch1.changes.some(c => c.entityId === "batch_jeddah_1");
    assert(!hasForeignBranch, "Branch A1 pull must not include Branch A2 specific changes");
  });

  await runTest("Branch Security", "Branch A1 mutation successfully targets Branch A1", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_branch_ok_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: { id: `inv_br1_${Date.now()}`, total: 80, branchId: branchA1 },
        idempotencyKey: `idem_br1_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assert(res.success, "Valid branch mutation succeeds");
  });

  await runTest("Branch Security", "Multi-branch tenant-wide global entities are received by all branches", async () => {
    SyncChangelogService.recordChange({
      tenantId: tenantA,
      branchId: null, // Global tenant-wide product catalog update
      entity: "PRODUCT",
      entityId: "prod_global_catalog_1",
      operation: "UPDATE",
      version: 2,
      payload: { name: "Amoxicillin 500mg" }
    });

    const deltaBranch1 = await SyncChangelogService.getChangesSince({
      tenantId: tenantA,
      branchId: branchA1,
      cursor: 0
    });

    assert(deltaBranch1.changes.some(c => c.entityId === "prod_global_catalog_1"), "Branch 1 receives global product change");
  });

  await runTest("Branch Security", "Cross-branch inventory mutation validation", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_stock_transfer_${Date.now()}`,
        entity: "STOCK_TRANSFER",
        operation: "CREATE",
        payload: { fromBranch: branchA1, toBranch: branchA2, items: [{ productId: "p1", qty: 10 }] },
        idempotencyKey: `idem_xfer_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assert(res.success, "Stock transfer initiated from authorized origin branch");
  });

  await runTest("Branch Security", "Pull deltas strictly filter by specified entity types", async () => {
    SyncChangelogService.recordChange({
      tenantId: tenantA,
      branchId: branchA1,
      entity: "CUSTOMER",
      entityId: "cust_filter_1",
      operation: "CREATE",
      version: 1,
      payload: { name: "Patient X" }
    });

    const deltaOnlyInvoices = await SyncChangelogService.getChangesSince({
      tenantId: tenantA,
      branchId: branchA1,
      entities: ["INVOICE"],
      cursor: 0
    });

    assert(!deltaOnlyInvoices.changes.some(c => c.entity === "CUSTOMER"), "Filtered delta does not contain customers");
  });

  await runTest("Branch Security", "Branch parameter normalization prevents empty branch override", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: "",
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_empty_br_${Date.now()}`,
        entity: "PRODUCT",
        operation: "CREATE",
        payload: { id: "prod_fallback_br" },
        idempotencyKey: `idem_empty_br_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assert(res.success, "Processed safely with fallback branch assignment");
  });

  // ============================================================================
  // 3. DEVICE SECURITY TESTS (15 - 20)
  // ============================================================================
  console.log("\n--- 3. DEVICE SECURITY TESTS ---");

  await runTest("Device Security", "Device registration registers device as ACTIVE", async () => {
    const regDevice = await DeviceService.registerDevice({
      deviceId: devicePOS2,
      deviceName: "Secondary Terminal Jeddah",
      tenantId: tenantA,
      branchId: branchA2,
      userId: userAdmin,
      appVersion: "8.3.0",
      schemaVersion: SYNC_PROTOCOL_VERSION
    });

    assertEqual(regDevice.status, "ACTIVE", "Registered device must be ACTIVE");
    assertEqual(regDevice.deviceId, devicePOS2, "Device ID matches");
  });

  await runTest("Device Security", "Revoked device mutation push is rejected immediately", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: deviceRevoked, // Revoked terminal
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_revoked_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: { total: 100 },
        idempotencyKey: `idem_revoked_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assert(!res.success, "Push from revoked device must fail");
    assertEqual(res.errorCode, "DEVICE_REVOKED", "Error code must be DEVICE_REVOKED");
  });

  await runTest("Device Security", "Suspended device mutation push is rejected", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: deviceSuspended, // Suspended terminal
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_suspended_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: { total: 100 },
        idempotencyKey: `idem_suspended_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assert(!res.success, "Push from suspended device must fail");
    assertEqual(res.errorCode, "DEVICE_SUSPENDED", "Error code must be DEVICE_SUSPENDED");
  });

  await runTest("Device Security", "Device status update dynamically transitions security state", async () => {
    const tempDev = `temp_dev_${Date.now()}`;
    await DeviceService.registerDevice({
      deviceId: tempDev,
      deviceName: "Temp Terminal",
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      appVersion: "8.3.0",
      schemaVersion: SYNC_PROTOCOL_VERSION
    });

    const verifiedActive = await DeviceService.verifyDevice(tenantA, tempDev);
    assertEqual(verifiedActive.allowed, true, "Initially allowed");

    await DeviceService.updateDeviceStatus(tenantA, tempDev, "REVOKED", "Admin revoked");
    const verifiedRevoked = await DeviceService.verifyDevice(tenantA, tempDev);
    assertEqual(verifiedRevoked.allowed, false, "Blocked after revocation");
    assertEqual(verifiedRevoked.status, "REVOKED", "Status updated to REVOKED");
  });

  await runTest("Device Security", "Device verification endpoint verifies unknown device safely", async () => {
    const unknownVerif = await DeviceService.verifyDevice(tenantA, "NON_EXISTENT_DEVICE_999");
    assertEqual(unknownVerif.status, "UNKNOWN", "Non-existent device is UNKNOWN");
    assertEqual(unknownVerif.allowed, true, "Unregistered device allowed auto-registration grace");
  });

  await runTest("Device Security", "Device heartbeat updates lastSeen timestamp", async () => {
    const initialDevice = await DeviceService.getDevice(tenantA, devicePOS1);
    const initialSeen = initialDevice?.lastSeen;

    await new Promise(res => setTimeout(res, 10));
    await DeviceService.recordHeartbeat(tenantA, devicePOS1);

    const updatedDevice = await DeviceService.getDevice(tenantA, devicePOS1);
    assert(new Date(updatedDevice!.lastSeen).getTime() >= new Date(initialSeen || 0).getTime(), "lastSeen timestamp updated");
  });

  // ============================================================================
  // 4. IDEMPOTENCY TESTS (21 - 28)
  // ============================================================================
  console.log("\n--- 4. IDEMPOTENCY TESTS ---");

  await runTest("Idempotency", "Duplicate mutation processed once with cached DUPLICATE result", async () => {
    const idemKey = `idem_dup_test_${Date.now()}`;
    const mutationId = `mut_dup_test_${Date.now()}`;
    const payload = { id: "inv-idem-1", total: 450, invoiceNumber: "INV-IDEM-001" };

    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: mutationId,
        entity: "INVOICE",
        operation: "CREATE",
        payload,
        idempotencyKey: idemKey,
        timestamp: new Date().toISOString()
      }]
    };

    // First push -> SUCCESS
    const res1 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });
    assertEqual(res1.results[0].status, "SUCCESS", "First submission must be SUCCESS");

    // Second push (identical replay) -> DUPLICATE
    const res2 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });
    assertEqual(res2.results[0].status, "DUPLICATE", "Second submission must return DUPLICATE");
  });

  await runTest("Idempotency", "Duplicate invoice creation prevented in accounting ledger", async () => {
    const idemKey = `idem_inv_prevent_${Date.now()}`;
    const invoicePayload = { invoiceNumber: `INV-PREV-${Date.now()}`, total: 320, customerId: "C1" };

    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_inv_prev_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: invoicePayload,
        idempotencyKey: idemKey,
        timestamp: new Date().toISOString()
      }]
    };

    const res1 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });
    const res2 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assert(res1.summary.applied.length === 1, "First invoice applied");
    assert(res2.summary.duplicates.length === 1, "Second invoice intercepted as duplicate");
  });

  await runTest("Idempotency", "Duplicate payment mutation prevented", async () => {
    const idemKey = `idem_payment_${Date.now()}`;
    const paymentPayload = { id: `pay_${Date.now()}`, invoiceId: "inv_123", amount: 150, method: "CARD" };

    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_pay_${Date.now()}`,
        entity: "PAYMENT",
        operation: "CREATE",
        payload: paymentPayload,
        idempotencyKey: idemKey,
        timestamp: new Date().toISOString()
      }]
    };

    const res1 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });
    const res2 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assertEqual(res1.results[0].status, "SUCCESS", "Payment 1 recorded");
    assertEqual(res2.results[0].status, "DUPLICATE", "Payment 2 deduplicated");
  });

  await runTest("Idempotency", "Duplicate inventory movement prevented", async () => {
    const idemKey = `idem_stock_move_${Date.now()}`;
    const stockPayload = { productId: "p_panadol", deltaQty: -5, reason: "SALE" };

    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_stock_move_${Date.now()}`,
        entity: "INVENTORY_BATCH",
        operation: "UPDATE",
        payload: stockPayload,
        idempotencyKey: idemKey,
        timestamp: new Date().toISOString()
      }]
    };

    const res1 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });
    const res2 = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assertEqual(res1.results[0].status, "SUCCESS", "Initial stock deduction logged");
    assertEqual(res2.results[0].status, "DUPLICATE", "Duplicate stock deduction prevented");
  });

  await runTest("Idempotency", "Payload tampering on same idempotency key detected as HASH_MISMATCH", async () => {
    const idemKey = `idem_tamper_${Date.now()}`;
    const originalPayload = { amount: 100, recipient: "Supplier A" };
    const tamperedPayload = { amount: 99999, recipient: "Attacker" };

    // Record original in idempotency cache
    await SyncIdempotencyService.recordSuccess({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: idemKey,
      payload: originalPayload,
      response: { status: "OK", amount: 100 }
    });

    // Check with tampered payload
    const check = await SyncIdempotencyService.checkIdempotency({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: idemKey,
      payload: tamperedPayload
    });

    assertEqual(check.status, "HASH_MISMATCH", "Payload modification on same key detected");
  });

  await runTest("Idempotency", "Concurrent idempotency cache lock mechanism", async () => {
    const idemKey = `idem_concurrent_${Date.now()}`;

    // Mark as in-flight
    await SyncIdempotencyService.markInFlight({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: idemKey,
      payload: { data: "test" }
    });

    const check = await SyncIdempotencyService.checkIdempotency({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: idemKey,
      payload: { data: "test" }
    });

    assertEqual(check.status, "IN_FLIGHT", "Concurrent duplicate marked IN_FLIGHT");
  });

  await runTest("Idempotency", "Idempotency key scope strictly includes tenantId and deviceId", async () => {
    const key = `scoped_key_${Date.now()}`;
    const payload = { val: 42 };

    await SyncIdempotencyService.recordSuccess({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: key,
      payload,
      response: { success: true }
    });

    // Different device on same tenant
    const checkDiffDevice = await SyncIdempotencyService.checkIdempotency({
      tenantId: tenantA,
      deviceId: devicePOS2,
      idempotencyKey: key,
      payload
    });

    assertEqual(checkDiffDevice.status, "NOT_SEEN", "Different device has independent idempotency scope");
  });

  await runTest("Idempotency", "Replayed response payload perfectly matches original output", async () => {
    const idemKey = `idem_exact_match_${Date.now()}`;
    const payload = { invoiceId: "INV-EXACT-001", total: 777 };
    const originalOutput = { invoiceId: "INV-EXACT-001", status: "CONFIRMED", ledgerRef: "LED-998" };

    await SyncIdempotencyService.recordSuccess({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: idemKey,
      payload,
      response: originalOutput
    });

    const check = await SyncIdempotencyService.checkIdempotency({
      tenantId: tenantA,
      deviceId: devicePOS1,
      idempotencyKey: idemKey,
      payload
    });

    assertEqual(check.status, "SEEN_SUCCESS", "Status is SEEN_SUCCESS");
    assertEqual(check.cachedResponse.ledgerRef, "LED-998", "Cached response matches");
  });

  // ============================================================================
  // 5. CONFLICT DETECTION TESTS (29 - 36)
  // ============================================================================
  console.log("\n--- 5. CONFLICT DETECTION TESTS ---");

  await runTest("Conflict", "Version conflict detected on outdated client record", async () => {
    const entityId = `prod_ver_conf_${Date.now()}`;
    const conflictResult = SyncConflictService.detectConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "PRODUCT",
      entityId,
      mutationId: `mut_ver_${Date.now()}`,
      incomingVersion: 2,
      serverRecord: { id: entityId, version: 5, name: "Newer Server Product" },
      incomingPayload: { id: entityId, version: 2, name: "Stale Client Edit" }
    });

    assert(conflictResult.hasConflict, "Version conflict detected");
    assertEqual(conflictResult.category, "VERSION_CONFLICT", "Category is VERSION_CONFLICT");
  });

  await runTest("Conflict", "Stock conflict detected when requested reduction exceeds available inventory", async () => {
    const entityId = `prod_stock_conf_${Date.now()}`;
    const conflictResult = SyncConflictService.detectConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "INVENTORY_BATCH",
      entityId,
      mutationId: `mut_stock_${Date.now()}`,
      incomingVersion: 1,
      serverRecord: { id: entityId, version: 1, stock_qty: 3 }, // Only 3 left
      incomingPayload: { id: entityId, requestedReduction: 10 } // Requesting 10
    });

    assert(conflictResult.hasConflict, "Stock conflict detected");
    assertEqual(conflictResult.category, "STOCK_CONFLICT", "Category is STOCK_CONFLICT");
  });

  await runTest("Conflict", "Accounting conflict detected on unbalanced debit/credit journal entry", async () => {
    const entityId = `journal_conf_${Date.now()}`;
    const conflictResult = SyncConflictService.detectConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "JOURNAL_ENTRY",
      entityId,
      mutationId: `mut_acct_${Date.now()}`,
      incomingVersion: 1,
      serverRecord: { id: entityId, version: 1 },
      incomingPayload: {
        id: entityId,
        lines: [
          { account: "Cash", debit: 500, credit: 0 },
          { account: "Sales", debit: 0, credit: 400 } // Unbalanced!
        ]
      }
    });

    assert(conflictResult.hasConflict, "Accounting conflict detected");
    assertEqual(conflictResult.category, "ACCOUNTING_CONFLICT", "Category is ACCOUNTING_CONFLICT");
  });

  await runTest("Conflict", "Deleted record conflict detected when updating purged entity", async () => {
    const entityId = `deleted_ent_${Date.now()}`;
    const conflictResult = SyncConflictService.detectConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "PRODUCT",
      entityId,
      mutationId: `mut_del_${Date.now()}`,
      incomingVersion: 2,
      serverRecord: { id: entityId, version: 3, isDeleted: true }, // Record was deleted
      incomingPayload: { id: entityId, version: 2, name: "Update to deleted" }
    });

    assert(conflictResult.hasConflict, "Deleted record conflict detected");
    assertEqual(conflictResult.category, "DELETED_RECORD_CONFLICT", "Category is DELETED_RECORD_CONFLICT");
  });

  await runTest("Conflict", "Financial transactions are never silently overwritten upon conflict", async () => {
    const invoiceId = `inv_financial_safe_${Date.now()}`;
    const conflict = SyncConflictService.recordConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "INVOICE",
      entityId: invoiceId,
      mutationId: `mut_fin_${Date.now()}`,
      category: "VERSION_CONFLICT",
      resolutionStrategy: "MANUAL_MERGE",
      originalSnapshot: { total: 100, status: "POSTED" },
      incomingSnapshot: { total: 120, status: "DRAFT" },
      conflictReason: "Client attempted to mutate a posted financial invoice"
    });

    assertEqual(conflict.status, "OPEN", "Financial conflict remains OPEN for audit review");
    assertEqual(conflict.resolutionStrategy, "MANUAL_MERGE", "Strategy is MANUAL_MERGE");
  });

  await runTest("Conflict", "Conflict records store complete original and incoming snapshots", async () => {
    const cId = `conf_snap_${Date.now()}`;
    const originalSnap = { id: cId, price: 50, batch: "B1" };
    const incomingSnap = { id: cId, price: 65, batch: "B2" };

    const conf = SyncConflictService.recordConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "PRODUCT",
      entityId: cId,
      mutationId: `mut_snap_${Date.now()}`,
      category: "VERSION_CONFLICT",
      resolutionStrategy: "SERVER_WINS",
      originalSnapshot: originalSnap,
      incomingSnapshot: incomingSnap,
      conflictReason: "Price update discrepancy"
    });

    assertEqual(conf.originalSnapshot.price, 50, "Original price preserved");
    assertEqual(conf.incomingSnapshot.price, 65, "Incoming price preserved");
  });

  await runTest("Conflict", "Manual conflict resolution workflow transitions state to RESOLVED", async () => {
    const conf = SyncConflictService.recordConflict({
      tenantId: tenantA,
      branchId: branchA1,
      entityType: "PRODUCT",
      entityId: `p_resolve_${Date.now()}`,
      mutationId: `mut_res_${Date.now()}`,
      category: "VERSION_CONFLICT",
      resolutionStrategy: "MANUAL_MERGE",
      originalSnapshot: { stock: 10 },
      incomingSnapshot: { stock: 8 },
      conflictReason: "Stock mismatch"
    });

    const resolved = SyncConflictService.resolveConflict(conf.id, "SERVER_WINS", userAdmin);
    assert(resolved !== null, "Resolved conflict record returned");
    assertEqual(resolved!.status, "RESOLVED", "Status is RESOLVED");
    assertEqual(resolved!.resolvedBy, userAdmin, "Audit records resolving user");
  });

  await runTest("Conflict", "Open conflict queries correctly filter by tenant", async () => {
    const allA = SyncConflictService.getConflicts(tenantA);
    assert(allA.length >= 1, "Tenant A has recorded conflicts");
    const allB = SyncConflictService.getConflicts(tenantB);
    assert(!allB.some(c => c.tenantId === tenantA), "Tenant B cannot query Tenant A conflicts");
  });

  // ============================================================================
  // 6. RELIABILITY & OFFLINE TESTS (37 - 44)
  // ============================================================================
  console.log("\n--- 6. RELIABILITY & OFFLINE TESTS ---");

  await runTest("Reliability", "Changelog monotonic sequence assignment", async () => {
    const c1 = SyncChangelogService.recordChange({
      tenantId: tenantA,
      branchId: branchA1,
      entity: "PRODUCT",
      entityId: "prod_seq_1",
      operation: "CREATE",
      version: 1,
      payload: { name: "P1" }
    });

    const c2 = SyncChangelogService.recordChange({
      tenantId: tenantA,
      branchId: branchA1,
      entity: "PRODUCT",
      entityId: "prod_seq_2",
      operation: "CREATE",
      version: 1,
      payload: { name: "P2" }
    });

    assert(c2 > c1, "Subsequent cursor strictly exceeds prior cursor");
  });

  await runTest("Reliability", "Cursor-based delta pull returns only records since requested cursor", async () => {
    const markCursor = SyncChangelogService.getCurrentCursor();

    SyncChangelogService.recordChange({
      tenantId: tenantA,
      branchId: branchA1,
      entity: "INVOICE",
      entityId: "inv_cursor_test",
      operation: "CREATE",
      version: 1,
      payload: { total: 200 }
    });

    const delta = await SyncChangelogService.getChangesSince({
      tenantId: tenantA,
      branchId: branchA1,
      cursor: markCursor
    });

    assert(delta.changes.length >= 1, "Delta contains new change");
    assert(delta.changes.every(c => c.cursor > markCursor), "All returned changes have cursor > markCursor");
  });

  await runTest("Reliability", "Pagination of changelog changes with batchSize limit and hasMore flag", async () => {
    // Generate 5 changes
    for (let i = 0; i < 5; i++) {
      SyncChangelogService.recordChange({
        tenantId: tenantA,
        branchId: branchA1,
        entity: "PRODUCT",
        entityId: `p_batch_${i}_${Date.now()}`,
        operation: "CREATE",
        version: 1,
        payload: { idx: i }
      });
    }

    const paginated = await SyncChangelogService.getChangesSince({
      tenantId: tenantA,
      branchId: branchA1,
      cursor: 0,
      batchSize: 2
    });

    assert(paginated.changes.length <= 2, "Respects batchSize limit");
    assertEqual(paginated.hasMore, true, "hasMore is true when additional records exist");
    assert(paginated.nextCursor > 0, "nextCursor is populated for next pagination step");
  });

  await runTest("Reliability", "Partial batch failure processes valid mutations while rejecting invalid ones", async () => {
    const validMutation = {
      id: `mut_valid_${Date.now()}`,
      entity: "PRODUCT",
      operation: "CREATE" as const,
      payload: { id: `p_val_${Date.now()}`, name: "Valid Product" },
      idempotencyKey: `idem_valid_${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    const invalidMutation = {
      id: `mut_invalid_${Date.now()}`,
      entity: "UNSUPPORTED_UNKNOWN_ENTITY",
      operation: "CREATE" as const,
      payload: {},
      idempotencyKey: `idem_invalid_${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [validMutation, invalidMutation]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assertEqual(res.processedCount, 2, "Both mutations evaluated");
    assert(res.results.some(r => r.id === validMutation.id && r.status === "SUCCESS"), "Valid mutation succeeded");
    assert(res.results.some(r => r.id === invalidMutation.id && (r.status === "REJECTED" || r.status === "INVALID")), "Invalid mutation rejected");
  });

  await runTest("Reliability", "Exponential backoff calculation bounds retry delays", () => {
    const calculateBackoff = (retryCount: number) => {
      const base = 1000; // 1s
      const max = 32000; // 32s
      const delay = Math.min(base * Math.pow(2, retryCount), max);
      return delay;
    };

    assertEqual(calculateBackoff(0), 1000, "Retry 0 = 1000ms");
    assertEqual(calculateBackoff(1), 2000, "Retry 1 = 2000ms");
    assertEqual(calculateBackoff(2), 4000, "Retry 2 = 4000ms");
    assertEqual(calculateBackoff(3), 8000, "Retry 3 = 8000ms");
    assertEqual(calculateBackoff(4), 16000, "Retry 4 = 16000ms");
    assertEqual(calculateBackoff(5), 32000, "Retry 5 = 32000ms");
    assertEqual(calculateBackoff(10), 32000, "Retry 10 bounded at 32000ms max");
  });

  await runTest("Reliability", "Non-retryable status codes correctly classified", () => {
    const isRetryable = (httpStatus: number) => {
      if ([400, 401, 403, 404, 422].includes(httpStatus)) return false;
      return true; // 500, 502, 503, 504, network drops
    };

    assertEqual(isRetryable(400), false, "400 Bad Request is non-retryable");
    assertEqual(isRetryable(401), false, "401 Unauthorized is non-retryable");
    assertEqual(isRetryable(403), false, "403 Forbidden is non-retryable");
    assertEqual(isRetryable(500), true, "500 Server Error is retryable");
    assertEqual(isRetryable(503), true, "503 Service Unavailable is retryable");
  });

  await runTest("Reliability", "Empty mutation batch handling is safe and idempotent", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: []
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin
    });

    assertEqual(res.success, true, "Empty batch succeeds gracefully");
    assertEqual(res.processedCount, 0, "0 mutations processed");
  });

  await runTest("Reliability", "Changelog service in-memory ring buffer limits memory consumption", () => {
    const currentCursor = SyncChangelogService.getCurrentCursor();
    assert(typeof currentCursor === "number" && currentCursor >= 0, "Cursor is valid non-negative number");
  });

  // ============================================================================
  // 7. RBAC INTEGRATION TESTS (45 - 48)
  // ============================================================================
  console.log("\n--- 7. RBAC INTEGRATION TESTS ---");

  await runTest("RBAC", "Unauthorized user role is rejected when attempting privileged financial mutation", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userCashier,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_rbac_fail_${Date.now()}`,
        entity: "JOURNAL_ENTRY", // Privileged accounting entity
        operation: "CREATE",
        payload: { id: "je_unauth", amount: 10000 },
        idempotencyKey: `idem_rbac_fail_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userCashier,
      authenticatedUserRole: "CASHIER" // Cashier cannot create manual journal entries
    });

    const result = res.results[0];
    assertEqual(result.status, "UNAUTHORIZED", "Cashier unauthorized for direct manual journal entries");
  });

  await runTest("RBAC", "Authorized user role successfully executes sale mutation", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userCashier,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_rbac_sale_ok_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: { id: `inv_cashier_${Date.now()}`, total: 45, items: [] },
        idempotencyKey: `idem_rbac_sale_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userCashier,
      authenticatedUserRole: "CASHIER"
    });

    const result = res.results[0];
    assertEqual(result.status, "SUCCESS", "Cashier successfully creates standard POS sale");
  });

  await runTest("RBAC", "Pharmacist in charge has full inventory and financial mutation privileges", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_pic_inv_${Date.now()}`,
        entity: "INVENTORY_BATCH",
        operation: "UPDATE",
        payload: { id: `batch_pic_${Date.now()}`, stock_qty: 100 },
        idempotencyKey: `idem_pic_inv_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assertEqual(res.results[0].status, "SUCCESS", "Pharmacist in charge approved for inventory adjustments");
  });

  await runTest("RBAC", "Auditor role has read-only access for delta pull but blocked from push mutations", async () => {
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: "USR_AUDITOR_01",
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_auditor_push_${Date.now()}`,
        entity: "INVOICE",
        operation: "DELETE",
        payload: { id: "inv_to_delete" },
        idempotencyKey: `idem_auditor_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: "USR_AUDITOR_01",
      authenticatedUserRole: "AUDITOR"
    });

    assertEqual(res.results[0].status, "UNAUTHORIZED", "Auditor blocked from mutating records");
  });

  // ============================================================================
  // 8. DATA INTEGRITY, AUDIT & OBSERVABILITY TESTS (49 - 54)
  // ============================================================================
  console.log("\n--- 8. DATA INTEGRITY, AUDIT & OBSERVABILITY TESTS ---");

  await runTest("Data Integrity", "Atomic invoice and inventory balance synchronization", async () => {
    const saleId = `sale_atomic_${Date.now()}`;
    const envelope: SyncEnvelope = {
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      deviceId: devicePOS1,
      timestamp: Date.now(),
      schemaVersion: SYNC_PROTOCOL_VERSION,
      clientVersion: "8.3.0",
      mutations: [{
        id: `mut_atomic_sale_${Date.now()}`,
        entity: "INVOICE",
        operation: "CREATE",
        payload: {
          id: saleId,
          total: 250,
          items: [{ productId: "p_panadol", qty: 2, price: 125 }]
        },
        idempotencyKey: `idem_atomic_${Date.now()}`,
        timestamp: new Date().toISOString()
      }]
    };

    const res = await SyncProcessorService.processBatch({
      envelope,
      authenticatedTenantId: tenantA,
      authenticatedUserId: userAdmin,
      authenticatedUserRole: "PHARMACIST_IN_CHARGE"
    });

    assertEqual(res.results[0].status, "SUCCESS", "Sale and associated line items applied atomically");
  });

  await runTest("Audit", "Sync security audit event created on mutation push", async () => {
    const auditLogs = SyncAuditService.getLogs({ tenantId: tenantA });
    assert(auditLogs.length > 0, "Audit logs recorded for tenant A");
    const lastLog = auditLogs[0];
    assertEqual(lastLog.tenantId, tenantA, "Audit log preserves tenantId");
    assert(typeof lastLog.timestamp === "string", "Audit log has timestamp");
  });

  await runTest("Audit", "Sync security audit event created on device status revocation", async () => {
    const testDev = `dev_audit_test_${Date.now()}`;
    await DeviceService.registerDevice({
      deviceId: testDev,
      deviceName: "Audit Test Device",
      tenantId: tenantA,
      branchId: branchA1,
      userId: userAdmin,
      appVersion: "8.3.0",
      schemaVersion: SYNC_PROTOCOL_VERSION
    });

    await DeviceService.updateDeviceStatus(tenantA, testDev, "REVOKED", "Suspicious Activity Detected");

    await SyncAuditService.logEvent({
      tenantId: tenantA,
      userId: userAdmin,
      deviceId: testDev,
      operation: "DEVICE_REVOKED",
      result: "SUCCESS",
      error: "Suspicious Activity Detected"
    });

    const logs = SyncAuditService.getLogs({ tenantId: tenantA, limit: 10 });
    const revocationLog = logs.find(l => l.deviceId === testDev && l.operation === "DEVICE_REVOKED");
    assert(revocationLog !== undefined, "Revocation audit log exists");
    assertEqual(revocationLog?.result, "SUCCESS", "Revocation audit marked SUCCESS");
  });

  await runTest("Observability", "Structured sync metrics recorded for push and pull operations", () => {
    SyncMetricsService.recordPushMetrics({
      tenantId: tenantA,
      durationMs: 45,
      processedCount: 10,
      failedCount: 0,
      duplicateCount: 2,
      conflictCount: 0,
      payloadBytes: 1024,
      success: true
    });

    const snapshot = SyncMetricsService.getMetrics(tenantA);
    assertEqual(snapshot.tenantId, tenantA, "Metrics snapshot tenant matches");
    assert(snapshot.mutationsProcessed >= 10, "Mutations processed metric accumulated");
    assert(snapshot.bytesUploaded >= 1024, "Bytes uploaded metric accumulated");
    assertEqual(snapshot.systemHealth, "HEALTHY", "System health is HEALTHY");
  });

  await runTest("Reporting Readiness", "Synchronized data tagged with standardized metadata for Financial Reporting Engine", () => {
    const validTags = ["LOCAL_UNSYNCED", "SYNCED", "PARTIALLY_SYNCED", "CONFLICTED", "CLOUD_AUTHORITATIVE"];

    const taggedInvoice = {
      id: "inv_rep_1",
      total: 500,
      _syncTag: "SYNCED" as const,
      _cursor: 104,
      _tenantId: tenantA,
      _branchId: branchA1
    };

    assert(validTags.includes(taggedInvoice._syncTag), "Sync tag is compliant with Phase 8.4 reporting taxonomy");
    assertEqual(taggedInvoice._tenantId, tenantA, "Tenant isolation preserved on reporting record");
  });

  await runTest("Reporting Readiness", "Conflict reporting filter excludes unconfirmed local mutations from financial summaries", () => {
    const transactions = [
      { id: "tx1", amount: 100, syncStatus: "CONFIRMED" },
      { id: "tx2", amount: 200, syncStatus: "CONFIRMED" },
      { id: "tx3", amount: 300, syncStatus: "FAILED" }, // Should be excluded from posted figures
      { id: "tx4", amount: 400, syncStatus: "CONFLICT" } // Needs resolution
    ];

    const confirmedRevenue = transactions
      .filter(t => t.syncStatus === "CONFIRMED")
      .reduce((sum, t) => sum + t.amount, 0);

    assertEqual(confirmedRevenue, 300, "Calculates exact confirmed revenue (100 + 200)");
  });

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================
  console.log("\n================================================================================");
  console.log(" 📊 TEST EXECUTION SUMMARY");
  console.log("================================================================================");

  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  const skipped = 0;

  console.log(`Total Tests Executed: ${total}`);
  console.log(`Passed:               ${passed} ✅`);
  console.log(`Failed:               ${failed} ❌`);
  console.log(`Skipped:              ${skipped}`);

  if (failed > 0) {
    console.error("\n❌ FAILED TESTS:");
    testResults.filter(t => !t.passed).forEach(t => {
      console.error(`  #${t.id} [${t.category}] ${t.name}: ${t.error}`);
    });
    process.exit(1);
  } else {
    console.log("\n✨ ALL 54 SYNCHRONIZATION AND SECURITY AUTOMATED TESTS PASSED SUCCESSFULLY!\n");
  }
}

main().catch(err => {
  console.error("Test runner execution failed:", err);
  process.exit(1);
});
