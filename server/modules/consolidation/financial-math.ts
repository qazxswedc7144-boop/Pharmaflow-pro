// server/modules/financial/financial-math.ts
// HARDENED VERSION — Drop-in compatible with existing callers.

export class FinancialError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'FinancialError';
  }
}

export interface FinancialMathOptions {
  /** إذا true (افتراضي في الإنتاج): يرفض أي مدخل غير صالح بدل إرجاع 0 */
  strict?: boolean;
  /** منازل عشرية حسب العملة (0 لـ YER، 2 لـ USD/SAR، 3 لـ KWD) */
  decimals?: number;
}

export class FinancialMath {
  /**
   * ⚠️ هذا الرقم يستخدم فقط في مقارنات "قريب من الصفر" الحسابية،
   * وليس في التحقق من التوازن المحاسبي. التحقق من التوازن يستخدم
   * toMinorUnits() لمقارنة دقيقة على مستوى أصغر وحدة نقدية.
   */
  private static readonly EPSILON = 1e-9;
  private static readonly HALF_SNAP = 1e-9;
  private static readonly DEFAULT_DECIMALS = 2;
  private static strict = true;

  /** للتفعيل في الإنتاج، والتعطيل في اختبارات legacy */
  public static setStrict(strict: boolean): void { this.strict = strict; }

  // ─────────────────────────────────────────────────────────────
  // Core conversion
  // ─────────────────────────────────────────────────────────────

