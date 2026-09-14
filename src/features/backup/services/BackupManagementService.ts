import { db } from '@/core/db';
import { 
  BackupInventoryItem, 
  BackupHealthSummary, 
  BackupValidationResult, 
  RetentionPolicy, 
  CleanupPlan, 
  CleanupResult,
  BackupStatus 
} from '../backup.types';
import { BackupService, backupService as defaultBackupService } from './BackupService';

/**
 * Enterprise Backup Management Service
 * Responsible for inventory tracking, health summarization, retention policy calculation,
 * dry-run validation coordination, and safe local backup record deletion.
 * 
 * Strict architectural rule: Isolated from direct Firebase SDKs and cryptographic primitives.
 */
export class BackupManagementService {
  private lastValidationResult: 'valid' | 'invalid' | 'none' = 'none';
  private lastValidationTime?: string;
  private retentionPolicy: RetentionPolicy = {
    maxLocalBackups: 10,
    autoCleanupEnabled: false
  };

  constructor(private readonly backupService: BackupService = defaultBackupService) {}

  /**
   * Retrieves all local backup metadata records from Dexie storage,
   * sorted in reverse chronological order (newest first).
   */
  async listBackups(): Promise<BackupInventoryItem[]> {
    try {
      const records = await db.systemBackups.toArray();
      if (!Array.isArray(records)) {
        return [];
      }

      // Sort by creation date descending
      const sorted = records.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      return sorted.map((record): BackupInventoryItem => {
        let status: BackupStatus = 'local';
        if (record.status === 'FAILED') {
          status = 'failed';
        }

        const sizeInKB = Number(record.sizeInKB) || 0;

        return {
          id: String(record.id),
          name: record.backupName || record.name || `PharmaFlow_Backup_${record.id}.pfb`,
          createdAt: record.createdAt || new Date().toISOString(),
          type: (record.backupType as any) || 'full',
          sizeInKB,
          sizeInBytes: sizeInKB * 1024,
          status,
          verified: Boolean(record.restoreTested),
          checksum: record.checksumHash || '',
          version: record.systemVersion || '1.0.0'
        };
      });
    } catch (err) {
      console.warn('[BackupManagementService] Error reading backups from Dexie:', err);
      return [];
    }
  }

  /**
   * Aggregates a comprehensive health and status summary of the backup subsystem.
   */
  async getHealthSummary(): Promise<BackupHealthSummary> {
    const inventory = await this.listBackups();
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

    const isStale = latestSuccessfulBackupDate
      ? (Date.now() - new Date(latestSuccessfulBackupDate).getTime() > 24 * 60 * 60 * 1000)
      : true;

    let overallHealth: 'healthy' | 'warning' | 'critical' | 'unknown' = 'healthy';
    let recoveryReadiness: 'ready' | 'warning' | 'not_ready' = 'ready';
    let integrityStatus: 'valid' | 'warning' | 'failed' | 'unknown' = 'valid';

    if (totalBackups === 0 || successfulBackups.length === 0) {
      overallHealth = 'critical';
      recoveryReadiness = 'not_ready';
      integrityStatus = totalBackups === 0 ? 'unknown' : 'failed';
    } else if (isStale || failedBackupsCount > 0) {
      overallHealth = 'warning';
      recoveryReadiness = successfulBackups.length > 0 ? 'warning' : 'not_ready';
      integrityStatus = 'warning';
    } else {
      overallHealth = 'healthy';
      recoveryReadiness = 'ready';
      integrityStatus = 'valid';
    }

    return {
      totalBackups,
      latestBackupDate,
      latestSuccessfulBackupDate,
      latestLocalBackupDate,
      latestCloudBackupDate,
      localBackupsCount,
      cloudBackupsCount,
      pendingUploadsCount: 0,
      failedBackupsCount,
      unsyncedCount,
      overallHealth,
      recoveryReadiness,
      integrityStatus,
      retentionCurrent: totalBackups,
      retentionLimit: this.retentionPolicy.maxLocalBackups,
      lastValidationResult: this.lastValidationResult,
      lastValidationTime: this.lastValidationTime
    };
  }

  /**
   * Memory-only validation of an encrypted backup package (.pfb) without mutating database state.
   */
  async validateBackup(file: File | Blob, password: string): Promise<BackupValidationResult> {
    const result = await this.backupService.validateBackup(file, password);
    this.lastValidationResult = result.valid ? 'valid' : 'invalid';
    this.lastValidationTime = new Date().toISOString();
    return result;
  }

