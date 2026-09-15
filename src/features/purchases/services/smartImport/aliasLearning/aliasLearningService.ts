// src/features/purchases/services/smartImport/aliasLearning/aliasLearningService.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Core Alias Learning Orchestrator & Event-Driven Decision Handler
 */

import { 
  BatchProcessingSession, 
  BatchApplyContext, 
  SupplierResolutionAction, 
  ProductResolutionAction,
  ProductDecision 
} from '../batchProcessing/types';
import { AliasSource } from './aliasLearning.types';
import { AliasNormalization } from './aliasNormalization';
import { SupplierAliasRepository } from './supplierAliasRepository';
import { ProductAliasRepository } from './productAliasRepository';
import { AliasAuditService } from './aliasAuditService';
import { Product } from '@/types';

export interface AliasLearningSummary {
  supplierAliasesLearned: number;
  productAliasesLearned: number;
  catalogReferencesLearned: number;
  rejectionsRecorded: number;
  conflictsDetected: number;
  warnings: string[];
}

export class AliasLearningService {
  /**
   * Processes a confirmed batch session and extracts learning events for suppliers and products
   */
  static async learnFromBatchSession(
    session: BatchProcessingSession,
    context: BatchApplyContext
  ): Promise<AliasLearningSummary> {
    const summary: AliasLearningSummary = {
      supplierAliasesLearned: 0,
      productAliasesLearned: 0,
      catalogReferencesLearned: 0,
      rejectionsRecorded: 0,
      conflictsDetected: 0,
      warnings: []
    };

    const tenantId = context.tenantId || session.tenantId || 'default-tenant';
    const branchId = context.branchId || session.branchId;
    const userId = context.userId || session.userId || 'SYSTEM';

    // -------------------------------------------------------------
    // Step 1: Supplier Alias Learning
    // -------------------------------------------------------------
    try {
      const supDecision = session.supplierDecision;
      const rawSupName = (supDecision.importedSupplierName || '').trim();
      const matchedSupId = supDecision.matchedSupplierId;

      const isExplicitConfirmation = 
        (supDecision.action === SupplierResolutionAction.AUTO_MATCH || 
         supDecision.action === SupplierResolutionAction.LINK_EXISTING) && 
        !!matchedSupId && 
        !!rawSupName;

      if (isExplicitConfirmation) {
        const savedAlias = await SupplierAliasRepository.saveAlias({
          tenantId,
          branchId,
          supplierId: matchedSupId,
          aliasRaw: rawSupName,
          source: AliasSource.IMPORT_CONFIRMATION,
          userId
        });

        summary.supplierAliasesLearned++;

        await AliasAuditService.log({
          tenantId,
          branchId,
          userId,
          action: 'SUPPLIER_ALIAS_CONFIRMED',
          aliasType: 'SUPPLIER',
          aliasId: savedAlias.id,
          supplierId: matchedSupId,
          rawImportedValue: rawSupName,
          normalizedValue: savedAlias.aliasNormalized,
          decision: `Linked to Supplier ID ${matchedSupId}`,
          confidence: savedAlias.confidence,
          sourceImportId: session.sessionId,
          details: `Supplier alias "${rawSupName}" confirmed for supplier ${supDecision.matchedSupplierName || matchedSupId}`
        });
      }
    } catch (supErr: any) {
      summary.warnings.push(`Supplier alias learning error: ${supErr?.message || supErr}`);
    }

    // -------------------------------------------------------------
    // Step 2: Product Aliases & Catalog Reference Learning
    // -------------------------------------------------------------
    const activeSupplierId = session.supplierDecision.matchedSupplierId || session.supplierDecision.suggestedSuppliers?.[0]?.id;
    const masterProductsMap = new Map<string, Product>();
    (context.masterData?.products || []).forEach(p => masterProductsMap.set(p.id, p));

    for (const prod of session.productDecisions) {
      try {
        await this.processSingleProductDecision(prod, {
          tenantId,
          branchId,
          userId,
          supplierId: activeSupplierId,
          sessionId: session.sessionId,
          masterProductsMap,
          summary
        });
      } catch (prodErr: any) {
        summary.warnings.push(`Product alias error on row #${prod.sourceRowId}: ${prodErr?.message || prodErr}`);
      }
    }

    return summary;
  }