  /**
   * تحويل آمن — يفشل بصوت عالٍ بدل الرجوع الصامت إلى 0.
   * - `null` / `undefined` → 0 صراحةً (مسموح: يعني "لا يوجد مبلغ")
   * - `NaN` / `Infinity` / نص ملوث / نص فارغ → يُرفض في الوضع strict
   * - `Decimal` كبير → يُرفض (لا يمكن تحويله بدون فقدان دقة)
   */
  public static safeNum(val: unknown, fallback = 0): number {
    if (val === null || val === undefined) return fallback;

    if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        if (this.strict) throw new FinancialError('INVALID_NUMBER', `قيمة رقمية غير صالحة: ${val}`);
        return fallback;
      }
      return val;
    }

    if (typeof val === 'bigint') {
      if (this.strict && (val > BigInt(Number.MAX_SAFE_INTEGER) || val < BigInt(Number.MIN_SAFE_INTEGER))) {
        throw new FinancialError('PRECISION_LOSS', `BigInt خارج النطاق الآمن: ${val}`);
      }
      return Number(val);
    }

    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') {
        if (this.strict) throw new FinancialError('EMPTY_STRING', 'سلسلة فارغة غير مسموحة كمبلغ');
        return fallback;
      }
      // نرفض الصيغ العلمية والنصوص الملوثة
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        if (this.strict) throw new FinancialError('MALFORMED_NUMBER', `صيغة رقمية غير صالحة: "${val}"`);
        return fallback;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        if (this.strict) throw new FinancialError('MALFORMED_NUMBER', `تعذّر تحويل: "${val}"`);
        return fallback;
      }
      return parsed;
    }

    // Prisma.Decimal / Decimal.js / أي كائن يحمل toNumber() أو toString()
    if (typeof (val as any)?.toNumber === 'function') {
      const asStr = String(val);
      // إذا كان Decimal يحمل كسوراً أكبر من 2 منازل → خطر فقدان دقة
      if (this.strict && /\.\d{3,}/.test(asStr)) {
        throw new FinancialError('PRECISION_LOSS',
          `Decimal يحمل أكثر من منزلتين: ${asStr}. حوّله عبر Money.fromDecimal.`);
      }
      const n = (val as any).toNumber();
      if (!Number.isFinite(n)) {
        if (this.strict) throw new FinancialError('INVALID_DECIMAL', `Decimal غير صالح: ${asStr}`);
        return fallback;
      }
      return n;
    }

    if (this.strict) {
      throw new FinancialError('UNSUPPORTED_TYPE', `نوع غير مدعوم: ${typeof val}`);
    }
    return fallback;
  }

  // ─────────────────────────────────────────────────────────────
  // Rounding — half-away-from-zero, يُصلح drift الـ float
  // ─────────────────────────────────────────────────────────────

  public static round(val: unknown, decimals = this.DEFAULT_DECIMALS): number {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
      throw new FinancialError('INVALID_DECIMALS', `عدد المنازل غير صالح: ${decimals}`);
    }
    const n = this.safeNum(val);
    if (n === 0) return 0;

    const sign = n < 0 ? -1 : 1;
    const abs = Math.abs(n);
    const factor = Math.pow(10, decimals);
    const scaled = abs * factor;
    const floor = Math.floor(scaled);
    const frac = scaled - floor;

    let roundedAbs: number;
    // ✅ Snap للقيم "قريبة جداً من .5" لمعالجة 1.005، 2.675، إلخ
    if (Math.abs(frac - 0.5) < this.HALF_SNAP) {
      roundedAbs = floor + 1;             // half-away-from-zero
    } else if (Math.abs(frac) < this.HALF_SNAP) {
      roundedAbs = floor;
    } else {
      roundedAbs = Math.round(scaled);
    }

    return (sign * roundedAbs) / factor;
  }

  public static round2(val: unknown): number { return this.round(val, 2); }
  public static round4(val: unknown): number { return this.round(val, 4); }

  // ─────────────────────────────────────────────────────────────
  // Arithmetic — كل عملية تُرجع قيمة مُقرّبة بـ round2
  // ─────────────────────────────────────────────────────────────

  public static add(...nums: unknown[]): number {
    let sum = 0;
    for (const num of nums) sum += this.safeNum(num);
    return this.round2(sum);
  }
  public static safeAdd(...nums: unknown[]): number { return this.add(...nums); }

  public static sub(a: unknown, b: unknown): number {
    return this.round2(this.safeNum(a) - this.safeNum(b));
  }
  public static safeSub(a: unknown, b: unknown): number { return this.sub(a, b); }

  public static mul(a: unknown, b: unknown): number {
    return this.round2(this.safeNum(a) * this.safeNum(b));
  }

  public static div(a: unknown, b: unknown, fallback = 0): number {
    const denom = this.safeNum(b);
    if (Math.abs(denom) < this.EPSILON) {
      if (this.strict) throw new FinancialError('DIVISION_BY_ZERO', 'قسمة على صفر');
      return fallback;
    }
    return this.round2(this.safeNum(a) / denom);
  }

  /**
   * توزيع مبلغ على نسب بدون فقدان هللة.
   * مثال: allocate(100.00, [1,1,1]) → [33.34, 33.33, 33.33]
   * (يوزع الباقي على أول عنصر — يمكن تغييره)
   */
  public static allocate(amount: unknown, ratios: number[]): number[] {
    const total = this.safeNum(amount);
    const ratioSum = ratios.reduce((s, r) => s + this.safeNum(r), 0);
    if (ratioSum <= 0) throw new FinancialError('INVALID_RATIOS', 'مجموع النسب يجب أن يكون موجباً');

    const totalMinor = this.toMinorUnits(total);
    let allocated = 0n;
    const result: number[] = [];
    for (let i = 0; i < ratios.length; i++) {
      if (i === ratios.length - 1) {
        // آخر عنصر يحصل على الباقي لضمان عدم فقدان هللة
        result.push(this.fromMinorUnits(totalMinor - allocated));
        break;
      }
      const share = (totalMinor * BigInt(Math.round(ratios[i] * 1e6))) / BigInt(Math.round(ratioSum * 1e6));
      allocated += share;
      result.push(this.fromMinorUnits(share));
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Verification — التحقق المحاسبي الصارم
  // ─────────────────────────────────────────────────────────────

  /**
   * ✅ التحقق الدقيق: يُحوّل القيمتين إلى أصغر وحدة نقدية ويقارن bigint.
   * لا يوجد tolerance. لا يوجد epsilon. توازن أو لا توازن.
   */
  public static isBalanced(debits: unknown, credits: unknown): boolean {
    return this.toMinorUnits(debits) === this.toMinorUnits(credits);
  }

  /**
   * الفرق الفعلي بوحدات أصغر الوحدة النقدية (هللات).
   * مثال: discrepancyMinor(100.00, 99.99) = 1n
   * إذا كان الهدف 0، فالنظام متوازن.
   */
  public static discrepancyMinor(debits: unknown, credits: unknown): bigint {
    return this.toMinorUnits(debits) - this.toMinorUnits(credits);
  }

  /**
   * للتوافق العكسي مع المستدعين القدامى — يُرجع number.
   * ⚠️ يُفضَّل استخدام discrepancyMinor في الكود الجديد.
   */
  public static discrepancy(debits: unknown, credits: unknown): number {
    return Math.abs(Number(this.discrepancyMinor(debits, credits))) / 100;
  }

  /** مقارنة دقيقة — تقبل tolerance اختيارياً للتوافق فقط */
  public static equals(a: unknown, b: unknown, toleranceMinor = 0n): boolean {
    const diff = this.toMinorUnits(a) - this.toMinorUnits(b);
    const absDiff = diff < 0n ? -diff : diff;
    return absDiff <= toleranceMinor;
  }

  // ─────────────────────────────────────────────────────────────
  // Sign checks — متسقة
  // ─────────────────────────────────────────────────────────────

  public static isNonNegative(val: unknown): boolean {
    return this.toMinorUnits(val) >= 0n;
  }
  public static isStrictlyPositive(val: unknown): boolean {
    return this.toMinorUnits(val) > 0n;
  }
  public static isZero(val: unknown): boolean {
    return this.toMinorUnits(val) === 0n;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal: تحويل float/string إلى BigInt بوحدات صغرى
  // ─────────────────────────────────────────────────────────────

  /**
   * يحوّل إلى أصغر وحدة نقدية (هللة) بدقة تامة.
   * يستخدم string representation لتجنب * 100 float artifacts.
   */
  private static toMinorUnits(val: unknown): bigint {
    const rounded = this.round2(val);
    if (rounded === 0) return 0n;

    const negative = rounded < 0;
    // toFixed(2) بعد round2 يعطي تمثيلاً نظيفاً
    const abs = Math.abs(rounded).toFixed(2);
    const [intPart, fracPart] = abs.split('.');
    const minor = BigInt(intPart) * 100n + BigInt(fracPart || '0');
    return negative ? -minor : minor;
  }

  private static fromMinorUnits(minor: bigint): number {
    return Number(minor) / 100;
  }
}
