// src/features/purchases/services/smartImport/aliasLearning/aliasConfidencePolicy.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Explainable Confidence & Scoring Policy
 */

import { ProductAlias, SupplierAlias, AliasSource } from './aliasLearning.types';

export interface ConfidenceExplanation {
  baseScore: number;
  confirmationBonus: number;
  usageBonus: number;
  recencyBonus: number;
  rejectionPenalty: number;
  finalScore: number;
  isHighConfidence: boolean;
  canAutoMatch: boolean;
  breakdown: string;
}

export class AliasConfidencePolicy {
  public static readonly THRESHOLD_AUTO_MATCH = 0.90;
  public static readonly THRESHOLD_HIGH_CONFIDENCE = 0.85;
  public static readonly THRESHOLD_SUGGESTION = 0.60;
  public static readonly THRESHOLD_SUPPRESSED = 0.50;

  /**
   * Calculates an explainable confidence score for a Product Alias
   */
  static evaluateProductAlias(alias: ProductAlias): ConfidenceExplanation {
    // 1. Base Score based on scope and source
    let baseScore = alias.isGlobal ? 0.85 : 0.92;
    if (alias.source === AliasSource.MANUAL_DECISION || alias.source === AliasSource.IMPORT_CONFIRMATION) {
      baseScore += 0.03;
    }

    // 2. Confirmation Bonus (up to +0.06)
    const confirmationBonus = Math.min(0.06, (alias.confirmedCount || 0) * 0.02);

    // 3. Usage Frequency Bonus (up to +0.03)
    const usageBonus = Math.min(0.03, (alias.usageCount || 0) * 0.005);

    // 4. Recency Bonus (+0.02 if used within last 30 days)
    let recencyBonus = 0;
    if (alias.lastUsedAt) {
      const daysSinceLastUse = (Date.now() - new Date(alias.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUse <= 30) {
        recencyBonus = 0.02;
      }
    }

    // 5. Rejection Penalty (-0.20 per explicit rejection)
    const rejectionPenalty = Math.min(0.50, (alias.rejectedCount || 0) * 0.20);

    // 6. Compute Final Score bounded in [0.0, 1.0]
    let finalScore = baseScore + confirmationBonus + usageBonus + recencyBonus - rejectionPenalty;
    finalScore = Math.max(0.0, Math.min(1.0, Math.round(finalScore * 100) / 100));

    // If confirmed manually by user at least once and never rejected, guarantee minimum 0.95 for supplier or 0.92 for global
    if (alias.confirmedCount > 0 && (alias.rejectedCount || 0) === 0) {
      const minConfirmedScore = alias.isGlobal ? 0.92 : 0.95;
      if (finalScore < minConfirmedScore) {
        finalScore = minConfirmedScore;
      }
      if (alias.confirmedCount >= 2) {
        finalScore = Math.max(finalScore, 0.98);
      }
    }

    const isHighConfidence = finalScore >= this.THRESHOLD_HIGH_CONFIDENCE;
    const canAutoMatch = finalScore >= this.THRESHOLD_AUTO_MATCH && (alias.rejectedCount || 0) === 0;

    const breakdown = `Base: ${baseScore} | Confirmed (+${confirmationBonus}) | Usage (+${usageBonus}) | Recency (+${recencyBonus}) | Penalty (-${rejectionPenalty}) => ${finalScore}`;

    return {
      baseScore,
      confirmationBonus,
      usageBonus,
      recencyBonus,
      rejectionPenalty,
      finalScore,
      isHighConfidence,
      canAutoMatch,
      breakdown
    };
  }

  /**
   * Calculates an explainable confidence score for a Supplier Alias
   */
  static evaluateSupplierAlias(alias: SupplierAlias): ConfidenceExplanation {
    let baseScore = 0.90;
    if (alias.source === AliasSource.MANUAL_DECISION || alias.source === AliasSource.IMPORT_CONFIRMATION) {
      baseScore = 0.94;
    }

    const confirmationBonus = Math.min(0.05, (alias.confirmedCount || 0) * 0.025);
    const usageBonus = Math.min(0.03, (alias.usageCount || 0) * 0.005);

    let recencyBonus = 0;
    if (alias.lastUsedAt) {
      const daysSinceLastUse = (Date.now() - new Date(alias.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUse <= 30) {
        recencyBonus = 0.02;
      }
    }

    const rejectionPenalty = Math.min(0.50, (alias.rejectedCount || 0) * 0.25);

    let finalScore = baseScore + confirmationBonus + usageBonus + recencyBonus - rejectionPenalty;
    finalScore = Math.max(0.0, Math.min(1.0, Math.round(finalScore * 100) / 100));

    if (alias.confirmedCount > 0 && (alias.rejectedCount || 0) === 0) {
      finalScore = Math.max(finalScore, 0.95);
      if (alias.confirmedCount >= 2) {
        finalScore = Math.max(finalScore, 0.98);
      }
    }

    const isHighConfidence = finalScore >= this.THRESHOLD_HIGH_CONFIDENCE;
    const canAutoMatch = finalScore >= this.THRESHOLD_AUTO_MATCH && (alias.rejectedCount || 0) === 0;

    const breakdown = `Supplier Base: ${baseScore} | Confirmed (+${confirmationBonus}) | Usage (+${usageBonus}) | Recency (+${recencyBonus}) | Penalty (-${rejectionPenalty}) => ${finalScore}`;

    return {
      baseScore,
      confirmationBonus,
      usageBonus,
      recencyBonus,
      rejectionPenalty,
      finalScore,
      isHighConfidence,
      canAutoMatch,
      breakdown
    };
  }
}
