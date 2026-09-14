// src/features/purchases/services/smartImport/aliasLearning/aliasMatchingEngine.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Multi-Tier Alias Matching Engine with Pharmaceutical Safety & Batch Preloading
 */

import { Product } from '@/types';
import { ExtractedImportRow } from '../types';
import { 
  AliasMatchCandidateResult, 
  PreloadedAliasContext,
  DosageFormSafetyResult 
} from './aliasLearning.types';
import { AliasNormalization } from './aliasNormalization';
import { ProductAliasRepository } from './productAliasRepository';
import { SupplierAliasRepository } from './supplierAliasRepository';
import { ProductMatchingEngine } from '../productMatchingEngine';

export class AliasMatchingEngine {
  /**
   * Preloads all alias context for a batch of rows in a single operation to eliminate N+1 queries
   */
  static async preloadBatchContext(
    tenantId: string,
    supplierId?: string,
    rows: ExtractedImportRow[] = []
  ): Promise<PreloadedAliasContext> {
    const rawNames = rows.map(r => r.productName || '').filter(Boolean);
    const supplierCodes = rows.map(r => r.productCode || '').filter(Boolean);

    const [supplierAliases, productAliasData] = await Promise.all([
      SupplierAliasRepository.findAliasesBatch(tenantId, rawNames),
      ProductAliasRepository.preloadBatch(tenantId, supplierId, rawNames, supplierCodes)
    ]);

    return {
      supplierAliases,
      supplierSpecificProductAliases: productAliasData.supplierSpecificAliases,
      globalProductAliases: productAliasData.globalAliases,
      catalogReferences: productAliasData.catalogReferences,
      rejections: productAliasData.rejections
    };
  }

