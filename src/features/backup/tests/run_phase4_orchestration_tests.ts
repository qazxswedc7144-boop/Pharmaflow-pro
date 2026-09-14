import 'fake-indexeddb/auto';
import { db } from '@/core/db';
import { CryptoService } from '@/services/security/CryptoService';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BackupService } from '../services/BackupService';
import { BackupStorageAdapter } from '../services/storage/BackupStorageAdapter';
import { BackupRetryService } from '../services/BackupRetryService';
import { BackupOrchestrator } from '../services/BackupOrchestrator';
import { BackupEvent } from '../backup.types';

interface TestResult {
  name: string;
  description: string;
  passed: boolean;
  error?: string;
}

// Mock storage adapter for orchestrated testing
class MockStorageAdapter implements BackupStorageAdapter {
  public uploadCallCount = 0;
  public shouldFailCount = 0;
  public failPermanently = false;
  public uploadedPaths: string[] = [];

  async upload(path: string, _data: any): Promise<string> {
    this.uploadCallCount++;
    if (this.failPermanently) {
      throw new Error('Network error: Cloud storage unavailable');
    }
    if (this.shouldFailCount > 0) {
      this.shouldFailCount--;
      throw new Error('Transient error: Connection reset');
    }
    this.uploadedPaths.push(path);
    return `https://mockstorage.example.com/${path}`;
  }
}

