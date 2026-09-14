import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import CryptoJS from 'crypto-js';
import { db } from '@/core/db';
import { BackupService } from '../services/BackupService';
import { CryptoService } from '../../../services/security/CryptoService';

interface TestResult {
  name: string;
  expected: string;
  actual: string;
  status: 'PASSED' | 'FAILED';
  details?: string;
}

async function runRestoreTestSuite() {
  CryptoService.setIterations(1000);
  await db.open();
  const results: TestResult[] = [];
  const backupService = new BackupService();

  async function test(name: string, expected: string, fn: () => Promise<void>) {
    console.log(`Executing: ${name}...`);
    try {
      await fn();
      console.log(`  -> PASSED`);
      results.push({
        name,
        expected,
        actual: 'Matched expected behavior',
        status: 'PASSED'
      });
    } catch (e: any) {
      console.log(`  -> FAILED: ${e?.message}`);
      results.push({
        name,
        expected,
        actual: `Failed: ${e?.message || e}`,
        status: 'FAILED',
        details: e?.stack
      });
    }
  }

  console.log('--- STARTING PHASE 3 RESTORE ENGINE TEST SUITE ---');

  // Test 1: Valid backup + correct password
  await test('1. Valid backup + correct password', 'Successfully decrypts, validates, and restores records', async () => {
    const data = {
      products: [{ id: 'p-101', name: 'Panadol Extra', price: 15.5 }],
      customers: [{ id: 'c-201', name: 'John Doe' }]
    };
    const backup = await backupService.createLocalBackup(data, 'SuperSecret123!');
    const res = await backupService.restoreBackup(backup.blob!, 'SuperSecret123!');
    if (!res.success || !res.restoredTables.includes('products')) {
      throw new Error('Restore did not return expected tables');
    }
  });

  // Test 2: Wrong password
  await test('2. Wrong password', 'Throws clear error indicating incorrect password', async () => {
    const data = { products: [{ id: 'p-1', name: 'Aspirin' }] };
    const backup = await backupService.createLocalBackup(data, 'CorrectPassword999');
    let threw = false;
    try {
      await backupService.restoreBackup(backup.blob!, 'WrongPassword111');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('كلمة مرور') && !e.message.includes('غير صحيحة')) {
        throw new Error(`Unexpected error message: ${e.message}`);
      }
    }
    if (!threw) throw new Error('Did not throw on wrong password');
  });

  // Test 3: Empty password
  await test('3. Empty password', 'Throws error requesting password', async () => {
    const dummyBlob = new Blob(['abc'], { type: 'application/octet-stream' });
    let threw = false;
    try {
      await backupService.restoreBackup(dummyBlob, '');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('كلمة مرور')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on empty password');
  });

  // Test 4: Whitespace password
  await test('4. Whitespace password', 'Throws error requesting password', async () => {
    const dummyBlob = new Blob(['abc'], { type: 'application/octet-stream' });
    let threw = false;
    try {
      await backupService.restoreBackup(dummyBlob, '    ');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('كلمة مرور')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on whitespace password');
  });

  // Test 5: Corrupted ZIP
  await test('5. Corrupted ZIP', 'Throws error indicating invalid zip archive', async () => {
    const corruptBlob = new Blob(['This is not a zip file content at all!'], { type: 'application/octet-stream' });
    let threw = false;
    try {
      await backupService.restoreBackup(corruptBlob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('ملف مضغوط')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on corrupt zip');
  });

  // Test 6: Missing data.enc
  await test('6. Missing data.enc in ZIP', 'Throws error indicating data.enc is missing', async () => {
    const zip = new JSZip();
    zip.file("other.txt", "some random data");
    const blob = await zip.generateAsync({ type: "blob" });
    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('data.enc')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on missing data.enc');
  });

  // Test 7: Invalid data.enc JSON
  await test('7. Invalid data.enc JSON', 'Throws error indicating malformed encrypted payload JSON', async () => {
    const zip = new JSZip();
    zip.file("data.enc", "NOT_A_VALID_JSON{abc");
    const blob = await zip.generateAsync({ type: "blob" });
    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('JSON تالف') && !e.message.includes('غير صالح')) {
        throw new Error(`Unexpected message: ${e.message}`);
      }
    }
    if (!threw) throw new Error('Did not throw on invalid data.enc JSON');
  });

  // Test 8: Missing ciphertext
  await test('8. Missing ciphertext in payload', 'Throws error indicating incomplete payload', async () => {
    const zip = new JSZip();
    zip.file("data.enc", JSON.stringify({ salt: 'aabbccddeeff1122', iv: '1122334455667788' }));
    const blob = await zip.generateAsync({ type: "blob" });
    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('ciphertext')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on missing ciphertext');
  });

  // Test 9: Missing salt
  await test('9. Missing salt in payload', 'Throws error indicating incomplete payload', async () => {
    const zip = new JSZip();
    zip.file("data.enc", JSON.stringify({ ciphertext: 'abcde12345', iv: '1122334455667788' }));
    const blob = await zip.generateAsync({ type: "blob" });
    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('salt')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on missing salt');
  });

  // Test 10: Missing iv
  await test('10. Missing iv in payload', 'Throws error indicating incomplete payload', async () => {
    const zip = new JSZip();
    zip.file("data.enc", JSON.stringify({ ciphertext: 'abcde12345', salt: 'aabbccddeeff1122' }));
    const blob = await zip.generateAsync({ type: "blob" });
    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('iv')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on missing iv');
  });

  // Test 11: Invalid decrypted JSON
  await test('11. Invalid decrypted JSON', 'Throws error indicating decrypted data is corrupted JSON', async () => {
    const encrypted = CryptoService.encrypt("NON_JSON_CORRUPT_STRING{{{{{", 'Password123');
    const zip = new JSZip();
    zip.file("data.enc", JSON.stringify(encrypted));
    const blob = await zip.generateAsync({ type: "blob" });
    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('JSON تالف')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on invalid decrypted JSON');
  });

  // Test 12: Invalid backup structure (array or primitive instead of object)
  await test('12. Invalid backup structure', 'Throws error indicating invalid root structure', async () => {
    const encrypted = CryptoService.encrypt(JSON.stringify(["some", "array"]), 'Password123');
    const zip = new JSZip();
    zip.file("data.enc", JSON.stringify(encrypted));
    const blob = await zip.generateAsync({ type: "blob" });
    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('هيكل النسخة')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on array root');
  });

  // Test 13: Duplicate IDs handling and warning
  await test('13. Duplicate IDs in table', 'Handles duplicate primary keys gracefully with diagnostics/warnings', async () => {
    const data = {
      products: [
        { id: 'p-1', name: 'Product A' },
        { id: 'p-1', name: 'Product A Updated' }
      ]
    };
    const backup = await backupService.createLocalBackup(data, 'Password123');
    const dryRun = await backupService.validateBackup(backup.blob!, 'Password123');
    if (!dryRun.valid) throw new Error('Dry run failed unexpectedly');
    if (!dryRun.warnings?.some(w => w.includes('تكرار'))) {
      throw new Error('Did not detect duplicate key warning');
    }
  });

  // Test 14: Invalid / Malformed records in table
  await test('14. Invalid malformed records in table', 'Filters invalid non-object items and warns', async () => {
    const data = {
      products: [
        { id: 'p-1', name: 'Product A' },
        null,
        "string-item",
        { id: 'p-2', name: 'Product B' }
      ]
    };
    const backup = await backupService.createLocalBackup(data, 'Password123');
    const res = await backupService.restoreBackup(backup.blob!, 'Password123');
    if (!res.success) throw new Error('Restore failed');
    if (!res.warnings?.some(w => w.includes('غير صالح'))) {
      throw new Error('Did not record invalid record warning');
    }
  });

  // Test 15: Backward compatible Phase 1 backup (No metadata.json in ZIP)
  await test('15. Compatible old backup without metadata.json', 'Successfully restores Phase 1 backups without metadata file', async () => {
    const data = {
      products: [{ id: 'p-legacy-1', name: 'Legacy Product' }]
    };
    const encrypted = CryptoService.encrypt(JSON.stringify(data), 'Password123');
    const zip = new JSZip();
    zip.file("data.enc", JSON.stringify(encrypted));
    const blob = await zip.generateAsync({ type: "blob" });
    
    const res = await backupService.restoreBackup(blob, 'Password123');
    if (!res.success || !res.restoredTables.includes('products')) {
      throw new Error('Failed to restore legacy Phase 1 backup');
    }
  });

  // Test 16: Checksum verification
  await test('16. Checksum mismatch detection', 'Rejects modified data.enc when checksum in metadata mismatches', async () => {
    const encrypted1 = CryptoService.encrypt(JSON.stringify({ products: [{ id: 'p-1' }] }), 'Password123');
    const encrypted2 = CryptoService.encrypt(JSON.stringify({ products: [{ id: 'p-tampered' }] }), 'Password123');
    
    const zip = new JSZip();
    zip.file("data.enc", JSON.stringify(encrypted2));
    zip.file("metadata.json", JSON.stringify({
      version: '1.0.0',
      checksum: CryptoJS.SHA256(JSON.stringify(encrypted1)).toString() // Different checksum!
    }));
    const blob = await zip.generateAsync({ type: "blob" });

    let threw = false;
    try {
      await backupService.restoreBackup(blob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('Checksum mismatch')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not throw on Checksum mismatch');
  });

  // Test 17: Large backup file size guard
  await test('17. Max file size guard (> 100MB)', 'Rejects files larger than maximum size limit', async () => {
    const oversizedBlob = {
      size: 150 * 1024 * 1024, // Fake 150 MB
      arrayBuffer: async () => new ArrayBuffer(10)
    } as any;

    let threw = false;
    try {
      await backupService.restoreBackup(oversizedBlob, 'Password123');
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('كبير جداً')) throw new Error(`Unexpected message: ${e.message}`);
    }
    if (!threw) throw new Error('Did not reject oversized file');
  });

  // Test 18: Prototype pollution protection
  await test('18. Prototype pollution sanitization', 'Strips __proto__ and constructor properties', async () => {
    const data = {
      products: [
        JSON.parse('{"id": "p-proto", "name": "Safe", "__proto__": {"polluted": true}}')
      ]
    };
    const backup = await backupService.createLocalBackup(data, 'Password123');
    const res = await backupService.restoreBackup(backup.blob!, 'Password123');
    if (!res.success) throw new Error('Restore failed');
    if ((Object.prototype as any).polluted) {
      delete (Object.prototype as any).polluted;
      throw new Error('Prototype pollution succeeded!');
    }
  });

  // Test 19: Dry run validation API
  await test('19. Dry Run validateBackup() API', 'Returns valid plan without modifying database', async () => {
    const data = {
      products: [{ id: 'p-1', name: 'Item 1' }],
      invoices: [{ id: 'inv-1', total: 100 }]
    };
    const backup = await backupService.createLocalBackup(data, 'Password123');
    const dryRun = await backupService.validateBackup(backup.blob!, 'Password123');
    if (!dryRun.valid || dryRun.totalRecords !== 2 || !dryRun.tables?.includes('invoices')) {
      throw new Error(`Dry run output invalid: ${JSON.stringify(dryRun)}`);
    }
  });

  console.log('\n--- TEST RESULTS SUMMARY ---');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const mark = r.status === 'PASSED' ? '✅' : '❌';
    console.log(`${mark} [${r.status}] ${r.name}`);
    if (r.status === 'PASSED') passed++;
    else {
      failed++;
      console.error(`   Expected: ${r.expected}`);
      console.error(`   Actual: ${r.actual}`);
    }
  }

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRestoreTestSuite().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
