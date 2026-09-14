// src/features/purchases/services/smartImport/batchProcessing/batchSessionService.ts
import { 
  BatchProcessingSession, 
  BatchProcessingStatus, 
  SupplierResolutionAction, 
  SupplierResolutionStatus, 
  SupplierDecision, 
  SupplierCandidate, 
  ProductResolutionAction, 
  ProductDecision, 
  ProductCandidate, 
  BatchProcessingSummary 
} from './types';
import { ImportAnalysisResult, ImportSourceType, ExtractedImportRow } from '../types';
import { Product, Supplier } from '@/types';
import { ProductMatchingEngine } from '../productMatchingEngine';
import { ColumnIntelligence } from '../columnIntelligence';
import { normalizeToISODate } from '@/utils/expiryUtils';

export interface CreateSessionOptions {
  tenantId: string;
  branchId: string;
  userId: string;
  sourceType?: ImportSourceType;
  fileName?: string;
  existingSuppliers: Supplier[];
  existingProducts: Product[];
  learnedAliases?: Record<string, string>;
}

export class BatchSessionService {
  private static activeSessions = new Map<string, BatchProcessingSession>();
  private static readonly STORAGE_PREFIX = 'pharmaflow_batch_session_';

  /**
   * Initializes a brand-new canonical batch processing session from an import analysis result
   */
  static createSession(
    analysis: ImportAnalysisResult,
    options: CreateSessionOptions
  ): BatchProcessingSession {
    const sessionId = `BPS-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const supplierDecision = this.resolveSupplierInitial(
      analysis.summary.detectedSupplier || '',
      options.existingSuppliers
    );

    const productDecisions = this.resolveProductsInitial(
      analysis.rows,
      options.existingProducts,
      options.learnedAliases || {}
    );

    const summary = this.computeSummary(productDecisions, {
      detectedSupplier: analysis.summary.detectedSupplier,
      detectedInvoiceNumber: analysis.summary.detectedInvoiceNumber,
      detectedDate: analysis.summary.detectedDate
    });

    const isFullyResolved = 
      supplierDecision.action !== SupplierResolutionAction.UNRESOLVED &&
      productDecisions.every(p => p.action !== ProductResolutionAction.UNRESOLVED);

    const session: BatchProcessingSession = {
      sessionId,
      tenantId: options.tenantId,
      branchId: options.branchId,
      userId: options.userId,
      createdAt: now,
      updatedAt: now,
      sourceType: options.sourceType || ((analysis as any).diagnostics?.[0]?.context as ImportSourceType) || 'EXCEL',
      fileName: options.fileName,
      supplierDecision,
      productDecisions,
      diagnostics: (analysis as any).diagnostics || [],
      summary,
      status: isFullyResolved ? BatchProcessingStatus.READY_TO_APPLY : BatchProcessingStatus.READY_FOR_REVIEW
    };

    this.activeSessions.set(sessionId, session);
    this.persistToLocalStorage(session);

    return session;
  }

  /**
   * Evaluates initial supplier match state
   */
  static resolveSupplierInitial(
    rawSupplierName: string,
    existingSuppliers: Supplier[]
  ): SupplierDecision {
    const trimmed = (rawSupplierName || '').trim();
    if (!trimmed) {
      return {
        importedSupplierName: '',
        status: SupplierResolutionStatus.UNRESOLVED,
        confidence: 0,
        action: SupplierResolutionAction.UNRESOLVED,
        suggestedSuppliers: [],
        reason: 'لم يتم العثور على اسم المورد في المستند المستورد'
      };
    }

    const normInput = ColumnIntelligence.normalizeHeader(trimmed);

    // 1. Exact Match (Score 1.0)
    const exactMatch = existingSuppliers.find(s => {
      const sName = (s.Supplier_Name || '').trim();
      return sName.toLowerCase() === trimmed.toLowerCase() || ColumnIntelligence.normalizeHeader(sName) === normInput;
    });

    if (exactMatch) {
      return {
        importedSupplierName: trimmed,
        matchedSupplierId: exactMatch.id || exactMatch.Supplier_ID,
        matchedSupplierName: exactMatch.Supplier_Name,
        status: SupplierResolutionStatus.EXACT_MATCH,
        confidence: 1.0,
        action: SupplierResolutionAction.AUTO_MATCH,
        suggestedSuppliers: [{
          id: exactMatch.id || exactMatch.Supplier_ID || '',
          name: exactMatch.Supplier_Name || exactMatch.name || '',
          phone: exactMatch.Phone || exactMatch.phone,
          taxNumber: (exactMatch as any).taxNumber || (exactMatch as any).Tax_Number,
          score: 1.0
        }],
        reason: 'تطابق تام مع مورد مسجل في النظام'
      };
    }

    // 2. Similarity & Candidate Search
    const scoredSuppliers: SupplierCandidate[] = [];
    for (const sup of existingSuppliers) {
      const sName = sup.Supplier_Name || sup.name || '';
      const score = ProductMatchingEngine.calculateSimilarity(trimmed, sName);
      if (score >= 0.50) {
        scoredSuppliers.push({
          id: sup.id || sup.Supplier_ID || '',
          name: sup.Supplier_Name || sup.name || '',
          phone: sup.Phone || sup.phone,
          taxNumber: (sup as any).taxNumber || (sup as any).Tax_Number,
          score: Math.round(score * 100) / 100
        });
      }
    }

    scoredSuppliers.sort((a, b) => b.score - a.score);
    const topCandidate = scoredSuppliers[0];

    // High confidence match (>= 0.85) without ambiguity
    if (topCandidate && topCandidate.score >= 0.85) {
      const secondScore = scoredSuppliers[1]?.score ?? 0;
      const isAmbiguous = scoredSuppliers.length > 1 && (topCandidate.score - secondScore) < 0.05;
      
      if (isAmbiguous) {
        return {
          importedSupplierName: trimmed,
          status: SupplierResolutionStatus.AMBIGUOUS,
          confidence: topCandidate.score,
          action: SupplierResolutionAction.UNRESOLVED,
          suggestedSuppliers: scoredSuppliers.slice(0, 5),
          reason: 'توجد أكثر من نتيجة متطابقة بدرجة متقاربة - يرجى الاختيار اليدوي'
        };
      }

      return {
        importedSupplierName: trimmed,
        matchedSupplierId: topCandidate.id,
        matchedSupplierName: topCandidate.name,
        status: SupplierResolutionStatus.HIGH_CONFIDENCE_MATCH,
        confidence: topCandidate.score,
        action: SupplierResolutionAction.LINK_EXISTING,
        suggestedSuppliers: scoredSuppliers.slice(0, 5),
        reason: `تطابق عالي مع المورد (${topCandidate.name}) بنسبة ${Math.round(topCandidate.score * 100)}%`
      };
    }

    // Possible match (0.60 <= score < 0.85)
    if (topCandidate && topCandidate.score >= 0.60) {
      return {
        importedSupplierName: trimmed,
        status: SupplierResolutionStatus.POSSIBLE_MATCH,
        confidence: topCandidate.score,
        action: SupplierResolutionAction.UNRESOLVED,
        suggestedSuppliers: scoredSuppliers.slice(0, 5),
        reason: 'اقتراحات مشابهة للمورد - تتطلب تأكيد المستخدم'
      };
    }

    // New Supplier Candidate
    return {
      importedSupplierName: trimmed,
      status: SupplierResolutionStatus.NEW_SUPPLIER,
      confidence: 0,
      action: SupplierResolutionAction.UNRESOLVED,
      suggestedSuppliers: scoredSuppliers.slice(0, 3),
      newSupplierData: {
        name: trimmed
      },
      reason: 'مورد جديد غير مسجل مسبقاً'
    };
  }

  /**
   * Evaluates initial product match states for all extracted rows
   */
  static resolveProductsInitial(
    rows: ExtractedImportRow[],
    existingProducts: Product[],
    learnedAliases: Record<string, string>
  ): ProductDecision[] {
    return rows.map((row, index) => {
      const sourceRowId = index + 1;
      const rawName = (row.productName || '').trim();
      const barcode = (row.barcode || '').trim();
      const code = (row.productCode || '').trim();
      const qty = typeof row.quantity === 'number' && !isNaN(row.quantity) ? row.quantity : 1;
      const unitPrice = typeof row.unitPrice === 'number' && !isNaN(row.unitPrice) ? row.unitPrice : 0;
      const exp = row.expiryDate ? normalizeToISODate(row.expiryDate) : undefined;

      // Find best candidates using matching engine
      const candidate = ProductMatchingEngine.matchItem(row, existingProducts, learnedAliases);

      // Find top 4 scored suggestions for review modal / dropdown
      const suggestions: ProductCandidate[] = [];
      if (rawName || barcode) {
        for (const p of existingProducts) {
          const pName = p.Name || p.name || '';
          const score = ProductMatchingEngine.calculateSimilarity(rawName, pName);
          if (score >= 0.40 || (barcode && p.barcode === barcode)) {
            suggestions.push({
              id: p.id,
              name: pName,
              score: barcode && p.barcode === barcode ? 1.0 : Math.round(score * 100) / 100,
              barcode: p.barcode,
              costPrice: p.CostPrice || p.UnitPrice || 0,
              unitPrice: p.UnitPrice || 0,
              stockQuantity: p.StockQuantity || p.stock || 0,
              categoryName: p.categoryName
            });
          }
        }
        suggestions.sort((a, b) => b.score - a.score);
      }

      if (candidate && candidate.score >= 0.85) {
        return {
          sourceRowId,
          importedProductName: rawName,
          matchedProductId: candidate.product.id,
          matchedProductName: candidate.product.Name || candidate.product.name,
          confidence: candidate.score,
          action: (candidate.score >= 0.90 || candidate.matchType === 'ALIAS') ? ProductResolutionAction.AUTO_MATCH : ProductResolutionAction.LINK_EXISTING,
          reason: `تطابق ${candidate.matchType} بنسبة ${Math.round(candidate.score * 100)}%`,
          barcode: barcode || candidate.product.barcode,
          supplierProductCode: code,
          quantity: qty,
          unitPrice: unitPrice || candidate.product.CostPrice || candidate.product.UnitPrice || 0,
          total: qty * (unitPrice || candidate.product.CostPrice || candidate.product.UnitPrice || 0),
          expiryDate: exp,
          batchNumber: row.batchNumber,
          discountPercent: row.discountPercent,
          bonusQty: row.bonusQty,
          notes: row.notes,
          suggestedProducts: suggestions.slice(0, 5),
          validationIssues: []
        };
      }

      // If low confidence or no match, candidate is marked as UNRESOLVED with suggestions
      return {
        sourceRowId,
        importedProductName: rawName,
        confidence: candidate ? candidate.score : 0,
        action: ProductResolutionAction.UNRESOLVED,
        reason: candidate ? `تطابق تقريبي ضعيف (${Math.round(candidate.score * 100)}%) - يتطلب مراجعة المستخدم` : 'صنف جديد غير مسجل',
        barcode,
        supplierProductCode: code,
        quantity: qty,
        unitPrice,
        total: qty * unitPrice,
        expiryDate: exp,
        batchNumber: row.batchNumber,
        discountPercent: row.discountPercent,
        bonusQty: row.bonusQty,
        notes: row.notes,
        suggestedProducts: suggestions.slice(0, 5),
        newProductData: {
          name: rawName,
          barcode: barcode || undefined,
          unitPrice: unitPrice,
          costPrice: unitPrice
        },
        isNewProductCandidate: !candidate || candidate.score < 0.60,
        validationIssues: []
      };
    });
  }

  /**
   * Calculates overall summary metrics from current product decisions
   */
  static computeSummary(
    decisions: ProductDecision[],
    meta?: {
      detectedSupplier?: string;
      detectedInvoiceNumber?: string;
      detectedDate?: string;
    }
  ): BatchProcessingSummary {
    let autoMatchedCount = 0;
    let manualLinkedCount = 0;
    let createNewCount = 0;
    let skippedCount = 0;
    let unresolvedCount = 0;
    let totalAmount = 0;

    for (const d of decisions) {
      if (d.isSkipped || d.action === ProductResolutionAction.SKIP) {
        skippedCount++;
        continue;
      }

      totalAmount += (d.total || (d.quantity * d.unitPrice) || 0);

      switch (d.action) {
        case ProductResolutionAction.AUTO_MATCH:
          autoMatchedCount++;
          break;
        case ProductResolutionAction.LINK_EXISTING:
          manualLinkedCount++;
          break;
        case ProductResolutionAction.CREATE_NEW:
          createNewCount++;
          break;
        case ProductResolutionAction.UNRESOLVED:
        default:
          unresolvedCount++;
          break;
      }
    }

    return {
      totalRows: decisions.length,
      autoMatchedCount,
      manualLinkedCount,
      createNewCount,
      skippedCount,
      unresolvedCount,
      totalAmount: Math.round(totalAmount * 100) / 100,
      detectedSupplier: meta?.detectedSupplier,
      detectedInvoiceNumber: meta?.detectedInvoiceNumber,
      detectedDate: meta?.detectedDate
    };
  }

  /**
   * Sets supplier decision on an active session
   */
  static updateSupplierDecision(
    session: BatchProcessingSession,
    update: Partial<SupplierDecision>
  ): BatchProcessingSession {
    const updatedDecision: SupplierDecision = {
      ...session.supplierDecision,
      ...update,
      suggestedSuppliers: update.suggestedSuppliers || session.supplierDecision.suggestedSuppliers || []
    };

    return this.refreshSessionState({
      ...session,
      supplierDecision: updatedDecision,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Updates an individual product decision by sourceRowId
   */
  static updateProductDecision(
    session: BatchProcessingSession,
    sourceRowId: number,
    update: Partial<ProductDecision>
  ): BatchProcessingSession {
    const updatedDecisions = session.productDecisions.map(p => {
      if (p.sourceRowId === sourceRowId) {
        const merged: ProductDecision = {
          ...p,
          ...update,
          suggestedProducts: update.suggestedProducts || p.suggestedProducts || []
        };
        // Recalculate line total if price or quantity changed
        if (update.quantity !== undefined || update.unitPrice !== undefined) {
          const q = update.quantity !== undefined ? update.quantity : p.quantity;
          const u = update.unitPrice !== undefined ? update.unitPrice : p.unitPrice;
          merged.total = Math.round(q * u * 100) / 100;
        }
        return merged;
      }
      return p;
    });

    return this.refreshSessionState({
      ...session,
      productDecisions: updatedDecisions,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Performs bulk actions across multiple products in the session
   */
  static applyBulkAction(
    session: BatchProcessingSession,
    action: 'APPROVE_ALL_MATCHED' | 'CREATE_ALL_NEW' | 'SKIP_UNRESOLVED' | 'SKIP_SELECTED' | 'CREATE_SELECTED',
    selectedRowIds?: number[]
  ): BatchProcessingSession {
    const rowIdSet = selectedRowIds ? new Set(selectedRowIds) : null;

    const updatedDecisions = session.productDecisions.map(p => {
      // Check if item is selected or all
      const isTarget = !rowIdSet || rowIdSet.has(p.sourceRowId);
      if (!isTarget) return p;

      switch (action) {
        case 'APPROVE_ALL_MATCHED':
          if (p.matchedProductId && (p.action === ProductResolutionAction.UNRESOLVED || p.action === ProductResolutionAction.LINK_EXISTING)) {
            return {
              ...p,
              action: ProductResolutionAction.AUTO_MATCH,
              isSkipped: false
            };
          }
          break;

        case 'CREATE_ALL_NEW':
        case 'CREATE_SELECTED':
          if (!p.matchedProductId || action === 'CREATE_SELECTED') {
            return {
              ...p,
              action: ProductResolutionAction.CREATE_NEW,
              isSkipped: false,
              newProductData: p.newProductData || {
                name: p.importedProductName,
                barcode: p.barcode,
                unitPrice: p.unitPrice,
                costPrice: p.unitPrice
              }
            };
          }
          break;

        case 'SKIP_UNRESOLVED':
          if (p.action === ProductResolutionAction.UNRESOLVED) {
            return {
              ...p,
              action: ProductResolutionAction.SKIP,
              isSkipped: true
            };
          }
          break;

        case 'SKIP_SELECTED':
          return {
            ...p,
            action: ProductResolutionAction.SKIP,
            isSkipped: true
          };
      }

      return p;
    });

    return this.refreshSessionState({
      ...session,
      productDecisions: updatedDecisions,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Updates session summary and status based on current decisions
   */
  static refreshSessionState(session: BatchProcessingSession): BatchProcessingSession {
    const summary = this.computeSummary(session.productDecisions, {
      detectedSupplier: session.summary.detectedSupplier,
      detectedInvoiceNumber: session.summary.detectedInvoiceNumber,
      detectedDate: session.summary.detectedDate
    });

    const isSupplierResolved = 
      session.supplierDecision.action !== SupplierResolutionAction.UNRESOLVED ||
      session.supplierDecision.isSkipped === true;

    const isAllProductsResolved = session.productDecisions.every(
      p => p.action !== ProductResolutionAction.UNRESOLVED || p.isSkipped === true
    );

    let status = session.status;
    if (session.status !== BatchProcessingStatus.APPLIED && session.status !== BatchProcessingStatus.CANCELLED) {
      if (isSupplierResolved && isAllProductsResolved) {
        status = BatchProcessingStatus.READY_TO_APPLY;
      } else if (summary.autoMatchedCount > 0 || summary.manualLinkedCount > 0 || summary.createNewCount > 0) {
        status = BatchProcessingStatus.PARTIALLY_RESOLVED;
      } else {
        status = BatchProcessingStatus.READY_FOR_REVIEW;
      }
    }

    const updatedSession: BatchProcessingSession = {
      ...session,
      summary,
      status,
      updatedAt: new Date().toISOString()
    };

    this.activeSessions.set(session.sessionId, updatedSession);
    this.persistToLocalStorage(updatedSession);

    return updatedSession;
  }

  /**
   * Gets an active session by ID
   */
  static getSession(sessionId: string): BatchProcessingSession | undefined {
    let session = this.activeSessions.get(sessionId);
    if (!session && typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem(`${this.STORAGE_PREFIX}${sessionId}`);
        if (stored) {
          session = JSON.parse(stored) as BatchProcessingSession;
          if (session) {
            this.activeSessions.set(sessionId, session);
          }
        }
      } catch (err) {
        console.warn('[BatchSessionService] Error restoring session:', err);
      }
    }
    return session;
  }

  /**
   * Cancels an active session
   */
  static cancelSession(sessionId: string): BatchProcessingSession | undefined {
    const session = this.getSession(sessionId);
    if (!session) return undefined;

    const cancelled: BatchProcessingSession = {
      ...session,
      status: BatchProcessingStatus.CANCELLED,
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.activeSessions.set(sessionId, cancelled);
    this.persistToLocalStorage(cancelled);
    return cancelled;
  }

  private static persistToLocalStorage(session: BatchProcessingSession): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`${this.STORAGE_PREFIX}${session.sessionId}`, JSON.stringify(session));
      } catch {
        // ignore quota errors
      }
    }
  }
}