  /**
   * Matches a single row against master products using the 8-tier hierarchy and preloaded alias Maps
   */
  static matchRow(
    row: ExtractedImportRow,
    products: Product[],
    options: {
      tenantId: string;
      supplierId?: string;
      preloaded?: PreloadedAliasContext;
    }
  ): AliasMatchCandidateResult | null {
    const rawName = (row.productName || '').trim();
    const barcode = (row.barcode || '').trim();
    const code = (row.productCode || '').trim();
    const normInput = AliasNormalization.normalize(rawName);

    if (!rawName && !barcode && !code) return null;

    const preloaded = options.preloaded;
    const productsMapById = new Map<string, Product>();
    products.forEach(p => productsMapById.set(p.id, p));

    // Helper: Checks if product candidate is in rejection memory for this alias
    const isProductRejected = (productId: string): boolean => {
      if (!preloaded?.rejections) return false;
      return preloaded.rejections.has(`${normInput}::${productId}`);
    };

    // Helper: Validates dosage and pharmaceutical form safety
    const validateSafety = (targetProduct: Product): DosageFormSafetyResult => {
      const pName = targetProduct.name || targetProduct.Name || '';
      return AliasNormalization.checkDosageAndFormSafety(rawName, pName);
    };

    // -------------------------------------------------------------
    // Tier 1: Supplier-Specific Product Alias
    // -------------------------------------------------------------
    if (preloaded?.supplierSpecificProductAliases && options.supplierId) {
      const alias = preloaded.supplierSpecificProductAliases.get(normInput);
      if (alias && alias.productId) {
        const targetProduct = productsMapById.get(alias.productId);
        if (targetProduct && !isProductRejected(targetProduct.id)) {
          const safety = validateSafety(targetProduct);
          if (safety.isSafe) {
            return {
              productId: targetProduct.id,
              productName: targetProduct.name || targetProduct.Name || '',
              matchType: 'SUPPLIER_ALIAS',
              confidence: Math.max(alias.confidence, 0.95),
              aliasId: alias.id,
              isSupplierSpecific: true,
              safetyCheck: safety
            };
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Tier 2: Global Product Alias
    // -------------------------------------------------------------
    if (preloaded?.globalProductAliases) {
      const alias = preloaded.globalProductAliases.get(normInput);
      if (alias && alias.productId) {
        const targetProduct = productsMapById.get(alias.productId);
        if (targetProduct && !isProductRejected(targetProduct.id)) {
          const safety = validateSafety(targetProduct);
          if (safety.isSafe) {
            return {
              productId: targetProduct.id,
              productName: targetProduct.name || targetProduct.Name || '',
              matchType: 'GLOBAL_ALIAS',
              confidence: Math.max(alias.confidence, 0.92),
              aliasId: alias.id,
              isSupplierSpecific: false,
              safetyCheck: safety
            };
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Tier 3: Supplier Product Catalog Reference / SKU
    // -------------------------------------------------------------
    if (code && preloaded?.catalogReferences) {
      const catRef = preloaded.catalogReferences.get(code.toUpperCase());
      if (catRef && catRef.productId) {
        const targetProduct = productsMapById.get(catRef.productId);
        if (targetProduct && !isProductRejected(targetProduct.id)) {
          const safety = validateSafety(targetProduct);
          if (safety.isSafe) {
            return {
              productId: targetProduct.id,
              productName: targetProduct.name || targetProduct.Name || '',
              matchType: 'SUPPLIER_CATALOG_REF',
              confidence: 0.96,
              aliasId: catRef.id,
              isSupplierSpecific: true,
              safetyCheck: safety
            };
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Tier 4: Exact Barcode Match (Universal Master Identifier)
    // -------------------------------------------------------------
    if (barcode) {
      const barcodeMatch = products.find(p => p.barcode && p.barcode.trim() === barcode);
      if (barcodeMatch && !isProductRejected(barcodeMatch.id)) {
        return {
          productId: barcodeMatch.id,
          productName: barcodeMatch.name || barcodeMatch.Name || '',
          matchType: 'BARCODE',
          confidence: 1.0,
          isSupplierSpecific: false,
          safetyCheck: { isSafe: true, severity: 'INFO' }
        };
      }
    }

    // -------------------------------------------------------------
    // Tier 5: Exact Internal Product Code / SKU
    // -------------------------------------------------------------
    if (code) {
      const codeMatch = products.find(p => 
        (p.id && p.id.trim() === code) || 
        ((p as any).code && (p as any).code.trim() === code) ||
        (p.sku && p.sku.trim() === code)
      );
      if (codeMatch && !isProductRejected(codeMatch.id)) {
        return {
          productId: codeMatch.id,
          productName: codeMatch.name || codeMatch.Name || '',
          matchType: 'CODE',
          confidence: 0.98,
          isSupplierSpecific: false,
          safetyCheck: { isSafe: true, severity: 'INFO' }
        };
      }
    }

    // -------------------------------------------------------------
    // Tier 6: Normalized Name Match
    // -------------------------------------------------------------
    if (normInput) {
      const normMatch = products.find(p => {
        const pNorm = AliasNormalization.normalize(p.name || p.Name || '');
        return pNorm === normInput;
      });
      if (normMatch && !isProductRejected(normMatch.id)) {
        const safety = validateSafety(normMatch);
        if (safety.isSafe) {
          return {
            productId: normMatch.id,
            productName: normMatch.name || normMatch.Name || '',
            matchType: 'NORMALIZED',
            confidence: 0.95,
            isSupplierSpecific: false,
            safetyCheck: safety
          };
        }
      }
    }

    // -------------------------------------------------------------
    // Tier 7: Fuzzy Similarity Match with Dosage & Rejection Safety
    // -------------------------------------------------------------
    let bestFuzzy: Product | null = null;
    let bestScore = 0;
    let bestSafety: DosageFormSafetyResult = { isSafe: true };

    for (const p of products) {
      if (isProductRejected(p.id)) continue;

      const pName = p.name || p.Name || '';
      const score = ProductMatchingEngine.calculateSimilarity(rawName, pName);

      if (score > bestScore) {
        const safety = validateSafety(p);
        // Only accept candidate if dosage is safe or if score is high without critical collision
        if (safety.isSafe) {
          bestScore = score;
          bestFuzzy = p;
          bestSafety = safety;
        }
      }
    }

    if (bestFuzzy && bestScore >= 0.70) {
      return {
        productId: bestFuzzy.id,
        productName: bestFuzzy.name || bestFuzzy.Name || '',
        matchType: 'FUZZY',
        confidence: Math.round(bestScore * 100) / 100,
        isSupplierSpecific: false,
        safetyCheck: bestSafety
      };
    }

    return null;
  }

  /**
   * Matches all rows in batch mode with O(1) in-memory lookups
   */
  static async matchAllRows(
    rows: ExtractedImportRow[],
    products: Product[],
    options: {
      tenantId: string;
      supplierId?: string;
      preloaded?: PreloadedAliasContext;
    }
  ): Promise<ExtractedImportRow[]> {
    const preloaded = options.preloaded || (await this.preloadBatchContext(options.tenantId, options.supplierId, rows));

    return rows.map(row => {
      const result = this.matchRow(row, products, {
        tenantId: options.tenantId,
        supplierId: options.supplierId,
        preloaded
      });

      if (result) {
        return {
          ...row,
          matchedProductId: result.productId,
          matchedProductName: result.productName,
          matchType: result.matchType as any,
          matchScore: result.confidence,
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
            'صنف غير مسجل في قاعدة البيانات أو لم يتم العثور على اسم بديل مطابق'
          ]
        };
      }
    });
  }
}
