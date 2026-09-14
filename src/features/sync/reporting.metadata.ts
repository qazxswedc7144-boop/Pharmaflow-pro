// ==========================================
// FILE: src/features/sync/reporting.metadata.ts
// Phase 8.3 Reporting Foundation & Sync State Metadata
// ==========================================

import { ReportingSyncTag } from "./sync.types";

export interface SyncAwareRecord {
  id?: string;
  isSynced?: boolean;
  is_synced?: number | boolean;
  syncStatus?: string;
  hasConflict?: boolean;
  serverVersion?: number;
  localVersion?: number;
  postedToCloud?: boolean;
  updatedAt?: string | Date;
}

export class ReportingSyncMetadata {
  /**
   * Evaluates the precise synchronization state tag for any financial or operational record.
   */
  static getRecordSyncTag(record: SyncAwareRecord | null | undefined): ReportingSyncTag {
    if (!record) return "LOCAL_UNSYNCED";

    if (record.hasConflict || record.syncStatus === "CONFLICT") {
      return "CONFLICTED";
    }

    if (record.postedToCloud || record.syncStatus === "CLOUD_AUTHORITATIVE") {
      return "CLOUD_AUTHORITATIVE";
    }

    const isExplicitlySynced = 
      record.isSynced === true || 
      record.is_synced === 1 || 
      record.is_synced === true || 
      record.syncStatus === "SYNCED" || 
      record.syncStatus === "COMPLETED";

    if (isExplicitlySynced) {
      return "SYNCED";
    }

    if (record.syncStatus === "PROCESSING" || record.syncStatus === "PARTIAL") {
      return "PARTIALLY_SYNCED";
    }

    return "LOCAL_UNSYNCED";
  }

  /**
   * Filters a collection of records based on desired reporting scope.
   * Prevents financial reports from silently mixing unposted/conflicted local transactions with cloud ledgers.
   */
  static filterForReport<T extends SyncAwareRecord>(
    records: T[],
    options: {
      includeUnsynced?: boolean;
      authoritativeOnly?: boolean;
      excludeConflicted?: boolean;
    } = {}
  ): {
    filteredRecords: T[];
    stats: {
      total: number;
      authoritativeCount: number;
      syncedCount: number;
      unsyncedCount: number;
      conflictedCount: number;
    };
  } {
    const { includeUnsynced = true, authoritativeOnly = false, excludeConflicted = true } = options;

    let authoritativeCount = 0;
    let syncedCount = 0;
    let unsyncedCount = 0;
    let conflictedCount = 0;

    const filteredRecords: T[] = [];

    for (const record of records) {
      const tag = this.getRecordSyncTag(record);

      switch (tag) {
        case "CLOUD_AUTHORITATIVE":
          authoritativeCount++;
          filteredRecords.push(record);
          break;
        case "SYNCED":
          syncedCount++;
          if (!authoritativeOnly) {
            filteredRecords.push(record);
          }
          break;
        case "CONFLICTED":
          conflictedCount++;
          if (!excludeConflicted && !authoritativeOnly) {
            filteredRecords.push(record);
          }
          break;
        case "LOCAL_UNSYNCED":
        case "PARTIALLY_SYNCED":
        default:
          unsyncedCount++;
          if (includeUnsynced && !authoritativeOnly) {
            filteredRecords.push(record);
          }
          break;
      }
    }

    return {
      filteredRecords,
      stats: {
        total: records.length,
        authoritativeCount,
        syncedCount,
        unsyncedCount,
        conflictedCount
      }
    };
  }
}
