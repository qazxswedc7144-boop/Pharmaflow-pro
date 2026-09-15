// server/modules/consolidation/financial-math.ts
// Deterministic Financial Arithmetic and Precision Protection Engine

import { Prisma } from "@prisma/client";

export class FinancialMath {
  private static readonly EPSILON = 0.0001;

  /**
   * Safely converts any numeric, decimal, string or null representation to a deterministic float
   */
  public static safeNum(val: any, fallback = 0): number {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "number") {
      return Number.isFinite(val) ? val : fallback;
    }
    if (typeof val === "string") {
      const parsed = parseFloat(val.trim());
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (val instanceof Prisma.Decimal) {
      return val.toNumber();
    }
    if (typeof val?.toNumber === "function") {
      return val.toNumber();
    }
    return fallback;
  }

  /**
   * Standard financial rounding to specified decimal places (default 2)
   */
  public static round(val: any, decimals = 2): number {
    const factor = Math.pow(10, decimals);
    const n = this.safeNum(val);
    return Math.round((n + Number.EPSILON) * factor) / factor;
  }

  /**
   * Standard 2-decimal financial rounding (Bankers / Half-Up deterministic)
   * Prevents standard JS floating point drift (e.g. 0.1 + 0.2 = 0.30000000000000004)
   */
  public static round2(val: any): number {
    const n = this.safeNum(val);
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /**
   * 4-decimal precision rounding for unit costs and currency exchange ratios
   */
  public static round4(val: any): number {
    const n = this.safeNum(val);
    return Math.round((n + Number.EPSILON) * 10000) / 10000;
  }

  /**
   * Financial Addition: Exact sum with 2-decimal protection
   */
  public static add(...nums: any[]): number {
    let sum = 0;
    for (const num of nums) {
      sum += this.safeNum(num);
    }
    return this.round2(sum);
  }

  /**
   * Financial Subtraction: Exact difference with 2-decimal protection
   */
  public static sub(a: any, b: any): number {
    return this.round2(this.safeNum(a) - this.safeNum(b));
  }

  /**
   * Financial Multiplication: Exact product with 2-decimal protection
   */
  public static mul(a: any, b: any): number {
    return this.round2(this.safeNum(a) * this.safeNum(b));
  }

  /**
   * Financial Division: Exact quotient with division-by-zero safeguard
   */
  public static div(a: any, b: any, fallback = 0): number {
    const divisor = this.safeNum(b);
    if (Math.abs(divisor) < this.EPSILON) {
      return fallback;
    }
    return this.round2(this.safeNum(a) / divisor);
  }

  /**
   * Evaluates if two financial figures balance within standard acceptable audit tolerance ($0.01)
   */
  public static isBalanced(a: any, b: any, tolerance = 0.01): boolean {
    const diff = Math.abs(this.safeNum(a) - this.safeNum(b));
    return diff <= tolerance;
  }

  /**
   * Alias for isBalanced for semantic equality checks
   */
  public static equals(a: any, b: any, tolerance = 0.01): boolean {
    return this.isBalanced(a, b, tolerance);
  }

  /**
   * Computes the absolute discrepancy between two numbers
   */
  public static discrepancy(a: any, b: any): number {
    return this.round2(Math.abs(this.safeNum(a) - this.safeNum(b)));
  }
}
