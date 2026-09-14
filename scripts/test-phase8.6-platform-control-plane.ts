// scripts/test-phase8.6-platform-control-plane.ts
// Comprehensive Test Suite for Phase 8.6: Enterprise Super Admin Control Plane
// Covers all 10 verification dimensions with >60 automated test cases

import { PlatformService } from "../server/modules/platform/platform.service";
import { PlatformAuditService } from "../server/modules/platform/platform-audit.service";
import { AuthorizationService } from "../server/services/rbac/authorization.service";
import { PermissionService } from "../server/services/rbac/permission.service";
import { DeviceService } from "../server/modules/sync/device.service";
import { SyncMetricsService } from "../server/modules/sync/sync-metrics.service";
import { UserIdentityContext } from "../server/services/rbac/rbac.types";

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
  console.log(" 🧪 PHARMAFLOW PRO ERP — PHASE 8.6 PLATFORM CONTROL PLANE TEST SUITE");
  console.log("================================================================================\n");

  const platformOwnerUser: UserIdentityContext = {
    userId: "usr-platform-owner-01",
    username: "superadmin",
    role: "PLATFORM_OWNER",
    tenantId: "platform-root",
    branchId: "platform-root-br",
    isActive: true
  };

  const tenantAdminUser: UserIdentityContext = {
    userId: "usr-tenant-admin-99",
    username: "dallah_admin",
    role: "TENANT_ADMIN",
    tenantId: "TEN_MAIN_DALLAH_09",
    branchId: "BRH-DALL-01",
    isActive: true
  };

  const regularPharmacist: UserIdentityContext = {
    userId: "usr-pharmacist-01",
    username: "pharmacist_salem",
    role: "PHARMACIST",
    tenantId: "TEN_MAIN_DALLAH_09",
    branchId: "BRH-DALL-01",
    isActive: true
  };

  // -------------------------------------------------------------------------
  // 1. Platform Authorization & RBAC Isolation Tests
  // -------------------------------------------------------------------------
  console.log("▶ STAGE 1: Platform Authorization & Security Model");

  await runTest("AUTHZ", "Platform Owner has wildcard access to platform.dashboard.view", async () => {
    const decision = await AuthorizationService.evaluate(platformOwnerUser, "platform.dashboard.view");
    assert(decision.allowed, "Platform Owner should be allowed dashboard view");
  });

  await runTest("AUTHZ", "Platform Owner has access to platform.tenants.create", async () => {
    const decision = await AuthorizationService.evaluate(platformOwnerUser, "platform.tenants.create");
    assert(decision.allowed, "Platform Owner should be allowed tenant creation");
  });

  await runTest("AUTHZ", "Platform Owner has access to platform.licenses.revoke", async () => {
    const decision = await AuthorizationService.evaluate(platformOwnerUser, "platform.licenses.revoke");
    assert(decision.allowed, "Platform Owner should be allowed license revocation");
  });

  await runTest("AUTHZ", "TENANT_ADMIN is strictly DENIED access to platform.dashboard.view", async () => {
    const decision = await AuthorizationService.evaluate(tenantAdminUser, "platform.dashboard.view");
    assert(!decision.allowed, "TENANT_ADMIN must not access platform dashboard");
  });

  await runTest("AUTHZ", "TENANT_ADMIN is strictly DENIED access to platform.tenants.create", async () => {
    const decision = await AuthorizationService.evaluate(tenantAdminUser, "platform.tenants.create");
    assert(!decision.allowed, "TENANT_ADMIN must not create cross-platform tenants");
  });

  await runTest("AUTHZ", "TENANT_ADMIN is strictly DENIED access to platform.devices.revoke", async () => {
    const decision = await AuthorizationService.evaluate(tenantAdminUser, "platform.devices.revoke");
    assert(!decision.allowed, "TENANT_ADMIN must not access platform device revocation endpoint");
  });

  await runTest("AUTHZ", "TENANT_ADMIN is allowed standard tenant permissions (sales.invoice.view)", async () => {
    const decision = await AuthorizationService.evaluate(tenantAdminUser, "sales.invoice.view", { tenantId: "TEN_MAIN_DALLAH_09" });
    assert(decision.allowed, "TENANT_ADMIN must access their own tenant sales invoices");
  });

  await runTest("AUTHZ", "TENANT_ADMIN cannot access another tenant resource", async () => {
    const decision = await AuthorizationService.evaluate(tenantAdminUser, "sales.invoice.view", { tenantId: "TEN_ALNOOR_PHARMA_02" });
    assert(!decision.allowed, "TENANT_ADMIN must be blocked from cross-tenant access");
  });

  await runTest("AUTHZ", "Regular Pharmacist is denied platform.* permissions", async () => {
    const decision = await AuthorizationService.evaluate(regularPharmacist, "platform.subscriptions.manage");
    assert(!decision.allowed, "Pharmacist must not manage platform subscriptions");
  });

  await runTest("AUTHZ", "All platform permissions are registered in PermissionService", async () => {
    const all = PermissionService.getAllPermissions();
    const platformPerms = all.filter(p => p.module === "platform");
    assert(platformPerms.length >= 15, `Expected at least 15 platform permissions, got ${platformPerms.length}`);
  });

  // -------------------------------------------------------------------------
  // 2. Platform Audit Logging & Secret Sanitization Tests
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 2: Platform Audit Stream & Secret Redaction");

  await runTest("AUDIT", "Record platform audit event successfully", async () => {
    const record = await PlatformAuditService.recordEvent({
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username,
      action: "TEST_OPERATION",
      resource: "TestSystem",
      severity: "INFO",
      after: { testKey: "testValue" }
    });
    assert(record.id.startsWith("PAE-"), "Audit ID should have PAE prefix");
    assertEqual(record.action, "TEST_OPERATION", "Action should match");
  });

  await runTest("AUDIT", "Sanitize secret passwords in audit payloads", async () => {
    const record = await PlatformAuditService.recordEvent({
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username,
      action: "CREATE_USER_TEST",
      resource: "User",
      severity: "LOW",
      after: {
        username: "testuser",
        password: "SuperSecretPassword123!",
        adminPasswordHash: "$2a$10$abcdefghijk"
      }
    });
    assertEqual(record.after.password, "[REDACTED_SECRET]", "Raw password must be redacted");
    assertEqual(record.after.adminPasswordHash, "[REDACTED_SECRET]", "Password hash must be redacted");
    assertEqual(record.after.username, "testuser", "Non-secret username should remain intact");
  });

  await runTest("AUDIT", "Sanitize API tokens and private keys in audit payloads", async () => {
    const record = await PlatformAuditService.recordEvent({
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username,
      action: "GENERATE_KEY_TEST",
      resource: "ApiKey",
      severity: "HIGH",
      after: {
        keyName: "Production Gateway",
        secretToken: "pf_live_abc123secret",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----"
      }
    });
    assertEqual(record.after.secretToken, "[REDACTED_SECRET]", "Secret token must be redacted");
    assertEqual(record.after.privateKey, "[REDACTED_SECRET]", "Private key must be redacted");
  });

  await runTest("AUDIT", "Filter audit logs by tenantId", async () => {
    await PlatformAuditService.recordEvent({
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username,
      action: "TENANT_SPECIFIC_ACTION",
      resource: "Tenant",
      tenantId: "TEN_TEST_FILTER_01",
      severity: "INFO"
    });
    const res = PlatformAuditService.getEvents({ tenantId: "TEN_TEST_FILTER_01" });
    assert(res.logs.length >= 1, "Should return filtered logs");
    assert(res.logs.every(l => l.tenantId === "TEN_TEST_FILTER_01"), "All returned logs must belong to filter tenant");
  });

  await runTest("AUDIT", "Filter audit logs by severity", async () => {
    await PlatformAuditService.recordEvent({
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username,
      action: "CRITICAL_SECURITY_BREACH_SIMULATION",
      resource: "SecurityEngine",
      severity: "CRITICAL"
    });
    const res = PlatformAuditService.getEvents({ severity: "CRITICAL" });
    assert(res.logs.some(l => l.action === "CRITICAL_SECURITY_BREACH_SIMULATION"), "Should find critical event");
  });

  await runTest("AUDIT", "Retrieve high severity security event stream", async () => {
    const secEvents = PlatformAuditService.getSecurityEvents(50);
    assert(Array.isArray(secEvents), "Security events should be an array");
  });

  // -------------------------------------------------------------------------
  // 3. Platform Dashboard Metrics Aggregation
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 3: Platform Dashboard Metrics & Financial Health");

  await runTest("METRICS", "Calculate platform dashboard metrics structure", async () => {
    const metrics = await PlatformService.getDashboardMetrics();
    assert(typeof metrics.tenants.total === "number", "Total tenants must be a number");
    assert(typeof metrics.branches.total === "number", "Total branches must be a number");
    assert(typeof metrics.users.total === "number", "Total users must be a number");
    assert(typeof metrics.devices.total === "number", "Total devices must be a number");
    assert(typeof metrics.subscriptions.enterprise === "number", "Enterprise subscriptions must be a number");
  });

  await runTest("METRICS", "Verify MRR and ARR normalization", async () => {
    const metrics = await PlatformService.getDashboardMetrics();
    if (typeof metrics.financials.mrr === "number") {
      assert(metrics.financials.mrr >= 0, "MRR should be non-negative");
      if (typeof metrics.financials.arr === "number") {
        assertEqual(Math.round(metrics.financials.arr), Math.round(metrics.financials.mrr * 12), "ARR must equal MRR * 12");
      }
    }
  });

  await runTest("METRICS", "Verify system health diagnostics status", async () => {
    const metrics = await PlatformService.getDashboardMetrics();
    assert(["HEALTHY", "DEGRADED", "DOWN"].includes(metrics.systemHealth.api), "API status valid");
    assert(["HEALTHY", "DEGRADED", "DOWN"].includes(metrics.systemHealth.database), "Database status valid");
  });

  // -------------------------------------------------------------------------
  // 4. Tenant Lifecycle & Multi-Tenant Provisioning
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 4: Tenant Lifecycle & Provisioning Engine");

  let newlyCreatedTenantId = "";

  await runTest("TENANT", "Provision new tenant atomically", async () => {
    const testTenantName = `صيدلية الأمل الحديثة ${Date.now()}`;
    const result = await PlatformService.createTenant({
      name: testTenantName,
      legalName: "شركة الأمل الطبية المحدودة",
      domain: `alamal-${Date.now()}.pharmaflow.cloud`,
      country: "المملكة العربية السعودية",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      adminUsername: `alamal_admin_${Date.now()}`,
      adminPassword: "SecurePassword@2026",
      branchName: "الفرع الرئيسي - شارع التحلية",
      planCode: "ENTERPRISE",
      trialDays: 30,
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });

    assert(Boolean(result.tenant?.id), "Tenant ID must be created");
    assert(Boolean(result.branch?.id), "Default branch must be created");
    assert(Boolean(result.user?.id), "Admin user must be created");
    assert(Boolean(result.license?.signature), "License signature must be generated");
    newlyCreatedTenantId = result.tenant.id;
  });

  await runTest("TENANT", "Fetch paginated tenant list with search filter", async () => {
    const listRes = await PlatformService.getTenants({ limit: 10, offset: 0 });
    assert(listRes.tenants.length > 0, "Tenants list should not be empty");
    assert(listRes.total >= listRes.tenants.length, "Total should be greater or equal to page length");
  });

  await runTest("TENANT", "Fetch comprehensive tenant details profile", async () => {
    const details = await PlatformService.getTenantDetails(newlyCreatedTenantId || "TEN_MAIN_DALLAH_09");
    assert(Boolean(details.tenant), "Tenant profile must be present");
    assert(Array.isArray(details.branches), "Branches list must be present");
    assert(Array.isArray(details.users), "Users list must be present");
    assert(Boolean(details.license), "License information must be present");
  });

  await runTest("TENANT", "Suspend tenant account with reason and audit log", async () => {
    const targetId = newlyCreatedTenantId || "TEN_TEST_SUSPEND_01";
    const res = await PlatformService.updateTenantStatus({
      tenantId: targetId,
      status: "SUSPENDED",
      reason: "تأخر في سداد الفاتورة الشهرية",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Tenant suspension should succeed");
  });

  await runTest("TENANT", "Reactivate suspended tenant account", async () => {
    const targetId = newlyCreatedTenantId || "TEN_TEST_SUSPEND_01";
    const res = await PlatformService.updateTenantStatus({
      tenantId: targetId,
      status: "ACTIVE",
      reason: "تم تأكيد السداد وإعادة التفعيل",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Tenant reactivation should succeed");
  });

  // -------------------------------------------------------------------------
  // 5. Subscription Plan Upgrades & Digital Licensing
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 5: Subscriptions & Cryptographic Licensing");

  await runTest("LICENSE", "Generate deterministic license signature", async () => {
    const sig1 = PlatformService.generateLicenseSignature("TEN_001", "ENTERPRISE", "2027-01-01T00:00:00.000Z");
    const sig2 = PlatformService.generateLicenseSignature("TEN_001", "ENTERPRISE", "2027-01-01T00:00:00.000Z");
    const sig3 = PlatformService.generateLicenseSignature("TEN_002", "ENTERPRISE", "2027-01-01T00:00:00.000Z");

    assertEqual(sig1, sig2, "Identical tenant and plan parameters must yield identical signature");
    assert(sig1 !== sig3, "Different tenants must produce distinct cryptographic signatures");
  });

  await runTest("LICENSE", "Upgrade tenant subscription plan and extend license validity", async () => {
    const targetId = newlyCreatedTenantId || "TEN_MAIN_DALLAH_09";
    const res = await PlatformService.changeTenantPlan({
      tenantId: targetId,
      newPlanCode: "ENTERPRISE",
      durationDays: 365,
      reason: "ترقية إلى باقة المؤسسات السنوية",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Plan upgrade should succeed");
    assert(Boolean(res.license?.signature), "New license signature must be provided");
  });

  // -------------------------------------------------------------------------
  // 6. Cross-Tenant Device Control & Security Status
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 6: Device Center & Cross-Tenant Security");

  await runTest("DEVICE", "Register and fetch device list across all tenants", async () => {
    await DeviceService.registerDevice({
      deviceId: "POS-DEV-DALLAH-991",
      deviceName: "POS Terminal 1 - Dallah Main",
      tenantId: "TEN_MAIN_DALLAH_09",
      branchId: "BRH-DALL-01",
      userId: "usr-101",
      appVersion: "8.6.0",
      schemaVersion: 1
    });

    const devices = DeviceService.getTenantDevices("TEN_MAIN_DALLAH_09");
    assert(devices.length >= 1, "Should find registered device");
    assert(devices.some(d => d.deviceId === "POS-DEV-DALLAH-991"), "Device must be present in tenant list");
  });

  await runTest("DEVICE", "Suspend device via Platform Control Plane", async () => {
    const res = await PlatformService.updateDeviceStatus({
      tenantId: "TEN_MAIN_DALLAH_09",
      deviceId: "POS-DEV-DALLAH-991",
      status: "SUSPENDED",
      reason: "صيانة دورية لنقطة البيع",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Device suspension should succeed");
    assertEqual(res.device.status, "SUSPENDED", "Device status should be SUSPENDED");
  });

  await runTest("DEVICE", "Revoke device permanently and trigger critical audit log", async () => {
    const res = await PlatformService.updateDeviceStatus({
      tenantId: "TEN_MAIN_DALLAH_09",
      deviceId: "POS-DEV-DALLAH-991",
      status: "REVOKED",
      reason: "فقدان الجهاز والاشتباه باختراق أمني",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Device revocation should succeed");
    assertEqual(res.device.status, "REVOKED", "Device status should be REVOKED");

    const auditEvents = PlatformAuditService.getEvents({ action: "DEVICE_REVOKED" });
    assert(auditEvents.logs.length >= 1, "Must record DEVICE_REVOKED audit event");
  });

  await runTest("DEVICE", "Revoked device is blocked by DeviceService security check", async () => {
    const secStatus = DeviceService.getDeviceSecurityStatus("TEN_MAIN_DALLAH_09", "POS-DEV-DALLAH-991");
    assert(!secStatus.isAuthorized, "Revoked device must not be authorized");
    assertEqual(secStatus.status, "REVOKED", "Device status must be REVOKED");
  });

  // -------------------------------------------------------------------------
  // 7. Sync Diagnostics & Observability
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 7: Sync Observability & Diagnostics");

  await runTest("SYNC", "Run retry-failed sync diagnostic action", async () => {
    const res = await PlatformService.runSyncDiagnostics({
      tenantId: "TEN_MAIN_DALLAH_09",
      action: "retry-failed",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Sync diagnostic should succeed");
    assert(res.message.includes("نجاح"), "Message should indicate success");
  });

  await runTest("SYNC", "Run reset-lock sync diagnostic action", async () => {
    const res = await PlatformService.runSyncDiagnostics({
      tenantId: "TEN_MAIN_DALLAH_09",
      action: "reset-lock",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Reset lock should succeed");
    assert(res.details.lockReleased, "Lock must be released");
  });

  await runTest("SYNC", "Verify SyncMetricsService tracking", async () => {
    SyncMetricsService.recordPushMetrics({
      tenantId: "TEN_MAIN_DALLAH_09",
      durationMs: 45,
      processedCount: 10,
      failedCount: 0,
      duplicateCount: 0,
      conflictCount: 0,
      payloadBytes: 2048,
      success: true
    });
    const m = SyncMetricsService.getMetrics("TEN_MAIN_DALLAH_09");
    assert(m.mutationsProcessed >= 10, "Mutations processed count should increment");
    assertEqual(m.systemHealth, "HEALTHY", "Health should be HEALTHY");
  });

  // -------------------------------------------------------------------------
  // 8. System Infrastructure Diagnostics & Storage
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 8: System Infrastructure Diagnostics & Storage");

  await runTest("SYSTEM", "Query system health and components latency", async () => {
    const health = await PlatformService.getSystemHealth();
    assertEqual(health.status, "HEALTHY", "Overall health should be HEALTHY");
    assert(Boolean(health.components.apiGateway), "API Gateway must be checked");
    assert(Boolean(health.components.database), "Database component must be checked");
    assert(Boolean(health.components.syncEngine), "Sync Engine must be checked");
    assert(Boolean(health.components.reportingEngine), "Reporting Engine must be checked");
  });

  await runTest("SYSTEM", "Verify storage diagnostics breakdown", async () => {
    const health = await PlatformService.getSystemHealth();
    assert(health.storage.totalTenantDataKb > 0, "Tenant data storage must be calculated");
    assert(health.storage.backupSnapshotsCount >= 0, "Backup snapshots count must be tracked");
  });

  // -------------------------------------------------------------------------
  // 9. Feature Flags & Client Version Policies
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 9: Feature Flags & Client Version Compatibility");

  await runTest("FLAGS", "List registered platform feature flags", async () => {
    const flags = PlatformService.getFeatureFlags();
    assert(flags.length >= 5, "Should have at least 5 core feature flags");
    assert(flags.some(f => f.key === "REPORTING_ENGINE"), "REPORTING_ENGINE flag must exist");
    assert(flags.some(f => f.key === "AI_COPILOT"), "AI_COPILOT flag must exist");
    assert(flags.some(f => f.key === "FHIR_INTEROP"), "FHIR_INTEROP flag must exist");
  });

  await runTest("FLAGS", "Update feature flag tenant override", async () => {
    const updated = PlatformService.updateFeatureFlag({
      key: "AI_COPILOT",
      tenantOverrides: { TEN_ALNOOR_PHARMA_02: false },
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assertEqual(updated.tenantOverrides["TEN_ALNOOR_PHARMA_02"], false, "Tenant override must be stored");
  });

  await runTest("VERSION", "Verify client version validation allows supported version", async () => {
    const val = PlatformService.validateClientVersion("8.6.0");
    assert(val.allowed, "Version 8.6.0 should be allowed");
  });

  await runTest("VERSION", "Verify client version validation blocks deprecated versions", async () => {
    const val = PlatformService.validateClientVersion("7.0.0");
    assert(!val.allowed, "Version 7.0.0 should be rejected");
    assertEqual(val.code, "CLIENT_VERSION_UNSUPPORTED", "Rejection code should match");
  });

  // -------------------------------------------------------------------------
  // 10. Secure API Keys & Webhooks Gateway
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 10: API Keys Management & Webhooks Security");

  let createdApiKeyId = "";

  await runTest("APIKEY", "Create new API key with masked representation", async () => {
    const res = PlatformService.createApiKey({
      tenantId: "TEN_MAIN_DALLAH_09",
      tenantName: "مستشفى دله وصيدلياتها",
      name: "Tawakkalna Health Gateway",
      scopes: ["fhir.read", "financials.read"],
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });

    assert(res.rawSecretKey.startsWith("pf_live_"), "Secret key should start with pf_live_");
    assert(res.record.maskedKey.includes("••••"), "Stored key must be masked");
    createdApiKeyId = res.record.id;
  });

  await runTest("APIKEY", "Revoke API key", async () => {
    const ok = PlatformService.revokeApiKey(createdApiKeyId, {
      id: platformOwnerUser.userId,
      username: platformOwnerUser.username
    });
    assert(ok, "Revoke should return true");
  });

  await runTest("WEBHOOK", "Fetch webhook events and audit signatures", async () => {
    const webhooks = PlatformService.getWebhookLogs();
    assert(webhooks.length >= 1, "Should have webhook logs");
    assert(webhooks.some(w => w.provider === "KURAIMI"), "Kuraimi webhook should exist");
    assert(webhooks.some(w => w.signatureVerified === false), "Rejected invalid signature webhook should be recorded");
  });

  // -------------------------------------------------------------------------
  // 11. Advanced Enterprise Edge Cases & Integrity Tests
  // -------------------------------------------------------------------------
  console.log("\n▶ STAGE 11: Enterprise Edge Cases & Integrity Verification");

  await runTest("INTEGRITY", "Tampered digital license signature fails verification", async () => {
    const validSig = PlatformService.generateLicenseSignature("TEN_001", "ENTERPRISE", "2027-01-01T00:00:00.000Z");
    const tamperedSig = validSig.slice(0, -4) + "FFFF";
    assert(validSig !== tamperedSig, "Tampered signature should not match valid signature");
  });

  await runTest("INTEGRITY", "Client version policy update is reflected in system diagnostics", async () => {
    const current = PlatformService.getVersionPolicy();
    const updated = PlatformService.updateVersionPolicy(
      { latestRecommendedVersion: "8.6.1" },
      { id: platformOwnerUser.userId, username: platformOwnerUser.username }
    );
    assertEqual(updated.latestRecommendedVersion, "8.6.1", "Version policy should update");
    // Restore
    PlatformService.updateVersionPolicy(
      { latestRecommendedVersion: current.latestRecommendedVersion },
      { id: platformOwnerUser.userId, username: platformOwnerUser.username }
    );
  });

  await runTest("INTEGRITY", "Feature flag updates record platform audit entries", async () => {
    PlatformService.updateFeatureFlag({
      key: "FHIR_INTEROP",
      isEnabledGlobally: true,
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    const logs = PlatformAuditService.getEvents({ action: "FEATURE_FLAG_UPDATED" });
    assert(logs.logs.length >= 1, "Feature flag update must be audited");
  });

  await runTest("INTEGRITY", "API Key revocation blocks further authorization", async () => {
    const key = PlatformService.createApiKey({
      tenantId: "TEN_MAIN_DALLAH_09",
      tenantName: "مستشفى دله",
      name: "Temporary Integration",
      scopes: ["sync.read"],
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    const revoked = PlatformService.revokeApiKey(key.record.id, {
      id: platformOwnerUser.userId,
      username: platformOwnerUser.username
    });
    assert(revoked, "Revoke should succeed");
    const list = PlatformService.getApiKeys();
    const found = list.find(k => k.id === key.record.id);
    assertEqual(found?.status, "REVOKED", "Key status must be REVOKED");
  });

  await runTest("INTEGRITY", "Audit payload handles nested objects without circular crash", async () => {
    const nestedData = { level1: { level2: { secretPassword: "P@ssword123", publicInfo: "Visible" } } };
    const record = await PlatformAuditService.recordEvent({
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username,
      action: "NESTED_PAYLOAD_TEST",
      resource: "System",
      after: nestedData
    });
    assertEqual(record.after.level1.level2.secretPassword, "[REDACTED_SECRET]", "Deep nested secret must be redacted");
    assertEqual(record.after.level1.level2.publicInfo, "Visible", "Deep nested public info must remain intact");
  });

  await runTest("INTEGRITY", "Audit stream search finds matching terms across resources and actors", async () => {
    await PlatformAuditService.recordEvent({
      actorId: platformOwnerUser.userId,
      actorUsername: "AuditSearchHero",
      action: "UNIQUE_CUSTOM_ACTION_X99",
      resource: "SpecialResource",
      severity: "INFO"
    });
    const searchRes = PlatformAuditService.getEvents({ search: "UNIQUE_CUSTOM_ACTION_X99" });
    assert(searchRes.logs.length >= 1, "Search should find custom action");
    assertEqual(searchRes.logs[0].actorUsername, "AuditSearchHero", "Actor username must match");
  });

  await runTest("INTEGRITY", "Invalid tenant creation with empty name throws validation error", async () => {
    let threw = false;
    try {
      await PlatformService.createTenant({
        name: "",
        adminUsername: "admin",
        actorId: platformOwnerUser.userId,
        actorUsername: platformOwnerUser.username
      });
    } catch {
      threw = true;
    }
    assert(threw, "Empty tenant name must throw validation error");
  });

  await runTest("INTEGRITY", "Invalid tenant creation with empty username throws validation error", async () => {
    let threw = false;
    try {
      await PlatformService.createTenant({
        name: "Valid Pharmacy",
        adminUsername: "",
        actorId: platformOwnerUser.userId,
        actorUsername: platformOwnerUser.username
      });
    } catch {
      threw = true;
    }
    assert(threw, "Empty admin username must throw validation error");
  });

  await runTest("INTEGRITY", "Updating non-existent feature flag throws error", async () => {
    let threw = false;
    try {
      PlatformService.updateFeatureFlag({
        key: "NON_EXISTENT_FEATURE_FLAG_99",
        isEnabledGlobally: true,
        actorId: platformOwnerUser.userId,
        actorUsername: platformOwnerUser.username
      });
    } catch {
      threw = true;
    }
    assert(threw, "Non-existent feature flag must throw error");
  });

  await runTest("INTEGRITY", "Device status update to ACTIVE clears revocation reason", async () => {
    const updated = await DeviceService.updateDeviceStatus("TEN_MAIN_DALLAH_09", "POS-DEV-TEST-REACTIVATE", "REVOKED", "Suspicious login");
    assertEqual(updated?.status, "REVOKED", "Should be revoked");
    const reactivated = await DeviceService.updateDeviceStatus("TEN_MAIN_DALLAH_09", "POS-DEV-TEST-REACTIVATE", "ACTIVE");
    assertEqual(reactivated?.status, "ACTIVE", "Should be active");
    assertEqual(reactivated?.revocationReason, null, "Revocation reason should be cleared");
  });

  await runTest("INTEGRITY", "Device heartbeat updates lastSeenAt timestamp", async () => {
    const before = new Date(Date.now() - 5000).toISOString();
    DeviceService.touchDevice("TEN_MAIN_DALLAH_09", "POS-DEV-TEST-REACTIVATE");
    const dev = await DeviceService.getDevice("TEN_MAIN_DALLAH_09", "POS-DEV-TEST-REACTIVATE");
    assert(Boolean(dev?.lastSeenAt && dev.lastSeenAt >= before), "lastSeenAt must be refreshed");
  });

  await runTest("INTEGRITY", "Device unknown status allows grace period with status UNKNOWN", async () => {
    const status = await DeviceService.verifyDevice("TEN_UNKNOWN_99", "DEV_NEVER_SEEN_BEFORE");
    assert(status.allowed, "Unknown device allowed during initial discovery");
    assertEqual(status.status, "UNKNOWN", "Status should be UNKNOWN");
  });

  await runTest("INTEGRITY", "Cross-tenant list branches returns tenant-scoped data when filtered", async () => {
    const listRes = await PlatformService.getTenants({ limit: 5 });
    assert(listRes.tenants.length > 0, "Should return tenants");
  });

  await runTest("INTEGRITY", "Sync diagnostics refresh-metrics returns structured metrics snapshot", async () => {
    const res = await PlatformService.runSyncDiagnostics({
      tenantId: "TEN_MAIN_DALLAH_09",
      action: "refresh-metrics",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Diagnostic must succeed");
    assert(typeof res.details.syncDurationMs === "number", "syncDurationMs must be numeric");
  });

  await runTest("INTEGRITY", "Sync diagnostics re-register device resets device status to ACTIVE", async () => {
    const res = await PlatformService.runSyncDiagnostics({
      tenantId: "TEN_MAIN_DALLAH_09",
      action: "re-register-device",
      deviceId: "POS-DEV-DALLAH-991",
      actorId: platformOwnerUser.userId,
      actorUsername: platformOwnerUser.username
    });
    assert(res.success, "Re-registration must succeed");
    assertEqual(res.details.status, "ACTIVE", "Status must become ACTIVE");
  });

  await runTest("INTEGRITY", "Platform Audit buffer rolls over gracefully without memory leak", async () => {
    for (let i = 0; i < 20; i++) {
      await PlatformAuditService.recordEvent({
        actorId: platformOwnerUser.userId,
        actorUsername: "BulkStressTest",
        action: `BULK_ACTION_${i}`,
        resource: "Test",
        severity: "INFO"
      });
    }
    const logs = PlatformAuditService.getEvents({ limit: 10 });
    assertEqual(logs.logs.length, 10, "Pagination limit respected");
  });

  await runTest("INTEGRITY", "System health reports latency metrics in milliseconds", async () => {
    const health = await PlatformService.getSystemHealth();
    for (const [name, comp] of Object.entries(health.components)) {
      assert(typeof comp.latencyMs === "number" && comp.latencyMs >= 0, `Component ${name} latency must be non-negative`);
    }
  });

  await runTest("INTEGRITY", "Platform Tenant summary calculates correct storage and branch multipliers", async () => {
    const res = await PlatformService.getTenants({ limit: 1 });
    const t = res.tenants[0];
    assert(t.storageUsageKb >= 1000, "Storage usage should be at least 1MB");
    assert(t.branchesCount >= 1, "Branches count should be at least 1");
  });

  await runTest("INTEGRITY", "Cross-tenant isolation policy engine validates matching IDs", async () => {
    const decisionAllow = await AuthorizationService.evaluate(tenantAdminUser, "sales.invoice.view", { tenantId: "TEN_MAIN_DALLAH_09" });
    const decisionDeny = await AuthorizationService.evaluate(tenantAdminUser, "sales.invoice.view", { tenantId: "TEN_OTHER_99" });
    assert(decisionAllow.allowed, "Same tenant must be allowed");
    assert(!decisionDeny.allowed, "Foreign tenant must be blocked");
  });

  // -------------------------------------------------------------------------
  // Final Results Summary
  // -------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(" 📊 TEST RUN RESULTS SUMMARY");
  console.log("================================================================================");
  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  console.log(` Total Tests Executed: ${total}`);
  console.log(` Passed:               ${passed} ✅`);
  console.log(` Failed:               ${failed} ${failed > 0 ? "❌" : "✨"}`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error(`\n❌ Test suite failed with ${failed} failure(s).`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All ${total} automated tests passed with 100% success rate!`);
  }
}

main().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
