// server/modules/sync/sync-gap-detector.ts
// Phase 5 — Sequence Gap Detection & Recovery Engine
// Guarantees contiguous event ordering and prevents silent event loss in multi-device sync

import { SequenceGapInfo, SyncChange } from "./sync.types";

export interface GapCheckResult {
  hasGap: boolean;
  missingCursors: number[];
  contiguousChanges: SyncChange[];
  orphanedChanges: SyncChange[];
  lastContiguousCursor: number;
}

export class SyncGapDetector {
  /**
   * Evaluates a sequence of incoming changes against the expected base cursor.
   * Identifies any missing sequence gaps.
   */
  static detectGaps(params: {
    lastKnownCursor: number;
    incomingEvents: Array<{ sequence?: number; cursor?: number; id?: string; entity?: string; [key: string]: any }>;
  }): {
    hasGap: boolean;
    missingSequences: number[];
    safeContiguousItems: any[];
    blockedItems: any[];
    lastContiguousSequence: number;
  } {
    const changes: SyncChange[] = params.incomingEvents.map(e => ({
      id: e.id || `evt-${e.sequence || e.cursor}`,
      cursor: (e.cursor !== undefined ? e.cursor : e.sequence) || 0,
      tenantId: e.tenantId || "default",
      branchId: e.branchId || null,
      entity: e.entity || "MUTATION",
      entityId: e.entityId || e.id || "unknown",
      operation: e.operation || "CREATE",
      version: e.version || 1,
      actorId: e.actorId || "system",
      deviceId: e.deviceId || "system",
      payload: e.payload || {},
      createdAt: new Date().toISOString()
    }));

    const result = this.inspectSequence({
      expectedCursor: params.lastKnownCursor,
      incomingChanges: changes
    });

    return {
      hasGap: result.hasGap,
      missingSequences: result.missingCursors,
      safeContiguousItems: result.contiguousChanges,
      blockedItems: result.orphanedChanges,
      lastContiguousSequence: result.lastContiguousCursor
    };
  }

  static inspectSequence(params: {
    expectedCursor: number;
    incomingChanges: SyncChange[];
    allowGapsForNonFinancial?: boolean;
  }): GapCheckResult {
    const { expectedCursor, incomingChanges } = params;

    if (!incomingChanges || incomingChanges.length === 0) {
      return {
        hasGap: false,
        missingCursors: [],
        contiguousChanges: [],
        orphanedChanges: [],
        lastContiguousCursor: expectedCursor
      };
    }

    // Sort incoming changes monotonically by cursor
    const sorted = [...incomingChanges].sort((a, b) => a.cursor - b.cursor);
    
    const missingCursors: number[] = [];
    const contiguousChanges: SyncChange[] = [];
    const orphanedChanges: SyncChange[] = [];

    let currentCursor = expectedCursor;
    let gapFound = false;

    for (const change of sorted) {
      if (change.cursor <= currentCursor) {
        // Change is already at or behind our cursor (e.g. duplicate or already applied)
        continue;
      }

      const expectedNext = currentCursor + 1;

      if (!gapFound) {
        if (change.cursor === expectedNext) {
          // Perfectly contiguous sequence
          contiguousChanges.push(change);
          currentCursor = change.cursor;
        } else if (change.cursor > expectedNext) {
          // Sequence gap detected! Missing cursors in between
          gapFound = true;
          for (let m = expectedNext; m < change.cursor; m++) {
            missingCursors.push(m);
          }
          orphanedChanges.push(change);
        }
      } else {
        // We already have a gap, so subsequent changes are held as orphaned
        orphanedChanges.push(change);
      }
    }

    return {
      hasGap: missingCursors.length > 0,
      missingCursors,
      contiguousChanges,
      orphanedChanges,
      lastContiguousCursor: currentCursor
    };
  }

  /**
   * Formats a formal gap alert object for auditing and error reporting
   */
  static createGapAlert(
    expectedCursor: number,
    receivedCursor: number,
    missingCursors: number[]
  ): SequenceGapInfo {
    return {
      expectedNextCursor: expectedCursor + 1,
      receivedCursor,
      missingCursors,
      detectedAt: new Date().toISOString()
    };
  }

  /**
   * Checks if an entity is business-critical / financial, meaning it CANNOT be processed out of order.
   */
  static isBusinessCritical(entity: string): boolean {
    const upper = (entity || "").toUpperCase();
    return [
      "INVOICE",
      "SALE",
      "PAYMENT",
      "JOURNAL_ENTRY",
      "INVENTORY_MOVEMENT",
      "INVENTORY_BATCH",
      "BRANCH_TRANSFER",
      "STOCK_ADJUSTMENT"
    ].includes(upper);
  }
}
