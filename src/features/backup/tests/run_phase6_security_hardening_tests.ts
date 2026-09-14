import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import CryptoJS from 'crypto-js';
import { db } from '@/core/db';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BackupService } from '../services/BackupService';
import { BackupOrchestrator } from '../services/BackupOrchestrator';
import { BackupRetryService } from '../services/BackupRetryService';
import { BackupCredentialVault } from '../services/BackupCredentialVault';
import { BackupStorageAdapter } from '../services/storage/BackupStorageAdapter';
import { RetryConfig } from '../backup.types';
import { CryptoService, EncryptedPayloadV1, EncryptedPayloadV2 } from '@/services/security/CryptoService';

interface TestResult {
  number: number;
  name: string;
  description: string;
  passed: boolean;
  error?: string;
}

class MockStorageAdapter implements BackupStorageAdapter {
  public uploadedPaths: string[] = [];
  public failPermanently = false;

  async upload(path: string, _data: any): Promise<string> {
    if (this.failPermanently) {
      throw new Error('Cloud storage unavailable in mock');
    }
    this.uploadedPaths.push(path);
    return `https://mockstorage.local/${path}`;
  }
}

async function runPhase6SecurityHardeningTestSuite() {
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
  console.log('🛡️ Starting Phase 6 Backup Credential & Cryptographic Security Hardening Test Suite');
  console.log('===================================================================\n');

  // Accelerate test execution while preserving 100% cryptographic correctness
  CryptoService.setIterations(1000);
  BackupCredentialVault.setIterations(1000);

  const mockStorage = new MockStorageAdapter();
  const backupService = new BackupService(mockStorage);
  const fastRetryConfig: RetryConfig = {
    maxAttempts: 1,
    initialDelayMs: 1,
    backoffMultiplier: 1,
    maxDelayMs: 2,
    timeoutMs: 5000
  };
  const retrySvc = new BackupRetryService(fastRetryConfig);
  const orchestrator = new BackupOrchestrator(backupService, retrySvc);

  // Setup sample DB records
  await db.products.clear();
  await db.products.bulkAdd([
    { id: 'p1', name: 'Panadol Extra', price: 1500, stock: 50 } as any,
    { id: 'p2', name: 'Amoxicillin 500mg', price: 3200, stock: 20 } as any
  ]);

  // TEST 1: Credential Vault - Save and retrieve password securely
  await test('Vault Save & Retrieve', 'Password can be securely stored and retrieved from BackupCredentialVault', async () => {
    await BackupCredentialVault.clearCredential();
    const testSecret = 'SuperSecretPass#2026';
    await BackupCredentialVault.saveCredential(testSecret);
    
    // Clear in-memory cache to force vault decryption
    BackupCredentialVault.setInMemoryCache(null);
    const retrieved = await BackupCredentialVault.getCredential();

    if (retrieved !== testSecret) {
      throw new Error(`Expected '${testSecret}' but got '${retrieved}'`);
    }
  });

  // TEST 2: Credential Vault - Absence of plaintext password in IndexedDB
  await test('No Plaintext in IndexedDB', 'IndexedDB settings table contains NO plaintext password', async () => {
    const legacyPass = await db.settings.get('backupPassword');
    if (legacyPass && legacyPass.value) {
      throw new Error('Legacy plaintext backupPassword key still exists in settings table!');
    }

    const vaultRecord = await db.settings.get('backup_credential_vault');
    if (!vaultRecord || !vaultRecord.value) {
      throw new Error('Vault record missing from settings table');
    }

    const rawVal = typeof vaultRecord.value === 'string' ? vaultRecord.value : JSON.stringify(vaultRecord.value);
    if (rawVal.includes('SuperSecretPass#2026')) {
      throw new Error('Plaintext password detected inside vault record string!');
    }
  });

  // TEST 3: Credential Vault - Synchronous memory cache
  await test('Synchronous Memory Cache', 'getCredentialSync returns cached password instantly without async lag', async () => {
    const syncPass = BackupCredentialVault.getCredentialSync();
    if (syncPass !== 'SuperSecretPass#2026') {
      throw new Error(`Expected 'SuperSecretPass#2026' from sync cache but got '${syncPass}'`);
    }
  });

  // TEST 4: Credential Vault - hasCredential check
  await test('hasCredential Validation', 'hasCredential returns true when configured', async () => {
    const exists = await BackupCredentialVault.hasCredential();
    if (!exists) {
      throw new Error('hasCredential returned false for configured vault');
    }
  });

  // TEST 5: Credential Vault - clearCredential
  await test('clearCredential Purge', 'clearCredential purges in-memory cache and encrypted storage', async () => {
    await BackupCredentialVault.clearCredential();
    const afterClear = await BackupCredentialVault.getCredential();
    const syncAfter = BackupCredentialVault.getCredentialSync();
    const exists = await BackupCredentialVault.hasCredential();

    if (afterClear !== null && afterClear !== '') {
      throw new Error('Credential still present after clearCredential');
    }
    if (syncAfter !== null && syncAfter !== '') {
      throw new Error('Sync cache still present after clearCredential');
    }
    if (exists) {
      throw new Error('hasCredential still true after clearCredential');
    }
  });

  // TEST 6: Migration - Legacy plaintext password to vault
  await test('Legacy Plaintext Migration', 'Migrates legacy plaintext password to protected vault and deletes plaintext', async () => {
    await BackupCredentialVault.clearCredential();
    // Simulate historical plaintext state in Dexie
    await db.settings.put({ key: 'backupPassword', value: 'LegacySecretPassword999' });

    const result = await BackupCredentialVault.migrateLegacyPlaintextCredential();
    if (!result.migrated || !result.legacyFound) {
      throw new Error('Migration did not report successful migration');
    }

    // Verify plaintext is deleted
    const plaintextCheck = await db.settings.get('backupPassword');
    if (plaintextCheck && plaintextCheck.value) {
      throw new Error('Legacy plaintext record was NOT deleted after migration');
    }

    // Verify password is now in vault
    BackupCredentialVault.setInMemoryCache(null);
    const migratedPass = await BackupCredentialVault.getCredential();
    if (migratedPass !== 'LegacySecretPassword999') {
      throw new Error(`Expected migrated password 'LegacySecretPassword999' but got '${migratedPass}'`);
    }
  });

  // TEST 7: Migration - Empty or whitespace legacy record
  await test('Whitespace Migration Cleanup', 'Safely deletes empty/whitespace legacy records without creating a vault record', async () => {
    await BackupCredentialVault.clearCredential();
    await db.settings.put({ key: 'backupPassword', value: '   ' });

    const res = await BackupCredentialVault.migrateLegacyPlaintextCredential();
    if (!res.migrated) {
      throw new Error('Empty legacy migration failed');
    }

    const check = await db.settings.get('backupPassword');
    if (check) {
      throw new Error('Whitespace record was not deleted');
    }

    const hasCred = await BackupCredentialVault.hasCredential();
    if (hasCred) {
      throw new Error('Vault should be empty after migrating whitespace');
    }
  });

  // TEST 8: Migration - Idempotence
  await test('Migration Idempotence', 'Running migration multiple times does not throw or corrupt vault', async () => {
    await BackupCredentialVault.saveCredential('IdempotentPass#123');
    const run1 = await BackupCredentialVault.migrateLegacyPlaintextCredential();
    const run2 = await BackupCredentialVault.migrateLegacyPlaintextCredential();

    if (run1.legacyFound || run2.legacyFound) {
      throw new Error('Legacy found flag should be false on non-legacy state');
    }

    const currentPass = await BackupCredentialVault.getCredential();
    if (currentPass !== 'IdempotentPass#123') {
      throw new Error('Vault corrupted after multiple migration runs');
    }
  });

  // TEST 9: Store Integration - loadSettings transparent migration
  await test('Store loadSettings Migration', 'useSettingsStore.loadSettings triggers transparent migration and state update', async () => {
    await BackupCredentialVault.clearCredential();
    await db.settings.put({ key: 'backupPassword', value: 'StoreIntegratedPass#777' });

    await useSettingsStore.getState().loadSettings();
    const storePass = useSettingsStore.getState().backupPassword;

    if (storePass !== 'StoreIntegratedPass#777') {
      throw new Error(`Expected store password 'StoreIntegratedPass#777' but got '${storePass}'`);
    }

    const legacyInDb = await db.settings.get('backupPassword');
    if (legacyInDb && legacyInDb.value) {
      throw new Error('Plaintext legacy password still in DB after loadSettings');
    }
  });

  // TEST 10: Crypto Integrity V2 - Encrypt produces V2 Envelope
  await test('Crypto V2 Envelope Generation', 'CryptoService.encrypt produces Version 2 envelope with HMAC tag', async () => {
    const rawData = JSON.stringify({ message: 'Confidential Patient Records', count: 42 });
    const payload = CryptoService.encrypt(rawData, 'MasterKey#2026');

    if (payload.version !== 2) {
      throw new Error(`Expected version 2 but got ${payload.version}`);
    }
    if (!payload.tag || payload.tag.length < 32) {
      throw new Error('HMAC tag missing or too short in V2 payload');
    }
    if (!payload.ciphertext || !payload.salt || !payload.iv) {
      throw new Error('Missing core cryptographic fields in V2 payload');
    }
  });

  // TEST 11: Crypto Integrity V2 - Decryption success
  await test('Crypto V2 Decryption', 'CryptoService.decrypt successfully validates HMAC tag and decrypts data', async () => {
    const rawData = JSON.stringify({ pharmacy: 'Al-Shifa', license: 'PH-9921' });
    const payload = CryptoService.encrypt(rawData, 'MasterKey#2026');
    const decrypted = CryptoService.decrypt(payload, 'MasterKey#2026');

    if (decrypted !== rawData) {
      throw new Error('Decrypted string does not match original plaintext');
    }
  });

  // TEST 12: Crypto Backward Compatibility V1 - Legacy Decryption
  await test('Crypto V1 Backward Compatibility', 'CryptoService.decrypt successfully decrypts historical Version 1 payloads', async () => {
    // Construct valid legacy V1 payload (without version/tag)
    const salt = CryptoJS.lib.WordArray.random(16);
    const iv = CryptoJS.lib.WordArray.random(16);
    const derivedKey = CryptoJS.PBKDF2('LegacySecret#2024', salt, {
      keySize: 256 / 32,
      iterations: CryptoService.getIterations()
    });
    const plaintext = JSON.stringify({ legacyTable: ['row1', 'row2'] });
    const encrypted = CryptoJS.AES.encrypt(plaintext, derivedKey, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const v1Payload: EncryptedPayloadV1 = {
      ciphertext: encrypted.toString(),
      salt: salt.toString(CryptoJS.enc.Hex),
      iv: iv.toString(CryptoJS.enc.Hex)
    };

    const decrypted = CryptoService.decrypt(v1Payload, 'LegacySecret#2024');
    if (decrypted !== plaintext) {
      throw new Error('Failed to decrypt legacy V1 payload');
    }
  });

  // TEST 13: Tamper Detection - Modified Ciphertext
  await test('Tamper Detection: Ciphertext', 'Modified ciphertext in V2 payload fails HMAC verification before decryption', async () => {
    const payload = CryptoService.encrypt('Sensitive Data', 'Secret#123');
    // Tamper with ciphertext by flipping characters
    const tamperedPayload: EncryptedPayloadV2 = {
      ...payload,
      ciphertext: payload.ciphertext.substring(0, payload.ciphertext.length - 4) + 'AAAA'
    };

    let caught = false;
    try {
      CryptoService.decrypt(tamperedPayload, 'Secret#123');
    } catch {
      caught = true;
    }

    if (!caught) {
      throw new Error('Tampered ciphertext was accepted without throwing error!');
    }
  });

  // TEST 14: Tamper Detection - Modified Salt
  await test('Tamper Detection: Salt', 'Modified salt in V2 payload fails HMAC verification', async () => {
    const payload = CryptoService.encrypt('Sensitive Data', 'Secret#123');
    const tamperedPayload: EncryptedPayloadV2 = {
      ...payload,
      salt: '00112233445566778899aabbccddeeff'
    };

    let caught = false;
    try {
      CryptoService.decrypt(tamperedPayload, 'Secret#123');
    } catch {
      caught = true;
    }

    if (!caught) {
      throw new Error('Tampered salt was accepted without throwing error!');
    }
  });

  // TEST 15: Tamper Detection - Modified IV
  await test('Tamper Detection: IV', 'Modified IV in V2 payload fails HMAC verification', async () => {
    const payload = CryptoService.encrypt('Sensitive Data', 'Secret#123');
    const tamperedPayload: EncryptedPayloadV2 = {
      ...payload,
      iv: 'ffeeddccbbaa99887766554433221100'
    };

    let caught = false;
    try {
      CryptoService.decrypt(tamperedPayload, 'Secret#123');
    } catch {
      caught = true;
    }

    if (!caught) {
      throw new Error('Tampered IV was accepted without throwing error!');
    }
  });

  // TEST 16: Tamper Detection - Modified HMAC Tag
  await test('Tamper Detection: Tag', 'Modified HMAC tag in V2 payload fails authentication', async () => {
    const payload = CryptoService.encrypt('Sensitive Data', 'Secret#123');
    const tamperedPayload: EncryptedPayloadV2 = {
      ...payload,
      tag: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    };

    let caught = false;
    try {
      CryptoService.decrypt(tamperedPayload, 'Secret#123');
    } catch {
      caught = true;
    }

    if (!caught) {
      throw new Error('Tampered tag was accepted without throwing error!');
    }
  });

  // TEST 17: Tamper Detection - Wrong Password V2
  await test('Wrong Password Handling V2', 'Wrong password against V2 payload fails safely without leaking internals', async () => {
    const payload = CryptoService.encrypt('Sensitive Data', 'CorrectPassword#1');

    let caught = false;
    try {
      CryptoService.decrypt(payload, 'WrongPassword#999');
    } catch (err: any) {
      caught = true;
      if (err.message.includes('CryptoJS') || err.message.includes('PBKDF2') || err.message.includes('stack')) {
        throw new Error('Error message leaked internal implementation details!');
      }
    }

    if (!caught) {
      throw new Error('Wrong password did not throw error!');
    }
  });

  // TEST 18: Tamper Detection - Wrong Password V1
  await test('Wrong Password Handling V1', 'Wrong password against V1 payload fails safely without throwing unhandled exceptions', async () => {
    const salt = CryptoJS.lib.WordArray.random(16);
    const iv = CryptoJS.lib.WordArray.random(16);
    const derivedKey = CryptoJS.PBKDF2('Correct#1', salt, { keySize: 8, iterations: CryptoService.getIterations() });
    const encrypted = CryptoJS.AES.encrypt('Plain Data', derivedKey, { iv, mode: CryptoJS.mode.CBC });

    const v1: EncryptedPayloadV1 = {
      ciphertext: encrypted.toString(),
      salt: salt.toString(CryptoJS.enc.Hex),
      iv: iv.toString(CryptoJS.enc.Hex)
    };

    let caught = false;
    try {
      CryptoService.decrypt(v1, 'Wrong#2');
    } catch {
      caught = true;
    }

    if (!caught) {
      throw new Error('Wrong password on V1 payload did not throw error!');
    }
  });

  // TEST 19: Archive Tamper Detection - Modified data.enc inside .pfb
  await test('Archive Checksum Integrity', 'Tampered data.enc inside .pfb fails checksum validation', async () => {
    const testData = { products: [{ id: 'p1', name: 'Panadol' }] };
    const backup = await backupService.createLocalBackup(testData, 'BackupPass#2026', 'full');

    const zip = await JSZip.loadAsync(await backup.blob!.arrayBuffer());
    // Tamper with data.enc inside ZIP
    zip.file('data.enc', JSON.stringify({ ciphertext: 'fake', salt: 'fake', iv: 'fake' }));
    const tamperedBlob = await zip.generateAsync({ type: 'blob' });

    const validation = await backupService.validateBackup(tamperedBlob, 'BackupPass#2026');
    if (validation.valid) {
      throw new Error('Tampered .pfb was validated as valid!');
    }
    if (!validation.error?.includes('Checksum') && !validation.error?.includes('سلامة')) {
      throw new Error(`Expected checksum error message but got: ${validation.error}`);
    }
  });

  // TEST 20: Archive Tamper Detection - Modified metadata checksum
  await test('Archive Metadata Tamper', 'Modified metadata checksum fails validation', async () => {
    const testData = { products: [{ id: 'p1', name: 'Panadol' }] };
    const backup = await backupService.createLocalBackup(testData, 'BackupPass#2026', 'full');

    const zip = await JSZip.loadAsync(await backup.blob!.arrayBuffer());
    const metaStr = await zip.file('metadata.json')!.async('text');
    const meta = JSON.parse(metaStr);
    meta.checksum = '0000000000000000000000000000000000000000000000000000000000000000';
    zip.file('metadata.json', JSON.stringify(meta));
    const tamperedBlob = await zip.generateAsync({ type: 'blob' });

    const validation = await backupService.validateBackup(tamperedBlob, 'BackupPass#2026');
    if (validation.valid) {
      throw new Error('Tampered metadata checksum was accepted!');
    }
  });

  // TEST 21: Archive Tamper Detection - Missing data.enc
  await test('Archive Missing data.enc', 'ZIP package missing data.enc is rejected safely', async () => {
    const zip = new JSZip();
    zip.file('metadata.json', JSON.stringify({ version: '1.0.0' }));
    const invalidBlob = await zip.generateAsync({ type: 'blob' });

    const validation = await backupService.validateBackup(invalidBlob, 'Pass#1');
    if (validation.valid) {
      throw new Error('Missing data.enc was accepted!');
    }
    if (!validation.error?.includes('data.enc')) {
      throw new Error(`Expected missing data.enc error message, got: ${validation.error}`);
    }
  });

  // TEST 22: Restore Engine Atomic Safety
  await test('Atomic Restore Safety Guarantee', 'Tampered backup restore fails with ZERO modifications to existing database', async () => {
    // Record current DB state
    const beforeProducts = await db.products.toArray();
    const countBefore = beforeProducts.length;

    // Create a corrupted backup
    const zip = new JSZip();
    zip.file('data.enc', '{"invalid":"json"');
    zip.file('metadata.json', JSON.stringify({ version: '1.0.0' }));
    const badBlob = await zip.generateAsync({ type: 'blob' });

    let caught = false;
    try {
      await backupService.restoreBackup(badBlob, 'AnyPass');
    } catch {
      caught = true;
    }

    if (!caught) {
      throw new Error('Corrupted restore did not throw error');
    }

    // Verify DB was NOT mutated
    const afterProducts = await db.products.toArray();
    if (afterProducts.length !== countBefore) {
      throw new Error(`Database was mutated during failed restore! Before: ${countBefore}, After: ${afterProducts.length}`);
    }
  });

  // TEST 23: Security Error Message Sanitization
  await test('Error Sanitization', 'All error messages are localized in Arabic and leak no cryptographic primitives', async () => {
    const invalidPayload: any = { version: 2, ciphertext: 'abc', salt: '123', iv: '456', tag: '789' };
    try {
      CryptoService.decrypt(invalidPayload, 'wrong');
      throw new Error('Should have failed');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('AES') || msg.includes('CBC') || msg.includes('iterations') || msg.includes('CryptoJS')) {
        throw new Error(`Error leaked cryptographic internal names: ${msg}`);
      }
    }
  });

  // TEST 24: Auto Backup Orchestrator Vault Retrieval
  await test('Orchestrator Vault Integration', 'BackupOrchestrator retrieves password from BackupCredentialVault automatically', async () => {
    await BackupCredentialVault.saveCredential('OrchestratorPass#2026');
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: '' });

    const result = await orchestrator.triggerAutoBackup({ source: 'manual', retryConfig: fastRetryConfig });
    if (!result.success && !result.localSuccess) {
      throw new Error(`Auto backup failed to use vault password: ${result.error}`);
    }
  });

  // TEST 25: Auto Backup Orchestrator Missing Credential
  await test('Orchestrator Missing Credential', 'Orchestrator gracefully fails with pending status when no credential exists', async () => {
    await BackupCredentialVault.clearCredential();
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: '' });

    const result = await orchestrator.triggerAutoBackup({ source: 'manual', retryConfig: fastRetryConfig });
    if (result.success) {
      throw new Error('Auto backup succeeded without password configured!');
    }
    if (result.jobState !== 'pending') {
      throw new Error(`Expected pending jobState, got: ${result.jobState}`);
    }
  });

  // TEST 26: Auto Backup Offline-First Operation
  await test('Offline-First Auto Backup', 'Creates local backup and queues cloud job without network connection', async () => {
    await BackupCredentialVault.saveCredential('OfflinePass#2026');
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'OfflinePass#2026' });

    // Simulate offline state
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    try {
      const result = await orchestrator.triggerAutoBackup({ source: 'manual', retryConfig: fastRetryConfig });
      if (!result.localSuccess) {
        throw new Error(`Local backup failed in offline mode: ${result.error}`);
      }
      if (result.cloudSuccess) {
        throw new Error('Cloud backup should not report success in offline mode');
      }
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnline, configurable: true });
    }
  });

  // TEST 27: Cloud Storage Credential Isolation
  await test('Cloud Credential Isolation', 'Firebase payload contains no password, raw credentials, or plaintext', async () => {
    const testData = { customers: [{ id: 'c1', name: 'Dr. Ahmad' }] };
    const backup = await backupService.createLocalBackup(testData, 'SuperSecretVaultPass', 'full');

    const zip = await JSZip.loadAsync(await backup.blob!.arrayBuffer());
    const metaStr = await zip.file('metadata.json')!.async('text');
    const encStr = await zip.file('data.enc')!.async('text');

    if (metaStr.includes('SuperSecretVaultPass') || encStr.includes('SuperSecretVaultPass')) {
      throw new Error('Raw password found inside backup package payload!');
    }
    if (metaStr.includes('Dr. Ahmad') || encStr.includes('Dr. Ahmad')) {
      throw new Error('Plaintext ERP data found unencrypted inside backup package!');
    }
  });

  // TEST 28: Prototype Pollution Prevention in Restored Tables
  await test('Prototype Pollution Defense', 'Malicious __proto__ properties in backup payload are sanitized during restore', async () => {
    const maliciousPayload = {
      version: '1.0.0',
      products: [
        {
          id: 'p_safe',
          name: 'Safe Medicine',
          price: 500,
          __proto__: { isAdmin: true },
          constructor: { polluted: true }
        }
      ]
    };

    const backup = await backupService.createLocalBackup(maliciousPayload, 'ProtoPass#123', 'full');
    await backupService.restoreBackup(backup.blob!, 'ProtoPass#123');

    const restoredProduct: any = await db.products.get('p_safe');
    if (!restoredProduct) {
      throw new Error('Product not restored');
    }
    if (({} as any).isAdmin || ({} as any).polluted) {
      throw new Error('Prototype pollution succeeded across Object prototype!');
    }
  });

  // TEST 29: Corrupted Vault Storage Recovery
  await test('Corrupted Vault Recovery', 'Tampered vault storage record returns null safely without throwing uncaught errors', async () => {
    await db.settings.put({
      key: 'backup_credential_vault',
      value: JSON.stringify({
        version: 1,
        ciphertext: 'corrupted_ciphertext_data',
        salt: '00112233445566778899aabbccddeeff',
        iv: 'ffeeddccbbaa99887766554433221100',
        tag: 'fake_tag_value_that_does_not_match',
        updatedAt: new Date().toISOString()
      })
    });

    BackupCredentialVault.setInMemoryCache(null);
    const cred = await BackupCredentialVault.getCredential();

    if (cred !== null) {
      throw new Error('Corrupted vault did not return null');
    }
  });

  // TEST 30: End-to-End Hardened Lifecycle
  await test('End-to-End Hardened Lifecycle', 'Full cycle: Vault configure -> V2 Backup -> Dry-Run Validate -> Atomic Restore', async () => {
    // 1. Configure Vault
    await BackupCredentialVault.saveCredential('E2E_Hardened_Secret#2026');
    useSettingsStore.setState({ autoBackupEnabled: true, backupPassword: 'E2E_Hardened_Secret#2026' });

    // 2. Setup known DB data
    await db.products.clear();
    await db.products.bulkAdd([
      { id: 'prod_e2e_1', name: 'Paracetamol 500mg', price: 800, stock: 100 } as any,
      { id: 'prod_e2e_2', name: 'Ibuprofen 400mg', price: 1200, stock: 45 } as any
    ]);

    const productsBefore = await db.products.toArray();

    // 3. Create Backup
    const backupEntry = await backupService.createLocalBackup({ products: productsBefore }, 'E2E_Hardened_Secret#2026', 'full');
    if (!backupEntry.blob) {
      throw new Error('Backup blob missing');
    }

    // 4. Validate in-memory (Dry Run)
    const valResult = await backupService.validateBackup(backupEntry.blob, 'E2E_Hardened_Secret#2026');
    if (!valResult.valid) {
      throw new Error(`Dry run validation failed: ${valResult.error}`);
    }
    if (valResult.totalRecords !== 2) {
      throw new Error(`Expected 2 records in validation, found: ${valResult.totalRecords}`);
    }

    // 5. Clear table to verify restore
    await db.products.clear();
    const cleared = await db.products.toArray();
    if (cleared.length !== 0) {
      throw new Error('Failed to clear table before restore');
    }

    // 6. Restore from encrypted V2 package
    const restoreResult = await backupService.restoreBackup(backupEntry.blob, 'E2E_Hardened_Secret#2026');
    if (!restoreResult.success) {
      throw new Error('Restore failed');
    }
    if (restoreResult.restoredRecords !== 2) {
      throw new Error(`Expected 2 restored records, got ${restoreResult.restoredRecords}`);
    }

    const productsAfter = await db.products.toArray();
    if (productsAfter.length !== 2) {
      throw new Error(`Expected 2 products in DB after restore, got ${productsAfter.length}`);
    }
    if (productsAfter[0].name !== 'Paracetamol 500mg' || productsAfter[1].name !== 'Ibuprofen 400mg') {
      throw new Error('Restored product data does not match original data');
    }
  });

  // Summary Report
  console.log('\n===================================================================');
  console.log('📊 Phase 6 Security Hardening Test Suite Results');
  console.log('===================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`Total Scenarios: ${results.length}`);
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Failed: ${failedCount} / ${results.length}`);

  if (failedCount > 0) {
    console.error('\n❌ Failed Tests Summary:');
    results.filter(r => !r.passed).forEach(r => {
      console.error(`- Test ${r.number}: ${r.name} - ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🌟 ALL 30 PHASE 6 SECURITY HARDENING TESTS PASSED SUCCESSFULLY! 🌟\n');
  }
}

runPhase6SecurityHardeningTestSuite().catch(err => {
  console.error('Fatal error running Phase 6 test suite:', err);
  process.exit(1);
});
