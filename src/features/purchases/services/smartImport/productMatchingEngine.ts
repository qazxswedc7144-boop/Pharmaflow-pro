// src/features/purchases/services/smartImport/productMatchingEngine.ts
import { db } from '@/core/db';
import { Product } from '@/types';
import { ExtractedImportRow } from './types';
import { ColumnIntelligence } from './columnIntelligence';

export interface ProductMatchCandidate {
  product: Product;
  matchType: 'EXACT' | 'NORMALIZED' | 'BARCODE' | 'CODE' | 'ALIAS' | 'FUZZY';
  score: number;
}

export class ProductMatchingEngine {
  /**
   * Computes string similarity between 0.0 and 1.0
   */
  static calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    const a = ColumnIntelligence.normalizeHeader(str1);
    const b = ColumnIntelligence.normalizeHeader(str2);
    if (a === b) return 1.0;

    // Bigram / Dice Coefficient
    if (a.length < 2 || b.length < 2) return 0;

    const getBigrams = (str: string) => {
      const bigrams = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
      }
      return bigrams;
    };

    const bigramsA = getBigrams(a);
    const bigramsB = getBigrams(b);
    let intersection = 0;

    bigramsA.forEach(bg => {
      if (bigramsB.has(bg)) intersection++;
    });

    return (2.0 * intersection) / (bigramsA.size + bigramsB.size);
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
   * Matches a single row against the scoped products pool using 6-tier hierarchy
   */
  static matchItem(
    row: ExtractedImportRow,
    products: Product[],
    learnedAliases: Record<string, string> = {}
  ): ProductMatchCandidate | null {
    const rawName = (row.productName || '').trim();
    const barcode = (row.barcode || '').trim();
    const code = (row.productCode || '').trim();

    if (!rawName && !barcode && !code) return null;

    // Tier 1: Exact Barcode match
    if (barcode) {
      const barcodeMatch = products.find(p => p.barcode && p.barcode.trim() === barcode);
      if (barcodeMatch) {
        return { product: barcodeMatch, matchType: 'BARCODE', score: 1.0 };
      }
    }

    // Tier 2: Exact Product Code match
    if (code) {
      const codeMatch = products.find(p => (p.id && p.id.trim() === code) || ((p as any).code && (p as any).code.trim() === code));
      if (codeMatch) {
        return { product: codeMatch, matchType: 'CODE', score: 0.98 };
      }
    }

    // Tier 3: Exact Name Match
    const exactNameMatch = products.find(p => {
      const pName = (p.name || p.Name || '').trim();
      return pName.toLowerCase() === rawName.toLowerCase();
    });
    if (exactNameMatch) {
      return { product: exactNameMatch, matchType: 'EXACT', score: 0.99 };
    }

    // Tier 4: Normalized Name Match
    const normInput = ColumnIntelligence.normalizeHeader(rawName);
    const normNameMatch = products.find(p => {
      const pNorm = ColumnIntelligence.normalizeHeader(p.name || p.Name || '');
      return pNorm === normInput;
    });
    if (normNameMatch) {
      return { product: normNameMatch, matchType: 'NORMALIZED', score: 0.95 };
    }

    // Tier 5: Learned Alias Match
    if (learnedAliases) {
      const target = learnedAliases[rawName] || learnedAliases[normInput];
      if (target) {
        const targetNorm = ColumnIntelligence.normalizeHeader(target);
        const aliasMatch = products.find(p => {
          const pName = p.name || p.Name || '';
          return (
            pName.toLowerCase() === target.toLowerCase() ||
            p.id === target ||
            ColumnIntelligence.normalizeHeader(pName) === targetNorm
          );
        });
        if (aliasMatch) {
          return { product: aliasMatch, matchType: 'ALIAS', score: 0.92 };
        }
      }
    }

    // Tier 6: Fuzzy Similarity Match (Threshold > 0.70)
    let bestFuzzy: Product | null = null;
    let bestScore = 0;

    for (const p of products) {
      const pName = p.name || p.Name || '';
      const score = this.calculateSimilarity(rawName, pName);
      if (score > bestScore) {
        bestScore = score;
        bestFuzzy = p;
      }
    }

    if (bestFuzzy && bestScore >= 0.70) {
      return { product: bestFuzzy, matchType: 'FUZZY', score: Math.round(bestScore * 100) / 100 };
    }

    return null;
  }

  /**
   * Processes an array of rows and enriches them with product matching information
   */
  static matchAllRows(
    rows: ExtractedImportRow[],
    products: Product[],
    learnedAliases: Record<string, string> = {}
  ): ExtractedImportRow[] {
    return rows.map(row => {
      const candidate = this.matchItem(row, products, learnedAliases);
      if (candidate) {
        return {
          ...row,
          matchedProductId: candidate.product.id,
          matchedProductName: candidate.product.name || candidate.product.Name,
          matchType: candidate.matchType,
          matchScore: candidate.score,
          isNewProductCandidate: false
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
