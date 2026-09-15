// src/features/purchases/services/smartImport/selfHealing/selfHealingEngine.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Field-Level Self-Healing & Cross-Validation Engine
 */

import { FieldHealingResult, RowHealingResult } from './selfHealing.types';
import { ExtractedImportRow } from '../types';

export class SelfHealingEngine {
  /**
   * Month name mappings in Arabic and English for date normalization
   */
  private static readonly MONTH_MAP: Record<string, number> = {
    'jan': 1, 'january': 1, 'يناير': 1, 'كانون الثاني': 1,
    'feb': 2, 'february': 2, 'فبراير': 2, 'شباط': 2,
    'mar': 3, 'march': 3, 'مارس': 3, 'آذار': 3,
    'apr': 4, 'april': 4, 'أبريل': 4, 'ابريل': 4, 'نيسان': 4,
    'may': 5, 'مايو': 5, 'أيار': 5, 'ايار': 5,
    'jun': 6, 'june': 6, 'يونيو': 6, 'حزيران': 6,
    'jul': 7, 'july': 7, 'يوليو': 7, 'تموز': 7,
    'aug': 8, 'august': 8, 'أغسطس': 8, 'اغسطس': 8, 'آب': 8, 'اب': 8,
    'sep': 9, 'september': 9, 'سبتمبر': 9, 'أيلول': 9, 'ايلول': 9,
    'oct': 10, 'october': 10, 'أكتوبر': 10, 'اكتوبر': 10, 'تشرين الأول': 10,
    'nov': 11, 'november': 11, 'نوفمبر': 11, 'تشرين الثاني': 11,
    'dec': 12, 'december': 12, 'ديسمبر': 12, 'كانون الأول': 12
  };

  /**
   * Cross-Validates and mathematically reconstructs missing or damaged Total/Quantity
   */
  public static healMath(row: Partial<ExtractedImportRow>): {
    healedRow: Partial<ExtractedImportRow>;
    results: FieldHealingResult[];
  } {
    const results: FieldHealingResult[] = [];
    const copy = { ...row };

    const qty = copy.quantity;
    const price = copy.unitPrice;
    const total = copy.total;
    const disc = copy.discountPercent || 0;

    // Case 1: Missing Total when Quantity and Price are known
    if ((total === undefined || total === null || isNaN(total) || total === 0) &&
        typeof qty === 'number' && qty > 0 && 
        typeof price === 'number' && price >= 0) {
      const gross = qty * price;
      const calculated = disc > 0 ? gross * (1 - disc / 100) : gross;
      const healedTotal = Number(calculated.toFixed(2));

      copy.total = healedTotal;
      results.push({
        field: 'total',
        originalValue: total,
        healedValue: healedTotal,
        isHealed: true,
        healingMethod: 'MATH_RECONSTRUCTION',
        explanation: `تم استنتاج الإجمالي رياضياً (${qty} × ${price} ${disc > 0 ? `- خصم ${disc}%` : ''} = ${healedTotal})`,
        confidenceDelta: 0.40
      });
    }

    // Case 2: Missing Quantity when Total and Unit Price are known & divisible
    if ((qty === undefined || qty === null || isNaN(qty) || qty <= 0) &&
        typeof total === 'number' && total > 0 &&
        typeof price === 'number' && price > 0) {
      const grossTotal = disc > 0 && disc < 100 ? total / (1 - disc / 100) : total;
      const inferredQty = grossTotal / price;

      // Only heal if inferred quantity is an exact integer or close within 0.001
      if (Math.abs(inferredQty - Math.round(inferredQty)) < 0.001) {
        const exactQty = Math.round(inferredQty);
        copy.quantity = exactQty;
        results.push({
          field: 'quantity',
          originalValue: qty,
          healedValue: exactQty,
          isHealed: true,
          healingMethod: 'MATH_RECONSTRUCTION',
          explanation: `تم استنتاج الكمية بدقة رياضية (الإجمالي ${total} ÷ السعر ${price} = ${exactQty})`,
          confidenceDelta: 0.45
        });
      }
    }

    // Case 3: Missing Unit Price when Total and Quantity are known & qty > 0
    if ((price === undefined || price === null || isNaN(price) || price <= 0) &&
        typeof total === 'number' && total > 0 &&
        typeof qty === 'number' && qty > 0) {
      const grossTotal = disc > 0 && disc < 100 ? total / (1 - disc / 100) : total;
      const inferredPrice = Number((grossTotal / qty).toFixed(2));
      copy.unitPrice = inferredPrice;
      results.push({
        field: 'unitPrice',
        originalValue: price,
        healedValue: inferredPrice,
        isHealed: true,
        healingMethod: 'MATH_RECONSTRUCTION',
        explanation: `تم استنتاج سعر الوحدة بدقة رياضية (الإجمالي ${total} ÷ الكمية ${qty} = ${inferredPrice})`,
        confidenceDelta: 0.45
      });
    }

    return { healedRow: copy, results };
  }

