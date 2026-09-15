// src/features/purchases/services/smartImport/performance/matchingIndex.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: High-Performance Product Matching Index & Fuzzy Memoization
 * Enhanced with Strict Pharmaceutical Normalization, Dosage Safety, and Close Candidate Detection
 */

import { Product } from '@/types';
import { ProductMatchCandidate } from '../productMatchingEngine';
import { ExtractedImportRow } from '../types';
import { BoundedLRUCache } from './boundedCache';
import { ENTERPRISE_IMPORT_LIMITS } from './importLimits';
import { AliasNormalization } from '../aliasLearning/aliasNormalization';
import { NormalizedPharmaceuticalInfo } from '../aliasLearning/aliasLearning.types';

export interface PrecomputedProductEntry {
  product: Product;
  rawName: string;
  exactLowerName: string;
  normalizedName: string;
  canonicalName: string;
  barcode?: string;
  code?: string;
  normalizedBigrams: Set<string>;
  canonicalBigrams: Set<string>;
  tokens: Set<string>;
  pharmaInfo: NormalizedPharmaceuticalInfo;
}

export class ProductMatchingIndex {
  private barcodeMap: Map<string, Product> = new Map();
  private codeMap: Map<string, Product> = new Map();
  private exactNameMap: Map<string, Product> = new Map();
  private normalizedNameMap: Map<string, Product> = new Map();
  private canonicalNameMap: Map<string, Product> = new Map();
  private precomputedProducts: PrecomputedProductEntry[] = [];
  private fuzzyCache: BoundedLRUCache<string, ProductMatchCandidate | null>;

  constructor(products: Product[], cacheCapacity: number = ENTERPRISE_IMPORT_LIMITS.FUZZY_CACHE_CAPACITY) {
    this.fuzzyCache = new BoundedLRUCache<string, ProductMatchCandidate | null>({
      maxEntries: cacheCapacity,
      defaultTtlMs: 15 * 60 * 1000 // 15 mins session cache
    });

    this.buildIndex(products);
  }

  /**
   * Builds O(1) indexed maps and precomputes bigrams and pharmaceutical info for fast fuzzy matching
   */
  private buildIndex(products: Product[]): void {
    for (const p of products) {
      if (p.Is_Active === false) continue;

      const pName = (p.name || p.Name || '').trim();
      const lowerName = pName.toLowerCase();
      const normName = AliasNormalization.normalize(pName);
      const canonicalName = AliasNormalization.canonicalize(pName);
      const barcode = (p.barcode || '').trim();
      const code = (p.id || (p as any).code || p.sku || '').trim();

      // 1. Index Barcode (exact and stripped of leading zeros if applicable)
      if (barcode && !this.barcodeMap.has(barcode)) {
        this.barcodeMap.set(barcode, p);
        if (/^0+\d+$/.test(barcode)) {
          const stripped = barcode.replace(/^0+/, '');
          if (stripped && !this.barcodeMap.has(stripped)) {
            this.barcodeMap.set(stripped, p);
          }
        }
      }

      // 2. Index Product Code, ID, SKU
      if (code && !this.codeMap.has(code)) {
        this.codeMap.set(code, p);
      }
      if (p.id && !this.codeMap.has(p.id.trim())) {
        this.codeMap.set(p.id.trim(), p);
      }
      if (p.sku && !this.codeMap.has(p.sku.trim())) {
        this.codeMap.set(p.sku.trim(), p);
      }

      // 3. Index Exact Name (lower)
      if (lowerName && !this.exactNameMap.has(lowerName)) {
        this.exactNameMap.set(lowerName, p);
      }

      // 4. Index Normalized Name
      if (normName && !this.normalizedNameMap.has(normName)) {
        this.normalizedNameMap.set(normName, p);
      }

      // 5. Index Canonical Name (standardized dosage units and forms)
      if (canonicalName && !this.canonicalNameMap.has(canonicalName)) {
        this.canonicalNameMap.set(canonicalName, p);
      }

      // Precompute bigrams and pharmaceutical info for fuzzy comparisons
      const normalizedBigrams = this.extractBigrams(normName || lowerName);
      const canonicalBigrams = this.extractBigrams(canonicalName);
      const tokens = new Set((canonicalName || normName).split(' ').filter(t => t.length > 1));
      const pharmaInfo = AliasNormalization.extractPharmaceuticalInfo(pName);

      this.precomputedProducts.push({
        product: p,
        rawName: pName,
        exactLowerName: lowerName,
        normalizedName: normName,
        canonicalName,
        barcode,
        code,
        normalizedBigrams,
        canonicalBigrams,
        tokens,
        pharmaInfo
      });
    }
  }

