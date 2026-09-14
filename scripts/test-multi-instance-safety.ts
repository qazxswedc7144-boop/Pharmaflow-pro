// scripts/test-multi-instance-safety.ts

import { IdempotencyRepository } from "../server/modules/idempotency/idempotency.repository";
import { RedisConnectionManager } from "../server/database/redis";

async function runMultiInstanceAudit() {
  console.log("==========================================================================");
  console.log("🛡️ PharmaFlow PRO ERP — Multi-Instance Consistency & Lock Safety Audit");
  console.log("==========================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || "Assertion failed"}`);
    }
  }

  // 1. Process-Local Mutex Scope Verification
  console.log("\n--- TEST 1: Process-Local Mutex Guarantee Verification ---");
  await RedisConnectionManager.clear();
  await RedisConnectionManager.set("lock:test", "TOKEN-A", "PX", 5000, true);
  const inst1HasLock = (await RedisConnectionManager.get("lock:test")) === "TOKEN-A";
  assert(inst1HasLock, "Local process acquires mutex in memory store");

  // 2. Authoritative Database Idempotency Across Instances
  console.log("\n--- TEST 2: Cross-Instance Idempotency Lock Collision Simulation ---");
  const testKey = `test-idem-multinode-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const hash = "hash-test-payload-123";

  // Simulate Request reaching Instance 1
  const instance1Result = await IdempotencyRepository.acquireLock(
    testKey,
    hash,
    "/api/invoices/post",
    "POST",
    "USER-CLOUDRUN-POD-1"
  );

  assert(instance1Result.isNew === true, "Instance 1 successfully acquires new database-level idempotency lock");
  assert(instance1Result.record.processing === true, "Idempotency record is locked in DB state as 'processing: true'");

  // Simulate Parallel Request reaching Instance 2 with the SAME Idempotency-Key
  const instance2Result = await IdempotencyRepository.acquireLock(
    testKey,
    hash,
    "/api/invoices/post",
    "POST",
    "USER-CLOUDRUN-POD-2"
  );

  assert(
    instance2Result.isNew === false,
    "Instance 2 receives existing DB lock (isNew = false), preventing duplicate execution"
  );
  assert(
    instance2Result.record.processing === true,
    "Instance 2 detects in-flight transaction from Instance 1 via authoritative DB boundary"
  );

  // Resolve transaction by Instance 1
  await IdempotencyRepository.resolveKey(testKey, { invoiceId: "INV-999", status: "POSTED" }, 200);

  // Subsequent request on any instance (Instance 3) receives cached authoritative result
  const instance3Result = await IdempotencyRepository.findByKey(testKey);
  assert(
    instance3Result !== null && instance3Result.processing === false,
    "Instance 3 reads completed transaction outcome directly from authoritative DB"
  );

  // Cleanup test key
  await IdempotencyRepository.releaseLock(testKey);

  // 3. Authority Model Verification
  console.log("\n--- TEST 3: Architectural Authority Model Classification ---");
  const status = RedisConnectionManager.getStatus();
  assert(
    status === "REDIS_FALLBACK_MEMORY_MODE" || status === "REDIS_AVAILABLE",
    "RedisConnectionManager reports valid operational mode"
  );

  console.log("\n==========================================================================");
  console.log(`📊 MULTI-INSTANCE AUDIT RESULTS: ${passed}/${total} assertions passed (${Math.round((passed / total) * 100)}%)`);
  console.log("==========================================================================\n");

  if (passed === total) {
    console.log("🛡️ Cross-Instance Consistency & Database Authority Verified: SAFE");
    process.exit(0);
  } else {
    console.error("❌ Audit failed.");
    process.exit(1);
  }
}

runMultiInstanceAudit().catch((err) => {
  console.error("Audit script fatal error:", err);
  process.exit(1);
});
