// src/core/observability/crashRecoveryManager.ts

import { db } from '@/core/db';
import { observabilityService } from './observabilityService';
import { recoveryCoordinator } from './recoveryCoordinator';
import { createObservabilityContext } from './observabilityContext';

export interface CrashRecoveryResult {
  interruptedSyncsFound: number;
  interruptedDraftsFound: number;
  unconfirmedFinancialCount: number;
  recoveredCount: number;
  reconciliationsRequiredCount: number;
  timestamp: string;
}

export class CrashRecoveryManager {
  private static instance: CrashRecoveryManager;

  public static getInstance(): CrashRecoveryManager {
    if (!CrashRecoveryManager.instance) {
      CrashRecoveryManager.instance = new CrashRecoveryManager();
    }
    return CrashRecoveryManager.instance;
  }

  /**
   * Application Bootstrap Crash Recovery Routine.
   * Runs safely during app startup to detect interrupted transactions or syncs.
   */
  public async bootstrapAppRecovery(): Promise<CrashRecoveryResult> {
    const ctx = createObservabilityContext({ workflow: 'APP_BOOTSTRAP_CRASH_RECOVERY' });
    let interruptedSyncsFound = 0;
    let interruptedDraftsFound = 0;
    let unconfirmedFinancialCount = 0;
    let recoveredCount = 0;
    let reconciliationsRequiredCount = 0;

    try {
      if (!db || !db.isOpen()) {
        try {
          await db.open();
        } catch {}
      }

      // 1. Inspect Outbox / Sync Queue for stuck processing items
      if (db && db.outbox) {
        const processingMutations = await db.outbox
          .where('status')
          .equals('processing')
          .toArray()
          .catch(() => []);

        interruptedSyncsFound = processingMutations.length;

        for (const mut of processingMutations) {
          // Reset stuck 'processing' back to 'pending' for safe retry
          try {
            await db.outbox.update(mut.id, { status: 'pending', updatedAt: new Date().toISOString() });
            recoveredCount++;
          } catch {}
        }
      }

      // 2. Inspect Invoices with pending or draft document status that might be unposted financial transactions
      if (db && db.invoices) {
        const draftInvoices = await db.invoices
          .where('documentStatus')
          .equals('DRAFT')
          .toArray()
          .catch(() => []);

        interruptedDraftsFound = draftInvoices.length;

        for (const draft of draftInvoices) {
          if (draft.transactionUuid) {
            const check = await recoveryCoordinator.verifyFinancialOperationCommitted(
              draft.id,
              draft.transactionUuid
            );

            if (check.committed) {
              // Invoice was committed in DB but stuck as DRAFT in UI state
              await db.invoices.update(draft.id, { documentStatus: 'POSTED' });
              recoveredCount++;
              await observabilityService.recordRecovery(
                'RESTORE_STATE',
                'SUCCESS',
                ctx,
                `Invoice ${draft.id} restored to POSTED state after crash recovery verification.`
              );
            } else if (check.status === 'UNKNOWN') {
              unconfirmedFinancialCount++;
              reconciliationsRequiredCount++;
              await observabilityService.recordRecovery(
                'MANUAL_INTERVENTION',
                'RECONCILIATION_REQUIRED',
                ctx,
                `Invoice ${draft.id} commitment state is unknown. Marked for reconciliation.`
              );
            }
          }
        }
      }

      const summary: CrashRecoveryResult = {
        interruptedSyncsFound,
        interruptedDraftsFound,
        unconfirmedFinancialCount,
        recoveredCount,
        reconciliationsRequiredCount,
        timestamp: new Date().toISOString()
      };

      if (recoveredCount > 0 || reconciliationsRequiredCount > 0) {
        await observabilityService.recordRecovery(
          'RESTORE_STATE',
          reconciliationsRequiredCount > 0 ? 'RECONCILIATION_REQUIRED' : 'SUCCESS',
          ctx,
          `Bootstrap crash recovery complete. Recovered: ${recoveredCount}, Reconciliations required: ${reconciliationsRequiredCount}`
        );
      }

      return summary;
    } catch (error: any) {
      await observabilityService.recordError(
        error,
        ctx,
        'DATABASE',
        'WARNING'
      );

      return {
        interruptedSyncsFound: 0,
        interruptedDraftsFound: 0,
        unconfirmedFinancialCount: 0,
        recoveredCount: 0,
        reconciliationsRequiredCount: 0,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export const crashRecoveryManager = CrashRecoveryManager.getInstance();
