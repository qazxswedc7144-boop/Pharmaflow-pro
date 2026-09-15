// src/features/purchases/services/smartImport/productMatchingEngine.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: High-Performance Product Matching Engine with Indexed Lookup & Fuzzy Memoization
 * Enhanced with Strict Pharmaceutical Normalization, Dosage Safety, and Close Candidate Detection
 */

import { db } from '@/core/db';
import { Product } from '@/types';
import { ExtractedImportRow } from './types';
import { ProductMatchingIndex } from './performance/matchingIndex';
import { AliasNormalization } from './aliasLearning/aliasNormalization';

export interface ProductMatchCandidate {
  product: Product;
  matchType: 'EXACT' | 'NORMALIZED' | 'BARCODE' | 'CODE' | 'ALIAS' | 'FUZZY' | 'MANUAL_REVIEW';
  score: number;
  needsReview?: boolean;
  reviewReason?: string;
  candidateAlternatives?: Array<{ product: Product; score: number }>;
}

export class ProductMatchingEngine {
  /**
   * Computes string similarity between 0.0 and 1.0 (Dice Coefficient with canonical & normalized forms)
   */
  static calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const norm1 = AliasNormalization.normalize(str1);
    const norm2 = AliasNormalization.normalize(str2);
    if (norm1 === norm2) return 1.0;

    const canon1 = AliasNormalization.canonicalize(str1);
    const canon2 = AliasNormalization.canonicalize(str2);
    if (canon1 === canon2) return 1.0;

    const getBigrams = (str: string) => {
      const bigrams = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
      }
      return bigrams;
    };

    const bigramsNorm1 = getBigrams(norm1);
    const bigramsNorm2 = getBigrams(norm2);
    let intersectNorm = 0;
    bigramsNorm1.forEach(bg => {
      if (bigramsNorm2.has(bg)) intersectNorm++;
    });
    const scoreNorm = (bigramsNorm1.size + bigramsNorm2.size) > 0 
      ? (2.0 * intersectNorm) / (bigramsNorm1.size + bigramsNorm2.size) 
      : 0;

    const bigramsCanon1 = getBigrams(canon1);
    const bigramsCanon2 = getBigrams(canon2);
    let intersectCanon = 0;
    bigramsCanon1.forEach(bg => {
      if (bigramsCanon2.has(bg)) intersectCanon++;
    });
    const scoreCanon = (bigramsCanon1.size + bigramsCanon2.size) > 0 
      ? (2.0 * intersectCanon) / (bigramsCanon1.size + bigramsCanon2.size) 
      : 0;

    return Math.max(scoreNorm, scoreCanon);
  }

  /**
   * Loads active products strictly filtered by tenant/branch
   */
  static async loadScopedProducts(tenantId?: string, branchId?: string): Promise<Product[]> {
    try {
      const all = await db.getProducts();
      return all.filter(p => {
        if (p.Is_Active === false) return false;
        if (tenantId && (p as any).tenantId && (p as any).tenantId !== tenantId) return false;
        if (branchId && p.branchId && p.branchId !== branchId) return false;
        return true;
      });
    } catch (err) {
      console.warn("Could not load products from db for smart matching, returning empty array", err);
      return [];
    }
  }

  /**
   * Matches a single row against the scoped products pool using strict 5-tier hierarchy
   * Barcode/Code > Exact normalized name > Alias > Strong fuzzy match > Manual review
   */
  static matchItem(
    row: ExtractedImportRow,
    products: Product[],
    learnedAliases: Record<string, string> = {}
  ): ProductMatchCandidate | null {
    const index = new ProductMatchingIndex(products);
    return index.matchRow(row, learnedAliases);
  }

  /**
   * High-performance batch product matching with pre-indexed search and fuzzy memoization
   */
  static matchAllRows(
    rows: ExtractedImportRow[],
    products: Product[],
    learnedAliases: Record<string, string> = {}
  ): ExtractedImportRow[] {
    const index = new ProductMatchingIndex(products);

    return rows.map(row => {
      const candidate = index.matchRow(row, learnedAliases);
      if (candidate) {
        const isReview = candidate.needsReview || candidate.matchType === 'MANUAL_REVIEW';
        return {
          ...row,
          matchedProductId: candidate.product.id,
          matchedProductName: candidate.product.name || candidate.product.Name || '',
          matchType: candidate.matchType,
          matchScore: candidate.score,
          isNewProductCandidate: false,
          needsReview: isReview ? true : row.needsReview,
          reviewReason: isReview ? candidate.reviewReason : row.reviewReason,
          candidateAlternatives: candidate.candidateAlternatives?.map(a => ({
            productId: a.product.id,
            productName: a.product.name || a.product.Name || '',
            score: a.score
          })),
          status: isReview ? 'WARNING' : row.status,
          validationIssues: isReview
            ? [...row.validationIssues, candidate.reviewReason || 'صنف يتطلب مراجعة يدوية لتأكيد المطابقة']
            : row.validationIssues
        };
      } else {
        return {
          ...row,
          matchedProductId: undefined,
          matchedProductName: undefined,
          matchType: 'NONE',
          matchScore: 0,
          isNewProductCandidate: true,
          validationIssues: [
            ...row.validationIssues,
            'صنف جديد غير مسجل في قاعدة البيانات الحالية'
          ]
        };
      }
    });
  }
}

