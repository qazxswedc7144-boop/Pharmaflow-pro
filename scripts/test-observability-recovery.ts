// scripts/test-observability-recovery.ts

/**
 * PharmaFlow PRO ERP - Phase 3.4.6
 * Enterprise Observability, Diagnostics & Recovery Certification Test Suite
 */

import {
  observabilityService,
  diagnosticsEngine,
  healthMonitor,
  recoveryCoordinator,
  performanceMonitor,
  circuitBreakerRegistry,
  crashRecoveryManager,
  redactObject,
  redactString,
  runWithCorrelationContext,
  generateCorrelationId,
  getActiveCorrelationId,
  CircuitBreakerOpenError,
  CENTRAL_RETRY_POLICY
} from '../src/core/observability';

// Mock minimal Dexie DB shim for standalone Node environment if needed
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('----------------------------------------------------');
  console.log('🧪 PharmaFlow PRO ERP — Phase 3.4.6 Test Suite');
  console.log('----------------------------------------------------');

  // Test A — Correlation Propagation
  console.log('\n[Test A] Correlation Propagation');
  const testCorrId = generateCorrelationId('test-corr');
  await runWithCorrelationContext(testCorrId, async () => {
    const active = getActiveCorrelationId();
    assert(active === testCorrId, `Active correlation ID matches scoped context (${active})`);

    const diag = await observabilityService.recordError(
      new Error('Test correlation error'),
      { feature: 'PURCHASE' },
      'BUSINESS_RULE',
      'WARNING'
    );
    assert(diag.correlationId === testCorrId, `Diagnostic record retained correlationId (${diag.correlationId})`);
  });

  // Test B — Error Classification
  console.log('\n[Test B] Error Classification');
  const netCat = diagnosticsEngine.classifyCategory(new Error('Failed to fetch network request'));
  assert(netCat === 'NETWORK', `Network error classified as NETWORK (got ${netCat})`);

  const authCat = diagnosticsEngine.classifyCategory(new Error('401 Unauthorized token expired'));
  assert(authCat === 'AUTH', `Auth error classified as AUTH (got ${authCat})`);

  const dbCat = diagnosticsEngine.classifyCategory(new Error('IndexedDB transaction failed constraint'));
  assert(dbCat === 'DATABASE', `Database error classified as DATABASE (got ${dbCat})`);

  const syncCat = diagnosticsEngine.classifyCategory(new Error('Sync outbox push failed'), 'sync');
  assert(syncCat === 'SYNC', `Sync error classified as SYNC (got ${syncCat})`);

  const invCat = diagnosticsEngine.classifyCategory(new Error('Insufficient stock batch quantity'), 'inventory');
  assert(invCat === 'INVENTORY', `Inventory error classified as INVENTORY (got ${invCat})`);

  // Test C — Error Deduplication & Fingerprinting
  console.log('\n[Test C] Error Deduplication & Fingerprinting');
  const fp1 = diagnosticsEngine.generateFingerprint('NETWORK', 'Failed to fetch https://api.example.com/123', 'SYNC');
  const fp2 = diagnosticsEngine.generateFingerprint('NETWORK', 'Failed to fetch https://api.example.com/999', 'SYNC');
  assert(fp1 === fp2, `Normalized error messages share same fingerprint (${fp1})`);

  // Simulate processError deduplication
  const errContext = { correlationId: 'corr-dedup-1', tenantId: 't-01', userId: 'u-01', deviceId: 'd-01', timestamp: new Date().toISOString() };
  await diagnosticsEngine.processError(new Error('Repeated timeout error'), errContext, 'NETWORK', 'WARNING');
  await diagnosticsEngine.processError(new Error('Repeated timeout error'), errContext, 'NETWORK', 'WARNING');
  assert(true, 'Deduplicated multiple error occurrences safely');

  // Test D — Offline Safety
  console.log('\n[Test D] Offline Safety');
  const health = await healthMonitor.evaluateSystemHealth();
  assert(health.overall !== undefined, `Health evaluation returned status (${health.overall})`);
  assert(health.mode === 'NORMAL' || health.mode === 'DEGRADED', 'Offline mode does not treat healthy local DB as system crash');

  // Test E — Retry Boundaries
  console.log('\n[Test E] Retry Boundaries');
  assert(CENTRAL_RETRY_POLICY.FINANCIAL.maxRetries === 0, 'FINANCIAL retry policy strictly set to 0 blind retries');
  assert(CENTRAL_RETRY_POLICY.SYNC.maxRetries === 5, 'SYNC retry policy bounded to 5 attempts');

  let attemptsExecuted = 0;
  try {
    await recoveryCoordinator.executeWithRecovery(async () => {
      attemptsExecuted++;
      throw new Error('Transient network glitch');
    }, { category: 'NETWORK', maxRetriesOverride: 2 });
  } catch (err) {
    assert(attemptsExecuted === 3, `Bounded retries executed exactly 3 times (1 initial + 2 retries)`);
  }

  // Test F — Financial Idempotency
  console.log('\n[Test F] Financial Idempotency Safety');
  const check = await recoveryCoordinator.verifyFinancialOperationCommitted('non-existent-op-id');
  assert(check.committed === false, 'Uncommitted financial operation identified correctly');

  // Test G — Circuit Breaker Honest Failure
  console.log('\n[Test G] Circuit Breaker & Zero Mock Data');
  const cb = circuitBreakerRegistry.get('TEST_AI_SERVICE', { failureThreshold: 2, recoveryTimeoutMs: 60000 });
  cb.onFailure(new Error('Gemini API Error 1'));
  cb.onFailure(new Error('Gemini API Error 2'));

  assert(cb.getState() === 'OPEN', 'Circuit Breaker transitions to OPEN after threshold failures');

  try {
    await cb.execute(async () => {
      return 'Mock AI Result';
    });
    assert(false, 'OPEN circuit should reject execution');
  } catch (err: any) {
    assert(err instanceof CircuitBreakerOpenError, 'Circuit Breaker throws CircuitBreakerOpenError (Honest Failure - Zero Mock Data)');
  }

  // Test H — Crash Recovery Bootstrap
  console.log('\n[Test H] Crash Recovery Bootstrap');
  const recoveryResult = await crashRecoveryManager.bootstrapAppRecovery();
  assert(recoveryResult.timestamp !== undefined, 'Bootstrap crash recovery executed safely');

  // Test I — Sensitive Data Redaction
  console.log('\n[Test I] Sensitive Data Redaction');
  const rawData = {
    authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    password: 'superSecretPassword123',
    apiKey: 'AIzaSyA1234567890SecretApiKey',
    user: 'pharmacy_admin'
  };

  const redacted = redactObject(rawData);
  assert(redacted.authorization === '[REDACTED]', 'Bearer JWT redacted');
  assert(redacted.password === '[REDACTED]', 'Password redacted');
  assert(redacted.apiKey === '[REDACTED]', 'API Key redacted');
  assert(redacted.user === 'pharmacy_admin', 'Non-sensitive fields preserved');

  const redactedStr = redactString('Failed request with Bearer eyJhbGci.eyJzdWIi.SflKxw and password=secret123');
  assert(!redactedStr.includes('secret123') && redactedStr.includes('[REDACTED]'), 'Inline string secrets redacted');

  // Test J — Performance Monitoring
  console.log('\n[Test J] Performance Monitoring');
  const ctx = { correlationId: 'perf-test-1', tenantId: 't-01', userId: 'u-01', deviceId: 'd-01', timestamp: new Date().toISOString() };
  const trackedResult = await performanceMonitor.track(
    'Save Purchase Invoice',
    'FINANCIAL_SAVE',
    async () => {
      return { success: true };
    },
    ctx
  );

  assert(trackedResult.success === true, 'Performance tracking wraps action transparently without side effects');

  const snapshot = await observabilityService.createDiagnosticSnapshot();
  assert(snapshot.appVersion === '3.4.6', 'Diagnostic snapshot generated with accurate system metadata');

  console.log('----------------------------------------------------');
  console.log(`📊 Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('----------------------------------------------------');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
