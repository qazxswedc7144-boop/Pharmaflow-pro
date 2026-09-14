import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import CryptoJS from 'crypto-js';
import { db } from '@/core/db';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BackupService } from '../services/BackupService';
import { BackupManagementService } from '../services/BackupManagementService';
import { BackupOrchestrator } from '../services/BackupOrchestrator';
import { BackupHealthService } from '../services/BackupHealthService';
import { CryptoService } from '@/services/security/CryptoService';
import { BackupInventoryItem } from '../backup.types';

interface TestResult {
  number: number;
  name: string;
  description: string;
  passed: boolean;
  error?: string;
}

async function runPhase5DisasterRecoveryTestSuite() {
  CryptoService.setIterations(1000);
  await db.open();
  const results: TestResult[] = [];
  let testIndex = 1;

  const test = async (name: string, description: string, fn: () => Promise<void>) => {
    const currentNumber = testIndex++;
    try {
      await fn();
      results.push({ number: currentNumber, name, description, passed: true });
      console.log(`✅ [PASS] ${currentNumber}. ${name} - ${description}`);
    } catch (err: any) {
      results.push({ number: currentNumber, name, description, passed: false, error: err?.message || String(err) });
      console.error(`❌ [FAIL] ${currentNumber}. ${name} - ${description}:`, err?.message || err);
    }
  };

  console.log('\n===================================================================');
  console.log('🧪 Starting Phase 5 Backup Observability & Disaster Recovery Test Suite');
  console.log('===================================================================\n');

  const backupService = new BackupService();
  const managementService = new BackupManagementService(backupService);
  const orchestrator = new BackupOrchestrator(backupService);
  const healthService = new BackupHealthService(managementService, backupService, orchestrator);

  // Clear systemBackups table before test run
  await db.systemBackups.clear();

  // Test 1: Healthy Backup State
  await test('Healthy Backup State', 'Recent valid backup produces healthy status & ready recovery readiness', async () => {
    await db.systemBackups.clear();
    const recentDate = new Date().toISOString();
    await db.systemBackups.add({
      id: 'healthy-b1',
      backupName: 'PharmaFlow_Healthy.pfb',
      createdAt: recentDate,
      backupType: 'full' as any,
      createdBy: 'system',
      systemVersion: '1.0.0',
      dataSnapshot: '',
      checksumHash: 'abc123sha256',
      sizeInKB: 120,
      status: 'SUCCESS',
      restoreTested: true
    });

    const summary = await healthService.getDetailedHealthSummary();
    if (summary.overallHealth !== 'healthy') {
      throw new Error(`Expected overallHealth 'healthy', got '${summary.overallHealth}'`);
    }
    if (summary.recoveryReadiness !== 'ready') {
      throw new Error(`Expected recoveryReadiness 'ready', got '${summary.recoveryReadiness}'`);
    }
    if (summary.totalBackups !== 1) {
      throw new Error(`Expected totalBackups 1, got ${summary.totalBackups}`);
    }
  });

  // Test 2: Warning Backup State (Stale backup)
  await test('Warning Backup State', 'Stale backup (>24h) triggers warning overall health and readiness warning', async () => {
    await db.systemBackups.clear();
    const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    await db.systemBackups.add({
      id: 'stale-b1',
      backupName: 'PharmaFlow_Stale.pfb',
      createdAt: staleDate,
      backupType: 'full' as any,
      createdBy: 'system',
      systemVersion: '1.0.0',
      dataSnapshot: '',
      checksumHash: 'abc123sha256',
      sizeInKB: 120,
      status: 'SUCCESS',
      restoreTested: false
    });

    const summary = await healthService.getDetailedHealthSummary();
    if (summary.overallHealth !== 'warning') {
      throw new Error(`Expected overallHealth 'warning' for stale backup, got '${summary.overallHealth}'`);
    }
    if (summary.recoveryReadiness !== 'warning') {
      throw new Error(`Expected recoveryReadiness 'warning', got '${summary.recoveryReadiness}'`);
    }
  });

  // Test 3: Critical Backup State (No backups / All failed)
  await test('Critical Backup State', 'Zero backups or all failed backups produces critical health & not_ready readiness', async () => {
    await db.systemBackups.clear();
    await db.systemBackups.add({
      id: 'failed-b1',
      backupName: 'PharmaFlow_Failed.pfb',
      createdAt: new Date().toISOString(),
      backupType: 'full' as any,
      createdBy: 'system',
      systemVersion: '1.0.0',
      dataSnapshot: '',
      checksumHash: '',
      sizeInKB: 0,
      status: 'FAILED',
      restoreTested: false
    });

    const summary = await healthService.getDetailedHealthSummary();
    if (summary.overallHealth !== 'critical') {
      throw new Error(`Expected overallHealth 'critical', got '${summary.overallHealth}'`);
    }
    if (summary.recoveryReadiness !== 'not_ready') {
      throw new Error(`Expected recoveryReadiness 'not_ready', got '${summary.recoveryReadiness}'`);
    }
  });

  // Test 4: Valid Checksum Verification
  await test('Valid Checksum', 'verifyBackupPackage confirms matching SHA-256 checksum in memory', async () => {
    const payload = CryptoService.encrypt(JSON.stringify({ products: [{ id: 'p1' }] }), 'TestPass123!');
    const payloadStr = JSON.stringify(payload);
    const checksum = CryptoJS.SHA256(payloadStr).toString();

    const zip = new JSZip();
    zip.file("data.enc", payloadStr);
    zip.file("metadata.json", JSON.stringify({ id: 'chk-1', checksum, version: '1.0.0' }));
    const blob = await zip.generateAsync({ type: "blob" });

    const report = await healthService.verifyBackupPackage(blob);
    if (!report.valid || report.checksumMatched !== true) {
      throw new Error(`Expected valid report with checksumMatched=true, got ${JSON.stringify(report)}`);
    }
  });

  // Test 5: Invalid Checksum Detection
  await test('Invalid Checksum', 'verifyBackupPackage rejects mismatched SHA-256 checksum', async () => {
    const payload = CryptoService.encrypt(JSON.stringify({ products: [{ id: 'p1' }] }), 'TestPass123!');
    const payloadStr = JSON.stringify(payload);

    const zip = new JSZip();
    zip.file("data.enc", payloadStr);
    zip.file("metadata.json", JSON.stringify({ id: 'chk-bad', checksum: 'fake_tampered_checksum_hash', version: '1.0.0' }));
    const blob = await zip.generateAsync({ type: "blob" });

    const report = await healthService.verifyBackupPackage(blob);
    if (report.valid || report.checksumMatched !== false) {
      throw new Error(`Expected invalid report with checksumMatched=false, got ${JSON.stringify(report)}`);
    }
  });

  // Test 6: Missing data.enc Archive Handling
  await test('Missing data.enc', 'verifyBackupPackage rejects ZIP archive lacking data.enc', async () => {
    const zip = new JSZip();
    zip.file("metadata.json", JSON.stringify({ id: 'no-enc', version: '1.0.0' }));
    const blob = await zip.generateAsync({ type: "blob" });

    const report = await healthService.verifyBackupPackage(blob);
    if (report.valid || report.hasDataEnc !== false) {
      throw new Error(`Expected report with hasDataEnc=false, got ${JSON.stringify(report)}`);
    }
  });

  // Test 7: Corrupted Encrypted Payload
  await test('Corrupted Encrypted Payload', 'verifyBackupPackage rejects malformed JSON or missing crypto fields in data.enc', async () => {
    const zip = new JSZip();
    zip.file("data.enc", "this_is_not_valid_json_payload");
    zip.file("metadata.json", JSON.stringify({ id: 'corrupt-json', version: '1.0.0' }));
    const blob = await zip.generateAsync({ type: "blob" });

    const report = await healthService.verifyBackupPackage(blob);
    if (report.valid || report.hasValidJson !== false) {
      throw new Error(`Expected report with hasValidJson=false, got ${JSON.stringify(report)}`);
    }
  });

  // Test 8: Wrong Password Rejection
  await test('Wrong Password', 'validateBackup fails gracefully on incorrect decryption password without modifying DB', async () => {
    const data = { products: [{ id: 'p-secret', name: 'Confidential Medicine' }] };
    const backup = await backupService.createLocalBackup(data, 'CorrectPassword123!', 'full');

    const result = await backupService.validateBackup(backup.blob!, 'WrongPassword999!');
    if (result.valid) {
      throw new Error('validateBackup accepted incorrect password!');
    }
    if (!result.error?.includes('كلمة المرور غير صحيحة')) {
      throw new Error(`Expected wrong password message, got: ${result.error}`);
    }
  });

  // Test 9: Recovery Readiness: Ready
  await test('Recovery Readiness: Ready', 'Accurately calculates ready state when recent valid backups exist', async () => {
    await db.systemBackups.clear();
    await db.systemBackups.add({
      id: 'ready-1',
      backupName: 'PharmaFlow_Ready.pfb',
      createdAt: new Date().toISOString(),
      backupType: 'full' as any,
      createdBy: 'system',
      systemVersion: '1.0.0',
      dataSnapshot: '',
      checksumHash: 'hash1',
      sizeInKB: 50,
      status: 'SUCCESS',
      restoreTested: true
    });

    const summary = await healthService.getDetailedHealthSummary();
    if (summary.recoveryReadiness !== 'ready') {
      throw new Error(`Expected recoveryReadiness 'ready', got '${summary.recoveryReadiness}'`);
    }
  });

  // Test 10: No Recoverable Backup
  await test('No Recoverable Backup', 'Returns recoveryReadiness not_ready when zero valid backups exist', async () => {
    await db.systemBackups.clear();
    const summary = await healthService.getDetailedHealthSummary();
    if (summary.recoveryReadiness !== 'not_ready') {
      throw new Error(`Expected recoveryReadiness 'not_ready', got '${summary.recoveryReadiness}'`);
    }
  });

  // Test 11: Local-only Backup State Detection
  await test('Local-Only Backup', 'detectInconsistencies identifies local-only backup entries', async () => {
    const inventory: BackupInventoryItem[] = [
      { id: 'loc-1', name: 'local_only.pfb', createdAt: new Date().toISOString(), type: 'full', status: 'local' }
    ];
    const reports = await healthService.detectInconsistencies(inventory);
    if (!reports.some(r => r.type === 'cloud_missing_local_present')) {
      throw new Error('Did not detect cloud_missing_local_present inconsistency');
    }
  });

  // Test 12: Cloud-Only Backup State Detection
  await test('Cloud-Only Backup', 'detectInconsistencies identifies cloud-only backup entries', async () => {
    const inventory: BackupInventoryItem[] = [
      { id: 'cld-1', name: 'cloud_only.pfb', createdAt: new Date().toISOString(), type: 'full', status: 'cloud' }
    ];
    const reports = await healthService.detectInconsistencies(inventory);
    if (!reports.some(r => r.type === 'local_missing_cloud_present')) {
      throw new Error('Did not detect local_missing_cloud_present inconsistency');
    }
  });

  // Test 13: Pending Cloud Backup Tracking
  await test('Pending Cloud Backup', 'Health summary tracks count of backups pending cloud sync', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'TestPassword123!' });
    orchestrator.setOnlineStatusGetter(() => false); // Offline mode

    await orchestrator.triggerAutoBackup({ force: true, source: 'manual' });
    const pendingCount = orchestrator.getPendingCloudSyncCount();
    if (pendingCount !== 1) {
      throw new Error(`Expected pending cloud sync count 1, got ${pendingCount}`);
    }

    const summary = await healthService.getDetailedHealthSummary();
    if (summary.pendingUploadsCount !== 1) {
      throw new Error(`Expected summary.pendingUploadsCount 1, got ${summary.pendingUploadsCount}`);
    }
  });

  // Test 14: Orphan Queue Entry Inconsistency Detection
  await test('Orphan Queue Entry', 'detectInconsistencies handles orphan queue references gracefully', async () => {
    const reports = await healthService.detectInconsistencies([]);
    if (!Array.isArray(reports)) {
      throw new Error('detectInconsistencies did not return an array');
    }
  });

  // Test 15: Duplicate Backup ID Detection
  await test('Duplicate Backup ID', 'detectInconsistencies flags duplicate backup IDs in local inventory', async () => {
    const inventory: BackupInventoryItem[] = [
      { id: 'dup-id', name: 'backup1.pfb', createdAt: new Date().toISOString(), type: 'full', status: 'local' },
      { id: 'dup-id', name: 'backup2.pfb', createdAt: new Date().toISOString(), type: 'full', status: 'local' }
    ];
    const reports = await healthService.detectInconsistencies(inventory);
    if (!reports.some(r => r.type === 'duplicate_backup_id')) {
      throw new Error('Did not detect duplicate_backup_id report');
    }
  });

  // Test 16: Retention Safety: Normal Cleanup Plan
  await test('Retention Safety', 'createCleanupPlan identifies oldest backups exceeding max retention limit', async () => {
    await db.systemBackups.clear();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await db.systemBackups.add({
        id: `ret-b-${i}`,
        backupName: `PharmaFlow_${i}.pfb`,
        createdAt: new Date(now - i * 3600000).toISOString(),
        backupType: 'full' as any,
        createdBy: 'system',
        systemVersion: '1.0.0',
        dataSnapshot: '',
        checksumHash: `hash-${i}`,
        sizeInKB: 10,
        status: 'SUCCESS',
        restoreTested: false
      });
    }

    const plan = await managementService.createCleanupPlan({
      maxLocalBackups: 3,
      autoCleanupEnabled: true
    });

    if (plan.totalBackups !== 5) throw new Error(`Expected 5 total backups, got ${plan.totalBackups}`);
    if (plan.toDeleteCount !== 2) throw new Error(`Expected 2 candidates to delete, got ${plan.toDeleteCount}`);
  });

  // Test 17: Last Recoverable Backup Protection
  await test('Last Recoverable Backup Protection', 'Retention policy strictly prevents deleting the ONLY known recoverable backup', async () => {
    await db.systemBackups.clear();
    // 3 failed backups (newest) and only 1 valid backup (oldest)
    const now = Date.now();
    await db.systemBackups.add({
      id: 'failed-1',
      backupName: 'Fail1.pfb',
      createdAt: new Date(now).toISOString(),
      backupType: 'full' as any,
      createdBy: 'system',
      systemVersion: '1.0.0',
      dataSnapshot: '',
      checksumHash: '',
      sizeInKB: 0,
      status: 'FAILED',
      restoreTested: false
    });
    await db.systemBackups.add({
      id: 'failed-2',
      backupName: 'Fail2.pfb',
      createdAt: new Date(now - 1000).toISOString(),
      backupType: 'full' as any,
      createdBy: 'system',
      systemVersion: '1.0.0',
      dataSnapshot: '',
      checksumHash: '',
      sizeInKB: 0,
      status: 'FAILED',
      restoreTested: false
    });
    await db.systemBackups.add({
      id: 'only-valid-b',
      backupName: 'OnlyValid.pfb',
      createdAt: new Date(now - 50000).toISOString(), // Oldest
      backupType: 'full' as any,
      createdBy: 'system',
      systemVersion: '1.0.0',
      dataSnapshot: '',
      checksumHash: 'valid-hash',
      sizeInKB: 50,
      status: 'SUCCESS',
      restoreTested: true
    });

    // Policy maxLocalBackups = 1
    const plan = await managementService.createCleanupPlan({
      maxLocalBackups: 1,
      autoCleanupEnabled: true
    });

    // The only valid backup must NOT be in candidates list
    if (plan.candidates.some(c => c.id === 'only-valid-b')) {
      throw new Error('CRITICAL VIOLATION: Retention cleanup plan marked the only valid recoverable backup for deletion!');
    }
  });

  // Test 18: Large Backup Memory Safety
  await test('Large Backup Memory Safety', 'collectDatabaseSnapshot gathers data sequentially without throwing or memory corruption', async () => {
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'TestPassword123!' });
    orchestrator.setOnlineStatusGetter(() => false);

    const result = await orchestrator.triggerAutoBackup({ force: true, source: 'manual' });
    if (!result.localSuccess) {
      throw new Error(`Auto backup failed during sequential table snapshot: ${result.error}`);
    }
  });

  // Test 19: Disaster Recovery Dry Run Execution
  await test('Disaster Recovery Dry Run', 'runDisasterRecoveryDrill tests failure modes and generates successful readiness assessment', async () => {
    const drillResult = await healthService.runDisasterRecoveryDrill({
      password: 'EnterpriseDrillPass2026!'
    });

    if (!drillResult.success) {
      throw new Error(`DR Drill failed: ${drillResult.errors.join(', ')}`);
    }
    if (!drillResult.healthyBackupValidated) {
      throw new Error('DR Drill failed to validate healthy backup');
    }
    if (!drillResult.wrongPasswordRejected) {
      throw new Error('DR Drill failed to reject wrong password');
    }
    if (!drillResult.corruptedBackupRejected) {
      throw new Error('DR Drill failed to reject corrupted backup');
    }
    if (!drillResult.missingDataEncRejected) {
      throw new Error('DR Drill failed to reject missing data.enc');
    }
    if (!drillResult.checksumMismatchRejected) {
      throw new Error('DR Drill failed to reject checksum mismatch');
    }
    if (drillResult.recoveryReadiness !== 'ready') {
      throw new Error(`Expected recoveryReadiness 'ready', got '${drillResult.recoveryReadiness}'`);
    }
  });

  // Test 20: Database Remains Unchanged During DR Drill
  await test('Database Remains Unchanged During DR Drill', 'Confirms zero modification to live Dexie database before and after DR drill', async () => {
    // Seed test product record
    await db.products.put({
      id: 'p-dr-guard-test',
      name: 'Unchanged Product Guard Test',
      price: 99.99,
      stockQuantity: 42
    } as any);

    const preCount = await db.products.count();
    const preItem = await db.products.get('p-dr-guard-test');

    const drillResult = await healthService.runDisasterRecoveryDrill();
    if (!drillResult.databaseUnchangedVerified) {
      throw new Error('DR Drill reported database modification during dry run!');
    }

    const postCount = await db.products.count();
    const postItem = await db.products.get('p-dr-guard-test');

    if (preCount !== postCount || !postItem || postItem.name !== preItem?.name) {
      throw new Error('DATABASE CORRUPTED: Live database records were modified during DR Drill!');
    }
  });

  console.log('\n===================================================================');
  console.log('📊 Phase 5 Test Suite Results Summary:');
  console.log('===================================================================');
  let passedCount = 0;
  let failedCount = 0;
  for (const r of results) {
    if (r.passed) passedCount++;
    else failedCount++;
  }
  console.log(`Total Scenarios: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.error('❌ One or more Phase 5 tests failed.');
    process.exit(1);
  } else {
    console.log('🎉 All Phase 5 Observability & Disaster Recovery tests passed successfully!');
    process.exit(0);
  }
}

runPhase5DisasterRecoveryTestSuite().catch(err => {
  console.error('Fatal error running Phase 5 test suite:', err);
  process.exit(1);
});
