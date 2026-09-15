// src/features/purchases/services/smartImport/confidence/confidenceEngine.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Multi-Field Explainable Confidence Scoring Engine
 */

import { 
  ConfidenceLevel, 
  FieldConfidence, 
  RowConfidenceMap, 
  DocumentConfidenceReport 
} from './confidence.types';
import { ExtractedImportRow, ImportSummary } from '../types';
import { DosageSafetyReport } from '../domain/resolution.types';

export class ConfidenceEngine {
  public static readonly HIGH_THRESHOLD = 0.90;
  public static readonly MEDIUM_THRESHOLD = 0.70;

  public static calculateSupplierConfidence(
    name?: string, 
    isKnownMatch = false,
    status?: string,
    customReason?: string
  ): FieldConfidence {
    const reasons: string[] = [];
    if (!name || !name.trim()) {
      return {
        field: 'supplier',
        score: 0.30,
        level: 'LOW',
        reasons: [customReason || 'المورد غير محدد في المستند ويحتاج مراجعة واختيار يدوي'],
        extractedValue: name
      };
    }

    if (status === 'AMBIGUOUS') {
      return {
        field: 'supplier',
        score: 0.55,
        level: 'LOW',
        reasons: [customReason || 'تشابه بين عدة موردين متقاربين — يحتاج مراجعة واختيار يدوي'],
        extractedValue: name
      };
    }

    if (status === 'POSSIBLE_MATCH') {
      return {
        field: 'supplier',
        score: 0.65,
        level: 'MEDIUM',
        reasons: [customReason || 'مطابقة تقريبية للمورد — يحتاج مراجعة وتأكيد المستخدم'],
        extractedValue: name
      };
    }

    if (isKnownMatch || status === 'EXACT_MATCH') {
      const score = 0.98;
      reasons.push(customReason || `تطابق تام مع مورد مسجل في النظام: ${name}`);
      return {
        field: 'supplier',
        score,
        level: 'HIGH',
        reasons,
        extractedValue: name,
        resolvedValue: name
      };
    }

    if (status === 'HIGH_CONFIDENCE_MATCH') {
      const score = 0.90;
      reasons.push(customReason || `مطابقة موثوقة مع المورد: ${name}`);
      return {
        field: 'supplier',
        score,
        level: 'HIGH',
        reasons,
        extractedValue: name,
        resolvedValue: name
      };
    }

    const score = 0.45;
    reasons.push(customReason || `اسم مورد مستخرج غير مسجل في دليلك: ${name} (يحتاج مراجعة)`);
    return {
      field: 'supplier',
      score,
      level: 'LOW',
      reasons,
      extractedValue: name
    };
  }

  public static calculateInvoiceDateConfidence(dateStr?: string): FieldConfidence {
    const reasons: string[] = [];
    if (!dateStr || !dateStr.trim()) {
      return {
        field: 'invoiceDate',
        score: 0.60,
        level: 'MEDIUM',
        reasons: ['تاريخ الفاتورة غير محدد'],
        extractedValue: dateStr
      };
    }
    const isIso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
    const score = isIso ? 1.0 : 0.80;
    reasons.push(isIso ? `تاريخ قياسي صحيح: ${dateStr}` : `تاريخ مستخرج: ${dateStr}`);
    return {
      field: 'invoiceDate',
      score,
      level: this.getLevel(score),
      reasons,
      extractedValue: dateStr,
      resolvedValue: dateStr
    };
  }

  public static calculateRowConfidence(row: Partial<ExtractedImportRow> & { dosageSafety?: DosageSafetyReport }): {
    scores: Record<string, number>;
    overallScore: number;
    reasons: string[];
  } {
    const rawConfScore = (row as any).confidenceScore ?? ((row as any).confidence?.overallConfidence ?? 0.85);
    const pName = this.scoreProductName(row.productName, rawConfScore, row.dosageSafety);
    const qty = this.scoreQuantity(row.quantity);
    const price = this.scoreUnitPrice(row.unitPrice);
    const total = this.scoreTotal(row.total, row.quantity, row.unitPrice, row.discountPercent);
    const exp = this.scoreExpiryDate(row.expiryDate);
    const bar = this.scoreBarcode(row.barcode);

    const scores = {
      productName: pName.score,
      quantity: qty.score,
      unitPrice: price.score,
      total: total.score,
      expiryDate: exp.score,
      barcode: bar.score
    };

    const overallScore = Number(((pName.score * 0.3) + (qty.score * 0.2) + (price.score * 0.2) + (total.score * 0.3)).toFixed(2));
    const allReasons = [
      ...pName.reasons,
      ...qty.reasons,
      ...price.reasons,
      ...total.reasons
    ];

    return {
      scores,
      overallScore,
      reasons: allReasons
    };
  }