  /**
   * Helper to extract character bigrams
   */
  private extractBigrams(str: string): Set<string> {
    const bigrams = new Set<string>();
    if (!str || str.length < 2) return bigrams;
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Computes Dice similarity between two bigram sets
   */
  private calculateDice(bigramsA: Set<string>, bigramsB: Set<string>): number {
    if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

    let intersection = 0;
    bigramsA.forEach(bg => {
      if (bigramsB.has(bg)) intersection++;
    });

    return (2.0 * intersection) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Matches a single row against the indexed product database using strict 5-tier hierarchy:
   * Barcode/Code > Exact normalized name > Alias > Strong fuzzy match > Manual review
   */
  matchRow(
    row: ExtractedImportRow,
    learnedAliases: Record<string, string> = {}
  ): ProductMatchCandidate | null {
    const rawName = (row.productName || '').trim();
    const barcode = (row.barcode || '').trim();
    const code = (row.productCode || '').trim();

    if (!rawName && !barcode && !code) return null;

    // =========================================================================
    // TIER 1: Barcode / Product Code Match - O(1)
    // =========================================================================
    if (barcode) {
      const barcodeMatch = this.barcodeMap.get(barcode) || 
        (/^0+\d+$/.test(barcode) ? this.barcodeMap.get(barcode.replace(/^0+/, '')) : undefined);
      if (barcodeMatch) {
        return { product: barcodeMatch, matchType: 'BARCODE', score: 1.0 };
      }
    }

    if (code) {
      const codeMatch = this.codeMap.get(code);
      if (codeMatch) {
        return { product: codeMatch, matchType: 'CODE', score: 0.98 };
      }
    }

    if (!rawName) return null;

    // =========================================================================
    // TIER 2: Exact & Normalized Name Match - O(1)
    // =========================================================================
    // 2a. Exact lowercase match
    const lowerRaw = rawName.toLowerCase();
    const exactNameMatch = this.exactNameMap.get(lowerRaw);
    if (exactNameMatch) {
      return { product: exactNameMatch, matchType: 'EXACT', score: 0.99 };
    }

    // 2b. Normalized Arabic/English match (hamzas, diacritics, tatweel, taa marbuta, digits)
    const normInput = AliasNormalization.normalize(rawName);
    const normNameMatch = this.normalizedNameMap.get(normInput);
    if (normNameMatch) {
      return { product: normNameMatch, matchType: 'NORMALIZED', score: 0.96 };
    }

    // 2c. Canonical Name match (standardized units: 1g = 1000mg, 500 ملجم = 500mg, tab = أقراص)
    const canonicalInput = AliasNormalization.canonicalize(rawName);
    const canonNameMatch = this.canonicalNameMap.get(canonicalInput);
    if (canonNameMatch) {
      return { product: canonNameMatch, matchType: 'NORMALIZED', score: 0.95 };
    }

    // =========================================================================
    // TIER 3: Alias Match (Learned Aliases & Synonyms)
    // =========================================================================
    if (learnedAliases && Object.keys(learnedAliases).length > 0) {
      let target = learnedAliases[rawName] || learnedAliases[normInput] || learnedAliases[canonicalInput];
      if (!target) {
        for (const [k, v] of Object.entries(learnedAliases)) {
          if (AliasNormalization.normalize(k) === normInput || AliasNormalization.canonicalize(k) === canonicalInput) {
            target = v;
            break;
          }
        }
      }

      if (target) {
        const targetLower = target.toLowerCase();
        const targetNorm = AliasNormalization.normalize(target);
        const targetCanon = AliasNormalization.canonicalize(target);

        const aliasMatch = this.exactNameMap.get(targetLower) || 
                           this.codeMap.get(target) || 
                           this.normalizedNameMap.get(targetNorm) ||
                           this.canonicalNameMap.get(targetCanon);

        if (aliasMatch) {
          return { product: aliasMatch, matchType: 'ALIAS', score: 0.93 };
        }
      }
    }

    // =========================================================================
    // TIER 4 & 5: Strong Fuzzy Match & Manual Review Fallback
    // =========================================================================
    const cacheKey = `fz:${canonicalInput || normInput}`;
    if (this.fuzzyCache.has(cacheKey)) {
      return this.fuzzyCache.get(cacheKey)!;
    }

    const inputNormBigrams = this.extractBigrams(normInput || lowerRaw);
    const inputCanonBigrams = this.extractBigrams(canonicalInput);
    const inputTokens = new Set((canonicalInput || normInput).split(' ').filter(t => t.length > 1));
    const inputPharma = AliasNormalization.extractPharmaceuticalInfo(rawName);

    let bestCandidate: PrecomputedProductEntry | null = null;
    let bestScore = 0;
    let secondCandidate: PrecomputedProductEntry | null = null;
    let secondScore = 0;

    for (const entry of this.precomputedProducts) {
      // Safety Check: Dosage & Form Mismatch Protection
      if (inputPharma.dosage && entry.pharmaInfo.dosage) {
        const safety = AliasNormalization.checkDosageAndFormSafety(rawName, entry.rawName);
        if (!safety.isSafe) {
          // Critical dosage/form conflict (e.g. 500mg vs 1000mg, or Tab vs Syrup) -> Skip!
          continue;
        }
      } else if (inputPharma.form && entry.pharmaInfo.form && inputPharma.form !== entry.pharmaInfo.form) {
        // Explicit form conflict
        continue;
      }

      // Compute similarity scores
      const canonScore = this.calculateDice(inputCanonBigrams, entry.canonicalBigrams);
      const normScore = this.calculateDice(inputNormBigrams, entry.normalizedBigrams);
      const baseScore = Math.max(canonScore, normScore);

      // Token overlap ratio
      let commonTokens = 0;
      inputTokens.forEach(t => {
        if (entry.tokens.has(t)) commonTokens++;
      });
      const tokenRatio = inputTokens.size > 0 ? commonTokens / inputTokens.size : 0;

      let score = baseScore * 0.7 + tokenRatio * 0.3;

      // Bonus if dosage is confirmed identical
      if (
        inputPharma.dosage &&
        entry.pharmaInfo.dosage &&
        inputPharma.dosage.unit === entry.pharmaInfo.dosage.unit &&
        Math.abs(inputPharma.dosage.value - entry.pharmaInfo.dosage.value) < 0.001
      ) {
        score = Math.min(1.0, score + 0.05);
      }

      if (score > bestScore) {
        secondScore = bestScore;
        secondCandidate = bestCandidate;
        bestScore = score;
        bestCandidate = entry;
      } else if (score > secondScore) {
        secondScore = score;
        secondCandidate = entry;
      }
    }

    let result: ProductMatchCandidate | null = null;

    // Strict Evaluation
    if (bestCandidate && bestScore >= 0.76) {
      // Check for close candidates (مرشحان متقاربان)
      const isCloseCandidates = 
        secondCandidate !== null &&
        secondScore >= 0.70 &&
        (bestScore - secondScore) < 0.07;

      if (isCloseCandidates) {
        // Ambiguous candidates -> Flag for manual review instead of picking wrong product!
        result = {
          product: bestCandidate.product,
          matchType: 'MANUAL_REVIEW',
          score: Math.round(bestScore * 100) / 100,
          needsReview: true,
          reviewReason: `مرشحان متقاربان يتطلبان مراجعة يدوية: (${bestCandidate.rawName} بنسبة ${Math.round(bestScore * 100)}%) و (${secondCandidate!.rawName} بنسبة ${Math.round(secondScore * 100)}%)`,
          candidateAlternatives: [
            { product: bestCandidate.product, score: Math.round(bestScore * 100) / 100 },
            { product: secondCandidate!.product, score: Math.round(secondScore * 100) / 100 }
          ]
        };
      } else if (bestScore >= 0.78 || (bestScore >= 0.75 && inputPharma.dosage && bestCandidate.pharmaInfo.dosage)) {
        // Strong decisive fuzzy match
        result = {
          product: bestCandidate.product,
          matchType: 'FUZZY',
          score: Math.round(bestScore * 100) / 100,
          needsReview: false
        };
      } else {
        // Borderline score without strong lead -> Requires manual confirmation
        result = {
          product: bestCandidate.product,
          matchType: 'MANUAL_REVIEW',
          score: Math.round(bestScore * 100) / 100,
          needsReview: true,
          reviewReason: `تطابق تقريبي غير مؤكد (${Math.round(bestScore * 100)}%) يتطلب مراجعة يدوية للتأكيد الدوائي`
        };
      }
    }

    this.fuzzyCache.set(cacheKey, result);
    return result;
  }

  /**
   * Clears internal caches
   */
  clearCache(): void {
    this.fuzzyCache.clear();
  }

  /**
   * Total indexed items
   */
  get size(): number {
    return this.precomputedProducts.length;
  }
}

