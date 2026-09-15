import { db } from '@/core/db';
import { IdempotencyRegistry, IdempotencyKeyBuilder, AccountingConsistencyValidator } from '@/core/integrity';

export interface DuplicateCheckParams {
  id?: string;
  tenantId?: string;
  branchId?: string;
  operationType: string;
  entityType: string;
  payload: any;
  date?: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchLevel: 'EXACT_ID' | 'IDEMPOTENCY_KEY' | 'BUSINESS_FINGERPRINT' | 'HEURISTIC' | 'NONE';
  requiresReview: boolean;
  existingId?: string;
  reason?: string;
}

export class DuplicateDetectionService {
  /**
   * Performs multi-layered duplicate detection across all ERP domains
   */
  public static async checkDuplicate(params: DuplicateCheckParams): Promise<DuplicateCheckResult> {
    const tenantId = params.tenantId || 'default';
    const branchId = params.branchId || 'main';
    const opType = params.operationType;

    // Layer 1: Exact ID Match
    if (params.id) {
      const exactExists = await this.checkExactId(params.entityType, params.id);
      if (exactExists) {
        return {
          isDuplicate: true,
          matchLevel: 'EXACT_ID',
          requiresReview: false,
          existingId: params.id,
          reason: `مستند مكرر بنفس المعرف الرقمي: ${params.id}`
        };
      }
    }

    // Layer 2: Idempotency Key Match
    const fp = IdempotencyKeyBuilder.generateFingerprint(opType, params.payload || {});
    const key = IdempotencyKeyBuilder.buildKey({
      tenantId,
      branchId,
      operationType: opType,
      entityType: params.entityType,
      entityId: params.id || 'new',
      requestFingerprint: fp
    });

    const existingRecord = await IdempotencyRegistry.get(key);
    if (existingRecord && existingRecord.status === 'COMMITTED') {
      return {
        isDuplicate: true,
        matchLevel: 'IDEMPOTENCY_KEY',
        requiresReview: false,
        existingId: existingRecord.entityId,
        reason: 'عملية مكررة تم اعتمادها سابقاً بنفس مفتاح Idempotency'
      };
    }

    // Layer 3: Business Fingerprint Match across Dexie entities
    const fpMatchId = await this.checkBusinessFingerprint(params.entityType, opType, params.payload, fp);
    if (fpMatchId) {
      return {
        isDuplicate: true,
        matchLevel: 'BUSINESS_FINGERPRINT',
        requiresReview: false,
        existingId: fpMatchId,
        reason: 'تم العثور على مستند مكرر بنفس البيانات التجارية الجوهرية (العميل/المورد، الأصناف والأسعار)'
      };
    }

    // Layer 4: Time Window Heuristic Match (flags as NEEDS_REVIEW, zero auto-delete!)
    const heuristicMatch = await this.checkHeuristicMatch(params.entityType, params.payload, params.date);
    if (heuristicMatch) {
      return {
        isDuplicate: false, // Probabilistic match only, flag for human review
        matchLevel: 'HEURISTIC',
        requiresReview: true,
        existingId: heuristicMatch,
        reason: 'تطابق احتمالي في القيمة والوقت مع مستند سابق. يتطلب مراجعة بشرية قبل الاعتماد.'
      };
    }

    return {
      isDuplicate: false,
      matchLevel: 'NONE',
      requiresReview: false
    };
  }

  private static async checkExactId(entityType: string, id: string): Promise<boolean> {
    if (typeof indexedDB === 'undefined' || !db) return false;
    try {
      const type = entityType.toLowerCase();
      if (type.includes('sale') && db.sales) return Boolean(await db.sales.get(id));
      if (type.includes('purchase') && db.purchases) return Boolean(await db.purchases.get(id));
      if (type.includes('voucher') && db.vouchers) return Boolean(await db.vouchers.get(id));
      if (type.includes('journal') && db.journalEntries) return Boolean(await db.journalEntries.get(id));
    } catch {
      return false;
    }
    return false;
  }

  private static async checkBusinessFingerprint(
    entityType: string,
    opType: string,
    payload: any,
    targetFp: string
  ): Promise<string | undefined> {
    if (typeof indexedDB === 'undefined' || !db) return undefined;
    try {
      const type = entityType.toLowerCase();
      if (type.includes('sale') && db.sales) {
        const sales = await db.sales.toArray();
        for (const s of sales) {
          if (s.InvoiceStatus === 'VOID') continue;
          const sFp = IdempotencyKeyBuilder.generateFingerprint(opType, s);
          if (sFp === targetFp) return s.id;
        }
      } else if (type.includes('purchase') && db.purchases) {
        const purchases = await db.purchases.toArray();
        for (const p of purchases) {
          if (p.invoiceStatus === 'VOID') continue;
          const pFp = IdempotencyKeyBuilder.generateFingerprint(opType, p);
          if (pFp === targetFp) return p.id;
        }
      } else if (type.includes('journal') && db.journalEntries) {
        const targetJournalFp = AccountingConsistencyValidator.generateJournalFingerprint(payload);
        const entries = await db.journalEntries.toArray();
        for (const j of entries) {
          const jFp = AccountingConsistencyValidator.generateJournalFingerprint(j);
          if (jFp === targetJournalFp) return j.id;
        }
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private static async checkHeuristicMatch(entityType: string, payload: any, date?: string): Promise<string | undefined> {
    if (typeof indexedDB === 'undefined' || !db || !payload) return undefined;
    try {
      const amount = Number(payload.total || payload.amount || 0);
      if (amount <= 0) return undefined;

      const type = entityType.toLowerCase();
      if (type.includes('sale') && db.sales) {
        const custId = payload.customerId;
        if (!custId) return undefined;
        const sales = await db.sales.where('customerId').equals(custId).toArray();
        for (const s of sales) {
          if (s.InvoiceStatus !== 'VOID' && Math.abs((s.finalTotal || s.totalAmount || 0) - amount) < 0.01) {
            // Check within 2 minutes window
            const diffMs = Math.abs(new Date(s.date || 0).getTime() - new Date(date || Date.now()).getTime());
            if (diffMs < 120000) return s.id;
          }
        }
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
}
