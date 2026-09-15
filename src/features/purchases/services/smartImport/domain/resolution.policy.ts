// src/features/purchases/services/smartImport/domain/resolution.policy.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.4: Resolution Domain Policies & Blocking Rules
 */

import { 
  ResolutionItem, 
  ResolutionCandidate, 
  DosageSafetyReport, 
  ResolutionValidationReport 
} from './resolution.types';
import { AliasNormalization } from '../aliasLearning/aliasNormalization';

export class ResolutionPolicy {
  /**
   * Minimum confidence score required for unattended auto-matching
   */
  public static readonly AUTO_MATCH_THRESHOLD = 0.90;

  /**
   * Evaluates dosage and pharmaceutical form safety between imported text and master product
   */
  public static evaluateDosageSafety(
    importedText: string,
    candidateText: string
  ): DosageSafetyReport {
    const safety = AliasNormalization.checkDosageAndFormSafety(importedText, candidateText);
    
    let conflictType: 'DOSAGE_MISMATCH' | 'FORM_MISMATCH' | undefined = undefined;
    if (!safety.isSafe) {
      if (safety.importedInfo?.dosage && safety.targetProductInfo?.dosage && 
          (safety.importedInfo.dosage.value !== safety.targetProductInfo.dosage.value ||
           safety.importedInfo.dosage.unit !== safety.targetProductInfo.dosage.unit)) {
        conflictType = 'DOSAGE_MISMATCH';
      } else if (safety.importedInfo?.form && safety.targetProductInfo?.form &&
                 safety.importedInfo.form !== safety.targetProductInfo.form) {
        conflictType = 'FORM_MISMATCH';
      } else {
        conflictType = 'DOSAGE_MISMATCH';
      }
    }

    return {
      isConflict: !safety.isSafe,
      conflictType,
      severity: safety.severity || 'INFO',
      reason: safety.reason,
      sourceStrength: safety.importedInfo?.dosage ? `${safety.importedInfo.dosage.value}${safety.importedInfo.dosage.unit}` : undefined,
      sourceForm: safety.importedInfo?.form,
      matchedStrength: safety.targetProductInfo?.dosage ? `${safety.targetProductInfo.dosage.value}${safety.targetProductInfo.dosage.unit}` : undefined,
      matchedForm: safety.targetProductInfo?.form,
      importedInfo: safety.importedInfo,
      targetProductInfo: safety.targetProductInfo
    };
  }

  /**
   * Checks if an item can be automatically resolved based on confidence, candidate quality, and safety report
   */
  public static isAutoResolutionEligible(item: {
    dosageSafety?: DosageSafetyReport;
    candidateProducts?: ResolutionCandidate[] | any[];
    confidence?: number;
    status?: string;
  }): boolean {
    if (item.dosageSafety?.isConflict) {
      return false;
    }

    const topCandidate = item.candidateProducts?.[0];
    const score = topCandidate?.score ?? item.confidence ?? 0;

    return score >= this.AUTO_MATCH_THRESHOLD;
  }

  /**
   * Determines if a candidate match is eligible for auto-resolution without human prompt
   */
  public static canAutoResolveProduct(
    candidate: ResolutionCandidate,
    importedText: string
  ): { eligible: boolean; safetyReport: DosageSafetyReport; reason?: string } {
    const safetyReport = this.evaluateDosageSafety(importedText, candidate.name);

    // BLOCKING RULE: Dosage or Form conflicts NEVER auto-resolve
    if (safetyReport.isConflict) {
      return {
        eligible: false,
        safetyReport,
        reason: `تعارض أمان دوائي: ${safetyReport.reason}`
      };
    }

    const isHighConfidence = candidate.score >= this.AUTO_MATCH_THRESHOLD;
    const isReliableTier = candidate.matchTier === 'TIER_1_SUPPLIER_ALIAS' ||
      candidate.matchTier === 'TIER_3_CATALOG_CODE' ||
      candidate.matchTier === 'TIER_4_BARCODE' ||
      candidate.matchTier === 'TIER_5_SKU' ||
      candidate.matchTier === 'TIER_6_EXACT_NAME';

    if (isHighConfidence || isReliableTier) {
      return {
        eligible: true,
        safetyReport,
        reason: candidate.explanation || `مطابقة تلقائية موثوقة بنسبة ${Math.round(candidate.score * 100)}%`
      };
    }

    return {
      eligible: false,
      safetyReport,
      reason: `نسبة الثقة (${Math.round(candidate.score * 100)}%) تتطلب مراجعة المستخدم`
    };
  }

