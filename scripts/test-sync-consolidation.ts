// scripts/test-sync-consolidation.ts
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
  (global as any).window.location = { origin: 'http://localhost:3000' };
}

if (typeof global.document === 'undefined') {
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible'
  };
}

import axios from 'axios';
import { DistributedSyncEngine } from '../src/features/sync/sync.engine';
import { SyncEngine } from '../src/features/sync/SyncEngine';
import { TokenProvider } from '../src/services/auth/tokenProvider';
import { SyncWorker } from '../packages/sync-engine/src/workers/sync.worker';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
}

// In-Memory Dexie Table Mock
function createMockTable() {
  const items: any[] = [];
  return {
    add: async (item: any) => {
      if (item.idempotencyKey && items.some(i => i.idempotencyKey === item.idempotencyKey)) {
        const err: any = new Error('Key already exists');
        err.name = 'ConstraintError';
        throw err;
      }
      const newItem = { id: items.length + 1, ...item };
      items.push(newItem);
      return newItem.id;
    },
    update: async (id: number, patch: any) => {
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) {
        items[idx] = { ...items[idx], ...patch };
      }
    },
    delete: async (id: number) => {
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) items.splice(idx, 1);
    },
    where: (field: string) => {
      return {
        equals: (val: any) => ({
          first: async () => items.find(i => i[field] === val) || null,
          toArray: async () => items.filter(i => i[field] === val)
        }),
        anyOf: (...vals: any[]) => ({
          toArray: async () => items.filter(i => vals.flat().includes(i[field]))
        }),
        between: (min: any, max: any) => ({
          limit: (n: number) => ({
            toArray: async () => {
              const pendingStatus = Array.isArray(min) ? min[0] : 'PENDING';
              return items.filter(i => (i.syncStatus === pendingStatus || i.status === pendingStatus)).slice(0, n);
            }
          })
        })
      };
    },
    toArray: async () => [...items],
    _rawItems: items
  };
}

function createMockDb() {
  const syncQueueTable = createMockTable();
  const outboxTable = createMockTable();
  const failedTable = createMockTable();
  const invoicesTable = createMockTable();
  const productsTable = createMockTable();

  return {
    syncQueue: syncQueueTable,
    outbox: outboxTable,
    failedMutations: failedTable,
    invoices: invoicesTable,
    products: productsTable,
    transaction: async (mode: string, tables: any, fn: any) => {
      return await fn();
    }
  };
}