  public static calculateDocumentSummary(rowScores: any[], hasDosageConflict = false): {
    confidenceScore: number;
    confidenceLevel: ConfidenceLevel;
    requiresHumanReview: boolean;
  } {
    if (hasDosageConflict) {
      return {
        confidenceScore: 0,
        confidenceLevel: 'BLOCKED',
        requiresHumanReview: true
      };
    }
    const avg = rowScores.length > 0 
      ? rowScores.reduce((acc, r) => acc + (r.overallScore || 0), 0) / rowScores.length 
      : 0.5;
    const level = this.getLevel(avg, false);
    return {
      confidenceScore: Number(avg.toFixed(2)),
      confidenceLevel: level,
      requiresHumanReview: level !== 'HIGH'
    };
  }

  /**
   * Translates numeric score to ConfidenceLevel
   */
  public static getLevel(score: number, isBlocked = false): ConfidenceLevel {
    if (isBlocked) return 'BLOCKED';
    if (score >= this.HIGH_THRESHOLD) return 'HIGH';
    if (score >= this.MEDIUM_THRESHOLD) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Scores Product Name confidence based on extraction, catalog matching, and dosage safety
   */
  public static scoreProductName(
    name: string | undefined,
    matchScore?: number,
    dosageSafety?: DosageSafetyReport,
    isHealed?: boolean
  ): FieldConfidence {
    const reasons: string[] = [];
    const trimmed = (name || '').trim();

    if (!trimmed) {
      return {
        field: 'productName',
        score: 0,
        level: 'BLOCKED',
        reasons: ['اسم الصنف مفقود تماماً في سطر الفاتورة'],
        extractedValue: name
      };
    }

    if (dosageSafety?.isConflict) {
      return {
        field: 'productName',
        score: 0,
        level: 'BLOCKED',
        reasons: [`تعارض أمان دوائي في التركيز أو الشكل الصيدلاني: ${dosageSafety.reason}`],
        extractedValue: name,
        resolvedValue: name
      };
    }

    let baseScore = 0.60;
    if (trimmed.length > 3) baseScore += 0.10;
    if (/[a-zA-Z\u0600-\u06FF]/.test(trimmed)) baseScore += 0.10;

    if (matchScore !== undefined) {
      if (matchScore >= 0.95) {
        baseScore = 0.98;
        reasons.push(`تطابق صيدلاني دقيق بنسبة ${Math.round(matchScore * 100)}% مع دليل الأدوية`);
      } else if (matchScore >= 0.85) {
        baseScore = Math.max(baseScore, 0.88);
        reasons.push(`تطابق صيدلاني مقترح بنسبة ${Math.round(matchScore * 100)}%`);
      } else if (matchScore >= 0.60) {
        baseScore = Math.max(baseScore, 0.72);
        reasons.push(`تطابق جزئي بنسبة ${Math.round(matchScore * 100)}% يحتاج مراجعة`);
      } else {
        baseScore = 0.60;
        reasons.push('صنف جديد محتمل غير مسجل مسبقاً بدليل الأدوية');
      }
    } else {
      reasons.push('تم استخراج الاسم بنجاح من المستند');
    }

    if (isHealed) {
      reasons.push('تم تحسين وتنسيق الاسم عبر محرك التطهير الذاتي');
    }

    const finalScore = Math.min(1, Math.max(0, baseScore));
    return {
      field: 'productName',
      score: Number(finalScore.toFixed(2)),
      level: this.getLevel(finalScore),
      reasons,
      extractedValue: name,
      resolvedValue: trimmed,
      isHealed
    };
  }

  /**
   * Scores Quantity confidence
   */
  public static scoreQuantity(
    quantity: number | undefined,
    isCalculatedFromMath = false
  ): FieldConfidence {
    const reasons: string[] = [];

    if (quantity === undefined || isNaN(quantity) || quantity <= 0) {
      return {
        field: 'quantity',
        score: 0,
        level: 'BLOCKED',
        reasons: ['الكمية مفقودة أو سالبة أو غير صالحة'],
        extractedValue: quantity
      };
    }

    let score = 0.85;
    if (Number.isInteger(quantity)) {
      score += 0.10;
      reasons.push(`كمية صحيحة موجبة (${quantity})`);
    } else {
      score += 0.05;
      reasons.push(`كمية كسرية (${quantity})`);
    }

    if (isCalculatedFromMath) {
      score = 0.95;
      reasons.push('تم التحقق من الكمية رياضياً (الإجمالي ÷ السعر)');
    }

    const finalScore = Math.min(1, score);
    return {
      field: 'quantity',
      score: Number(finalScore.toFixed(2)),
      level: this.getLevel(finalScore),
      reasons,
      extractedValue: quantity,
      resolvedValue: quantity
    };
  }

  /**
   * Scores Unit Price confidence
   */
  public static scoreUnitPrice(
    price: number | undefined,
    isCalculatedFromMath = false
  ): FieldConfidence {
    const reasons: string[] = [];

    if (price === undefined || isNaN(price) || price < 0) {
      return {
        field: 'unitPrice',
        score: 0,
        level: 'BLOCKED',
        reasons: ['سعر الوحدة مفقود أو سالب أو غير صالح'],
        extractedValue: price
      };
    }

    let score = 0.85;
    if (price > 0) {
      score += 0.10;
      reasons.push(`سعر وحدة صالح (${price.toFixed(2)})`);
    } else {
      score = 0.70;
      reasons.push('سعر الوحدة صفر (صنف مجاني/بونص محتمل)');
    }

    if (isCalculatedFromMath) {
      score = 0.95;
      reasons.push('تم استنتاج وتأكيد السعر رياضياً');
    }

    const finalScore = Math.min(1, score);
    return {
      field: 'unitPrice',
      score: Number(finalScore.toFixed(2)),
      level: this.getLevel(finalScore),
      reasons,
      extractedValue: price,
      resolvedValue: price
    };
  }

  /**
   * Scores Total confidence using mathematical cross validation (Qty * Price)
   */
  public static scoreTotal(
    total: number | undefined,
    quantity: number | undefined,
    unitPrice: number | undefined,
    discountPercent = 0
  ): FieldConfidence {
    if (total === undefined || isNaN(total) || total < 0) {
      // If quantity & price are solid, we can reconstruct
      if (quantity && quantity > 0 && unitPrice !== undefined && unitPrice >= 0) {
        const expected = discountPercent > 0 
          ? (quantity * unitPrice) * (1 - discountPercent / 100) 
          : (quantity * unitPrice);
        return {
          field: 'total',
          score: 0.95,
          level: 'HIGH',
          reasons: ['تم حساب الإجمالي رياضياً من حاصل ضرب (الكمية × السعر)'],
          extractedValue: total,
          resolvedValue: Number(expected.toFixed(2)),
          isHealed: true,
          healingMethod: 'MATH_RECONSTRUCTION'
        };
      }

      return {
        field: 'total',
        score: 0,
        level: 'BLOCKED',
        reasons: ['الإجمالي مفقود ولا يمكن حسابه تلقائياً'],
        extractedValue: total
      };
    }

    if (quantity && quantity > 0 && unitPrice !== undefined && unitPrice >= 0) {
      const gross = quantity * unitPrice;
      const expected = discountPercent > 0 ? gross * (1 - discountPercent / 100) : gross;
      const diff = Math.abs(total - expected);

      if (diff < 0.01) {
        return {
          field: 'total',
          score: 0.99,
          level: 'HIGH',
          reasons: [`تطابق حسابي تام مع السعر والكمية (${expected.toFixed(2)})`],
          extractedValue: total,
          resolvedValue: total
        };
      } else if (diff <= 0.05) {
        return {
          field: 'total',
          score: 0.94,
          level: 'HIGH',
          reasons: [`تطابق حسابي مع فروق تقريب طفيفة (${diff.toFixed(3)})`],
          extractedValue: total,
          resolvedValue: total
        };
      } else if (diff <= 1.0) {
        return {
          field: 'total',
          score: 0.75,
          level: 'MEDIUM',
          reasons: [`فرق حسابي محتمل بمقدار (${diff.toFixed(2)}) - المتوقع: ${expected.toFixed(2)}`],
          extractedValue: total,
          resolvedValue: total
        };
      } else {
        return {
          field: 'total',
          score: 0.45,
          level: 'LOW',
          reasons: [`تعارض حسابي واضح: المستخرج (${total}) يختلف عن المتوقع (${expected.toFixed(2)})`],
          extractedValue: total,
          resolvedValue: total
        };
      }
    }

    return {
      field: 'total',
      score: 0.80,
      level: 'MEDIUM',
      reasons: ['تم استخراج الإجمالي لكن يتعذر التحقق الحسابي الدقيق لغياب السعر أو الكمية'],
      extractedValue: total,
      resolvedValue: total
    };
  }

  /**
   * Scores Expiry Date confidence
   */
  public static scoreExpiryDate(
    expiryDate: string | undefined,
    isHealed = false
  ): FieldConfidence {
    const reasons: string[] = [];

    if (!expiryDate || !expiryDate.trim()) {
      return {
        field: 'expiryDate',
        score: 0.80, // Expiry is optional for some products, not blocked
        level: 'MEDIUM',
        reasons: ['تاريخ الصلاحية غير محدد في المستند (اختياري)'],
        extractedValue: expiryDate
      };
    }

    const trimmed = expiryDate.trim();
    const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);

    if (isoMatch) {
      const expDate = new Date(trimmed);
      const now = new Date();
      if (isNaN(expDate.getTime())) {
        return {
          field: 'expiryDate',
          score: 0.30,
          level: 'LOW',
          reasons: ['تاريخ صلاحية غير صالح تقويمياً'],
          extractedValue: expiryDate
        };
      }

      if (expDate.getTime() < now.getTime() - (30 * 24 * 60 * 60 * 1000)) {
        return {
          field: 'expiryDate',
          score: 0.50,
          level: 'LOW',
          reasons: ['تنبيه أمان: تاريخ الصلاحية منتهي أو قديم'],
          extractedValue: expiryDate,
          resolvedValue: trimmed
        };
      }

      let score = 0.95;
      reasons.push('تاريخ صلاحية معتمد بصيغة ISO صالحة');
      if (isHealed) {
        score = 0.92;
        reasons.push('تم تطبيع التاريخ تلقائياً إلى صيغة قياسية');
      }

      return {
        field: 'expiryDate',
        score,
        level: this.getLevel(score),
        reasons,
        extractedValue: expiryDate,
        resolvedValue: trimmed,
        isHealed
      };
    }

    return {
      field: 'expiryDate',
      score: 0.65,
      level: 'LOW',
      reasons: [`تاريخ صلاحية بصيغة غير قياسية (${trimmed})`],
      extractedValue: expiryDate,
      resolvedValue: trimmed
    };
  }

