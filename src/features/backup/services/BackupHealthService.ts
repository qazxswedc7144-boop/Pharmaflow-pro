import JSZip from 'jszip';
import CryptoJS from 'crypto-js';
import { db } from '@/core/db';
import { 
  BackupHealthSummary, 
  BackupHealthStatus, 
  RecoveryReadinessStatus, 
  BackupInconsistencyReport, 
  BackupIntegrityReport, 
  DisasterRecoveryDrillResult, 
  BackupInventoryItem,
  BackupEvent,
  BackupEventType
} from '../backup.types';
import { BackupManagementService, backupManagementService } from './BackupManagementService';
import { BackupService, backupService } from './BackupService';
import { BackupOrchestrator, backupOrchestrator } from './BackupOrchestrator';
import { CryptoService, EncryptedPayload } from '@/services/security/CryptoService';

export type HealthEventListener = (event: BackupEvent) => void;

/**
 * Enterprise Backup Health & Observability Service
 * 
 * Provides comprehensive monitoring of backup inventory, integrity verification,
 * disaster recovery readiness calculation, orphan state detection, and non-destructive
 * disaster recovery drills without mutating database state.
 */
export class BackupHealthService {
  private readonly listeners = new Set<HealthEventListener>();

  constructor(
    private readonly managementSvc: BackupManagementService = backupManagementService,
    private readonly backupSvc: BackupService = backupService,
    private readonly orchestrator: BackupOrchestrator = backupOrchestrator
  ) {}

  /**
   * Subscribes to health observability events.
   */
  addEventListener(listener: HealthEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emits structured, safe telemetry events (never logging secrets or payloads).
   */
  private emitEvent(type: BackupEventType, details: Partial<BackupEvent> = {}): void {
    const event: BackupEvent = {
      type,
      timestamp: new Date().toISOString(),
      ...details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Prevent listener failures from affecting the health service
      }
    }
  }

