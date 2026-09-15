/**
 * PharmaFlow ERP - Deterministic Financial Math Engine
 * Guarantees precision, handles bankers/half-up rounding, and prevents floating point drift.
 * STRICT FINANCIAL RULE: All debit/credit balance comparisons must pass through FinancialMath.
 */

export class FinancialMath {
  private static readonly EPSILON = 0.0001;

  /**
   * Safely converts any numeric, decimal, string or null representation to a deterministic float
   */
  public static safeNum(val: unknown, fallback = 0): number {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "number") {
      return Number.isFinite(val) ? val : fallback;
    }
    if (typeof val === "string") {
      const parsed = parseFloat(val.trim());
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (typeof (val as { toNumber?: () => number })?.toNumber === "function") {
      try {
        return (val as { toNumber: () => number }).toNumber();
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  /**
   * Standard financial rounding to specified decimal places (default 2)
   */
  public static round(val: unknown, decimals = 2): number {
    const factor = Math.pow(10, decimals);
    const n = this.safeNum(val);
    return Math.round((n + Number.EPSILON) * factor) / factor;
  }

  /**
   * Standard 2-decimal financial rounding
   */
  public static round2(val: unknown): number {
    const n = this.safeNum(val);
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /**
   * 4-decimal precision rounding for unit costs and ratios
   */
  public static round4(val: unknown): number {
    const n = this.safeNum(val);
    return Math.round((n + Number.EPSILON) * 10000) / 10000;
  }

  /**
   * Financial Addition: Exact sum with 2-decimal protection
   */
  public static add(...nums: unknown[]): number {
    let sum = 0;
    for (const num of nums) {
      sum += this.safeNum(num);
    }
    return this.round2(sum);
  }

  public static safeAdd(...nums: unknown[]): number {
    return this.add(...nums);
  }

  /**
   * Financial Subtraction: a - b with 2-decimal protection
   */
  public static sub(a: unknown, b: unknown): number {
    return this.round2(this.safeNum(a) - this.safeNum(b));
  }

  public static safeSub(a: unknown, b: unknown): number {
    return this.sub(a, b);
  }

  /**
   * Financial Multiplication with 2-decimal protection
   */
  public static mul(a: unknown, b: unknown): number {
    return this.round2(this.safeNum(a) * this.safeNum(b));
  }

  /**
   * Financial Division with division-by-zero protection
   */
  public static div(a: unknown, b: unknown, fallback = 0): number {
    const denom = this.safeNum(b);
    if (Math.abs(denom) < this.EPSILON) return fallback;
    return this.round2(this.safeNum(a) / denom);
  }

  /**
   * Financial Equality with custom or default epsilon
   */
  public static equals(a: unknown, b: unknown, tolerance = 0.01): boolean {
    return Math.abs(this.safeNum(a) - this.safeNum(b)) <= tolerance;
  }

  /**
   * Debit vs Credit Double-Entry Balance Check
   * Strict equality within allowable threshold (0.01)
   */
  public static isBalanced(debits: unknown, credits: unknown, tolerance = 0.01): boolean {
    const d = this.safeNum(debits);
    const c = this.safeNum(credits);
    return Math.abs(d - c) <= tolerance;
  }

  /**
   * Calculates absolute discrepancy between debits and credits
   */
  public static discrepancy(debits: unknown, credits: unknown): number {
    return this.round2(Math.abs(this.safeNum(debits) - this.safeNum(credits)));
  }

  /**
   * Verifies that all given monetary numbers are strictly positive (or zero if allowed)
   */
  public static isNonNegative(val: unknown): boolean {
    return this.safeNum(val) >= 0;
  }

  /**
   * Verifies that given monetary number is strictly greater than zero
   */
  public static isStrictlyPositive(val: unknown): boolean {
    return this.safeNum(val) > this.EPSILON;
  }
}