  /**
   * Scores Barcode confidence
   */
  public static scoreBarcode(barcode: string | undefined): FieldConfidence {
    if (!barcode || !barcode.trim()) {
      return {
        field: 'barcode',
        score: 0.80,
        level: 'MEDIUM',
        reasons: ['الباركود غير متوفر في المستند (اختياري)'],
        extractedValue: barcode
      };
    }

    const clean = barcode.replace(/[\s\-_]/g, '');
    const isNumeric = /^\d+$/.test(clean);

    if (isNumeric && (clean.length === 8 || clean.length === 12 || clean.length === 13 || clean.length === 14)) {
      return {
        field: 'barcode',
        score: 0.96,
        level: 'HIGH',
        reasons: [`باركود قياسي صحيح (${clean.length} أرقام)`],
        extractedValue: barcode,
        resolvedValue: clean
      };
    }

    if (isNumeric && clean.length >= 4) {
      return {
        field: 'barcode',
        score: 0.82,
        level: 'MEDIUM',
        reasons: [`باركود أو كود صنف داخلي (${clean})`],
        extractedValue: barcode,
        resolvedValue: clean
      };
    }

    return {
      field: 'barcode',
      score: 0.50,
      level: 'LOW',
      reasons: ['صيغة الباركود تحتوي على محارف غير قياسية'],
      extractedValue: barcode,
      resolvedValue: clean
    };
  }

