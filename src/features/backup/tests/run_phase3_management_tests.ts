import 'fake-indexeddb/auto';
import { db } from '@/core/db';
import { CryptoService } from '@/services/security/CryptoService';
import { backupService } from '../services/BackupService';
import { BackupManagementService } from '../services/BackupManagementService';
import { RetentionPolicy } from '../backup.types';

interface TestResult {
  name: string;
  description: string;
  passed: boolean;
  error?: string;
}

async function runPhase3TestSuite() {
  CryptoService.setIterations(1000);
  await db.open();
  const results: TestResult[] = [];
  const managementService = new BackupManagementService(backupService);

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

  console.log('\n======================================================');
  console.log('🧪 Starting Phase 3 Backup Management Center Test Suite');
  console.log('======================================================\n');

  // Clear systemBackups table prior to clean testing
  await db.systemBackups.clear();

  // Test 1: Local backup creation
  let createdBackupId = '';
  await test('1. Local Backup Creation', 'Creates local encrypted backup and adds metadata to Dexie', async () => {
    const data = {
      products: [{ id: 'prod_test_p3_1', name: 'Panadol Extra', price: 12.0 }],
      invoices: [{ id: 'inv_test_p3_1', total: 120.0 }]
    };
    const backup = await backupService.createLocalBackup(data, 'ValidP3Password123!');
    createdBackupId = backup.metadata.id;
    if (!backup.blob || !backup.metadata.name) {
      throw new Error('Backup package or blob missing');
    }
    const record = await db.systemBackups.get(createdBackupId);
    if (!record) {
      throw new Error('Backup metadata was not recorded in db.systemBackups');
    }
  });

  // Test 2: Display local backups in inventory
  await test('2. Backup Inventory Listing', 'Inventory lists existing backups with correct properties', async () => {
    const inventory = await managementService.listBackups();
    if (inventory.length === 0) {
      throw new Error('Inventory returned empty array');
    }
    const found = inventory.find(item => item.id === createdBackupId);
    if (!found) {
      throw new Error(`Created backup ${createdBackupId} not found in inventory`);
    }
    if (!found.name.startsWith('PharmaFlow_Backup_')) {
      throw new Error(`Unexpected backup name format: ${found.name}`);
    }
    if (found.status !== 'local') {
      throw new Error(`Expected status "local", got "${found.status}"`);
    }
  });

  // Test 3: Validate valid backup in memory
  await test('3. Memory-Only Valid Backup Inspection', 'Validates archive in memory without mutating database', async () => {
    const data = {
      products: [{ id: 'prod_val_1', name: 'Aspirin 100mg', price: 8.5 }],
      customers: [{ id: 'cust_val_1', name: 'Ali Hassan', phone: '0100000000' }]
    };
    const countBefore = await db.products.count();
    const backup = await backupService.createLocalBackup(data, 'ValPass123!');

    const valResult = await managementService.validateBackup(backup.blob!, 'ValPass123!');
    if (!valResult.valid) {
      throw new Error(`Expected valid backup, got error: ${valResult.error}`);
    }
    if (valResult.totalRecords !== 2) {
      throw new Error(`Expected 2 total records in plan, got ${valResult.totalRecords}`);
    }
    if (!valResult.tables?.includes('products') || !valResult.tables?.includes('customers')) {
      throw new Error('Expected products and customers in tables array');
    }

    // Verify DB was NOT modified by validation
    const countAfter = await db.products.count();
    if (countAfter !== countBefore) {
      throw new Error('Database was mutated during validation!');
    }
  });

  // Test 4: Validate corrupted backup
  await test('4. Memory-Only Corrupted Backup Inspection', 'Rejects corrupted archive safely without modifying DB', async () => {
    const corruptBlob = new Blob(['Not a valid zip data archive content'], { type: 'application/octet-stream' });
    const countBefore = await db.products.count();

    const valResult = await managementService.validateBackup(corruptBlob, 'SomePass123!');
    if (valResult.valid) {
      throw new Error('Corrupted blob should not be marked as valid');
    }
    if (!valResult.error) {
      throw new Error('Expected validation error message for corrupted archive');
    }

    const countAfter = await db.products.count();
    if (countAfter !== countBefore) {
      throw new Error('Database was mutated during corrupted validation!');
    }
  });

  // Test 5: Delete valid local backup record
  await test('5. Safe Local Backup Deletion', 'Deletes only targeted backup record from inventory', async () => {
    // Add two backups
    const b1 = await backupService.createLocalBackup({ products: [] }, 'Pass1!');
    const b2 = await backupService.createLocalBackup({ products: [] }, 'Pass2!');

    const deleted = await managementService.deleteLocalBackup(b1.metadata.id);
    if (!deleted) {
      throw new Error('deleteLocalBackup returned false');
    }

    const check1 = await db.systemBackups.get(b1.metadata.id);
    const check2 = await db.systemBackups.get(b2.metadata.id);

    if (check1) {
      throw new Error('Target backup record still exists in database');
    }
    if (!check2) {
      throw new Error('Non-target backup record was deleted by mistake');
    }
  });

  // Test 6: Delete non-existing or invalid backup ID
  await test('6. Invalid Backup ID Deletion Guard', 'Safely rejects non-existing or malformed IDs', async () => {
    let caughtEmpty = false;
    try {
      await managementService.deleteLocalBackup('');
    } catch (err: any) {
      caughtEmpty = true;
      if (!err.message.includes('غير صالح')) {
        throw new Error(`Unexpected error message for empty ID: ${err.message}`);
      }
    }
    if (!caughtEmpty) throw new Error('Empty ID should be rejected');

    let caughtNonExistent = false;
    try {
      await managementService.deleteLocalBackup('non_existent_uuid_999999');
    } catch (err: any) {
      caughtNonExistent = true;
      if (!err.message.includes('غير موجودة')) {
        throw new Error(`Unexpected error message for non-existent ID: ${err.message}`);
      }
    }
    if (!caughtNonExistent) throw new Error('Non-existent ID should be rejected');
  });

  // Test 7: Retention policy cleanup calculation
  await test('7. Retention Policy Planning', 'Accurately plans cleanup candidates exceeding max count', async () => {
    await db.systemBackups.clear();

    // Insert 6 backups with staggered timestamps
    for (let i = 1; i <= 6; i++) {
      const date = new Date(Date.now() - (6 - i) * 60000); // 1 is oldest, 6 is newest
      await db.systemBackups.add({
        id: `backup_reten_${i}`,
        backupName: `PharmaFlow_Backup_reten_${i}.pfb`,
        createdAt: date.toISOString(),
        backupType: 'full',
        status: 'SUCCESS',
        sizeInKB: 10
      });
    }

    const policy: RetentionPolicy = {
      maxLocalBackups: 4,
      autoCleanupEnabled: true
    };

    const plan = await managementService.createCleanupPlan(policy);
    if (plan.totalBackups !== 6) {
      throw new Error(`Expected 6 total backups, got ${plan.totalBackups}`);
    }
    if (plan.toDeleteCount !== 2) {
      throw new Error(`Expected 2 toDeleteCount, got ${plan.toDeleteCount}`);
    }
    if (plan.candidates.length !== 2) {
      throw new Error(`Expected 2 candidates, got ${plan.candidates.length}`);
    }

    // Oldest backups (1 and 2) should be candidates
    const candidateIds = plan.candidates.map(c => c.id);
    if (!candidateIds.includes('backup_reten_1') || !candidateIds.includes('backup_reten_2')) {
      throw new Error(`Expected oldest backups (1 and 2) to be deleted, got: ${candidateIds.join(', ')}`);
    }

    // Apply cleanup
    const result = await managementService.applyCleanupPlan(plan);
    if (!result.success || result.deletedCount !== 2) {
      throw new Error(`Failed to apply cleanup plan: ${result.errors.join(', ')}`);
    }

    const remaining = await db.systemBackups.count();
    if (remaining !== 4) {
      throw new Error(`Expected 4 remaining backups, found ${remaining}`);
    }
  });

  // Test 8: Retention cleanup disabled
  await test('8. Retention Disabled Guard', 'Does not select candidates when autoCleanupEnabled is false', async () => {
    const policy: RetentionPolicy = {
      maxLocalBackups: 2,
      autoCleanupEnabled: false
    };

    const plan = await managementService.createCleanupPlan(policy);
    if (plan.toDeleteCount !== 0 || plan.candidates.length !== 0) {
      throw new Error('Disabled cleanup policy should have 0 candidates');
    }
  });

  // Test 9: Health summary
  await test('9. Health Summary Aggregation', 'Correctly computes health metrics and status counts', async () => {
    const summary = await managementService.getHealthSummary();
    if (typeof summary.totalBackups !== 'number') {
      throw new Error('Health summary missing totalBackups');
    }
    if (typeof summary.localBackupsCount !== 'number') {
      throw new Error('Health summary missing localBackupsCount');
    }
    if (!summary.latestBackupDate) {
      throw new Error('Health summary missing latestBackupDate');
    }
  });

  // Test 10: Cloud adapter isolation
  await test('10. Management Layer Isolation', 'Verifies zero firebase or cryptojs imports in BackupManagementService', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/backup/services/BackupManagementService.ts'),
      'utf-8'
    );

    if (content.includes('firebase/') || content.includes('firebase')) {
      throw new Error('BackupManagementService contains forbidden firebase imports');
    }
    if (content.includes('crypto-js') || content.includes('CryptoJS')) {
      throw new Error('BackupManagementService contains forbidden crypto-js imports');
    }
  });

  console.log('\n======================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`📊 Result: ${results.filter(r => r.passed).length}/${results.length} tests passed`);
  console.log(`Overall Phase 3 Status: ${allPassed ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('======================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase3TestSuite().catch((err) => {
  console.error('Fatal error in Phase 3 test suite:', err);
  process.exit(1);
});
