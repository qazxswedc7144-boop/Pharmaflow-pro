/**
 * Enterprise Data Integrity, Consistency & Idempotency Types
 */

export type IdempotencyStatus = 'PROCESSING' | 'COMMITTED' | 'FAILED' | 'EXPIRED';

export type ConsistencyState =
  | 'VALID'
  | 'PENDING'
  | 'INCONSISTENT'
  | 'REPAIR_REQUIRED'
  | 'REPAIRING'
  | 'REPAIRED'
  | 'FAILED';

export interface IdempotencyKeyParams {
  tenantId: string;
  branchId: string;
  operationType: string;
  entityType: string;
  entityId?: string;
  requestFingerprint: string;
}

export interface IdempotencyRecord {
  key: string;
  status: IdempotencyStatus;
  tenantId: string;
  branchId: string;
  operationType: string;
  entityType: string;
  entityId?: string;
  fingerprint: string;
  userId?: string;
  createdAt: string;
  completedAt?: string;
  result?: any;
  responseData?: any;
  failureReason?: string;
}

export interface IntegrityAuditRecord {
  id: string;
  operationId: string;
  idempotencyKey: string;
  fingerprint: string;
  tenantId: string;
  branchId: string;
  userId: string;
  deviceId: string;
  operationType: string;
  entityType: string;
  entityId: string;
  status: 'STARTED' | 'COMMITTED' | 'FAILED' | 'ROLLED_BACK' | 'RECOVERED';
  startedAt: string;
  completedAt?: string;
  resultReference?: string;
  failureReason?: string;
}

export interface RepairPlan {
  repairId: string;
  tenantId: string;
  branchId: string;
  inconsistencyType: string;
  affectedEntities: Array<{ entityType: string; entityId: string }>;
  beforeState: any;
  proposedAfterState: any;
  repairSteps: string[];
  requiresHumanReview: boolean;
  status: 'DRAFT' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'FAILED';
  createdAt: string;
}

export interface RepairResult {
  repairId: string;
  status: 'EXECUTED' | 'FAILED' | 'CANCELLED';
  executedBy: string;
  beforeState: any;
  afterState: any;
  reason: string;
  timestamp: string;
  validationReport?: any;
}

export interface InventoryConsistencyReport {
  isValid: boolean;
  productId: string;
  branchId: string;
  stockQuantity: number;
  movementSum: number;
  drift: number;
  negativeStock: boolean;
  violations: string[];
}

export interface AccountingConsistencyReport {
  isValid: boolean;
  journalId?: string;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  duplicateEntries: string[];
  violations: string[];
}

export interface CrossDomainConsistencyReport {
  state: ConsistencyState;
  domain: 'SALES' | 'PURCHASES' | 'INVENTORY' | 'ACCOUNTING';
  referenceId: string;
  hasInventoryMovement: boolean;
  hasJournalEntry: boolean;
  hasLedgerUpdate: boolean;
  hasAuditRecord: boolean;
  discrepancies: string[];
}
