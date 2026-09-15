// src/core/observability/recoveryCoordinator.ts

import {
  RecoveryStrategy,
  ObservabilityContext,
  SystemOperatingMode,
  ObservabilityCategory
} from './types';
import { createObservabilityContext } from './observabilityContext';
import { observabilityService } from './observabilityService';
import { db } from '@/core/db';

export const CENTRAL_RETRY_POLICY: Record<ObservabilityCategory, { maxRetries: number; backoffMs: number }> = {
  AUTH: { maxRetries: 1, backoffMs: 1000 },
  FINANCIAL: { maxRetries: 0, backoffMs: 0 }, // 0 blind retries - requires explicit verification
  SYNC: { maxRetries: 5, backoffMs: 2000 },
  AI: { maxRetries: 2, backoffMs: 2000 },
  OCR: { maxRetries: 2, backoffMs: 2000 },
  NETWORK: { maxRetries: 3, backoffMs: 1500 },
  SESSION: { maxRetries: 1, backoffMs: 1000 },
  DATABASE: { maxRetries: 2, backoffMs: 500 },
  TRANSACTION: { maxRetries: 0, backoffMs: 0 },
  VALIDATION: { maxRetries: 0, backoffMs: 0 },
  BUSINESS_RULE: { maxRetries: 0, backoffMs: 0 },
  INVENTORY: { maxRetries: 1, backoffMs: 1000 },
  ACCOUNTING: { maxRetries: 0, backoffMs: 0 },
  IMPORT: { maxRetries: 2, backoffMs: 2000 },
  CONFIGURATION: { maxRetries: 1, backoffMs: 1000 },
  PERFORMANCE: { maxRetries: 1, backoffMs: 1000 },
  UNKNOWN: { maxRetries: 2, backoffMs: 1000 }
};

export interface ExecutionRecoveryOptions {
  category: ObservabilityCategory;
  strategy?: RecoveryStrategy;
  operationId?: string;
  idempotencyKey?: string;
  maxRetriesOverride?: number;
  contextOverrides?: Partial<ObservabilityContext>;
}

export class RecoveryCoordinator {
  private static instance: RecoveryCoordinator;
  private currentOperatingMode: SystemOperatingMode = 'NORMAL';
  private activeRecoveryAttempts: Map<string, number> = new Map();

  public static getInstance(): RecoveryCoordinator {
    if (!RecoveryCoordinator.instance) {
      RecoveryCoordinator.instance = new RecoveryCoordinator();
    }
    return RecoveryCoordinator.instance;
  }

  public getOperatingMode(): SystemOperatingMode {
    return this.currentOperatingMode;
  }

  public setOperatingMode(mode: SystemOperatingMode): void {
    if (this.currentOperatingMode !== mode) {
      console.warn(`[RecoveryCoordinator] Operating mode changed: ${this.currentOperatingMode} -> ${mode}`);
      this.currentOperatingMode = mode;
      observabilityService.recordRecovery(
        'SAFE_MODE',
        mode === 'SAFE_MODE' ? 'ATTEMPTED' : 'SUCCESS',
        undefined,
        `System operating mode set to ${mode}`
      ).catch(() => {});
    }
  }

  /**
   * Financial Safety Check: Determines whether a financial operation was already committed.
   * Prevents blind retries and duplicate posting.
   */
  public async verifyFinancialOperationCommitted(
    operationId: string,
    idempotencyKey?: string
  ): Promise<{ committed: boolean; result?: any; status: 'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN' }> {
    if (!operationId && !idempotencyKey) {
      return { committed: false, status: 'NOT_COMMITTED' };
    }

    try {
      // 1. Check idempotencyKeys table if present
      if (db && db.idempotencyKeys) {
        const keyToSearch = idempotencyKey || operationId;
        const record = await db.idempotencyKeys.get(keyToSearch);
        if (record && record.status === 'COMPLETED') {
          return { committed: true, result: record.response || record.result, status: 'COMMITTED' };
        }
      }

      // 2. Check invoices table by transactionUuid or id or invoiceNumber
      if (db && db.invoices) {
        const keyToSearch = idempotencyKey || operationId;
        const existingInv = await db.invoices
          .where('transactionUuid')
          .equals(keyToSearch)
          .first();

        if (existingInv) {
          return { committed: true, result: existingInv, status: 'COMMITTED' };
        }

        const byId = await db.invoices.get(keyToSearch);
        if (byId) {
          return { committed: true, result: byId, status: 'COMMITTED' };
        }
      }

      // 3. Check journal entries table by reference_id or sourceId
      if (db && db.journalEntries) {
        const keyToSearch = idempotencyKey || operationId;
        const entry = await db.journalEntries
          .where('sourceId')
          .equals(keyToSearch)
          .first();

        if (entry) {
          return { committed: true, result: entry, status: 'COMMITTED' };
        }
      }

      return { committed: false, status: 'NOT_COMMITTED' };
    } catch (err) {
      console.warn('[RecoveryCoordinator] Could not verify financial commitment status:', err);
      return { committed: false, status: 'UNKNOWN' };
    }
  }