  /**
   * Processes learning logic for a single product decision
   */
  private static async processSingleProductDecision(
    decision: ProductDecision,
    context: {
      tenantId: string;
      branchId?: string;
      userId: string;
      supplierId?: string;
      sessionId: string;
      masterProductsMap: Map<string, Product>;
      summary: AliasLearningSummary;
    }
  ): Promise<void> {
    const rawName = (decision.importedProductName || '').trim();
    if (!rawName) return;

    // A. Explicit Match / Linking (AUTO_MATCH or LINK_EXISTING)
    if (
      (decision.action === ProductResolutionAction.AUTO_MATCH || decision.action === ProductResolutionAction.LINK_EXISTING) &&
      decision.matchedProductId
    ) {
      const targetProduct = context.masterProductsMap.get(decision.matchedProductId);
      const targetName = targetProduct?.name || targetProduct?.Name || decision.matchedProductName || '';

      // Pharmaceutical Dosage & Form Safety Guard
      const safety = AliasNormalization.checkDosageAndFormSafety(rawName, targetName);
      if (!safety.isSafe && safety.severity === 'CRITICAL') {
        context.summary.warnings.push(
          `تم تخطي حفظ الاسم البديل للصنف "${rawName}" بسبب تعارض دوائي مع "${targetName}": ${safety.reason}`
        );
        return;
      }

      // Save Supplier-Specific or Global Product Alias
      const saveResult = await ProductAliasRepository.saveProductAlias({
        tenantId: context.tenantId,
        branchId: context.branchId,
        supplierId: context.supplierId,
        productId: decision.matchedProductId,
        aliasRaw: rawName,
        isGlobal: !context.supplierId,
        source: AliasSource.IMPORT_CONFIRMATION,
        userId: context.userId
      });

      context.summary.productAliasesLearned++;

      if (saveResult.isConflict) {
        context.summary.conflictsDetected++;
        await AliasAuditService.log({
          tenantId: context.tenantId,
          branchId: context.branchId,
          userId: context.userId,
          action: 'ALIAS_CONFLICT_DETECTED',
          aliasType: 'PRODUCT',
          aliasId: saveResult.alias.id,
          supplierId: context.supplierId,
          productId: decision.matchedProductId,
          rawImportedValue: rawName,
          normalizedValue: saveResult.alias.aliasNormalized,
          previousMapping: saveResult.previousProductId,
          newMapping: decision.matchedProductId,
          decision: 'USER_OVERRIDE',
          confidence: saveResult.alias.confidence,
          sourceImportId: context.sessionId,
          details: `تم تعديل وتحديث ربط الاسم البديل "${rawName}" من الصنف (${saveResult.previousProductId}) إلى الصنف (${decision.matchedProductId})`
        });
      } else {
        await AliasAuditService.log({
          tenantId: context.tenantId,
          branchId: context.branchId,
          userId: context.userId,
          action: 'PRODUCT_ALIAS_CONFIRMED',
          aliasType: 'PRODUCT',
          aliasId: saveResult.alias.id,
          supplierId: context.supplierId,
          productId: decision.matchedProductId,
          rawImportedValue: rawName,
          normalizedValue: saveResult.alias.aliasNormalized,
          decision: `Linked to Product ${decision.matchedProductId}`,
          confidence: saveResult.alias.confidence,
          sourceImportId: context.sessionId,
          details: `Product alias "${rawName}" confirmed for product "${targetName}"`
        });
      }

      // Save Supplier Catalog Reference if SKU / code is present
      if (decision.supplierProductCode && context.supplierId) {
        await ProductAliasRepository.saveCatalogReference({
          tenantId: context.tenantId,
          supplierId: context.supplierId,
          productId: decision.matchedProductId,
          supplierProductCode: decision.supplierProductCode,
          supplierProductName: rawName,
          barcode: decision.barcode,
          lastPurchasePrice: decision.unitPrice
        });

        context.summary.catalogReferencesLearned++;

        await AliasAuditService.log({
          tenantId: context.tenantId,
          branchId: context.branchId,
          userId: context.userId,
          action: 'SUPPLIER_PRODUCT_REFERENCE_LEARNED',
          aliasType: 'CATALOG_REF',
          supplierId: context.supplierId,
          productId: decision.matchedProductId,
          rawImportedValue: decision.supplierProductCode,
          normalizedValue: decision.supplierProductCode.toUpperCase(),
          decision: `Registered Catalog Code ${decision.supplierProductCode} for Product ${decision.matchedProductId}`,
          confidence: 0.98,
          sourceImportId: context.sessionId,
          details: `Catalog code ${decision.supplierProductCode} learned for supplier ${context.supplierId}`
        });
      }
    }

    // B. Negative Learning: Explicit Suggestion Rejections
    // If the item had suggested candidates but the user explicitly selected a different candidate or created a new item
    if (
      decision.suggestedProducts &&
      decision.suggestedProducts.length > 0 &&
      (decision.action === ProductResolutionAction.CREATE_NEW || decision.action === ProductResolutionAction.LINK_EXISTING)
    ) {
      const topSuggestion = decision.suggestedProducts[0];
      // If user did NOT link to the top suggested product, record rejection
      if (topSuggestion && topSuggestion.id !== decision.matchedProductId) {
        await ProductAliasRepository.recordRejection({
          tenantId: context.tenantId,
          supplierId: context.supplierId,
          rawName,
          rejectedProductId: topSuggestion.id,
          reason: `المستخدم رفض الاقتراح (${topSuggestion.name}) واختار بديلاً آخر (${decision.matchedProductName || 'إنشاء صنف جديد'})`,
          userId: context.userId
        });

        context.summary.rejectionsRecorded++;

        await AliasAuditService.log({
          tenantId: context.tenantId,
          branchId: context.branchId,
          userId: context.userId,
          action: 'PRODUCT_ALIAS_REJECTED',
          aliasType: 'REJECTION',
          supplierId: context.supplierId,
          productId: topSuggestion.id,
          rawImportedValue: rawName,
          normalizedValue: AliasNormalization.normalize(rawName),
          decision: `Rejected suggestion ${topSuggestion.id}`,
          confidence: 0,
          sourceImportId: context.sessionId,
          details: `User rejected auto-candidate "${topSuggestion.name}" for imported row "${rawName}"`
        });
      }
    }
  }
}