  /**
   * Scores Batch Number confidence
   */
  public static scoreBatchNumber(batchNumber: string | undefined): FieldConfidence {
    if (!batchNumber || !batchNumber.trim()) {
      return {
        field: 'batchNumber',
        score: 0.80,
        level: 'MEDIUM',
        reasons: ['رقم التشغيلة غير متوفر (اختياري)'],
        extractedValue: batchNumber
      };
    }

    const trimmed = batchNumber.trim();
    if (trimmed.length >= 3 && /^[a-zA-Z0-9\-_/]+$/.test(trimmed)) {
      return {
        field: 'batchNumber',
        score: 0.94,
        level: 'HIGH',
        reasons: [`رقم تشغيلة صالح ومعياري (${trimmed})`],
        extractedValue: batchNumber,
        resolvedValue: trimmed
      };
    }

    return {
      field: 'batchNumber',
      score: 0.70,
      level: 'MEDIUM',
      reasons: [`رقم تشغيلة مقروء (${trimmed})`],
      extractedValue: batchNumber,
      resolvedValue: trimmed
    };
  }

  /**
   * Evaluates complete Row Confidence Map
   */
  public static scoreRow(
    row: ExtractedImportRow,
    dosageSafety?: DosageSafetyReport
  ): RowConfidenceMap {
    const nameConf = this.scoreProductName(row.productName, row.matchScore, dosageSafety);
    const qtyConf = this.scoreQuantity(row.quantity);
    const priceConf = this.scoreUnitPrice(row.unitPrice);
    const totalConf = this.scoreTotal(row.total, row.quantity, row.unitPrice, row.discountPercent);
    const expConf = this.scoreExpiryDate(row.expiryDate);
    const barcodeConf = this.scoreBarcode(row.barcode);
    const batchConf = this.scoreBatchNumber(row.batchNumber);

    const isBlocked = nameConf.level === 'BLOCKED' ||
      qtyConf.level === 'BLOCKED' ||
      priceConf.level === 'BLOCKED' ||
      totalConf.level === 'BLOCKED';

    // Weighted composite score (Name: 35%, Qty: 20%, Price: 20%, Total: 15%, Expiry: 5%, Barcode: 5%)
    let composite = (
      nameConf.score * 0.35 +
      qtyConf.score * 0.20 +
      priceConf.score * 0.20 +
      totalConf.score * 0.15 +
      expConf.score * 0.05 +
      barcodeConf.score * 0.05
    );

    if (isBlocked) {
      composite = Math.min(composite, 0.40);
    }

    const compositeScore = Number(composite.toFixed(2));
    const compositeLevel = this.getLevel(compositeScore, isBlocked);

    const reasons: string[] = [
      ...nameConf.reasons,
      ...qtyConf.reasons,
      ...priceConf.reasons,
      ...totalConf.reasons
    ];

    return {
      rowNumber: row.rowNumber,
      productNameConfidence: nameConf,
      quantityConfidence: qtyConf,
      unitPriceConfidence: priceConf,
      totalConfidence: totalConf,
      expiryDateConfidence: expConf,
      barcodeConfidence: barcodeConf,
      batchNumberConfidence: batchConf,
      compositeScore,
      compositeLevel,
      reasons
    };
  }

