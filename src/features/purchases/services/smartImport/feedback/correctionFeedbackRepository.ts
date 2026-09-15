// src/features/purchases/services/smartImport/feedback/correctionFeedbackRepository.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Human Correction Feedback Repository with Strict Tenant Isolation
 */

import { CorrectionFeedbackRecord } from './correctionFeedback.types';
import { configurationService } from '@/services/config/configurationService';

export class CorrectionFeedbackRepository {
  private static readonly STORAGE_KEY_PREFIX = 'pharmaflow_correction_feedback_';
  private static inMemoryRecords: Map<string, CorrectionFeedbackRecord[]> = new Map();

  /**
   * Saves a human correction record with strict anti-pollution and tenant isolation rules
   */
  public static async recordCorrection(record: Omit<CorrectionFeedbackRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<CorrectionFeedbackRecord> {
    const finalRecord: CorrectionFeedbackRecord = {
      id: record.id || `CORR-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId: record.tenantId,
      branchId: record.branchId,
      sourceType: record.sourceType,
      field: record.field,
      originalExtractedValue: record.originalExtractedValue,
      correctedValue: record.correctedValue,
      provider: record.provider,
      confidenceBefore: record.confidenceBefore,
      correctionReason: record.correctionReason,
      timestamp: record.timestamp || new Date().toISOString(),
      isAppliedToCatalog: false // ANTI-POLLUTION RULE: Never auto-applied as an alias
    };

    const tenantKey = finalRecord.tenantId;
    const existing = this.inMemoryRecords.get(tenantKey) || [];
    existing.push(finalRecord);
    this.inMemoryRecords.set(tenantKey, existing);

    // Save to configurationService safely
    try {
      const storageKey = `${this.STORAGE_KEY_PREFIX}${tenantKey}`;
      configurationService.set(storageKey, existing.slice(-200)).catch(() => {});
    } catch {
      // ignore storage errors
    }

    return finalRecord;
  }

  /**
   * Retrieves correction feedback records strictly isolated by tenantId
   */
  public static async getTenantCorrections(
    tenantId: string,
    filter?: {
      branchId?: string;
      field?: string;
    }
  ): Promise<CorrectionFeedbackRecord[]> {
    let records = this.inMemoryRecords.get(tenantId);
    if (!records) {
      try {
        const storageKey = `${this.STORAGE_KEY_PREFIX}${tenantId}`;
        const stored = configurationService.getSync<CorrectionFeedbackRecord[]>(storageKey);
        if (stored) {
          records = stored;
          this.inMemoryRecords.set(tenantId, records || []);
        }
      } catch {
        // ignore
      }
    }

    const list = records || [];
    if (!filter) return list;

    return list.filter(r => {
      if (filter.branchId && r.branchId !== filter.branchId) return false;
      if (filter.field && r.field !== filter.field) return false;
      return true;
    });
  }

  /**
   * Convenience alias for getTenantCorrections
   */
  public static async getFeedback(tenantId: string): Promise<CorrectionFeedbackRecord[]> {
    return this.getTenantCorrections(tenantId);
  }

  /**
   * Clears memory records (for test isolation)
   */
  public static clearMemory(): void {
    this.inMemoryRecords.clear();
  }
}
