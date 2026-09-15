// src/core/observability/diagnosticsEngine.ts

import { db } from '@/core/db';
import {
  ObservabilityCategory,
  ObservabilitySeverity,
  DiagnosticRecord,
  ErrorAggregate,
  ObservabilityContext
} from './types';
import { redactObject, redactString } from './diagnosticsRedactor';

const MAX_DIAGNOSTICS_RECORDS = 500;

export class DiagnosticsEngine {
  /**
   * Classifies an arbitrary error into a standard ObservabilityCategory.
   */
  public classifyCategory(error: any, feature?: string): ObservabilityCategory {
    if (!error) return 'UNKNOWN';

    const msg = String(error.message || error.reason || error.code || error).toLowerCase();
    const name = String(error.name || '').toLowerCase();
    const feat = String(feature || '').toLowerCase();

    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('offline') || name.includes('networkerror')) {
      return 'NETWORK';
    }
    if (msg.includes('token') || msg.includes('auth') || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('jwt') || msg.includes('401') || msg.includes('403')) {
      return 'AUTH';
    }
    if (msg.includes('session') || msg.includes('login') || msg.includes('expired')) {
      return 'SESSION';
    }
    if (msg.includes('dexie') || msg.includes('indexeddb') || msg.includes('database') || msg.includes('table') || msg.includes('schema') || msg.includes('constraint')) {
      return 'DATABASE';
    }
    if (msg.includes('transaction') || msg.includes('rollback') || msg.includes('commit')) {
      return 'TRANSACTION';
    }
    if (msg.includes('sync') || feat.includes('sync') || msg.includes('outbox') || msg.includes('queue')) {
      return 'SYNC';
    }
    if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required') || msg.includes('zod')) {
      return 'VALIDATION';
    }
    if (msg.includes('stock') || msg.includes('inventory') || feat.includes('inventory') || msg.includes('batch')) {
      return 'INVENTORY';
    }
    if (msg.includes('ledger') || msg.includes('accounting') || msg.includes('journal') || msg.includes('balance') || feat.includes('accounting')) {
      return 'ACCOUNTING';
    }
    if (msg.includes('import') || feat.includes('import') || msg.includes('alias') || msg.includes('excel')) {
      return 'IMPORT';
    }
    if (msg.includes('gemini') || msg.includes('ai') || feat.includes('ai')) {
      return 'AI';
    }
    if (msg.includes('ocr') || msg.includes('tesseract') || feat.includes('ocr')) {
      return 'OCR';
    }
    if (msg.includes('config') || feat.includes('config') || msg.includes('setting')) {
      return 'CONFIGURATION';
    }
    if (msg.includes('slow') || msg.includes('performance') || msg.includes('freeze') || msg.includes('timeout')) {
      return 'PERFORMANCE';
    }

    return 'UNKNOWN';
  }

  /**
   * Generates a deterministic hash/fingerprint for an error.
   */
  public generateFingerprint(
    category: ObservabilityCategory,
    message: string,
    feature?: string,
    rootCause?: string
  ): string {
    const normMsg = message
      .toLowerCase()
      .replace(/\d+/g, '#') // Normalize numbers/IDs
      .replace(/["']/g, '')
      .trim();

    const normFeat = (feature || 'GENERAL').toLowerCase();
    const normCause = (rootCause || '').toLowerCase();

    const rawKey = `${category}:${normFeat}:${normMsg.substring(0, 100)}:${normCause.substring(0, 50)}`;

    // Simple deterministic string hash
    let hash = 0;
    for (let i = 0; i < rawKey.length; i++) {
      const char = rawKey.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `fp-${Math.abs(hash).toString(36)}`;
  }

  /**
   * Classifies severity level for an error.
   */
  public classifySeverity(category: ObservabilityCategory, error: any): ObservabilitySeverity {
    if (!error) return 'INFO';

    const msg = String(error.message || '').toLowerCase();

    if (msg.includes('fatal') || msg.includes('corrupt') || msg.includes('panic')) {
      return 'FATAL';
    }
    if (category === 'DATABASE' || category === 'TRANSACTION' || category === 'ACCOUNTING') {
      return 'CRITICAL';
    }
    if (category === 'AUTH' || category === 'SYNC' || category === 'INVENTORY' || category === 'IMPORT') {
      return 'ERROR';
    }
    if (category === 'NETWORK' || category === 'PERFORMANCE' || category === 'VALIDATION') {
      return 'WARNING';
    }

    return 'ERROR';
  }

  /**
   * Processes an incoming error:
   * 1. Redacts sensitive data
   * 2. Classifies category and severity
   * 3. Generates fingerprint
   * 4. Deduplicates into error_aggregates (increments counter)
   * 5. Saves record to system_diagnostics with retention protection
   */
  public async processError(
    rawError: any,
    context: ObservabilityContext,
    categoryOverride?: ObservabilityCategory,
    severityOverride?: ObservabilitySeverity
  ): Promise<DiagnosticRecord> {
    const sanitizedError = redactObject(rawError);
    const rawMsg = sanitizedError?.message || String(sanitizedError || 'Unknown Error');
    const message = redactString(rawMsg);
    const stack = sanitizedError?.stack ? redactString(String(sanitizedError.stack)) : undefined;

    const category = categoryOverride || this.classifyCategory(sanitizedError, context.feature);
    const severity = severityOverride || this.classifySeverity(category, sanitizedError);
    const rootCause = sanitizedError?.code || sanitizedError?.name || undefined;

    const fingerprint = this.generateFingerprint(category, message, context.feature, rootCause);

    const errorId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const record: DiagnosticRecord = {
      id: errorId,
      errorId,
      correlationId: context.correlationId,
      fingerprint,
      category,
      severity,
      message,
      rootCause,
      stack,
      feature: context.feature,
      recoverable: category !== 'DATABASE' && severity !== 'FATAL',
      retryable: category === 'NETWORK' || category === 'SYNC' || category === 'AI' || category === 'OCR',
      metadata: redactObject(sanitizedError?.metadata || {}),
      tenantId: context.tenantId,
      timestamp: context.timestamp
    };

    // Deduplicate in error_aggregates & save diagnostic record in Dexie safely
    try {
      if (db && db.error_aggregates && db.system_diagnostics && db.isOpen()) {
        await db.transaction('rw', 'error_aggregates', 'system_diagnostics', async () => {
          // 1. Update Aggregate Counter
          const existingAgg = await db.error_aggregates.get(fingerprint);
          if (existingAgg) {
            await db.error_aggregates.put({
              ...existingAgg,
              count: existingAgg.count + 1,
              lastSeenAt: context.timestamp
            });
          } else {
            const newAgg: ErrorAggregate = {
              fingerprint,
              category,
              normalizedMessage: message.substring(0, 150),
              feature: context.feature || 'GENERAL',
              rootCause,
              severity,
              count: 1,
              firstSeenAt: context.timestamp,
              lastSeenAt: context.timestamp,
              tenantId: context.tenantId
            };
            await db.error_aggregates.put(newAgg);
          }

          // 2. Put record in system_diagnostics
          await db.system_diagnostics.put(record);

          // 3. Enforce Retention limits on non-critical records
          const count = await db.system_diagnostics.count();
          if (count > MAX_DIAGNOSTICS_RECORDS) {
            const oldestNonCritical = await db.system_diagnostics
              .where('severity')
              .anyOf('INFO', 'WARNING', 'ERROR')
              .limit(50)
              .toArray();

            if (oldestNonCritical.length > 0) {
              const idsToRemove = oldestNonCritical.map(r => r.id);
              await db.system_diagnostics.bulkDelete(idsToRemove);
            }
          }
        });
      }
    } catch (e) {
      console.warn('[DiagnosticsEngine] Could not persist diagnostic record to Dexie:', e);
    }

    return record;
  }
}

export const diagnosticsEngine = new DiagnosticsEngine();
