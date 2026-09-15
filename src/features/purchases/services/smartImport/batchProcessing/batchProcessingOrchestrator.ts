// src/features/purchases/services/smartImport/batchProcessing/batchProcessingOrchestrator.ts
import { db } from '@/core/db';
import { 
  BatchProcessingSession, 
  BatchApplyContext, 
  CanonicalResolutionResult, 
  DecisionValidationResult,
  SupplierDecision,
  ProductDecision
} from './types';
import { BatchSessionService } from './batchSessionService';
import { BatchDecisionValidator } from './batchDecisionValidator';
import { BatchResolutionService } from './batchResolutionService';
import { ImportAnalysisResult, ImportSourceType } from '../types';
import { authService } from '@/features/auth/services/authService';
import { Product, Supplier } from '@/types';
import { auditLogService } from '@/services/audit/auditLog';
import { AliasMatchingEngine, PreloadedAliasContext } from '../aliasLearning';

export interface InitializeBatchSessionParams {
  analysis: ImportAnalysisResult;
  sourceType?: ImportSourceType;
  fileName?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
}

export class BatchProcessingOrchestrator {
  /**
   * Initializes a batch processing session from raw smart import analysis
   */
  static async startSession(params: InitializeBatchSessionParams): Promise<BatchProcessingSession> {
    const user = authService.getCurrentUser();
    const tenantId = params.tenantId || (user as any)?.tenantId || 'default-tenant';
    const branchId = params.branchId || (user as any)?.branchId || 'MAIN';
    const userId = params.userId || (user as any)?.id || (user as any)?.User_ID || 'SYSTEM';

    let existingSuppliers: Supplier[] = [];
    let existingProducts: Product[] = [];
    let learnedAliases: Record<string, string> = {};

    try {
      if (db.suppliers && typeof db.suppliers.toArray === 'function') {
        const all = await db.suppliers.toArray();
        existingSuppliers = all.filter(s => {
          if (s.Is_Active === false) return false;
          if (tenantId && (s as any).tenantId && (s as any).tenantId !== tenantId) return false;
          return true;
        });
      }
    } catch {
      existingSuppliers = [];
    }

    try {
      if (db.products && typeof db.products.toArray === 'function') {
        const all = await db.products.toArray();
        existingProducts = all.filter(p => {
          if (p.Is_Active === false) return false;
          if (tenantId && (p as any).tenantId && (p as any).tenantId !== tenantId) return false;
          return true;
        });
      }
    } catch {
      existingProducts = [];
    }

    try {
      if (db.getSetting) {
        learnedAliases = (await db.getSetting('smart_import_aliases', {})) || {};
      }
    } catch {
      learnedAliases = {};
    }

    let preloadedAliasContext: PreloadedAliasContext | undefined = undefined;
    try {
      preloadedAliasContext = await AliasMatchingEngine.preloadBatchContext(
        tenantId,
        undefined,
        params.analysis.rows || []
      );
    } catch (err) {
      console.warn('[BatchProcessingOrchestrator] Could not preload alias context:', err);
    }

    const session = BatchSessionService.createSession(params.analysis, {
      tenantId,
      branchId,
      userId,
      sourceType: params.sourceType,
      fileName: params.fileName,
      existingSuppliers,
      existingProducts,
      learnedAliases,
      preloadedAliasContext
    });

    await auditLogService.log({
      user_id: userId,
      action: 'SMART_IMPORT_BATCH_CREATED',
      target_type: 'BATCH_SESSION',
      target_id: session.sessionId,
      details: `تم إنشاء جلسة معالجة دفعية (${session.sessionId}) لعدد ${session.productDecisions.length} صنف`
    });

    return session;
  }

  /**
   * Updates the supplier decision in the session
   */
  static updateSupplier(session: BatchProcessingSession, update: Partial<SupplierDecision>): BatchProcessingSession {
    return BatchSessionService.updateSupplierDecision(session, update);
  }

  /**
   * Updates an individual product decision in the session
   */
  static updateProduct(
    session: BatchProcessingSession,
    sourceRowId: number,
    update: Partial<ProductDecision>
  ): BatchProcessingSession {
    return BatchSessionService.updateProductDecision(session, sourceRowId, update);
  }

  /**
   * Applies a bulk action across products in the session
   */
  static applyBulkAction(
    session: BatchProcessingSession,
    action: 'APPROVE_ALL_MATCHED' | 'CREATE_ALL_NEW' | 'SKIP_UNRESOLVED' | 'SKIP_SELECTED' | 'CREATE_SELECTED',
    selectedRowIds?: number[]
  ): BatchProcessingSession {
    return BatchSessionService.applyBulkAction(session, action, selectedRowIds);
  }

  /**
   * Validates the session state against database master data
   */
  static async validateSession(session: BatchProcessingSession): Promise<DecisionValidationResult> {
    const user = authService.getCurrentUser();
    const tenantId = session.tenantId || (user as any)?.tenantId || 'default-tenant';

    let existingSuppliers: Supplier[] = [];
    let existingProducts: Product[] = [];

    try {
      if (db.suppliers && typeof db.suppliers.toArray === 'function') {
        const all = await db.suppliers.toArray();
        existingSuppliers = all.filter(s => {
          if (s.Is_Active === false) return false;
          if (tenantId && (s as any).tenantId && (s as any).tenantId !== tenantId) return false;
          return true;
        });
      }
    } catch {
      existingSuppliers = [];
    }

    try {
      if (db.products && typeof db.products.toArray === 'function') {
        const all = await db.products.toArray();
        existingProducts = all.filter(p => {
          if (p.Is_Active === false) return false;
          if (tenantId && (p as any).tenantId && (p as any).tenantId !== tenantId) return false;
          return true;
        });
      }
    } catch {
      existingProducts = [];
    }

    return BatchDecisionValidator.validate(session, {
      tenantId,
      branchId: session.branchId,
      existingProducts,
      existingSuppliers
    });
  }

  /**
   * Applies the batch atomically
   */
  static async applyBatchSession(
    session: BatchProcessingSession,
    customIdempotencyKey?: string
  ): Promise<CanonicalResolutionResult> {
    const user = authService.getCurrentUser();
    const tenantId = session.tenantId || (user as any)?.tenantId || 'default-tenant';
    const branchId = session.branchId || (user as any)?.branchId || 'MAIN';
    const userId = (user as any)?.id || (user as any)?.User_ID || 'SYSTEM';

    const idempotencyKey = customIdempotencyKey || `IDEM-${session.sessionId}-${Date.now()}`;

    const context: BatchApplyContext = {
      tenantId,
      branchId,
      userId,
      idempotencyKey
    };

    return await BatchResolutionService.applyBatch(session, context);
  }

  /**
   * Cancels a batch processing session
   */
  static async cancelSession(sessionId: string): Promise<BatchProcessingSession | undefined> {
    const cancelled = BatchSessionService.cancelSession(sessionId);
    if (cancelled) {
      const user = authService.getCurrentUser();
      await auditLogService.log({
        user_id: (user as any)?.id || (user as any)?.User_ID || 'SYSTEM',
        action: 'SMART_IMPORT_BATCH_CANCELLED',
        target_type: 'BATCH_SESSION',
        target_id: sessionId,
        details: `تم إلغاء جلسة الاستيراد الذكي (${sessionId})`
      });
    }
    return cancelled;
  }
}