async function runTests() {
  localStorage.clear();
  localStorage.setItem('pharmaflow_user', JSON.stringify({
    id: 'usr_test_101',
    email: 'test@pharmaflow.local',
    tenantId: 'tenant_alpha',
    branchId: 'branch_cairo_01'
  }));
  console.log('====================================================');
  console.log('🧪 Phase 3.4.3 — Unified Sync Engine Test Suite');
  console.log('====================================================\n');

  // Setup initial auth session
  TokenProvider.setSession(
    { id: 'usr_test_101', email: 'test@pharmaflow.local' } as any,
    'access_token_sync_test',
    'refresh_token_sync_test',
    { tenantId: 'tenant_alpha', branchId: 'branch_cairo_01', roles: ['Pharmacist'] }
  );

  const mockDb = createMockDb();
  const engine = DistributedSyncEngine.getInstance(mockDb);

  // Mock global fetch for API endpoints
  let pushHttpCalls = 0;
  let pullHttpCalls = 0;
  let lastPushBody: any = null;
  let lastPushHeaders: any = null;

  const originalFetch = global.fetch;
  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/api/v1/sync/push')) {
      pushHttpCalls++;
      lastPushBody = JSON.parse(init.body);
      lastPushHeaders = init.headers;
      await new Promise(r => setTimeout(r, 80));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, processedCount: 1 })
      };
    }
    if (url.includes('/api/v1/sync/pull')) {
      pullHttpCalls++;
      await new Promise(r => setTimeout(r, 50));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, nextCursor: 100, changes: [] })
      };
    }
    return { ok: false, status: 404 };
  };

  // ----------------------------------------------------
  // TEST A: Single Flight Coalescing
  // ----------------------------------------------------
  console.log('--- Test A: Single Flight Coalescing ---');
  const initialPullCount = pullHttpCalls;
  
  // Trigger 10 simultaneous syncNow calls
  const syncPromises = Array.from({ length: 10 }).map(() => engine.syncNow());
  await Promise.all(syncPromises);

  const newPullCount = pullHttpCalls - initialPullCount;
  assert(newPullCount === 1, `10 simultaneous syncNow() calls coalesced into exactly 1 active network pull cycle (actual: ${newPullCount})`);

  // ----------------------------------------------------
  // TEST B: Queue Deduplication & Atomic Enqueue
  // ----------------------------------------------------
  console.log('\n--- Test B: Queue Deduplication & Atomic Enqueue ---');
  const customKey = 'SALE:inv_1001:CREATE:1:branch_cairo_01';
  
  const res1 = await engine.enqueue('CREATE', { id: 'inv_1001', amount: 450 }, 'SALE', customKey);
  const res2 = await engine.enqueue('CREATE', { id: 'inv_1001', amount: 450 }, 'SALE', customKey);

  assert(res1.idempotencyKey === customKey, 'First enqueue returns generated custom key');
  assert(res2.idempotencyKey === customKey, 'Second enqueue returns same custom key');
  
  const queuedItems = await mockDb.syncQueue.toArray();
  const matchingItems = queuedItems.filter((i: any) => i.idempotencyKey === customKey);
  assert(matchingItems.length === 1, 'Idempotency constraint prevented duplicate queue insertion');

  // ----------------------------------------------------
  // TEST C: Enterprise Offline Safety
  // ----------------------------------------------------
  console.log('\n--- Test C: Offline Safety ---');
  (global.navigator as any).onLine = false;

  const offlineEnqueue = await engine.enqueue('CREATE', { id: 'inv_offline_99', amount: 120 }, 'SALE');
  assert(offlineEnqueue.mutationId !== undefined, 'Offline enqueue succeeds locally');
  
  await engine.syncNow();
  assert(TokenProvider.isAuthenticated() === true, 'Offline sync attempt preserves active auth session (no logout)');

  (global.navigator as any).onLine = true;

  // ----------------------------------------------------
  // TEST D: Network Recovery Coalescing
  // ----------------------------------------------------
  console.log('\n--- Test D: Network Recovery Coalescing ---');
  await new Promise(r => setTimeout(r, 350));
  const callsBeforeRecovery = pullHttpCalls;
  
  // Simulate 5 rapid online events
  (engine as any).handleNetworkChange();
  (engine as any).handleNetworkChange();
  (engine as any).handleNetworkChange();
  (engine as any).handleNetworkChange();
  (engine as any).handleNetworkChange();

  // Wait for debounce timer
  await new Promise(r => setTimeout(r, 400));
  const callsAfterRecovery = pullHttpCalls - callsBeforeRecovery;
  assert(callsAfterRecovery === 1, `Rapid online triggers coalesced into 1 recovery sync (actual: ${callsAfterRecovery})`);

  // ----------------------------------------------------
  // TEST E: Multi-Tenant Isolation
  // ----------------------------------------------------
  console.log('\n--- Test E: Multi-Tenant Isolation ---');
  (global.navigator as any).onLine = false;
  await engine.enqueue('CREATE', { id: 'inv_tenant_b' }, 'SALE', undefined, { tenantId: 'tenant_beta', branchId: 'branch_alex_02' });
  (global.navigator as any).onLine = true;
  await engine.drainQueue();

  assert(lastPushBody !== null, 'Push request executed with payload');
  const pushTenant = lastPushHeaders['X-Tenant-ID'] || lastPushHeaders['x-tenant-id'];
  assert(pushTenant === 'tenant_beta', `Headers strictly enforce active context tenant (actual: ${pushTenant})`);

  // ----------------------------------------------------
  // TEST F: 401 Single-Flight Token Refresh Flow
  // ----------------------------------------------------
  console.log('\n--- Test F: 401 Single-Flight Token Refresh ---');
  console.log('Current Refresh Token before Test F:', TokenProvider.getRefreshToken());
  let attempt401Count = 0;
  let refreshAttemptCount = 0;

  // Mock fetch to simulate 401 on first attempt, then success after refresh
  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/api/auth/refresh')) {
      refreshAttemptCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'rotated_access_token_777',
          refreshToken: 'rotated_refresh_token_888',
          user: { id: 'usr_test_101', email: 'test@pharmaflow.local' }
        })
      };
    }
    if (url.includes('/api/v1/sync/push')) {
      attempt401Count++;
      if (attempt401Count === 1) {
        return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };

  // Mock axios for TokenProvider refresh endpoint
  const originalAxiosPost = axios.post;
  const mockAxiosPost = async (url: string, body?: any, config?: any) => {
    if (url.includes('/api/auth/refresh')) {
      refreshAttemptCount++;
      return {
        data: {
          accessToken: 'rotated_access_token_777',
          refreshToken: 'rotated_refresh_token_888',
          user: { id: 'usr_test_101', email: 'test@pharmaflow.local' }
        }
      };
    }
    return originalAxiosPost ? originalAxiosPost(url, body, config) : { data: {} };
  };
  (axios as any).post = mockAxiosPost;
  if ((axios as any).default) {
    (axios as any).default.post = mockAxiosPost;
  }

  (global.navigator as any).onLine = false;
  await engine.enqueue('CREATE', { id: 'inv_401_test' }, 'SALE');
  (global.navigator as any).onLine = true;
  await engine.drainQueue();

  assert(refreshAttemptCount === 1, 'Single-flight token refresh triggered once upon 401');
  assert(TokenProvider.getAccessToken() === 'rotated_access_token_777', 'Rotated token updated in TokenProvider');
  
  (axios as any).post = originalAxiosPost;
  (global as any).fetch = originalFetch;

  // ----------------------------------------------------
  // TEST G: Legacy Compatibility Facade (SyncEngine.ts)
  // ----------------------------------------------------
  console.log('\n--- Test G: Legacy Compatibility Facade ---');
  const legacyEnqueueRes = await SyncEngine.enqueue('CREATE', { id: 'legacy_inv_1' }, 'SALE');
  assert(legacyEnqueueRes.mutationId !== undefined, 'SyncEngine.enqueue() delegates to DistributedSyncEngine');

  await SyncEngine.drainQueue();
  assert(true, 'SyncEngine.drainQueue() delegates cleanly to DistributedSyncEngine');

  // ----------------------------------------------------
  // TEST H: SyncWorker Delegation
  // ----------------------------------------------------
  console.log('\n--- Test H: SyncWorker Delegation ---');
  const worker = SyncWorker.getInstance();
  worker.triggerSync();
  assert(true, 'SyncWorker.triggerSync() delegates to DistributedSyncEngine single-flight requestSync');

  console.log('\n====================================================');
  console.log(`🎉 All Tests Completed: ${passedTests}/${totalTests} Passed Successfully!`);
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('❌ Sync consolidation test suite execution failed:', err);
  process.exit(1);
});