  /**
   * Safely deletes a specific local backup metadata entry from Dexie storage.
   * Enforces ID validation and ensures non-existent records are rejected safely.
   */
  async deleteLocalBackup(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new Error('معرف النسخة الاحتياطية غير صالح.');
    }

    const trimmedId = id.trim();
    const existing = await db.systemBackups.get(trimmedId);
    if (!existing) {
      throw new Error('النسخة الاحتياطية المطلوبة غير موجودة في السجل المحلي أو تم حذفها مسبقاً.');
    }

    await db.systemBackups.delete(trimmedId);
    return true;
  }

  /**
   * Returns current retention policy settings.
   */
  getRetentionPolicy(): RetentionPolicy {
    return { ...this.retentionPolicy };
  }

  /**
   * Updates retention policy settings.
   */
  setRetentionPolicy(policy: Partial<RetentionPolicy>): RetentionPolicy {
    this.retentionPolicy = {
      ...this.retentionPolicy,
      ...policy
    };
    return this.getRetentionPolicy();
  }

  /**
   * Generates a safe cleanup plan identifying backups that exceed the configured retention limit.
   * Does NOT perform deletion.
   */
  async createCleanupPlan(customPolicy?: RetentionPolicy): Promise<CleanupPlan> {
    const policy = customPolicy || this.retentionPolicy;
    const backups = await this.listBackups();
    const totalBackups = backups.length;
    const maxAllowed = Math.max(1, policy.maxLocalBackups);

    if (!policy.autoCleanupEnabled) {
      return {
        totalBackups,
        maxAllowed,
        toDeleteCount: 0,
        candidates: [],
        reason: 'سياسة التنظيف التلقائي معطلة.'
      };
    }

    if (totalBackups <= maxAllowed) {
      return {
        totalBackups,
        maxAllowed,
        toDeleteCount: 0,
        candidates: [],
        reason: `إجمالي النسخ (${totalBackups}) ضمن الحد الأقصى المسموح به (${maxAllowed}).`
      };
    }

    // Identify protected backups that must NEVER be deleted:
    // Rule: "Never delete the only known recoverable backup"
    const validBackups = backups.filter(b => b.status !== 'failed');
    const protectedIds = new Set<string>();

    if (validBackups.length > 0 && validBackups[0]?.id) {
      // Protect the newest valid/recoverable backup
      protectedIds.add(validBackups[0].id);
    }

    // Protect single local recoverable backup if it's the only one
    const localBackups = backups.filter(b => b.status === 'local' || b.status === 'both');
    if (localBackups.length === 1 && localBackups[0]?.id) {
      protectedIds.add(localBackups[0].id);
    }

    // Since backups are sorted newest first, items from index maxAllowed onwards are potential candidates
    const rawCandidates = backups.slice(maxAllowed);

    // Filter candidates to strictly exclude protected backups
    const candidates = rawCandidates.filter(c => !protectedIds.has(c.id));

    return {
      totalBackups,
      maxAllowed,
      toDeleteCount: candidates.length,
      candidates,
      reason: candidates.length > 0
        ? `تجاوز الحد الأقصى المسموح به (${maxAllowed}) بعدد ${candidates.length} نسخة قديمة مؤهلة للحذف الآمن.`
        : `إجمالي النسخ المؤهلة للحذف هو 0 (تمت حماية النسخ الصالحة والوحيدة القابلة للاستعادة).`
    };
  }

  /**
   * Applies an approved cleanup plan by safely deleting each candidate backup.
   */
  async applyCleanupPlan(plan: CleanupPlan): Promise<CleanupResult> {
    if (!plan || !Array.isArray(plan.candidates) || plan.candidates.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        deletedIds: [],
        errors: []
      };
    }

    const deletedIds: string[] = [];
    const errors: string[] = [];

    for (const candidate of plan.candidates) {
      try {
        await this.deleteLocalBackup(candidate.id);
        deletedIds.push(candidate.id);
      } catch (err: any) {
        errors.push(`فشل حذف النسخة ${candidate.name} (${candidate.id}): ${err?.message || 'خطأ غير معروف'}`);
      }
    }

    return {
      success: errors.length === 0,
      deletedCount: deletedIds.length,
      deletedIds,
      errors
    };
  }
}

export const backupManagementService = new BackupManagementService();