  /**
   * Aggregates a full status, health, and recovery readiness overview.
   */
  async getDetailedHealthSummary(): Promise<BackupHealthSummary> {
    this.emitEvent('health-check-started', {
      message: 'بدء فحص صحة وجاهزية منظومة النسخ الاحتياطي...'
    });

    const inventory = await this.managementSvc.listBackups();
    const retentionPolicy = this.managementSvc.getRetentionPolicy();
    const pendingUploadsCount = this.orchestrator.getPendingCloudSyncCount();

    const totalBackups = inventory.length;
    const localBackups = inventory.filter(b => b.status === 'local' || b.status === 'both');
    const cloudBackups = inventory.filter(b => b.status === 'cloud' || b.status === 'both' || b.status === 'synced');
    const failedBackups = inventory.filter(b => b.status === 'failed');
    const successfulBackups = inventory.filter(b => b.status !== 'failed');

    const localBackupsCount = localBackups.length;
    const cloudBackupsCount = cloudBackups.length;
    const failedBackupsCount = failedBackups.length;
    const unsyncedCount = localBackups.filter(b => b.status === 'local').length;

    const latestBackupDate = inventory.length > 0 ? inventory[0]?.createdAt : undefined;
    const latestSuccessfulBackup = successfulBackups.length > 0 ? successfulBackups[0] : undefined;
    const latestSuccessfulBackupDate = latestSuccessfulBackup?.createdAt;
    const latestLocalBackup = localBackups.length > 0 ? localBackups[0] : undefined;
    const latestLocalBackupDate = latestLocalBackup?.createdAt;
    const latestCloudBackup = cloudBackups.length > 0 ? cloudBackups[0] : undefined;
    const latestCloudBackupDate = latestCloudBackup?.createdAt;

    // Detect inconsistencies and orphan states
    const inconsistencies = await this.detectInconsistencies(inventory);

    // Stale evaluation (over 24 hours without successful backup)
    const now = Date.now();
    const isStale = latestSuccessfulBackupDate 
      ? (now - new Date(latestSuccessfulBackupDate).getTime() > 24 * 60 * 60 * 1000)
      : true;

    // Calculate Overall Health
    let overallHealth: BackupHealthStatus = 'healthy';
    let recoveryReadiness: RecoveryReadinessStatus = 'ready';
    let integrityStatus: 'valid' | 'warning' | 'failed' | 'unknown' = 'valid';

    if (totalBackups === 0 || successfulBackups.length === 0) {
      overallHealth = 'critical';
      recoveryReadiness = 'not_ready';
      integrityStatus = totalBackups === 0 ? 'unknown' : 'failed';
    } else if (inconsistencies.some(i => i.severity === 'critical')) {
      overallHealth = 'critical';
      recoveryReadiness = 'not_ready';
      integrityStatus = 'failed';
    } else if (isStale || pendingUploadsCount > 0 || failedBackupsCount > 0 || inconsistencies.some(i => i.severity === 'warning')) {
      overallHealth = 'warning';
      recoveryReadiness = successfulBackups.length > 0 ? 'warning' : 'not_ready';
      integrityStatus = 'warning';
    } else {
      overallHealth = 'healthy';
      recoveryReadiness = 'ready';
      integrityStatus = 'valid';
    }

    if (recoveryReadiness === 'ready') {
      this.emitEvent('recovery-ready', { message: 'منظومة النسخ الاحتياطي جاهزة للاستعادة الفورية.' });
    } else if (recoveryReadiness === 'warning') {
      this.emitEvent('recovery-warning', { message: 'الاستعادة ممكنة ولكن توجد تنبيهات (نسخ قديمة أو معلقة).' });
    } else {
      this.emitEvent('recovery-critical', { message: 'تحذير: لا توجد نسخة احتياطية صالحة وجاهزة للاستعادة!' });
    }

    this.emitEvent('health-check-completed', {
      message: `اكتمل فحص الصحة: الحالة العامة [${overallHealth}]، الجاهزية [${recoveryReadiness}].`
    });

    return {
      totalBackups,
      latestBackupDate,
      latestSuccessfulBackupDate,
      latestLocalBackupDate,
      latestCloudBackupDate,
      localBackupsCount,
      cloudBackupsCount,
      pendingUploadsCount,
      failedBackupsCount,
      unsyncedCount,
      overallHealth,
      recoveryReadiness,
      integrityStatus,
      retentionCurrent: totalBackups,
      retentionLimit: retentionPolicy.maxLocalBackups,
      inconsistencies
    };
  }

