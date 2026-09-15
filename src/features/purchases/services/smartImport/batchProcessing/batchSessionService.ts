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
import { normalizeToISODate } from '@/utils/expiryUtils';
import { PreloadedAliasContext, AliasMatchingEngine, AliasNormalization } from '../aliasLearning';
import { ResolutionPolicy } from '../domain/resolution.policy';
import { configurationService } from '@/services/config/configurationService';

export interface CreateSessionOptions {
  tenantId: string;
  branchId: string;
  userId: string;
  sourceType?: ImportSourceType;
  fileName?: string;
  existingSuppliers: Supplier[];
  existingProducts: Product[];
  learnedAliases?: Record<string, string>;
  preloadedAliasContext?: PreloadedAliasContext;
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
      options.existingSuppliers,
      options.preloadedAliasContext
    );

    const productDecisions = this.resolveProductsInitial(
      analysis.rows,
      options.existingProducts,
      options.learnedAliases || {},
      options.preloadedAliasContext,
      {
        tenantId: options.tenantId,
        supplierId: supplierDecision.matchedSupplierId
      }
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
    existingSuppliers: Supplier[],
    preloadedAliasContext?: PreloadedAliasContext
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

    const normInput = AliasNormalization.normalizeSupplier(trimmed);

    // 1. Check Preloaded Supplier Aliases
    if (preloadedAliasContext?.supplierAliases) {
      const aliasOrId = preloadedAliasContext.supplierAliases.get(normInput) ||
                        preloadedAliasContext.supplierAliases.get(AliasNormalization.normalize(trimmed));
      if (aliasOrId) {
        const supplierId = typeof aliasOrId === 'string' ? aliasOrId : (aliasOrId as any).supplierId;
        const sup = existingSuppliers.find(s => (s.id || s.Supplier_ID) === supplierId);
        if (sup) {
          return {
            importedSupplierName: trimmed,
            matchedSupplierId: sup.id || sup.Supplier_ID,
            matchedSupplierName: sup.Supplier_Name || sup.name || '',
            status: SupplierResolutionStatus.EXACT_MATCH,
            confidence: 1.0,
            action: SupplierResolutionAction.AUTO_MATCH,
            suggestedSuppliers: [{
              id: sup.id || sup.Supplier_ID || '',
              name: sup.Supplier_Name || sup.name || '',
              phone: sup.Phone || sup.phone,
              taxNumber: (sup as any).taxNumber || (sup as any).Tax_Number,
              score: 1.0
            }],
            reason: 'تطابق عبر الاسم البديل المعتمد للمورد (Supplier Alias)'
          };
        }
      }
    }

    // 2. Exact Match (Score 1.0)
    const exactMatch = existingSuppliers.find(s => {
      const sName = (s.Supplier_Name || s.name || '').trim();
      return sName.toLowerCase() === trimmed.toLowerCase() || AliasNormalization.normalizeSupplier(sName) === normInput;
    });

    if (exactMatch) {
      return {
        importedSupplierName: trimmed,
        matchedSupplierId: exactMatch.id || exactMatch.Supplier_ID,
        matchedSupplierName: exactMatch.Supplier_Name || exactMatch.name,
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

    // 3. Similarity & Candidate Search
    const scoredSuppliers: SupplierCandidate[] = [];
    for (const sup of existingSuppliers) {
      const sName = sup.Supplier_Name || sup.name || '';
      const score = ProductMatchingEngine.calculateSimilarity(trimmed, sName);
      if (score >= 0.45) {
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
    const secondCandidate = scoredSuppliers[1];

    // High confidence match (>= 0.90) without ambiguity (score difference >= 0.10)
    if (topCandidate && topCandidate.score >= 0.90) {
      const secondScore = secondCandidate?.score ?? 0;
      const isAmbiguous = scoredSuppliers.length > 1 && (topCandidate.score - secondScore) < 0.10;
      
      if (isAmbiguous) {
        return {
          importedSupplierName: trimmed,
          status: SupplierResolutionStatus.AMBIGUOUS,
          confidence: topCandidate.score,
          action: SupplierResolutionAction.UNRESOLVED,
          suggestedSuppliers: scoredSuppliers.slice(0, 5),
          reason: `توجد عدة أسماء موردين متقاربة (${topCandidate.name} و ${secondCandidate?.name}) - يحتاج مراجعة وتأكيد يدوي لمنع الخلط`
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
        reason: `تطابق عالي وموثوق مع المورد (${topCandidate.name}) بنسبة ${Math.round(topCandidate.score * 100)}%`
      };
    }

    // Possible match or ambiguous match (0.55 <= score < 0.90) — NEVER auto-assign randomly
    if (topCandidate && topCandidate.score >= 0.55) {
      const secondScore = secondCandidate?.score ?? 0;
      const isAmbiguous = scoredSuppliers.length > 1 && Math.abs(topCandidate.score - secondScore) <= 0.08;

      return {
        importedSupplierName: trimmed,
        status: isAmbiguous ? SupplierResolutionStatus.AMBIGUOUS : SupplierResolutionStatus.POSSIBLE_MATCH,
        confidence: topCandidate.score,
        action: SupplierResolutionAction.UNRESOLVED,
        suggestedSuppliers: scoredSuppliers.slice(0, 5),
        reason: isAmbiguous
          ? `تشابه متقارب بين أكثر من مورد (${topCandidate.name} و ${secondCandidate?.name}) - يحتاج مراجعة`
          : `مطابقة تقريبية مع المورد (${topCandidate.name}) بنسبة ${Math.round(topCandidate.score * 100)}% - يحتاج مراجعة وتأكيد`
      };
    }

    // New Supplier Candidate (< 0.55 or no close candidate)
    return {
      importedSupplierName: trimmed,
      status: SupplierResolutionStatus.NEW_SUPPLIER,
      confidence: 0.40,
      action: SupplierResolutionAction.UNRESOLVED,
      suggestedSuppliers: scoredSuppliers.slice(0, 3),
      newSupplierData: {
        name: trimmed
      },
      reason: `المورد المستخرج "${trimmed}" غير مسجل في دليلك - يحتاج مراجعة لإضافته أو ربطه`
    };
  }

  /**
   * Evaluates initial product match states for all extracted rows
   */
  static resolveProductsInitial(
    rows: ExtractedImportRow[],
    existingProducts: Product[],
    learnedAliases: Record<string, string> = {},
    preloadedAliasContext?: PreloadedAliasContext,
    matchContext?: { tenantId?: string; supplierId?: string }
  ): ProductDecision[] {
    return rows.map((row, index) => {
      const sourceRowId = index + 1;
      const rawName = (row.productName || '').trim();
      const barcode = (row.barcode || '').trim();
      const code = (row.productCode || '').trim();
      const qty = typeof row.quantity === 'number' && !isNaN(row.quantity) ? row.quantity : 1;
      const unitPrice = typeof row.unitPrice === 'number' && !isNaN(row.unitPrice) ? row.unitPrice : 0;
      const exp = row.expiryDate ? normalizeToISODate(row.expiryDate) : undefined;

      // Extract pharmaceutical info (strength, form, pack size)
      const extractedInfo = AliasNormalization.extractPharmaceuticalInfo(rawName);

      // 1. Try 8-Tier AliasMatchingEngine if available
      let candidate: any = null;
      if (preloadedAliasContext || matchContext?.tenantId) {
        candidate = AliasMatchingEngine.matchRow(row, existingProducts, {
          tenantId: matchContext?.tenantId || 'default-tenant',
          supplierId: matchContext?.supplierId,
          preloaded: preloadedAliasContext
        });
      }

      // Fallback to legacy ProductMatchingEngine if no candidate
      if (!candidate) {
        const legacyCand = ProductMatchingEngine.matchItem(row, existingProducts, learnedAliases);
        if (legacyCand) {
          candidate = {
            product: legacyCand.product,
            matchTier: legacyCand.matchType === 'ALIAS' ? 'TIER_2_GLOBAL_ALIAS' : 'TIER_7_FUZZY_NAME',
            score: legacyCand.score,
            confidenceExplanation: `تطابق ${legacyCand.matchType} بنسبة ${Math.round(legacyCand.score * 100)}%`
          };
        }
      }

      // Find top 4 scored suggestions for review modal / dropdown
      const suggestions: ProductCandidate[] = [];
      if (rawName || barcode) {
        for (const p of existingProducts) {
          const pName = p.Name || p.name || '';
          const score = ProductMatchingEngine.calculateSimilarity(rawName, pName);
          if (score >= 0.40 || (barcode && p.barcode === barcode)) {
            const pInfo = AliasNormalization.extractPharmaceuticalInfo(pName);
            suggestions.push({
              id: p.id,
              name: pName,
              score: barcode && p.barcode === barcode ? 1.0 : Math.round(score * 100) / 100,
              barcode: p.barcode,
              costPrice: p.CostPrice || p.UnitPrice || 0,
              unitPrice: p.UnitPrice || 0,
              stockQuantity: p.StockQuantity || p.stock || 0,
              categoryName: p.categoryName,
              pharmaceuticalInfo: pInfo
            });
          }
        }
        suggestions.sort((a, b) => b.score - a.score);
      }

      if (candidate) {
        const score = typeof candidate.confidence === 'number' ? candidate.confidence : (candidate.score || 0);
        const productId = candidate.productId || candidate.product?.id;
        const productName = candidate.productName || candidate.product?.Name || candidate.product?.name;
        const matchTier = candidate.matchType || candidate.matchTier;
        const matchedProd = existingProducts.find(p => p.id === productId);

        // Evaluate Dosage & Form Safety Guard
        const safetyReport = ResolutionPolicy.evaluateDosageSafety(rawName, productName || '');

        if (score >= 0.85 && productId) {
          // BLOCKING RULE: Dosage Safety conflicts can NEVER be auto-matched
          const isSafetyConflict = safetyReport.isConflict;
          const isAutoMatch = !isSafetyConflict && (
            score >= 0.90 || 
            matchTier === 'SUPPLIER_ALIAS' || 
            matchTier === 'GLOBAL_ALIAS' || 
            matchTier === 'SUPPLIER_CATALOG_REF' ||
            matchTier === 'BARCODE' ||
            matchTier === 'EXACT' ||
            matchTier === 'CODE'
          );

          const validationIssues: string[] = [];
          if (isSafetyConflict) {
            validationIssues.push('DOSAGE_SAFETY_CONFLICT');
          }

          return {
            sourceRowId,
            importedProductName: rawName,
            matchedProductId: isSafetyConflict ? undefined : productId,
            matchedProductName: isSafetyConflict ? undefined : productName,
            confidence: isSafetyConflict ? score * 0.5 : score,
            action: isAutoMatch ? ProductResolutionAction.AUTO_MATCH : ProductResolutionAction.UNRESOLVED,
            reason: isSafetyConflict 
              ? `🔴 تعارض أمان دوائي: ${safetyReport.reason}`
              : (candidate.confidenceExplanation || `تطابق ${matchTier || 'ALIAS'} بنسبة ${Math.round(score * 100)}%`),
            barcode: barcode || matchedProd?.barcode,
            supplierProductCode: code,
            quantity: qty,
            unitPrice: unitPrice || matchedProd?.CostPrice || matchedProd?.UnitPrice || 0,
            total: qty * (unitPrice || matchedProd?.CostPrice || matchedProd?.UnitPrice || 0),
            expiryDate: exp,
            batchNumber: row.batchNumber,
            discountPercent: row.discountPercent,
            bonusQty: row.bonusQty,
            notes: row.notes,
            suggestedProducts: suggestions.slice(0, 5),
            validationIssues,
            dosageSafety: safetyReport,
            extractedInfo,
            resolutionStatus: isSafetyConflict ? 'BLOCKED' : (isAutoMatch ? 'AUTO_RESOLVED' : 'PENDING_REVIEW'),
            resolutionCategory: 'PRODUCT',
            conflictType: isSafetyConflict ? 'DOSAGE_SAFETY_CONFLICT' : undefined,
            conflictSource: isSafetyConflict ? 'IMPORT' : undefined,
            sourceProvenance: row.sourceProvenance || 'OCR',
            evidence: (row as any).evidence || row.notes,
            newProductData: {
              name: rawName,
              barcode: barcode || undefined,
              unitPrice: unitPrice,
              costPrice: unitPrice,
              strength: extractedInfo.dosage ? `${extractedInfo.dosage.value}${extractedInfo.dosage.unit}` : undefined,
              form: extractedInfo.form
            }
          };
        }
      }

      // If low confidence or no match, candidate is marked as UNRESOLVED with suggestions
      const candScore = candidate ? (typeof candidate.confidence === 'number' ? candidate.confidence : candidate.score || 0) : 0;
      return {
        sourceRowId,
        importedProductName: rawName,
        confidence: candScore,
        action: ProductResolutionAction.UNRESOLVED,
        reason: candidate ? `تطابق تقريبي ضعيف (${Math.round(candScore * 100)}%) - يتطلب مراجعة المستخدم` : 'صنف جديد غير مسجل',
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
          costPrice: unitPrice,
          strength: extractedInfo.dosage ? `${extractedInfo.dosage.value}${extractedInfo.dosage.unit}` : undefined,
          form: extractedInfo.form
        },
        isNewProductCandidate: !candidate || candScore < 0.60,
        validationIssues: [],
        extractedInfo,
        resolutionStatus: 'PENDING_REVIEW',
        resolutionCategory: 'PRODUCT',
        sourceProvenance: row.sourceProvenance || 'OCR',
        evidence: (row as any).evidence || row.notes
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
    let criticalConflictsCount = 0;
    let totalAmount = 0;

    for (const d of decisions) {
      if (d.isSkipped || d.action === ProductResolutionAction.SKIP) {
        skippedCount++;
        continue;
      }

      totalAmount += (d.total || (d.quantity * d.unitPrice) || 0);

      if (d.dosageSafety?.isConflict && d.action === ProductResolutionAction.UNRESOLVED) {
        criticalConflictsCount++;
      }

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
      criticalConflictsCount,
      totalAmount: Math.round(totalAmount * 100) / 100,
      detectedSupplier: meta?.detectedSupplier,
      detectedInvoiceNumber: meta?.detectedInvoiceNumber,
      detectedDate: meta?.detectedDate,
      invoiceNumberSource: (meta as any)?.invoiceNumberSource || (meta?.detectedInvoiceNumber ? 'OCR' : 'UNKNOWN'),
      invoiceNumberConfidence: meta?.detectedInvoiceNumber ? 0.95 : 0
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
          sourceProvenance: update.sourceProvenance || 'USER',
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
    if (!session) {
      try {
        session = configurationService.getSync<BatchProcessingSession>(`${this.STORAGE_PREFIX}${sessionId}`) || undefined;
        if (session) {
          this.activeSessions.set(sessionId, session);
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
    configurationService.set(`${this.STORAGE_PREFIX}${session.sessionId}`, session).catch(() => {});
  }
}
