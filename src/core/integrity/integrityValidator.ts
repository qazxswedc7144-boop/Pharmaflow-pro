import { db } from '@/core/db';
import { ConsistencyRules } from './consistencyRules';
import { InventoryConsistencyReport, AccountingConsistencyReport } from './types';

/**
 * Inventory Consistency Validator
 */
export class InventoryConsistencyValidator {
  /**
   * Validates inventory invariants before committing a sale or adjustment
   */
  public static async validateBeforeCommit(items: Array<{ productId?: string; name?: string; quantity: number }>): Promise<void> {
    for (const item of items) {
      if (!item.productId && !item.name) continue;

      let currentStock = 0;
      if (item.productId && typeof indexedDB !== 'undefined' && db.products) {
        const prod = await db.products.get(item.productId);
        if (prod) currentStock = prod.StockQuantity || prod.stockQuantity || 0;
      }

      const report = ConsistencyRules.validateInventoryInvariants({
        productId: item.productId || item.name || 'unknown',
        stockQuantity: currentStock - item.quantity
      });

      if (!report.isValid) {
        throw new Error(`فشل التحقق من سلامة المخزون: ${report.violations.join('; ')}`);
      }
    }
  }

  /**
   * Detects inventory drift (difference between recorded balance and sum of movements)
   */
  public static async detectDrift(productId: string, branchId = 'main'): Promise<InventoryConsistencyReport> {
    let stockQuantity = 0;
    let movementSum = 0;
    const violations: string[] = [];

    try {
      if (typeof indexedDB !== 'undefined' && db.products) {
        const prod = await db.products.get(productId);
        if (prod) stockQuantity = prod.StockQuantity || prod.stockQuantity || 0;
      }

      if (typeof indexedDB !== 'undefined' && db.inventoryTransactions) {
        const movements = await db.inventoryTransactions.where('productId').equals(productId).toArray();
        for (const m of movements) {
          const qty = Number(m.quantity || m.qty || 0);
          const type = String(m.type || '').toUpperCase();
          if (type.includes('IN') || type.includes('PURCHASE') || type.includes('RETURN_IN')) {
            movementSum += Math.abs(qty);
          } else if (type.includes('OUT') || type.includes('SALE') || type.includes('RETURN_OUT')) {
            movementSum -= Math.abs(qty);
          } else if (type.includes('ADJUSTMENT')) {
            movementSum += qty;
          }
        }
      }
    } catch (err) {
      console.warn('[InventoryConsistencyValidator] Drift detection check limited:', err);
    }

    const drift = stockQuantity - movementSum;
    const negativeStock = stockQuantity < 0;

    if (negativeStock) {
      violations.push(`رصيد الصنف [${productId}] بالسالب (${stockQuantity})`);
    }

    if (Math.abs(drift) > 0.001) {
      violations.push(`انحراف في حركة المخزون للصنف [${productId}]: المسجل (${stockQuantity}) != مجموع الحركات (${movementSum})`);
    }

    return {
      isValid: violations.length === 0,
      productId,
      branchId,
      stockQuantity,
      movementSum,
      drift,
      negativeStock,
      violations
    };
  }
}

/**
 * Accounting Consistency Validator
 */
export class AccountingConsistencyValidator {
  /**
   * Validates journal entry double-entry balance before saving
   */
  public static validateJournalBalance(lines: Array<{ debit: number; credit: number; accountId?: string }>): AccountingConsistencyReport {
    const res = ConsistencyRules.validateAccountingInvariants(lines);
    return {
      isValid: res.isValid,
      totalDebit: res.totalDebit,
      totalCredit: res.totalCredit,
      isBalanced: res.isValid,
      duplicateEntries: [],
      violations: res.violations
    };
  }

  /**
   * Generates a deterministic fingerprint for a journal entry to prevent duplicate posting
   */
  public static generateJournalFingerprint(entry: {
    sourceId?: string;
    sourceType?: string;
    description?: string;
    lines: Array<{ accountId: string; debit: number; credit: number }>;
  }): string {
    const normalizedLines = (entry.lines || [])
      .map((l) => `${l.accountId}:${Number(l.debit || 0).toFixed(2)}:${Number(l.credit || 0).toFixed(2)}`)
      .sort()
      .join('|');

    const str = `${entry.sourceType || 'manual'}:${entry.sourceId || 'nosource'}:${normalizedLines}`;

    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