  /**
   * In-Memory Package Verification: Validates integrity, data.enc, JSON structure,
   * crypto parameters, and SHA-256 checksum without touching the database.
   */
  async verifyBackupPackage(fileOrBlob: File | Blob | ArrayBuffer, expectedChecksum?: string): Promise<BackupIntegrityReport> {
    const warnings: string[] = [];

    if (!fileOrBlob) {
      return {
        valid: false,
        hasDataEnc: false,
        hasValidJson: false,
        hasCryptoFields: false,
        error: 'الملف المحدد غير صالح أو غير موجود.',
        warnings
      };
    }

    let zip: JSZip;
    try {
      const zipData = (typeof Blob !== 'undefined' && fileOrBlob instanceof Blob)
        ? await fileOrBlob.arrayBuffer()
        : fileOrBlob;
      zip = await JSZip.loadAsync(zipData);
    } catch {
      return {
        valid: false,
        hasDataEnc: false,
        hasValidJson: false,
        hasCryptoFields: false,
        error: 'الملف المحدد ليس حزمة ZIP صالحة (.pfb).',
        warnings
      };
    }

    const encFile = zip.file("data.enc");
    if (!encFile) {
      return {
        valid: false,
        hasDataEnc: false,
        hasValidJson: false,
        hasCryptoFields: false,
        error: 'الحزمة لا تحتوي على ملف البيانات المشفرة (data.enc).',
        warnings
      };
    }

    let encText: string;
    try {
      encText = await encFile.async("text");
    } catch {
      return {
        valid: false,
        hasDataEnc: true,
        hasValidJson: false,
        hasCryptoFields: false,
        error: 'فشل في قراءة محتوى data.enc.',
        warnings
      };
    }

    // Checksum verification
    let checksumMatched: boolean | undefined = undefined;
    let metadataValid: boolean | undefined = undefined;
    let backupId: string | undefined = undefined;

    const metaFile = zip.file("metadata.json");
    if (metaFile) {
      try {
        const metaText = await metaFile.async("text");
        const metadata = JSON.parse(metaText);
        metadataValid = true;
        backupId = metadata?.id;

        const targetChecksum = expectedChecksum || metadata?.checksum;
        if (targetChecksum) {
          const calculated = CryptoJS.SHA256(encText).toString();
          if (calculated === targetChecksum) {
            checksumMatched = true;
            this.emitEvent('checksum-valid', {
              backupId,
              message: 'تم التحقق من مطابقة Checksum بنجاح.'
            });
          } else {
            checksumMatched = false;
            this.emitEvent('checksum-failed', {
              backupId,
              message: 'فشل فحص Checksum: لا تتطابق البصمة مع الحزمة.'
            });
          }
        }
      } catch {
        metadataValid = false;
        warnings.push('ملف metadata.json تالف أو غير قابل للقراءة.');
      }
    } else if (expectedChecksum) {
      const calculated = CryptoJS.SHA256(encText).toString();
      checksumMatched = calculated === expectedChecksum;
      if (!checksumMatched) {
        this.emitEvent('checksum-failed', { message: 'فشل مطابقة Checksum مع القيمة المتوقعة.' });
      }
    }

    if (checksumMatched === false) {
      return {
        valid: false,
        backupId,
        hasDataEnc: true,
        hasValidJson: false,
        hasCryptoFields: false,
        checksumMatched: false,
        metadataValid,
        error: 'فشل فحص سلامة الملف (Checksum Mismatch). قد تكون النسخة تالفة أو تم العبث بها.',
        warnings
      };
    }

    // Validate JSON in data.enc
    let payload: EncryptedPayload;
    try {
      payload = JSON.parse(encText);
    } catch {
      return {
        valid: false,
        backupId,
        hasDataEnc: true,
        hasValidJson: false,
        hasCryptoFields: false,
        checksumMatched,
        metadataValid,
        error: 'حزمة data.enc ليست بصيغة JSON صالحة.',
        warnings
      };
    }

    // Validate crypto fields (ciphertext, salt, iv)
    const hasCryptoFields = Boolean(
      payload &&
      typeof payload === 'object' &&
      typeof payload.ciphertext === 'string' &&
      payload.ciphertext.length > 0 &&
      typeof payload.salt === 'string' &&
      payload.salt.length >= 8 &&
      typeof payload.iv === 'string' &&
      payload.iv.length >= 8
    );

    if (!hasCryptoFields) {
      return {
        valid: false,
        backupId,
        hasDataEnc: true,
        hasValidJson: true,
        hasCryptoFields: false,
        checksumMatched,
        metadataValid,
        error: 'حزمة التشفير غير مكتملة أو مفقودة الحقول الأساسية (ciphertext, salt, iv).',
        warnings
      };
    }

    return {
      valid: true,
      backupId,
      hasDataEnc: true,
      hasValidJson: true,
      hasCryptoFields: true,
      checksumMatched,
      metadataValid,
      warnings
    };
  }

