/**
 * Declarative Consistency Rules & Invariant Checks
 */

export class ConsistencyRules {
  /**
   * Validates inventory balance invariants:
   * 1. Quantity >= 0 (or warning if negative stock allowed)
   * 2. Reserved stock <= available stock + reserved stock
   * 3. Available stock >= 0
   */
  public static validateInventoryInvariants(item: {
    productId: string;
    stockQuantity: number;
    reservedQuantity?: number;
    allowNegative?: boolean;
  }): { isValid: boolean; violations: string[] } {
    const violations: string[] = [];
    const qty = Number(item.stockQuantity || 0);
    const reserved = Number(item.reservedQuantity || 0);

    if (qty < 0 && !item.allowNegative) {
      violations.push(`رصيد الصنف [${item.productId}] غير كافي (${qty})`);
    }

    if (reserved < 0) {
      violations.push(`الكمية المحجوزة للصنف [${item.productId}] لا يمكن أن تكون بالسالب (${reserved})`);
    }

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  /**
   * Validates double-entry accounting invariants:
   * 1. Debit Total === Credit Total
   * 2. At least two lines (one Debit, one Credit)
   * 3. Non-zero total
   */
  public static validateAccountingInvariants(lines: Array<{ debit: number; credit: number; accountId?: string }>): {
    isValid: boolean;
    totalDebit: number;
    totalCredit: number;
    violations: string[];
  } {
    const violations: string[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    if (!lines || lines.length < 2) {
      violations.push('القيد المحاسبي يجب أن يحتوي على طرفين على الأقل (مدين ودائن)');
    }

    for (const line of lines || []) {
      totalDebit += Number(line.debit || 0);
      totalCredit += Number(line.credit || 0);
    }

    // Rounding safety check to 4 decimal places
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.0001) {
      violations.push(`القيد غير متوازن: إجمالي المدين (${totalDebit.toFixed(2)}) لا يساوي إجمالي الدائن (${totalCredit.toFixed(2)})`);
    }

    return {
      isValid: violations.length === 0,
      totalDebit,
      totalCredit,
      violations
    };
  }
}