  /**
   * Executes a given operation with central, bounded, idempotent recovery policies.
   */
  public async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: ExecutionRecoveryOptions
  ): Promise<T> {
    const ctx = createObservabilityContext(options.contextOverrides);
    const category = options.category;
    const policy = CENTRAL_RETRY_POLICY[category] || CENTRAL_RETRY_POLICY.UNKNOWN;
    const maxRetries = options.maxRetriesOverride ?? policy.maxRetries;
    const strategy = options.strategy || (category === 'FINANCIAL' ? 'MANUAL_INTERVENTION' : 'RETRY');

    // Financial Safety Rule: ZERO blind retries for financial operations without verification!
    if (category === 'FINANCIAL' || category === 'ACCOUNTING' || category === 'TRANSACTION') {
      const opId = options.operationId || ctx.operationId;
      const idempKey = options.idempotencyKey;

      if (opId || idempKey) {
        const check = await this.verifyFinancialOperationCommitted(opId!, idempKey);
        if (check.committed) {
          await observabilityService.recordRecovery(
            'REPLAY_OPERATION',
            'SUCCESS',
            ctx,
            `Financial operation ${opId} was already committed. Replay prevented successfully.`
          );
          return check.result as T;
        }

        if (check.status === 'UNKNOWN') {
          await observabilityService.recordRecovery(
            'MANUAL_INTERVENTION',
            'RECONCILIATION_REQUIRED',
            ctx,
            `Financial operation ${opId} state is ambiguous. Flagged for reconciliation.`
          );
          throw new Error(`[FinancialSafety] Operation ${opId} commitment status is ambiguous. Flagged for manual reconciliation.`);
        }
      }
    }

    let attempt = 0;
    const attemptKey = `${ctx.correlationId}:${options.operationId || 'op'}`;
    this.activeRecoveryAttempts.set(attemptKey, 0);

    while (attempt <= maxRetries) {
      try {
        const result = await operation();
        if (attempt > 0) {
          await observabilityService.recordRecovery(
            strategy,
            'SUCCESS',
            ctx,
            `Operation recovered after ${attempt} retry attempt(s).`
          );
        }
        this.activeRecoveryAttempts.delete(attemptKey);
        return result;
      } catch (error: any) {
        attempt++;
        this.activeRecoveryAttempts.set(attemptKey, attempt);

        await observabilityService.recordError(error, ctx, category);

        if (attempt > maxRetries) {
          await observabilityService.recordRecovery(
            strategy,
            category === 'FINANCIAL' ? 'RECONCILIATION_REQUIRED' : 'FAILED',
            ctx,
            `Recovery failed after max retries (${maxRetries}). ${error?.message || ''}`
          );
          this.activeRecoveryAttempts.delete(attemptKey);
          throw error;
        }

        await observabilityService.recordRecovery(
          strategy,
          'ATTEMPTED',
          ctx,
          `Attempting retry ${attempt}/${maxRetries} for ${category} operation.`
        );

        // Exponential backoff with jitter
        const baseDelay = policy.backoffMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 200;
        await new Promise(res => setTimeout(res, baseDelay + jitter));
      }
    }

    this.activeRecoveryAttempts.delete(attemptKey);
    throw new Error(`[RecoveryCoordinator] Operation failed after ${maxRetries} attempts.`);
  }
}

export const recoveryCoordinator = RecoveryCoordinator.getInstance();
