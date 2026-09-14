// scripts/test-redis-fallback-hardening.ts
import { sanitizeRedisUrl, RedisConnectionManager } from "../server/database/redis";
import { LockingService } from "../server/modules/locking/locking.service";

async function runTests() {
  console.log("===============================================================");
  console.log("🧪 PharmaFlow PRO ERP — Redis Hardening & Fallback Test Suite");
  console.log("===============================================================\n");

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

  // TEST 1: Sanitizer Masking (No secret leakage in logs)
  console.log("\n--- TEST SUITE 1: Secret Redaction & Sanitization ---");
  const urlWithPassword = "redis://:superSecretP@ss123@redis-cluster.internal:6379/0";
  const sanitized = sanitizeRedisUrl(urlWithPassword);
  assert(!sanitized.includes("superSecretP@ss123"), "Passwords must never appear in sanitized output", sanitized);
  assert(sanitized.includes("***:***@") || sanitized.includes("***@"), "Sanitized output must include mask indicator", sanitized);

  const urlWithUserAndPass = "rediss://pharmaAdmin:MySecurePassword999@europe-west2.redis.cache:6380/1";
  const sanitizedUserPass = sanitizeRedisUrl(urlWithUserAndPass);
  assert(!sanitizedUserPass.includes("MySecurePassword999") && !sanitizedUserPass.includes("pharmaAdmin"), "Username and password redacted", sanitizedUserPass);

  const emptyUrl = sanitizeRedisUrl("");
  assert(emptyUrl === "[EMPTY]" || emptyUrl === "[NOT_CONFIGURED]", "Empty URL handled safely", emptyUrl);

  // TEST 2: In-Memory Cache Provider Operations (Fallback mode)
  console.log("\n--- TEST SUITE 2: In-Memory Cache Operations ---");
  await RedisConnectionManager.clear();

  assert(RedisConnectionManager.getStatus() === "REDIS_FALLBACK_MEMORY_MODE", "Reports REDIS_FALLBACK_MEMORY_MODE status");
  assert(RedisConnectionManager.isMemoryFallback === true, "isMemoryFallback is true");

  // Basic Set & Get
  await RedisConnectionManager.set("test:key:1", "value1");
  const val1 = await RedisConnectionManager.get("test:key:1");
  assert(val1 === "value1", "Basic key SET and GET works correctly in memory fallback");

  // Delete
  await RedisConnectionManager.del("test:key:1");
  const valDel = await RedisConnectionManager.get("test:key:1");
  assert(valDel === null, "Key DEL works correctly");

  // TTL Expiration
  await RedisConnectionManager.set("test:key:ttl", "temporary", "PX", 50);
  const valBefore = await RedisConnectionManager.get("test:key:ttl");
  assert(valBefore === "temporary", "Key exists before TTL expiry");
  
  await new Promise((r) => setTimeout(r, 60));
  const valAfter = await RedisConnectionManager.get("test:key:ttl");
  assert(valAfter === null, "Key automatically expires and returns null after TTL");

  // ScanKeys pattern matching
  await RedisConnectionManager.set("branch:B1:stock:P100", "10");
  await RedisConnectionManager.set("branch:B1:stock:P200", "20");
  await RedisConnectionManager.set("branch:B2:stock:P300", "30");

  const b1Keys = await RedisConnectionManager.scanKeys("branch:B1:*");
  assert(b1Keys.length === 2, "Pattern scanning accurately isolates branch keys", JSON.stringify(b1Keys));

  // TEST 3: Mutex & NX (Set if Not Exists) Atomic Locking
  console.log("\n--- TEST SUITE 3: Atomic Lock & Mutex Safety in Fallback Mode ---");
  await RedisConnectionManager.clear();

  // Acquire Lock for branch BRH-001 on inventory item MED-A
  const lock1 = await LockingService.acquireLock({
    key: "inventory:MED-A",
    branchId: "BRH-001",
    lockType: "INVENTORY",
    ownerId: "USER-1",
    ttl: 5000
  });

  assert(lock1 !== null, "Lock acquired successfully on unlocked resource");
  assert(lock1?.ownerId === "USER-1", "Lock record contains valid owner ID");

  // Attempt concurrent lock acquisition on SAME key and branch
  const lockConflict = await LockingService.acquireLock({
    key: "inventory:MED-A",
    branchId: "BRH-001",
    lockType: "INVENTORY",
    ownerId: "USER-2",
    ttl: 5000
  });

  assert(lockConflict === null, "Concurrent lock attempt on locked resource is REJECTED (NX Mutex)");

  // Attempt lock acquisition on SAME item key but DIFFERENT branch (Branch Isolation)
  const lockBranch2 = await LockingService.acquireLock({
    key: "inventory:MED-A",
    branchId: "BRH-002",
    lockType: "INVENTORY",
    ownerId: "USER-2",
    ttl: 5000
  });

  assert(lockBranch2 !== null, "Lock acquisition on different branch succeeds (Strict Branch Isolation)");

  // Verify Lock Status
  const isLockedB1 = await LockingService.isLocked("inventory:MED-A", "BRH-001");
  assert(isLockedB1 === true, "Resource is correctly flagged as locked");

  // Attempt to release with WRONG lockId / owner (Security protection)
  if (lock1) {
    const unauthorizedRelease = await LockingService.releaseLock("inventory:MED-A", "FAKE-LOCK-ID", "BRH-001", "HACKER");
    assert(unauthorizedRelease === false, "Unauthorized lock release attempt fails");

    // Release with legitimate lockId
    const legitimateRelease = await LockingService.releaseLock("inventory:MED-A", lock1.id, "BRH-001", "USER-1");
    assert(legitimateRelease === true, "Legitimate lock release succeeds");

    const isLockedAfter = await LockingService.isLocked("inventory:MED-A", "BRH-001");
    assert(isLockedAfter === false, "Resource is no longer locked after release");
  }

  // TEST 4: Lock Extension
  console.log("\n--- TEST SUITE 4: Lock Extension Verification ---");
  const lockExtendTest = await LockingService.acquireLock({
    key: "sync:pos:1",
    branchId: "BRH-001",
    lockType: "SYNC",
    ownerId: "POS-TERM-1",
    ttl: 1000
  });

  if (lockExtendTest) {
    const extendSuccess = await LockingService.extendLock("sync:pos:1", lockExtendTest.id, "BRH-001", 5000, "POS-TERM-1");
    assert(extendSuccess === true, "Owner can extend active lock TTL");

    const invalidExtend = await LockingService.extendLock("sync:pos:1", "INVALID-ID", "BRH-001", 5000, "POS-TERM-2");
    assert(invalidExtend === false, "Unauthorized user cannot extend lock TTL");

    await LockingService.releaseLock("sync:pos:1", lockExtendTest.id, "BRH-001", "POS-TERM-1");
  }

  // TEST 5: RedisConnectionManager API Compatibility
  console.log("\n--- TEST SUITE 5: RedisConnectionManager Backward Compatibility ---");
  await RedisConnectionManager.set("report:trial_balance", JSON.stringify({ balanced: true }), "EX", 300);
  const cachedReport = await RedisConnectionManager.get("report:trial_balance");
  assert(cachedReport !== null && JSON.parse(cachedReport).balanced === true, "Consolidation reporting cache works via RedisConnectionManager");

  console.log("\n===============================================================");
  console.log(`📊 TEST RESULTS: ${passed}/${total} assertions passed (${Math.round((passed / total) * 100)}%)`);
  console.log("===============================================================\n");

  if (passed === total) {
    console.log("🎉 All Redis Fallback Hardening tests passed successfully!");
    process.exit(0);
  } else {
    console.error("❌ Some tests failed.");
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
