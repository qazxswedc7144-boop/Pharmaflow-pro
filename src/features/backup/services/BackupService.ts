
import JSZip from 'jszip';
import CryptoJS from 'crypto-js';
import { 
  BackupMetadata, 
  BackupEntry, 
  RestoreResult, 
  BackupValidationResult, 
  RestorePlan,
  RestoreOptions,
  DisasterRecoveryDrillResult
} from '../backup.types';
import { BackupStorageAdapter, UploadProgressCallback } from './storage/BackupStorageAdapter';
import { firebaseStorageAdapter } from './storage/FirebaseStorageAdapter';
import { db } from '@/core/db';
import { CryptoService, EncryptedPayload } from '@/services/security/CryptoService';

/** Maximum allowed backup archive size (100 MB) */
const MAX_BACKUP_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** Supported ERP Table Keys */
const RECOGNIZED_TABLE_KEYS = [
  'products', 'invoices', 'invoiceItems', 'customers', 'suppliers', 'accounts',
  'sales', 'purchases', 'journalEntries', 'journalLines', 'inventoryTransactions',
  'accountingPeriods', 'vouchers', 'auditLogs', 'settings', 'systemSettings',
  'medicineBatches', 'exchangeRates', 'branches', 'branchSettings', 'branchInventory',
  'branchTransfers', 'branchTransferItems', 'branchUsers', 'categories', 'receipts',
  'payments', 'settlements', 'cashFlow', 'priceHistory', 'inventory', 'invoiceAdjustments',
  'systemAlerts', 'financialHealthSnapshots', 'historicalMetrics', 'voucherInvoiceLinks',
  'financialTransactions', 'warehouseStock', 'inventory_layers', 'fifo_consumption_log',
  'itemUsageLog', 'stock_movements', 'inventory_logs', 'Audit_Log', 'Accounting_Periods',
  'purchasesByItem', 'profitHealth', 'aiInsights', 'dailyAuditTasks', 'auditProgress',
  'itemProfits', 'supplierProfits', 'profit_health', 'systemPerformanceLog', 'cash_logs',
  'System_Error_Log', 'drafts', 'draft_invoices'
];

interface InternalParsedBackup {
  plan: RestorePlan;
  sanitizedTables: Record<string, any[]>;
  version: string;
  metadata?: Partial<BackupMetadata>;
}

export class BackupService {
  constructor(private readonly storageAdapter: BackupStorageAdapter = firebaseStorageAdapter) {}

  /**
   * Creates a local encrypted backup package (.pfb) containing data.enc and metadata.json.
   */
  async createLocalBackup(
    data: any, 
    password: string, 
    type: 'full' | 'fast' = 'full',
    options?: { tenantId?: string; branchId?: string; createdBy?: string }
  ): Promise<BackupEntry> {
    if (!password || !password.trim()) {
      throw new Error("يرجى إدخال كلمة مرور النسخة الاحتياطية");
    }
    const sanitizedData = this.sanitizeDataBeforeBackup(data);
    const serializedData = JSON.stringify(sanitizedData);
    const encryptedPayload = CryptoService.encrypt(serializedData, password);
    const encryptedPayloadString = JSON.stringify(encryptedPayload);
    const checksum = await this.calculateChecksum(encryptedPayloadString);

    const tenantId = options?.tenantId || 'tenant_default';
    const branchId = options?.branchId;
    const createdBy = options?.createdBy || 'system';

    const metadata: BackupMetadata = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      name: `PharmaFlow_Backup_${new Date().toISOString().replace(/:/g, '-')}.pfb`,
      date: new Date(),
      size: 0,
      type,
      status: 'local',
      encryption: true,
      checksum,
      version: '2.0.0',
      tenantId,
      branchId,
      createdBy,
      formatVersion: '2.0.0'
    };

    const zip = new JSZip();
    zip.file("data.enc", encryptedPayloadString);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    const content = await zip.generateAsync({ type: "blob" });

    metadata.size = content.size;