  /**
   * Evaluates if a supplier candidate qualifies for auto-resolution
   */
  public static canAutoResolveSupplier(
    candidate?: ResolutionCandidate
  ): { eligible: boolean; reason?: string } {
    if (!candidate) {
      return { eligible: false, reason: 'لم يتم العثور على مورد مطابق' };
    }

    if (candidate.score >= 0.95 || candidate.matchTier === 'EXACT' || candidate.matchTier === 'SUPPLIER_ALIAS') {
      return {
        eligible: true,
        reason: `مطابقة مورد موثوقة: ${candidate.name} (${Math.round(candidate.score * 100)}%)`
      };
    }

    return {
      eligible: false,
      reason: `مورد مقترح (${candidate.name}) بنسبة ثقة ${Math.round(candidate.score * 100)}% يتطلب تأكيد المستخدم`
    };
  }

  /**
   * Validates bulk resolution safety for a collection of items
   * Prevents applying bulk operations that violate pharmaceutical dosage safety
   */
  public static validateBulkResolutionSafety(
    items: ResolutionItem[],
    targetCandidate: ResolutionCandidate
  ): { isSafe: boolean; conflictingItems: ResolutionItem[]; reason?: string } {
    const conflictingItems: ResolutionItem[] = [];

    for (const item of items) {
      if (item.category !== 'PRODUCT') continue;
      const safety = this.evaluateDosageSafety(item.sourceValue, targetCandidate.name);
      if (safety.isConflict) {
        conflictingItems.push(item);
      }
    }

    if (conflictingItems.length > 0) {
      return {
        isSafe: false,
        conflictingItems,
        reason: `يمنع التطبيق الجماعي: يوجد ${conflictingItems.length} صنف يتعارض في التركيز أو الشكل الدوائي مع الصنف المختار`
      };
    }

    return { isSafe: true, conflictingItems: [] };
  }

  /**
   * Evaluates entire session readiness to transition to READY_TO_APPLY
   * Implements strict enterprise and pharmaceutical safety blocking policies
   */
  public static evaluateBatchReadiness(
    items: ResolutionItem[],
    context: {
      tenantId: string;
      branchId?: string;
      supplierRequired?: boolean;
    }
  ): ResolutionValidationReport {
    const blockingReasons: string[] = [];
    const warnings: string[] = [];
    let unresolvedCount = 0;
    let criticalConflictCount = 0;

    // 1. Supplier Check
    const supplierItem = items.find(i => i.category === 'SUPPLIER');
    if (supplierItem) {
      if (supplierItem.tenantId !== context.tenantId) {
        blockingReasons.push(`تعارض في هوية المؤسسة للمورد: ${supplierItem.tenantId} != ${context.tenantId}`);
      }
      if (supplierItem.status === 'PENDING_REVIEW' || supplierItem.status === 'BLOCKED') {
        if (context.supplierRequired !== false) {
          unresolvedCount++;
          blockingReasons.push('يجب حسم قرار المورد (مطابقة، ربط، إنشاء، أو تخطي صريح) قبل المتابعة');
        }
      }
    }

    // 2. Products and Conflicts Check
    for (const item of items) {
      if (item.status === 'SKIPPED') continue;

      if (item.tenantId !== context.tenantId) {
        blockingReasons.push(`تعارض في هوية المؤسسة للصنف (${item.sourceValue})`);
      }

      // Check Dosage Safety Conflicts
      if (item.dosageSafety?.isConflict && item.status !== 'USER_RESOLVED') {
        criticalConflictCount++;
        blockingReasons.push(`تعارض أمان دوائي غير محسوم للصنف "${item.sourceValue}": ${item.dosageSafety.reason}`);
      }

      if (item.status === 'PENDING_REVIEW' || item.status === 'BLOCKED') {
        unresolvedCount++;
        blockingReasons.push(`الصنف "${item.sourceValue}" يتطلب قراراً صريحاً`);
      }

      // Validate quantities and prices on original reference
      if (item.originalRowReference) {
        const qty = item.originalRowReference.quantity;
        const price = item.originalRowReference.unitPrice;

        if (typeof qty === 'number' && (qty <= 0 || isNaN(qty))) {
          blockingReasons.push(`كمية غير صالحة للصنف "${item.sourceValue}" (${qty})`);
        }

        if (typeof price === 'number' && (price < 0 || isNaN(price))) {
          blockingReasons.push(`سعر غير صالح للصنف "${item.sourceValue}" (${price})`);
        }
      }
    }

    const canApply = blockingReasons.length === 0 && unresolvedCount === 0 && criticalConflictCount === 0;

    return {
      canApply,
      isValid: blockingReasons.length === 0,
      blockingReasons,
      warnings,
      unresolvedCount,
      criticalConflictCount
    };
  }
}