async function runPhase4TestSuite() {
  CryptoService.setIterations(1000);
  await db.open();
  const results: TestResult[] = [];

  const test = async (name: string, description: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, description, passed: true });
      console.log(`✅ [PASS] ${name} - ${description}`);
    } catch (err: any) {
      results.push({ name, description, passed: false, error: err?.message || String(err) });
      console.error(`❌ [FAIL] ${name} - ${description}:`, err?.message || err);
    }
  };

  console.log('\n===================================================================');
  console.log('🧪 Starting Phase 4 Automated Backup Orchestration Test Suite');
  console.log('===================================================================\n');

  // Clear systemBackups table
  await db.systemBackups.clear();

  // Test 1: Auto Backup Disabled
  await test('1. Auto Backup Disabled', 'Rejects auto backup when autoBackupEnabled is false', async () => {
    useSettingsStore.setState({ autoBackupEnabled: false, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    const result = await orchestrator.triggerAutoBackup();
    if (result.success !== false) {
      throw new Error('Expected triggerAutoBackup to return success: false when autoBackupEnabled is false');
    }
    if (!result.error?.includes('معطل')) {
      throw new Error(`Expected disabled message, got: ${result.error}`);
    }
  });

  // Test 2: Auto Backup Enabled with valid password
  await test('2. Auto Backup Enabled', 'Executes backup when enabled with valid password', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    const result = await orchestrator.triggerAutoBackup({ force: true });
    if (!result.success || !result.localSuccess || !result.cloudSuccess) {
      throw new Error(`Backup failed: ${JSON.stringify(result)}`);
    }
    if (result.jobState !== 'completed') {
      throw new Error(`Expected jobState "completed", got "${result.jobState}"`);
    }
    if (mockStorage.uploadCallCount !== 1) {
      throw new Error(`Expected 1 upload call, got ${mockStorage.uploadCallCount}`);
    }
  });

  // Test 3: Empty Password
  await test('3. Empty Password Validation', 'Safely rejects backup when password is missing or empty', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: '' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    const result = await orchestrator.triggerAutoBackup({ force: true, password: '' });
    if (result.success !== false) {
      throw new Error('Expected backup to fail on empty password');
    }
    if (!result.error?.includes('كلمة مرور')) {
      throw new Error(`Expected password error message, got: ${result.error}`);
    }
  });

  // Test 4: Offline Mode (Local First)
  await test('4. Offline Mode Handling', 'Completes local backup and marks cloud pending when offline', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    // Simulate offline
    orchestrator.setOnlineStatusGetter(() => false);

    const result = await orchestrator.triggerAutoBackup({ force: true });
    if (!result.success || !result.localSuccess) {
      throw new Error('Local backup should succeed even when offline');
    }
    if (result.cloudSuccess !== false || result.cloudPending !== true) {
      throw new Error(`Expected cloudSuccess: false and cloudPending: true, got cloudSuccess: ${result.cloudSuccess}, cloudPending: ${result.cloudPending}`);
    }
    if (mockStorage.uploadCallCount !== 0) {
      throw new Error('Should not attempt upload when offline');
    }
    if (orchestrator.getPendingCloudSyncCount() !== 1) {
      throw new Error(`Expected 1 pending cloud backup, got ${orchestrator.getPendingCloudSyncCount()}`);
    }
  });

  // Test 5: Cloud Upload Failure Isolation
  await test('5. Cloud Failure Isolation', 'Local backup remains intact and successful if cloud upload fails', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    mockStorage.failPermanently = true; // Force cloud failure
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 2, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    const result = await orchestrator.triggerAutoBackup({ force: true });
    if (!result.success || !result.localSuccess) {
      throw new Error('Local backup must remain successful despite cloud failure');
    }
    if (result.cloudSuccess !== false || result.cloudPending !== true) {
      throw new Error('Cloud success should be false and cloudPending true');
    }
    if (result.jobState !== 'cloud-failed') {
      throw new Error(`Expected jobState "cloud-failed", got "${result.jobState}"`);
    }
  });

  // Test 6: Cloud Retry with Exponential Backoff
  await test('6. Cloud Retry & Recovery', 'Retries failed upload and recovers successfully', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    mockStorage.shouldFailCount = 2; // Fail twice then succeed on 3rd attempt
    const backupSvc = new BackupService(mockStorage);
    let retryCalls = 0;
    const retrySvc = new BackupRetryService(
      { maxAttempts: 3, initialDelayMs: 10, backoffMultiplier: 2, maxDelayMs: 50, timeoutMs: 1000 },
      async () => { retryCalls++; }
    );
    const orchestrator = new BackupOrchestrator(backupSvc, retrySvc);

    const result = await orchestrator.triggerAutoBackup({ force: true });
    if (!result.success || !result.cloudSuccess) {
      throw new Error('Expected backup to succeed after retries');
    }
    if (mockStorage.uploadCallCount !== 3) {
      throw new Error(`Expected 3 upload calls (2 failures + 1 success), got ${mockStorage.uploadCallCount}`);
    }
    if (retryCalls !== 2) {
      throw new Error(`Expected 2 retry sleep calls, got ${retryCalls}`);
    }
  });

  // Test 7: Max Retries Exhaustion
  await test('7. Max Retries Exhaustion', 'Stops retrying after max attempts without infinite loop', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    mockStorage.failPermanently = true;
    const backupSvc = new BackupService(mockStorage);
    let sleepCalls = 0;
    const retrySvc = new BackupRetryService(
      { maxAttempts: 3, initialDelayMs: 1, backoffMultiplier: 2, maxDelayMs: 10, timeoutMs: 1000 },
      async () => { sleepCalls++; }
    );
    const orchestrator = new BackupOrchestrator(backupSvc, retrySvc);

    const result = await orchestrator.triggerAutoBackup({ force: true });
    if (!result.localSuccess) {
      throw new Error('Local backup should still be valid');
    }
    if (result.cloudSuccess !== false) {
      throw new Error('Cloud upload must fail after max retries');
    }
    if (mockStorage.uploadCallCount !== 3) {
      throw new Error(`Expected exactly 3 upload attempts, got ${mockStorage.uploadCallCount}`);
    }
    if (sleepCalls !== 2) {
      throw new Error(`Expected 2 sleep delays between 3 attempts, got ${sleepCalls}`);
    }
  });

  // Test 8: Concurrency Locking Protection
  await test('8. Concurrency Locking', 'Prevents two simultaneous backup operations from running', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    // Start first backup and immediately attempt second
    const promise1 = orchestrator.triggerAutoBackup({ force: true });
    const promise2 = orchestrator.triggerAutoBackup({ force: true });

    const [res1, res2] = await Promise.all([promise1, promise2]);
    const oneSucceeded = (res1.success && !res2.success) || (!res1.success && res2.success);
    if (!oneSucceeded) {
      throw new Error(`Expected exactly one backup to proceed. Res1: ${res1.success}, Res2: ${res2.success}`);
    }
    const failedRes = !res1.success ? res1 : res2;
    if (!failedRes.error?.includes('قيد التنفيذ')) {
      throw new Error(`Expected lock conflict error message, got: ${failedRes.error}`);
    }
  });

  // Test 9: Cooldown / Duplicate Protection
  await test('9. Cooldown Duplicate Prevention', 'Suppresses duplicate triggers within cooldown window', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    const res1 = await orchestrator.triggerAutoBackup({ force: false, source: 'lifecycle' });
    if (!res1.success) {
      throw new Error(`First trigger should succeed: ${res1.error}`);
    }

    // Immediate second lifecycle trigger
    const res2 = await orchestrator.triggerAutoBackup({ force: false, source: 'lifecycle' });
    if (res2.success !== false) {
      throw new Error('Second trigger within cooldown should be suppressed');
    }
    if (!res2.error?.includes('تكرار')) {
      throw new Error(`Expected cooldown error, got: ${res2.error}`);
    }
  });

  // Test 10: Observability Event Stream
  await test('10. Observability Events', 'Emits structured lifecycle events throughout the backup flow', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    const receivedEvents: BackupEvent[] = [];
    const unsubscribe = orchestrator.addEventListener((event) => {
      receivedEvents.push(event);
    });

    await orchestrator.triggerAutoBackup({ force: true });
    unsubscribe();

    const eventTypes = receivedEvents.map(e => e.type);
    if (!eventTypes.includes('started')) throw new Error('Missing "started" event');
    if (!eventTypes.includes('local-success')) throw new Error('Missing "local-success" event');
    if (!eventTypes.includes('cloud-upload-started')) throw new Error('Missing "cloud-upload-started" event');
    if (!eventTypes.includes('cloud-success')) throw new Error('Missing "cloud-success" event');
    if (!eventTypes.includes('completed')) throw new Error('Missing "completed" event');
  });

  // Test 11: Offline Queue Re-Sync
  await test('11. Offline Queue Re-Sync', 'Syncs pending offline backups when network is restored', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'SecurePassword123!' });
    const mockStorage = new MockStorageAdapter();
    const backupSvc = new BackupService(mockStorage);
    const orchestrator = new BackupOrchestrator(backupSvc, new BackupRetryService({ maxAttempts: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1, timeoutMs: 1000 }, async () => {}));

    // Generate 2 offline backups
    orchestrator.setOnlineStatusGetter(() => false);
    await orchestrator.triggerAutoBackup({ force: true });
    await orchestrator.triggerAutoBackup({ force: true });

    if (orchestrator.getPendingCloudSyncCount() !== 2) {
      throw new Error(`Expected 2 pending items, got ${orchestrator.getPendingCloudSyncCount()}`);
    }

    // Now switch online and sync
    orchestrator.setOnlineStatusGetter(() => true);
    const synced = await orchestrator.syncPendingCloudBackups();
    if (synced !== 2) {
      throw new Error(`Expected 2 synced backups, got ${synced}`);
    }
    if (orchestrator.getPendingCloudSyncCount() !== 0) {
      throw new Error(`Expected 0 pending items after sync, got ${orchestrator.getPendingCloudSyncCount()}`);
    }
    if (mockStorage.uploadedPaths.length !== 2) {
      throw new Error(`Expected 2 uploaded files to cloud storage, got ${mockStorage.uploadedPaths.length}`);
    }
  });

  console.log('\n===================================================================');
  console.log(`📊 Phase 4 Test Suite Results: ${results.filter(r => r.passed).length}/${results.length} Passed`);
  console.log('===================================================================\n');

  const failedTests = results.filter(r => !r.passed);
  if (failedTests.length > 0) {
    console.error(`💥 ${failedTests.length} tests failed:`);
    for (const f of failedTests) {
      console.error(` - [${f.name}]: ${f.error}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

runPhase4TestSuite().catch((err) => {
  console.error('Fatal error in Phase 4 test runner:', err);
  process.exit(1);
});
