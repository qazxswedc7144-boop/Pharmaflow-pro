
export type BackupStatus = 'local' | 'cloud' | 'both' | 'synced' | 'failed' | 'unknown';

export interface BackupMetadata {
  id: string;
  name: string;
  date: Date;
  size: number;
  type: 'full' | 'fast';
  status: BackupStatus;
  encryption: boolean;
  checksum: string;
  version: string;
}

export interface BackupEntry {
  metadata: BackupMetadata;
  data: string; // Encrypted data string
  blob?: Blob;
}

export interface RestoreResult {
  success: boolean;
  restoredTables: string[];
  restoredRecords?: number;
  warnings?: string[];
  version?: string;
  errorCode?: string;
  message?: string;
}

export interface RestorePlan {
  tablesToRestore: string[];
  recordCounts: Record<string, number>;
  totalRecords: number;
  warnings: string[];
  backupVersion?: string;
}

export interface BackupValidationResult {
  valid: boolean;
  version?: string;
  tables?: string[];
  recordCounts?: Record<string, number>;
  totalRecords?: number;
  warnings?: string[];
  error?: string;
  errorCode?: string;
  plan?: RestorePlan;
  checksumStatus?: 'matched' | 'mismatch' | 'unknown';
  encryptionStatus?: 'encrypted' | 'plaintext' | 'invalid';
}

export interface BackupInventoryItem {
  id: string;
  name: string;
  createdAt: string;
  type: 'full' | 'fast' | string;
  sizeInBytes?: number;
  sizeInKB?: number;
  status: BackupStatus;
  verified?: boolean;
  lastVerifiedAt?: string;
  checksum?: string;
  version?: string;
}

export interface RetentionPolicy {
  maxLocalBackups: number;
  autoCleanupEnabled: boolean;
}

export interface CleanupPlan {
  totalBackups: number;
  maxAllowed: number;
  toDeleteCount: number;
  candidates: BackupInventoryItem[];
  reason: string;
}

export interface CleanupResult {
  success: boolean;
  deletedCount: number;
  deletedIds: string[];
  errors: string[];
}

export interface BackupHealthSummary {
  totalBackups: number;
  latestBackupDate?: string;
  latestSuccessfulBackupDate?: string;
  latestLocalBackupDate?: string;
  latestCloudBackupDate?: string;
  localBackupsCount: number;
  cloudBackupsCount: number;
  pendingUploadsCount: number;
  failedBackupsCount: number;
  unsyncedCount: number;
  overallHealth: BackupHealthStatus;
  recoveryReadiness: RecoveryReadinessStatus;
  integrityStatus: 'valid' | 'warning' | 'failed' | 'unknown';
  retentionCurrent: number;
  retentionLimit: number;
  lastValidationResult?: 'valid' | 'invalid' | 'none';
  lastValidationTime?: string;
  inconsistencies?: BackupInconsistencyReport[];
}

export type BackupHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export type RecoveryReadinessStatus = 'ready' | 'warning' | 'not_ready';

export type BackupInconsistencyType =
  | 'orphan_queue_item'
  | 'local_missing_cloud_present'
  | 'cloud_missing_local_present'
  | 'duplicate_backup_id'
  | 'checksum_mismatch'
  | 'payload_corrupted'
  | 'missing_data_enc';

export interface BackupInconsistencyReport {
  type: BackupInconsistencyType;
  severity: 'warning' | 'critical' | 'info';
  backupId?: string;
  message: string;
  detectedAt: string;
}

export interface BackupIntegrityReport {
  valid: boolean;
  backupId?: string;
  hasDataEnc: boolean;
  hasValidJson: boolean;
  hasCryptoFields: boolean;
  checksumMatched?: boolean;
  metadataValid?: boolean;
  tablesCount?: number;
  totalRecords?: number;
  error?: string;
  warnings: string[];
}

export interface DisasterRecoveryDrillResult {
  success: boolean;
  drillTimestamp: string;
  healthyBackupValidated: boolean;
  wrongPasswordRejected: boolean;
  corruptedBackupRejected: boolean;
  missingDataEncRejected: boolean;
  checksumMismatchRejected: boolean;
  restorePlanGenerated: boolean;
  databaseUnchangedVerified: boolean;
  recoveryReadiness: RecoveryReadinessStatus;
  errors: string[];
  warnings: string[];
}

export type BackupJobState =
  | 'pending'
  | 'local-completed'
  | 'uploading'
  | 'cloud-completed'
  | 'cloud-failed'
  | 'completed';

export type BackupEventType =
  | 'started'
  | 'local-success'
  | 'cloud-upload-started'
  | 'cloud-success'
  | 'cloud-failed'
  | 'retry-scheduled'
  | 'completed'
  | 'health-check-started'
  | 'health-check-completed'
  | 'checksum-valid'
  | 'checksum-failed'
  | 'recovery-ready'
  | 'recovery-warning'
  | 'recovery-critical'
  | 'retention-analysis'
  | 'orphan-detected'
  | 'disaster-recovery-test';

export interface BackupEvent {
  type: BackupEventType;
  timestamp: string;
  backupId?: string;
  jobState?: BackupJobState;
  attempt?: number;
  maxAttempts?: number;
  message?: string;
}

export interface BackupOrchestrationResult {
  success: boolean;
  backupId?: string;
  backupName?: string;
  localSuccess: boolean;
  cloudSuccess: boolean;
  jobState: BackupJobState;
  cloudPending?: boolean;
  error?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  timeoutMs: number;
}

