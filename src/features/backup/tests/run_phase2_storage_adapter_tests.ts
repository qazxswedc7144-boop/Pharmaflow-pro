import 'fake-indexeddb/auto';
import { db } from '@/core/db';
import { BackupService } from '../services/BackupService';
import { BackupStorageAdapter, UploadProgressCallback } from '../services/storage/BackupStorageAdapter';
import { FirebaseStorageAdapter } from '../services/storage/FirebaseStorageAdapter';
import { CryptoService } from '@/services/security/CryptoService';

interface TestResult {
  name: string;
  description: string;
  passed: boolean;
  error?: string;
}

class MockStorageAdapter implements BackupStorageAdapter {
  public uploadedFiles = new Map<string, Blob | ArrayBuffer | Uint8Array | string>();
  public progressEvents: number[] = [];

  async upload(
    path: string,
    data: Blob | ArrayBuffer | Uint8Array | string,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    this.uploadedFiles.set(path, data);
    if (onProgress) {
      this.progressEvents.push(25);
      onProgress(25);
      this.progressEvents.push(50);
      onProgress(50);
      this.progressEvents.push(100);
      onProgress(100);
    }
    return `https://mock-storage.example.com/${path}`;
  }

  async download(path: string): Promise<Blob> {
    const item = this.uploadedFiles.get(path);
    if (!item) {
      throw new Error('File not found');
    }
    if (item instanceof Blob) return item;
    return new Blob([item as any]);
  }

  async delete(path: string): Promise<void> {
    this.uploadedFiles.delete(path);
  }
}

class FailingStorageAdapter implements BackupStorageAdapter {
  async upload(): Promise<string> {
    throw new Error('فشل رفع النسخة السحابية: تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.');
  }
}

async function runPhase2TestSuite() {
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

  console.log('\n======================================================');
  console.log('🧪 Starting Phase 2 Storage Adapter Verification Suite');
  console.log('======================================================\n');

  // Test 1: Local backup creation without Firebase / offline safe
  await test('1. Local Backup Offline Safety', 'Creates encrypted backup without connecting to Firebase', async () => {
    const mockAdapter = new MockStorageAdapter();
    const service = new BackupService(mockAdapter);
    const data = {
      products: [{ id: 'prod_1', name: 'Paracetamol 500mg', price: 15.5 }],
      invoices: [{ id: 'inv_101', total: 150 }]
    };
    const backup = await service.createLocalBackup(data, 'TestPass123!');
    if (!backup.blob || backup.blob.size === 0) {
      throw new Error('Backup blob was not generated');
    }
    if (mockAdapter.uploadedFiles.size > 0) {
      throw new Error('Local backup should NOT upload to storage automatically');
    }
  });

  // Test 2: Encryption verification
  await test('2. Encryption Security Verification', 'Ensures AES-256-CBC payload with salt and iv', async () => {
    const payload = CryptoService.encrypt('sensitive data', 'MyPassword123');
    if (!payload.ciphertext || !payload.salt || !payload.iv) {
      throw new Error('Encrypted payload missing ciphertext, salt, or iv');
    }
    const decrypted = CryptoService.decrypt(payload, 'MyPassword123');
    if (decrypted !== 'sensitive data') {
      throw new Error('Decrypted string does not match original plaintext');
    }
  });

  // Test 3: Decrypt and restore backup
  await test('3. Decrypt and Restore Pipeline', 'Restores decrypted data into database correctly', async () => {
    const service = new BackupService();
    const data = {
      products: [{ id: 'prod_restore_1', name: 'Amoxicillin 500mg', price: 25.0 }]
    };
    const backup = await service.createLocalBackup(data, 'RestorePass123!');
    const restoreResult = await service.restoreBackup(backup.blob!, 'RestorePass123!');
    if (!restoreResult.success || !restoreResult.restoredTables.includes('products')) {
      throw new Error('Restore failed or did not include products table');
    }
  });

  // Test 4: Upload via injected storage adapter with progress tracking
  await test('4. Decoupled Storage Adapter Upload & Progress', 'Uploads via adapter and reports progress', async () => {
    const mockAdapter = new MockStorageAdapter();
    const service = new BackupService(mockAdapter);
    const backup = await service.createLocalBackup({ products: [] }, 'TestPass123!');

    let progressRecorded = 0;
    const downloadUrl = await service.uploadToCloud(backup, (progress) => {
      progressRecorded = progress;
    });

    if (!downloadUrl.startsWith('https://mock-storage.example.com/backups/')) {
      throw new Error(`Unexpected download URL: ${downloadUrl}`);
    }
    if (progressRecorded !== 100) {
      throw new Error(`Expected final progress 100%, got ${progressRecorded}%`);
    }
    if (mockAdapter.progressEvents.length !== 3) {
      throw new Error(`Expected 3 progress events, got ${mockAdapter.progressEvents.length}`);
    }
  });

  // Test 5: Error handling with failing adapter
  await test('5. Graceful Cloud Error Handling', 'Failing adapter throws safe domain error without raw leakage', async () => {
    const failingAdapter = new FailingStorageAdapter();
    const service = new BackupService(failingAdapter);
    const backup = await service.createLocalBackup({ products: [] }, 'TestPass123!');

    let caught = false;
    try {
      await service.uploadToCloud(backup);
    } catch (err: any) {
      caught = true;
      if (!err.message.includes('فشل رفع النسخة السحابية')) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!caught) {
      throw new Error('Failing storage adapter should have thrown an error');
    }
  });

  // Test 6: FirebaseStorageAdapter error mapping
  await test('6. FirebaseStorageAdapter Error Sanitization', 'Formats Firebase errors into user-friendly messages', async () => {
    const adapter = new FirebaseStorageAdapter();
    // Test formatStorageError method via upload with invalid structure
    let errorHandled = false;
    try {
      // Intentionally passing invalid storage target to trigger sanitized error handling
      await adapter.upload('', new Blob(['test']));
    } catch (err: any) {
      errorHandled = true;
      // Error message should be in Arabic and not leak bucket secrets or stack trace
      if (!err.message.startsWith('فشل') && !err.message.startsWith('تم')) {
        throw new Error(`Raw Firebase error leaked: ${err.message}`);
      }
    }
    if (!errorHandled) {
      throw new Error('Expected upload with invalid path to fail gracefully');
    }
  });

  // Test 7: Verify BackupService has no direct Firebase Storage imports
  await test('7. BackupService Dependency Isolation', 'Verifies zero firebase/storage imports in BackupService', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const backupServiceContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/backup/services/BackupService.ts'),
      'utf-8'
    );

    if (backupServiceContent.includes('firebase/storage')) {
      throw new Error('BackupService.ts contains forbidden direct import from "firebase/storage"');
    }
    if (backupServiceContent.includes('getStorage(')) {
      throw new Error('BackupService.ts contains direct "getStorage(" call');
    }
    if (backupServiceContent.includes('uploadBytesResumable(')) {
      throw new Error('BackupService.ts contains direct "uploadBytesResumable(" call');
    }
    if (backupServiceContent.includes('getDownloadURL(')) {
      throw new Error('BackupService.ts contains direct "getDownloadURL(" call');
    }
  });

  console.log('\n======================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`📊 Result: ${results.filter(r => r.passed).length}/${results.length} tests passed`);
  console.log(`Overall Phase 2 Status: ${allPassed ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('======================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase2TestSuite().catch((err) => {
  console.error('Fatal error in Phase 2 test suite:', err);
  process.exit(1);
});