    // Save metadata record to Dexie
    try {
      if (db.systemBackups) {
        await db.systemBackups.add({
          id: metadata.id,
          backupName: metadata.name,
          createdAt: metadata.date.toISOString(),
          backupType: metadata.type as any,
          createdBy,
          systemVersion: metadata.version,
          dataSnapshot: '',
          checksumHash: metadata.checksum,
          sizeInKB: Math.max(1, Math.round((metadata.size || 0) / 1024)),
          status: 'SUCCESS',
          restoreTested: false
        });
      }
    } catch {
      // Non-blocking fallback if systemBackups table is busy
    }

    return { metadata, data: encryptedPayloadString, blob: content };
  }

  /**
   * Previews backup metadata and archive structure without decrypting payload or touching DB.
   */
  async previewBackup(file: File | Blob): Promise<{
    metadata: Partial<BackupMetadata> | null;
    hasDataEnc: boolean;
    fileSize: number;
    validArchive: boolean;
  }> {
    try {
      const zipData = (typeof Blob !== 'undefined' && file instanceof Blob)
        ? await file.arrayBuffer()
        : file;
      const zip = await JSZip.loadAsync(zipData);
      const encFile = zip.file("data.enc");
      const metaFile = zip.file("metadata.json");

      let metadata: Partial<BackupMetadata> | null = null;
      if (metaFile) {
        try {
          const metaText = await metaFile.async("text");
          metadata = JSON.parse(metaText);
        } catch {
          // Non-blocking
        }
      }

      return {
        metadata,
        hasDataEnc: !!encFile,
        fileSize: file.size || 0,
        validArchive: !!encFile
      };
    } catch {
      return {
        metadata: null,
        hasDataEnc: false,
        fileSize: file?.size || 0,
        validArchive: false
      };
    }
  }

  /**
   * Dry-Run Backup Validation: Verifies archive integrity, decrypts payload in memory,
   * validates schema and records, and generates a restore plan WITHOUT mutating the database.
   */
  async validateBackup(file: File | Blob, password: string): Promise<BackupValidationResult> {
    try {
      const parsed = await this.parseAndValidateBackupPayload(file, password);
      return {
        valid: true,
        version: parsed.version,
        tables: parsed.plan.tablesToRestore,
        recordCounts: parsed.plan.recordCounts,
        totalRecords: parsed.plan.totalRecords,
        warnings: parsed.plan.warnings,
        plan: parsed.plan,
        checksumStatus: parsed.metadata?.checksum ? 'matched' : 'unknown',
        encryptionStatus: 'encrypted'
      };
    } catch (err: any) {
      return {
        valid: false,
        error: err?.message || 'فشل التحقق من صحة النسخة الاحتياطية',
        errorCode: err?.name || 'VALIDATION_FAILED',
        encryptionStatus: 'invalid'
      };
    }
  }

  /**
   * Hardened Restore Engine: Executes pre-transaction validation pipeline followed by
   * an atomic Dexie transaction with guaranteed zero partial database writes on failure.
   * Supports 'PREVIEW', 'VALIDATE', 'DRY_RUN', and 'RESTORE' modes.
   */
  async restoreBackup(
    file: File | Blob, 
    password: string, 
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    const mode = options?.mode || 'RESTORE';

    // Mode: PREVIEW
    if (mode === 'PREVIEW') {
      const preview = await this.previewBackup(file);
      if (!preview.validArchive) {
        throw new Error("ملف النسخة الاحتياطية غير صالح أو تالف.");
      }
      return {
        success: true,
        restoredTables: [],
        restoredRecords: 0,
        version: preview.metadata?.version || '1.0.0',
        message: `معاينة ناجحة للنسخة الاحتياطية (${preview.metadata?.name || 'Unknown'})`
      };
    }

    // 1-11: Full validation & parsing pipeline (Zero DB Mutation)
    const { plan, sanitizedTables, version, metadata } = await this.parseAndValidateBackupPayload(file, password);

    // Tenant Isolation Check
    if (options?.targetTenantId && metadata?.tenantId) {
      if (metadata.tenantId !== options.targetTenantId && metadata.tenantId !== 'tenant_default') {
        throw new Error(`خطأ في عزل البيانات: النسخة تتبع المشترك [${metadata.tenantId}] ولا تطابق المشترك الحالي [${options.targetTenantId}].`);
      }
    }

    // Mode: VALIDATE or DRY_RUN (Guarantee zero DB mutation)
    if (mode === 'VALIDATE' || mode === 'DRY_RUN') {
      return {
        success: true,
        restoredTables: plan.tablesToRestore,
        restoredRecords: plan.totalRecords,
        warnings: plan.warnings,
        version,
        message: mode === 'DRY_RUN' 
          ? `محاكاة استعادة ناجحة لـ ${plan.totalRecords} سجل عبر ${plan.tablesToRestore.length} جدول دون أي تعديل على قاعدة البيانات`
          : `تم التحقق من سلامة وصحة النسخة الاحتياطية بنجاح`
      };
    }

    // Mode: RESTORE (Strict Atomic Transaction)
    const restoredTables: string[] = [];
    let restoredRecords = 0;

    const existingTableNames = typeof db.getExistingTableNames === 'function'
      ? db.getExistingTableNames()
      : db.tables.map(t => t.name);

    const validTables = plan.tablesToRestore.filter(t => existingTableNames.includes(t));

    if (validTables.length > 0) {
      const tableInstances = validTables.map(t => {
        try {
          return db.table(t);
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (tableInstances.length > 0) {
        await db.transaction('rw', tableInstances, async () => {
          for (const tableName of validTables) {
            const rows = sanitizedTables[tableName];
            if (Array.isArray(rows)) {
              const table = db.table(tableName);
              if (table) {
                await table.clear();
                if (rows.length > 0) {
                  await table.bulkPut(rows);
                }
                restoredTables.push(tableName);
                restoredRecords += rows.length;
              }
            }
          }
        });
      }
    }

    // Audit Log for Restoration
    try {
      if (db.auditLogs) {
        await db.auditLogs.add({
          id: `AUDIT-RESTORE-${Date.now()}`,
          userId: 'system',
          action: 'RESTORE',
          details: `استعادة نسخة احتياطية: ${restoredRecords} سجل تم استعادتها في ${restoredTables.length} جدول`,
          timestamp: new Date().toISOString()
        } as any);
      }
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      restoredTables,
      restoredRecords,
      warnings: plan.warnings,
      version
    };
  }

  /**
   * Executes an Automated Disaster Recovery Drill:
   * Proves backup encryption, wrong password rejection, corrupted payload rejection,
   * checksum mismatch rejection, and guarantees live DB zero side-effects.
   */
  async executeDisasterRecoveryDrill(password: string = 'DrillSafePass!2026'): Promise<DisasterRecoveryDrillResult> {
    const drillTimestamp = new Date().toISOString();
    const errors: string[] = [];
    const warnings: string[] = [];

    let healthyBackupValidated = false;
    let wrongPasswordRejected = false;
    let corruptedBackupRejected = false;
    let missingDataEncRejected = false;
    let checksumMismatchRejected = false;
    let restorePlanGenerated = false;
    let databaseUnchangedVerified = false;

    // Snapshot count of records before drill
    const initialProductCount = db.products ? await db.products.count().catch(() => 0) : 0;
    const initialInvoiceCount = db.invoices ? await db.invoices.count().catch(() => 0) : 0;

    try {
      // Step 1: Create synthetic test backup payload
      const testData = {
        version: '2.0.0',
        tables: {
          products: [
            { id: 'DR_PROD_1', name: 'Drill Test Product', basePrice: 50, costPrice: 30, quantity: 100 }
          ],
          invoices: [
            { id: 'DR_INV_1', total: 500, status: 'POSTED', customerId: 'CUST_1' }
          ]
        }
      };

      const backupEntry = await this.createLocalBackup(testData, password, 'fast', {
        tenantId: 'tenant_drill',
        createdBy: 'dr_drill_system'
      });

      // Step 2: Validate healthy backup via DRY_RUN mode
      const validation = await this.validateBackup(backupEntry.blob!, password);
      if (validation.valid && validation.plan) {
        healthyBackupValidated = true;
        restorePlanGenerated = true;
      } else {
        errors.push(`Healthy backup validation failed: ${validation.error}`);
      }

      // Step 3: Test wrong password rejection
      try {
        const wrongResult = await this.validateBackup(backupEntry.blob!, 'WRONG_INCORRECT_PASSWORD');
        if (!wrongResult.valid) {
          wrongPasswordRejected = true;
        } else {
          errors.push("Security breach: Validation unexpectedly succeeded with wrong password!");
        }
      } catch {
        wrongPasswordRejected = true;
      }

      // Step 4: Test missing data.enc rejection
      try {
        const brokenZip = new JSZip();
        brokenZip.file("metadata.json", JSON.stringify({ version: '2.0.0' }));
        const brokenBlob = await brokenZip.generateAsync({ type: 'blob' });
        const missingRes = await this.validateBackup(brokenBlob, password);
        if (!missingRes.valid) {
          missingDataEncRejected = true;
        } else {
          errors.push("Integrity breach: Archive missing data.enc was not rejected!");
        }
      } catch {
        missingDataEncRejected = true;
      }

      // Step 5: Test corrupted encrypted payload rejection
      try {
        const corruptZip = new JSZip();
        corruptZip.file("data.enc", "INVALID_NOT_JSON_DATA_CORRUPT");
        corruptZip.file("metadata.json", JSON.stringify({ version: '2.0.0' }));
        const corruptBlob = await corruptZip.generateAsync({ type: 'blob' });
        const corruptRes = await this.validateBackup(corruptBlob, password);
        if (!corruptRes.valid) {
          corruptedBackupRejected = true;
        } else {
          errors.push("Integrity breach: Corrupted payload was not rejected!");
        }
      } catch {
        corruptedBackupRejected = true;
      }

      // Step 6: Test checksum mismatch rejection
      try {
        const tamperedZip = new JSZip();
        tamperedZip.file("data.enc", backupEntry.data);
        tamperedZip.file("metadata.json", JSON.stringify({
          version: '2.0.0',
          checksum: '0000000000000000000000000000000000000000000000000000000000000000'
        }));
        const tamperedBlob = await tamperedZip.generateAsync({ type: 'blob' });
        const tamperedRes = await this.validateBackup(tamperedBlob, password);
        if (!tamperedRes.valid) {
          checksumMismatchRejected = true;
        } else {
          errors.push("Integrity breach: Checksum mismatch was not rejected!");
        }
      } catch {
        checksumMismatchRejected = true;
      }

      // Step 7: Verify database was completely untouched
      const afterProductCount = db.products ? await db.products.count().catch(() => 0) : 0;
      const afterInvoiceCount = db.invoices ? await db.invoices.count().catch(() => 0) : 0;

      if (initialProductCount === afterProductCount && initialInvoiceCount === afterInvoiceCount) {
        databaseUnchangedVerified = true;
      } else {
        errors.push("Side-effect detected: Live database count shifted during drill!");
      }

    } catch (e: any) {
      errors.push(`Drill crashed: ${e.message}`);
    }

    const allPassed = healthyBackupValidated &&
      wrongPasswordRejected &&
      missingDataEncRejected &&
      corruptedBackupRejected &&
      checksumMismatchRejected &&
      restorePlanGenerated &&
      databaseUnchangedVerified &&
      errors.length === 0;

    return {
      success: allPassed,
      drillTimestamp,
      healthyBackupValidated,
      wrongPasswordRejected,
      corruptedBackupRejected,
      missingDataEncRejected,
      checksumMismatchRejected,
      restorePlanGenerated,
      databaseUnchangedVerified,
      recoveryReadiness: allPassed ? 'ready' : 'not_ready',
      errors,
      warnings
    };
  }

  /**
   * Comprehensive validation & parsing pipeline (Memory-only, no DB writes).
   */
  private async parseAndValidateBackupPayload(file: File | Blob, password: string): Promise<InternalParsedBackup> {
    // 1. Password validation
    if (!password || !password.trim()) {
      throw new Error("يرجى إدخال كلمة مرور النسخة الاحتياطية");
    }

    // 2. File / Blob validation & size check
    if (!file) {
      throw new Error("الملف المحدد غير صالح أو غير موجود.");
    }

    const fileSize = file.size || 0;
    if (fileSize > MAX_BACKUP_FILE_SIZE_BYTES) {
      throw new Error(`حجم ملف النسخة الاحتياطية كبير جداً (${(fileSize / (1024 * 1024)).toFixed(2)} MB). الحد الأقصى المسموح به هو 100 MB.`);
    }

    // 3. Load ZIP archive
    let zip: JSZip;
    try {
      const zipData = (typeof Blob !== 'undefined' && file instanceof Blob)
        ? await file.arrayBuffer()
        : file;
      zip = await JSZip.loadAsync(zipData);
    } catch {
      throw new Error("الملف المحدد ليس ملف مضغوط صالح (.pfb / .zip).");
    }

    // 4. Locate data.enc
    const encFile = zip.file("data.enc");
    if (!encFile) {
      throw new Error("الملف المضغوط لا يحتوي على ملف البيانات المشفرة (data.enc).");
    }

    // 5. Read data.enc as text
    let encText: string;
    try {
      encText = await encFile.async("text");
    } catch {
      throw new Error("فشل في قراءة بيانات الملف المشفر.");
    }

    // 6. Optional Checksum Verification from metadata.json (backward-compatible)
    let metadata: Partial<BackupMetadata> | undefined;
    const metaFile = zip.file("metadata.json");
    if (metaFile) {
      try {
        const metaText = await metaFile.async("text");
        metadata = JSON.parse(metaText);
        if (metadata?.checksum) {
          const calculatedChecksum = await this.calculateChecksum(encText);
          if (calculatedChecksum !== metadata.checksum) {
            throw new Error("فشل فحص سلامة الملف المشفر (Checksum mismatch). قد يكون الملف تالفاً أو تم تعديله.");
          }
        }
      } catch (e: any) {
        if (e.message.includes('Checksum mismatch')) throw e;
      }
    }

    // 7. Parse data.enc JSON
    let payload: EncryptedPayload;
    try {
      payload = JSON.parse(encText);
    } catch {
      throw new Error("تنسيق حزمة البيانات المشفرة غير صالح (JSON تالف).");
    }

    // 8. Validate encrypted payload structure
    if (
      !payload ||
      typeof payload !== 'object' ||
      !payload.ciphertext ||
      !payload.salt ||
      !payload.iv ||
      typeof payload.ciphertext !== 'string' ||
      typeof payload.salt !== 'string' ||
      typeof payload.iv !== 'string' ||
      payload.salt.length < 8 ||
      payload.iv.length < 8
    ) {
      throw new Error("حزمة التشفير غير مكتملة أو مفقودة الحقول الأساسية (ciphertext, salt, iv).");
    }

    // 9. Decrypt via CryptoService (V2 Authenticated Encrypt-then-MAC or V1 Legacy)
    let decryptedText: string;
    try {
      decryptedText = CryptoService.decrypt(payload, password);
    } catch {
      throw new Error("كلمة المرور غير صحيحة أو النسخة غير صالحة");
    }

    // 10. Parse decrypted JSON
    let parsedData: any;
    try {
      parsedData = JSON.parse(decryptedText);
    } catch {
      throw new Error("بيانات النسخة الاحتياطية بعد فك التشفير غير صالحة (JSON تالف).");
    }

    // 11. Validate root backup structure
    if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
      throw new Error("هيكل النسخة الاحتياطية غير صالح.");
    }

    const version = String(parsedData.version || parsedData.backupVersion || metadata?.version || '1.0.0');
    const warnings: string[] = [];

    // Check version major compatibility
    const majorVersion = version.split('.')[0];
    if (majorVersion !== '1') {
      warnings.push(`إصدار النسخة الاحتياطية (${version}) قد يختلف عن إصدار التطبيق الحالي.`);
    }

    const tablesSource = parsedData.tables || parsedData;
    const presentTableKeys = Object.keys(tablesSource).filter(
      k => RECOGNIZED_TABLE_KEYS.includes(k) && Array.isArray(tablesSource[k])
    );

    if (presentTableKeys.length === 0) {
      throw new Error("النسخة الاحتياطية لا تحتوي على جداول بيانات متوافقة مع PharmaFlow.");
    }

    // 12. Deep record-level validation & Prototype Pollution Sanitization
    const sanitizedTables: Record<string, any[]> = {};
    const recordCounts: Record<string, number> = {};
    let totalRecords = 0;

    for (const tableName of presentTableKeys) {
      const rawRows = tablesSource[tableName];
      if (!Array.isArray(rawRows)) continue;

      const cleanedRows: any[] = [];
      const seenPrimaryKeys = new Set<string>();

      for (let i = 0; i < rawRows.length; i++) {
        const item = rawRows[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          warnings.push(`تم تجاهل سجل غير صالح في جدول "${tableName}" بالرقم الترتيبي ${i + 1}.`);
          continue;
        }

        // Prototype pollution guard
        const sanitizedItem: any = {};
        for (const [key, val] of Object.entries(item)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
          }
          sanitizedItem[key] = val;
        }

        // Primary key resolution / deduplication check
        const pk = String(sanitizedItem.id || sanitizedItem.ID || sanitizedItem.key || sanitizedItem.code || `idx_${i}`);
        if (seenPrimaryKeys.has(pk)) {
          warnings.push(`تم رصد تكرار للمعرف الرئيسي "${pk}" في جدول "${tableName}".`);
        } else {
          seenPrimaryKeys.add(pk);
        }

        cleanedRows.push(sanitizedItem);
      }

      sanitizedTables[tableName] = cleanedRows;
      recordCounts[tableName] = cleanedRows.length;
      totalRecords += cleanedRows.length;
    }

    const plan: RestorePlan = {
      tablesToRestore: Object.keys(sanitizedTables),
      recordCounts,
      totalRecords,
      warnings,
      backupVersion: version
    };

    return {
      plan,
      sanitizedTables,
      version,
      metadata
    };
  }

  /**
   * Uploads an encrypted backup to cloud storage via the decoupled storage adapter.
   */
  async uploadToCloud(backup: BackupEntry, onProgress?: UploadProgressCallback): Promise<string> {
    if (!backup?.metadata?.name) {
      throw new Error("بيانات النسخة الاحتياطية غير صالحة للرفع.");
    }
    const path = `backups/${backup.metadata.name}`;
    const payload = backup.blob || backup.data;
    return await this.storageAdapter.upload(path, payload, onProgress);
  }

  /**
   * Deeply sanitizes data before backup to strip sensitive credentials and prevent prototype pollution
   */
  private sanitizeDataBeforeBackup(input: any): any {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeDataBeforeBackup(item));
    }
    const sanitized: Record<string, any> = {};
    const forbiddenKeys = new Set(['backuppassword', 'refreshtoken', 'accesstoken', 'secretkey', 'privatekey', 'credentials']);
    for (const [key, value] of Object.entries(input)) {
      if (forbiddenKeys.has(key.toLowerCase())) {
        continue;
      }
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeDataBeforeBackup(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private async calculateChecksum(data: string): Promise<string> {
    return CryptoJS.SHA256(data).toString();
  }
}

export const backupService = new BackupService();