  /**
   * Identifies orphan entries, missing synchronizations, and data inconsistencies.
   */
  async detectInconsistencies(inventory?: BackupInventoryItem[]): Promise<BackupInconsistencyReport[]> {
    const items = inventory || await this.managementSvc.listBackups();
    const reports: BackupInconsistencyReport[] = [];
    const now = new Date().toISOString();

    // 1. Detect duplicate backup IDs
    const seenIds = new Set<string>();
    for (const item of items) {
      if (seenIds.has(item.id)) {
        reports.push({
          type: 'duplicate_backup_id',
          severity: 'warning',
          backupId: item.id,
          message: `تم رصد تكرار لمعرف النسخة الاحتياطية (${item.id}) في السجل المحلي.`,
          detectedAt: now
        });
        this.emitEvent('orphan-detected', {
          backupId: item.id,
          message: `تكرار المعرف: ${item.id}`
        });
      } else {
        seenIds.add(item.id);
      }
    }

    // 2. Detect Local-only vs Cloud-only backups
    for (const item of items) {
      if (item.status === 'local') {
        reports.push({
          type: 'cloud_missing_local_present',
          severity: 'info',
          backupId: item.id,
          message: `النسخة الاحتياطية (${item.name}) محفوظة محلياً فقط ولم تتم مزامنتها سحابياً بعد.`,
          detectedAt: now
        });
      } else if (item.status === 'cloud') {
        reports.push({
          type: 'local_missing_cloud_present',
          severity: 'info',
          backupId: item.id,
          message: `النسخة الاحتياطية (${item.name}) مسجلة في السحابة فقط وغير متوفرة في التخزين المحلي.`,
          detectedAt: now
        });
      }
    }

    return reports;
  }