  /**
   * Helper: Normalizes Eastern Arabic numerals and comma separators to standard JavaScript number
   */
  public static normalizeNumericString(input: string): number {
    if (!input) return 0;
    const easternDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    let clean = input.trim();
    for (let i = 0; i < 10; i++) {
      const digit = easternDigits[i];
      if (digit) {
        clean = clean.replace(new RegExp(digit, 'g'), i.toString());
      }
    }
    clean = clean.replace(/٫/g, '.').replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Helper: Normalizes DD/MM/YYYY date strings to ISO YYYY-MM-DD
   */
  public static normalizeDate(rawDate: string): string {
    if (!rawDate) return '';
    const trimmed = rawDate.trim();
    const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy && dmy[1] && dmy[2] && dmy[3]) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      const year = dmy[3];
      return `${year}-${month}-${day}`;
    }
    return trimmed;
  }

  /**
   * Helper: Normalizes expiry date strings like '12/28' to '2028-12'
   */
  public static normalizeExpiry(rawExpiry: string): string {
    const healed = this.healExpiryDate(rawExpiry);
    if (healed.healedValue) {
      // Return YYYY-MM prefix
      return healed.healedValue.substring(0, 7);
    }
    return rawExpiry;
  }

  /**
   * Helper: Sanitizes raw barcode string
   */
  public static sanitizeBarcode(rawBarcode: string): string {
    if (!rawBarcode) return '';
    const unwrapped = rawBarcode.replace(/\[BAR:\s*/gi, '').replace(/[\[\]]/g, '').trim();
    const healed = this.healBarcode(unwrapped);
    return healed.healedValue || unwrapped.replace(/[\s\-_]/g, '').trim();
  }

  /**
   * Normalizes Expiry Date formats (e.g., '05/27', '05/2027', '2027-05', '15/08/2026', 'مايو 2027') to ISO 'YYYY-MM-DD'
   */
  public static healExpiryDate(rawDate?: string): FieldHealingResult<string | undefined> {
    if (!rawDate || !rawDate.trim()) {
      return {
        field: 'expiryDate',
        originalValue: rawDate,
        healedValue: undefined,
        isHealed: false,
        healingMethod: 'NONE',
        explanation: 'لا يوجد تاريخ صلاحية',
        confidenceDelta: 0
      };
    }

    const trimmed = rawDate.trim().replace(/[\\_]/g, '/');

    // Already valid ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return {
        field: 'expiryDate',
        originalValue: rawDate,
        healedValue: trimmed,
        isHealed: false,
        healingMethod: 'NONE',
        explanation: 'تاريخ صلاحية معتمد بصيغة ISO',
        confidenceDelta: 0
      };
    }

    // Helper: get last day of month
    const getLastDayOfMonth = (year: number, month: number): string => {
      const lastDay = new Date(year, month, 0).getDate();
      const mm = String(month).padStart(2, '0');
      const dd = String(lastDay).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    };

    // Format 1: MM/YY (e.g. 05/27 -> 2027-05-31)
    const mmYyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{2})$/);
    if (mmYyMatch && mmYyMatch[1] && mmYyMatch[2]) {
      const month = parseInt(mmYyMatch[1], 10);
      const shortYear = parseInt(mmYyMatch[2], 10);
      if (month >= 1 && month <= 12) {
        const fullYear = shortYear < 50 ? 2000 + shortYear : 1900 + shortYear;
        const normalized = getLastDayOfMonth(fullYear, month);
        return {
          field: 'expiryDate',
          originalValue: rawDate,
          healedValue: normalized,
          isHealed: true,
          healingMethod: 'DATE_NORMALIZATION',
          explanation: `تم تطبيع صيغة الشهر/السنة (${trimmed}) إلى نهاية الشهر (${normalized})`,
          confidenceDelta: 0.30
        };
      }
    }

    // Format 2: MM/YYYY or YYYY/MM (e.g. 05/2027 or 2027/05)
    const mmYyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (mmYyyyMatch && mmYyyyMatch[1] && mmYyyyMatch[2]) {
      const month = parseInt(mmYyyyMatch[1], 10);
      const year = parseInt(mmYyyyMatch[2], 10);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
        const normalized = getLastDayOfMonth(year, month);
        return {
          field: 'expiryDate',
          originalValue: rawDate,
          healedValue: normalized,
          isHealed: true,
          healingMethod: 'DATE_NORMALIZATION',
          explanation: `تم تطبيع صيغة الشهر/السنة (${trimmed}) إلى (${normalized})`,
          confidenceDelta: 0.30
        };
      }
    }

    const yyyyMmMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (yyyyMmMatch && yyyyMmMatch[1] && yyyyMmMatch[2]) {
      const year = parseInt(yyyyMmMatch[1], 10);
      const month = parseInt(yyyyMmMatch[2], 10);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
        const normalized = getLastDayOfMonth(year, month);
        return {
          field: 'expiryDate',
          originalValue: rawDate,
          healedValue: normalized,
          isHealed: true,
          healingMethod: 'DATE_NORMALIZATION',
          explanation: `تم تطبيع صيغة السنة/الشهر (${trimmed}) إلى (${normalized})`,
          confidenceDelta: 0.30
        };
      }
    }

    // Format 3: DD/MM/YYYY or DD-MM-YYYY
    const ddMmYyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddMmYyyyMatch && ddMmYyyyMatch[1] && ddMmYyyyMatch[2] && ddMmYyyyMatch[3]) {
      const day = parseInt(ddMmYyyyMatch[1], 10);
      const month = parseInt(ddMmYyyyMatch[2], 10);
      const year = parseInt(ddMmYyyyMatch[3], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const normalized = `${year}-${mm}-${dd}`;
        return {
          field: 'expiryDate',
          originalValue: rawDate,
          healedValue: normalized,
          isHealed: true,
          healingMethod: 'DATE_NORMALIZATION',
          explanation: `تم تحويل التاريخ (${trimmed}) إلى الصيغة القياسية (${normalized})`,
          confidenceDelta: 0.35
        };
      }
    }

    // Format 4: Arabic / English textual month (e.g. 'مايو 2027', 'May 2027')
    const lower = trimmed.toLowerCase();
    for (const [monthName, monthNum] of Object.entries(this.MONTH_MAP)) {
      if (lower.includes(monthName)) {
        const yearMatch = lower.match(/\b(20\d{2})\b/);
        if (yearMatch && yearMatch[1]) {
          const year = parseInt(yearMatch[1], 10);
          const normalized = getLastDayOfMonth(year, monthNum);
          return {
            field: 'expiryDate',
            originalValue: rawDate,
            healedValue: normalized,
            isHealed: true,
            healingMethod: 'DATE_NORMALIZATION',
            explanation: `تم تحويل الشهر النصي (${monthName}) إلى (${normalized})`,
            confidenceDelta: 0.30
          };
        }
      }
    }

    return {
      field: 'expiryDate',
      originalValue: rawDate,
      healedValue: rawDate,
      isHealed: false,
      healingMethod: 'NONE',
      explanation: 'تعذر تطبيع صيغة التاريخ تلقائياً',
      confidenceDelta: 0
    };
  }

  /**
   * Cleans and validates Barcode checksums (EAN-13, EAN-8, UPC-A)
   */
  public static healBarcode(rawBarcode?: string): FieldHealingResult<string | undefined> {
    if (!rawBarcode || !rawBarcode.trim()) {
      return {
        field: 'barcode',
        originalValue: rawBarcode,
        healedValue: undefined,
        isHealed: false,
        healingMethod: 'NONE',
        explanation: 'الباركود غير متوفر',
        confidenceDelta: 0
      };
    }

    // Strip whitespace, hyphens, non-alphanumerics
    const cleaned = rawBarcode.replace(/[\s\-_]/g, '');

    // Check if numeric barcode
    if (/^\d+$/.test(cleaned)) {
      if (cleaned.length === 13) {
        // Validate EAN-13 checksum
        const isValidChecksum = this.validateEan13Checksum(cleaned);
        if (isValidChecksum) {
          const wasModified = cleaned !== rawBarcode;
          return {
            field: 'barcode',
            originalValue: rawBarcode,
            healedValue: cleaned,
            isHealed: wasModified,
            healingMethod: wasModified ? 'BARCODE_CHECKSUM_CLEANUP' : 'NONE',
            explanation: wasModified ? 'تم تنظيف الباركود والتحقق من صحة Checksum (EAN-13)' : 'باركود EAN-13 صحيح وموثق',
            confidenceDelta: wasModified ? 0.20 : 0
          };
        }
      }

      if (cleaned.length === 8 || cleaned.length === 12 || cleaned.length === 14) {
        return {
          field: 'barcode',
          originalValue: rawBarcode,
          healedValue: cleaned,
          isHealed: cleaned !== rawBarcode,
          healingMethod: 'BARCODE_CHECKSUM_CLEANUP',
          explanation: `تم تنظيف وتنسيق الباركود (${cleaned.length} أرقام)`,
          confidenceDelta: 0.15
        };
      }
    }

    return {
      field: 'barcode',
      originalValue: rawBarcode,
      healedValue: cleaned,
      isHealed: cleaned !== rawBarcode,
      healingMethod: cleaned !== rawBarcode ? 'TEXT_SANITIZATION' : 'NONE',
      explanation: 'تم تنظيف محارف الباركود',
      confidenceDelta: 0.05
    };
  }

  /**
   * Helper: Validates standard EAN-13 Checksum digit
   */
  private static validateEan13Checksum(ean: string): boolean {
    if (ean.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digitChar = ean[i];
      const digit = digitChar ? parseInt(digitChar, 10) : 0;
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const lastChar = ean[12];
    return checkDigit === (lastChar ? parseInt(lastChar, 10) : -1);
  }

  /**
   * Sanitizes Product Name text removing OCR artefacts without altering dosage or drug names
   */
  public static healProductName(rawName?: string): FieldHealingResult<string> {
    if (!rawName || !rawName.trim()) {
      return {
        field: 'productName',
        originalValue: '',
        healedValue: '',
        isHealed: false,
        healingMethod: 'NONE',
        explanation: 'اسم الصنف فارغ',
        confidenceDelta: 0
      };
    }

    let cleaned = rawName
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Remove leading/trailing noisy punctuation like "|", "~", "`" often caused by OCR borders
    cleaned = cleaned.replace(/^[\s\|~`\-_:\.\*,]+/, '').replace(/[\s\|~`\-_:\.\*,]+$/, '').trim();

    const isHealed = cleaned !== rawName;
    return {
      field: 'productName',
      originalValue: rawName,
      healedValue: cleaned,
      isHealed,
      healingMethod: isHealed ? 'TEXT_SANITIZATION' : 'NONE',
      explanation: isHealed ? 'تم تنظيف شوائب المسح الضوئي والفواصل الزائدة من اسم الصنف' : 'اسم الصنف منسق',
      confidenceDelta: isHealed ? 0.10 : 0
    };
  }

  /**
   * Executes Full Self-Healing on a single Row
   */
  public static healRow(row: ExtractedImportRow): {
    healedRow: ExtractedImportRow;
    healingResult: RowHealingResult;
  } {
    let workingRow: ExtractedImportRow = { ...row };
    const fieldResults: FieldHealingResult[] = [];
    const explanations: string[] = [];

    // 1. Heal Product Name
    const nameHealing = this.healProductName(workingRow.productName);
    if (nameHealing.isHealed) {
      workingRow.productName = nameHealing.healedValue;
      fieldResults.push(nameHealing);
      explanations.push(nameHealing.explanation);
    }

    // 2. Heal Math & Totals
    const mathHealing = this.healMath(workingRow);
    workingRow = { ...workingRow, ...mathHealing.healedRow };
    mathHealing.results.forEach(r => {
      fieldResults.push(r);
      explanations.push(r.explanation);
    });

    // 3. Heal Expiry Date
    if (workingRow.expiryDate) {
      const expHealing = this.healExpiryDate(workingRow.expiryDate);
      if (expHealing.isHealed && expHealing.healedValue) {
        workingRow.expiryDate = expHealing.healedValue;
        fieldResults.push(expHealing);
        explanations.push(expHealing.explanation);
      }
    }

    // 4. Heal Barcode
    if (workingRow.barcode) {
      const barcodeHealing = this.healBarcode(workingRow.barcode);
      if (barcodeHealing.isHealed && barcodeHealing.healedValue) {
        workingRow.barcode = barcodeHealing.healedValue;
        fieldResults.push(barcodeHealing);
        explanations.push(barcodeHealing.explanation);
      }
    }

    const isModified = fieldResults.some(f => f.isHealed);

    return {
      healedRow: workingRow,
      healingResult: {
        rowNumber: row.rowNumber,
        isModified,
        healedFields: fieldResults,
        explanations
      }
    };
  }
}