  /**
   * Evaluates entire Document Confidence Report
   */
  public static scoreDocument(
    summary: ImportSummary,
    rows: ExtractedImportRow[],
    dosageSafetyMap?: Map<number, DosageSafetyReport>
  ): DocumentConfidenceReport {
    // 1. Supplier Confidence
    let supScore = 0.60;
    const supReasons: string[] = [];
    if (summary.detectedSupplier && summary.detectedSupplier.trim().length > 2) {
      supScore = 0.92;
      supReasons.push(`تم التعرف على المورد بنجاح: ${summary.detectedSupplier}`);
    } else {
      supScore = 0.40;
      supReasons.push('المورد غير محدد صراحة في ترويسة المستند ويحتاج تأكيد يدوي');
    }
    const supplierConfidence: FieldConfidence = {
      field: 'supplier',
      score: supScore,
      level: this.getLevel(supScore),
      reasons: supReasons,
      extractedValue: summary.detectedSupplier,
      resolvedValue: summary.detectedSupplier
    };

    // 2. Invoice Number Confidence
    let invNumScore = 0.60;
    const invNumReasons: string[] = [];
    if (summary.detectedInvoiceNumber && summary.detectedInvoiceNumber.trim().length > 2) {
      invNumScore = 0.94;
      invNumReasons.push(`تم استخراج رقم الفاتورة: ${summary.detectedInvoiceNumber}`);
    } else {
      invNumScore = 0.50;
      invNumReasons.push('رقم الفاتورة غير محدد أو تم توليد رقم مبدئي');
    }
    const invoiceNumberConfidence: FieldConfidence = {
      field: 'invoiceNumber',
      score: invNumScore,
      level: this.getLevel(invNumScore),
      reasons: invNumReasons,
      extractedValue: summary.detectedInvoiceNumber,
      resolvedValue: summary.detectedInvoiceNumber
    };

    // 3. Invoice Date Confidence
    let dateScore = 0.60;
    const dateReasons: string[] = [];
    if (summary.detectedDate && /^\d{4}-\d{2}-\d{2}$/.test(summary.detectedDate.trim())) {
      dateScore = 0.95;
      dateReasons.push(`تاريخ الفاتورة معتمد: ${summary.detectedDate}`);
    } else if (summary.detectedDate) {
      dateScore = 0.80;
      dateReasons.push(`تاريخ الفاتورة مستخرج: ${summary.detectedDate}`);
    } else {
      dateScore = 0.70;
      dateReasons.push('تاريخ الفاتورة غير محدد (سيتم استخدام تاريخ اليوم)');
    }
    const invoiceDateConfidence: FieldConfidence = {
      field: 'invoiceDate',
      score: dateScore,
      level: this.getLevel(dateScore),
      reasons: dateReasons,
      extractedValue: summary.detectedDate,
      resolvedValue: summary.detectedDate
    };

    // 4. Score all rows
    const rowConfidenceRecord: Record<number, RowConfidenceMap> = {};
    let sumScore = 0;
    let highCount = 0;
    let medCount = 0;
    let lowCount = 0;
    let blockedCount = 0;

    rows.forEach(r => {
      const safety = dosageSafetyMap?.get(r.rowNumber);
      const rowScore = this.scoreRow(r, safety);
      rowConfidenceRecord[r.rowNumber] = rowScore;

      sumScore += rowScore.compositeScore;
      if (rowScore.compositeLevel === 'BLOCKED') blockedCount++;
      else if (rowScore.compositeLevel === 'HIGH') highCount++;
      else if (rowScore.compositeLevel === 'MEDIUM') medCount++;
      else lowCount++;
    });

    const avgRowScore = rows.length > 0 ? (sumScore / rows.length) : 0;
    const overallScore = Number((avgRowScore * 0.7 + supScore * 0.15 + invNumScore * 0.1 + dateScore * 0.05).toFixed(2));
    const overallLevel = this.getLevel(overallScore, blockedCount > 0);

    const docReasons: string[] = [
      `إجمالي الأسطر: ${rows.length}`,
      `أسطر عالية الدقة: ${highCount}`,
      `أسطر متوسطة: ${medCount}`,
      `أسطر منخفضة: ${lowCount}`,
      `أسطر محظورة بتعارضات أمان: ${blockedCount}`
    ];

    return {
      supplierConfidence,
      invoiceNumberConfidence,
      invoiceDateConfidence,
      rows: rowConfidenceRecord,
      overallScore,
      overallLevel,
      highConfidenceCount: highCount,
      mediumConfidenceCount: medCount,
      lowConfidenceCount: lowCount,
      blockedCount,
      reasons: docReasons
    };
  }
}