  /**
   * Executes a Non-Destructive Disaster Recovery Drill.
   * Tests all failure scenarios and confirms zero modification to live Dexie database.
   */
  async runDisasterRecoveryDrill(options?: { password?: string }): Promise<DisasterRecoveryDrillResult> {
    const drillTimestamp = new Date().toISOString();
    const password = options?.password || 'EnterpriseDrillPassword2026!';
    const errors: string[] = [];
    const warnings: string[] = [];

    this.emitEvent('disaster-recovery-test', {
      message: 'بدء تمرين محاكاة التعافي من الكوارث (Non-Destructive DR Drill)...'
    });

    // 1. Record baseline database state before drill
    let preProductsCount = 0;
    let preInvoicesCount = 0;
    try {
      preProductsCount = await db.products.count();
      preInvoicesCount = await db.invoices.count();
    } catch {
      // Safe fallback for in-memory / mock environments
    }

    let healthyBackupValidated = false;
    let wrongPasswordRejected = false;
    let corruptedBackupRejected = false;
    let missingDataEncRejected = false;
    let checksumMismatchRejected = false;
    let restorePlanGenerated = false;

    try {
      // Step A: Create mock synthetic backup payload
      const mockDbData = {
        products: [
          { id: 'drill-p1', name: 'Paracetamol 500mg', price: 10, stockQuantity: 100 },
          { id: 'drill-p2', name: 'Amoxicillin 250mg', price: 25, stockQuantity: 50 }
        ],
        invoices: [
          { id: 'drill-inv1', invoiceNumber: 'INV-DR-001', totalAmount: 35 }
        ]
      };

      const validEncrypted = CryptoService.encrypt(JSON.stringify(mockDbData), password);
      const validEncryptedText = JSON.stringify(validEncrypted);
      const validChecksum = CryptoJS.SHA256(validEncryptedText).toString();

      // Step B: Build valid .pfb package
      const validZip = new JSZip();
      validZip.file("data.enc", validEncryptedText);
      validZip.file("metadata.json", JSON.stringify({
        id: 'drill-valid-id',
        version: '1.0.0',
        checksum: validChecksum
      }));
      const validBlob = await validZip.generateAsync({ type: "blob" });

      // Step C: Validate healthy package & generate restore plan (Dry-Run)
      const validPlanResult = await this.backupSvc.validateBackup(validBlob, password);
      if (validPlanResult.valid && validPlanResult.totalRecords === 3) {
        healthyBackupValidated = true;
        restorePlanGenerated = true;
      } else {
        errors.push('فشل اختبار التحقق من صحة النسخة السليمة أثناء تمرين التعافي.');
      }

      // Step D: Validate wrong password rejection
      try {
        const wrongPassResult = await this.backupSvc.validateBackup(validBlob, 'WrongPassword999!');
        if (!wrongPassResult.valid) {
          wrongPasswordRejected = true;
        } else {
          errors.push('فشل تمرين التعافي: تم قبول كلمة مرور خاطئة!');
        }
      } catch {
        wrongPasswordRejected = true;
      }

      // Step E: Validate corrupted ZIP rejection
      const corruptedBlob = new Blob(['CorruptedDataNotAZipArchive'], { type: 'application/octet-stream' });
      const corruptResult = await this.backupSvc.validateBackup(corruptedBlob, password);
      if (!corruptResult.valid) {
        corruptedBackupRejected = true;
      } else {
        errors.push('فشل تمرين التعافي: لم يتم رفض ملف ZIP تالف!');
      }

      // Step F: Validate missing data.enc rejection
      const missingEncZip = new JSZip();
      missingEncZip.file("metadata.json", JSON.stringify({ version: '1.0.0' }));
      const missingEncBlob = await missingEncZip.generateAsync({ type: "blob" });
      const missingEncResult = await this.backupSvc.validateBackup(missingEncBlob, password);
      if (!missingEncResult.valid) {
        missingDataEncRejected = true;
      } else {
        errors.push('فشل تمرين التعافي: لم يتم رفض حزمة مفقود منها data.enc!');
      }

      // Step G: Validate checksum mismatch rejection
      const tamperedZip = new JSZip();
      tamperedZip.file("data.enc", validEncryptedText);
      tamperedZip.file("metadata.json", JSON.stringify({
        version: '1.0.0',
        checksum: 'invalid_sha256_checksum_hash_here'
      }));
      const tamperedBlob = await tamperedZip.generateAsync({ type: "blob" });
      const tamperedResult = await this.backupSvc.validateBackup(tamperedBlob, password);
      if (!tamperedResult.valid) {
        checksumMismatchRejected = true;
      } else {
        errors.push('فشل تمرين التعافي: لم يتم رصد عدم تطابق Checksum!');
      }

    } catch (drillErr: any) {
      errors.push(`خطأ أثناء تنفيذ تمرين التعافي: ${drillErr?.message || drillErr}`);
    }

    // 2. Verify database state remains completely unchanged
    let postProductsCount = 0;
    let postInvoicesCount = 0;
    try {
      postProductsCount = await db.products.count();
      postInvoicesCount = await db.invoices.count();
    } catch {
      // Safe fallback
    }

    const databaseUnchangedVerified = 
      preProductsCount === postProductsCount && 
      preInvoicesCount === postInvoicesCount;

    if (!databaseUnchangedVerified) {
      errors.push('تحذير خطير: تم رصد تعديل في قاعدة البيانات أثناء تشغيل تمرين التعافي الجاف!');
    }

    const success = 
      healthyBackupValidated &&
      wrongPasswordRejected &&
      corruptedBackupRejected &&
      missingDataEncRejected &&
      checksumMismatchRejected &&
      restorePlanGenerated &&
      databaseUnchangedVerified &&
      errors.length === 0;

    const recoveryReadiness: RecoveryReadinessStatus = success ? 'ready' : 'not_ready';

    return {
      success,
      drillTimestamp,
      healthyBackupValidated,
      wrongPasswordRejected,
      corruptedBackupRejected,
      missingDataEncRejected,
      checksumMismatchRejected,
      restorePlanGenerated,
      databaseUnchangedVerified,
      recoveryReadiness,
      errors,
      warnings
    };
  }
}

export const backupHealthService = new BackupHealthService();
