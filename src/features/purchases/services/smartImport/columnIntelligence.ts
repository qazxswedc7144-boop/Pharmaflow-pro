// src/features/purchases/services/smartImport/columnIntelligence.ts
import { TargetField, ColumnDefinition } from './types';

/**
 * Enterprise Synonym & Column Intelligence Dictionary
 */
interface FieldKeywordRule {
  targetField: TargetField;
  exactMatches: string[];
  partialKeywords: string[];
  negativeKeywords?: string[];
  weight: number;
}

const FIELD_RULES: FieldKeywordRule[] = [
  {
    targetField: 'productName',
    exactMatches: [
      'الصنف', 'اسم الصنف', 'اسم المنتج', 'المنتج', 'البيان', 'الوصف', 'المادة', 'اسم الدواء', 'الدواء', 'المستحضر', 'اسم المادة',
      'item', 'item name', 'item description', 'product', 'product name', 'description', 'medicine', 'drug name', 'item_name', 'product_name', 'article', 'desc'
    ],
    partialKeywords: [
      'صنف', 'منتج', 'دواء', 'مستحضر', 'بيان', 'مادة', 'وصف',
      'item', 'product', 'desc', 'name', 'article'
    ],
    negativeKeywords: ['كود', 'code', 'id', 'barcode', 'باركود', 'unit', 'وحدة', 'نوع'],
    weight: 98
  },
  {
    targetField: 'quantity',
    exactMatches: [
      'الكمية', 'كمية', 'العدد', 'عدد', 'الوحدات', 'مشتراة', 'الكمية المشتراة', 'كميه',
      'qty', 'quantity', 'count', 'units', 'qnt', 'pieces', 'pcs', 'amount_qty'
    ],
    partialKeywords: [
      'كمي', 'عدد', 'qty', 'quant', 'count', 'units', 'pcs'
    ],
    negativeKeywords: ['سعر', 'price', 'cost', 'total', 'إجمالي', 'مجموع', 'بونص', 'bonus', 'free', 'مجاني'],
    weight: 96
  },
  {
    targetField: 'unitPrice',
    exactMatches: [
      'السعر', 'سعر الوحدة', 'سعر الشراء', 'سعر التكلفة', 'التكلفة', 'سعر الحبة', 'سعر العبوة', 'السعر الإفرادي', 'سعر قطاعي', 'سعر الجملة',
      'price', 'unit price', 'unit_price', 'cost', 'cost price', 'purchase price', 'rate', 'unit rate', 'price/unit', 'u_price'
    ],
    partialKeywords: [
      'سعر', 'تكلف', 'افرادي', 'إفرادي', 'price', 'cost', 'rate', 'unitprice'
    ],
    negativeKeywords: ['إجمالي', 'اجمالي', 'مجموع', 'صافي', 'total', 'net', 'sum', 'line total', 'خصم', 'discount'],
    weight: 95
  },
  {
    targetField: 'total',
    exactMatches: [
      'الإجمالي', 'اجمالي', 'المجموع', 'القيمة', 'الصافي', 'إجمالي السطر', 'صافي القيمة', 'المبلغ', 'إجمالي البند', 'القيمة الإجمالية',
      'total', 'amount', 'net amount', 'line total', 'total amount', 'sum', 'subtotal', 'line_total', 'net_total', 'value'
    ],
    partialKeywords: [
      'اجمال', 'إجمال', 'مجموع', 'صافي', 'مبلغ', 'قيمة', 'total', 'amount', 'subtotal', 'line_tot'
    ],
    negativeKeywords: ['سعر', 'unit', 'وحدة', 'price', 'rate', 'tax', 'ضريبة', 'خصم', 'discount'],
    weight: 95
  },
  {
    targetField: 'batchNumber',
    exactMatches: [
      'رقم التشغيلة', 'التشغيلة', 'تشغيلة', 'رقم الوجبة', 'الوجبة', 'رقم الشحنة', 'رقم الباتش', 'الباتش', 'تشغيله',
      'batch', 'batch no', 'batch number', 'lot', 'lot no', 'lot number', 'batch_no', 'lot_num'
    ],
    partialKeywords: [
      'تشغيل', 'وجب', 'شحن', 'باتش', 'batch', 'lot'
    ],
    negativeKeywords: ['تاريخ', 'date', 'exp', 'صلاحية'],
    weight: 92
  },
  {
    targetField: 'expiryDate',
    exactMatches: [
      'تاريخ الصلاحية', 'الصلاحية', 'تاريخ الانتهاء', 'الانتهاء', 'صلاحية', 'انتهاء', 'نهاية الصلاحية',
      'expiry', 'exp date', 'expiry date', 'expire', 'exp', 'expiration', 'exp_date', 'validity'
    ],
    partialKeywords: [
      'صلاحي', 'انته', 'exp', 'valid'
    ],
    negativeKeywords: ['تشغيلة', 'batch', 'lot', 'انتاج', 'prod'],
    weight: 92
  },
  {
    targetField: 'discount',
    exactMatches: [
      'الخصم', 'نسبة الخصم', 'خصم', 'تخفيض', 'نسبة التخفيض', 'قيمة الخصم', 'الخصم الممنوح',
      'discount', 'disc', 'discount %', 'discount percent', 'disc %', 'discount_val', 'rebate'
    ],
    partialKeywords: [
      'خصم', 'تخفيض', 'disc', 'rebate'
    ],
    negativeKeywords: [],
    weight: 90
  },
  {
    targetField: 'tax',
    exactMatches: [
      'الضريبة', 'ضريبة', 'ضريبة القيمة المضافة', 'قيمة الضريبة', 'نسبة الضريبة',
      'tax', 'vat', 'tax %', 'tax amount', 'vat amount', 'gst'
    ],
    partialKeywords: [
      'ضريب', 'tax', 'vat', 'gst'
    ],
    negativeKeywords: [],
    weight: 88
  },
  {
    targetField: 'barcode',
    exactMatches: [
      'الباركود', 'باركود', 'رمز المنتج', 'رمز الاستجابة', 'كود الترقيم الدولي',
      'barcode', 'bar code', 'gtin', 'upc', 'ean', 'ean13', 'bar_code'
    ],
    partialKeywords: [
      'باركود', 'barcode', 'gtin', 'ean', 'upc'
    ],
    negativeKeywords: ['اسم', 'name', 'صنف', 'item'],
    weight: 94
  },
  {
    targetField: 'productCode',
    exactMatches: [
      'كود الصنف', 'كود المنتج', 'الرمز', 'رقم الصنف', 'رقم المنتج', 'كود', 'الرمز الداخلي',
      'item code', 'product code', 'item no', 'code', 'sku', 'ref', 'reference', 'item_code'
    ],
    partialKeywords: [
      'كود', 'رمز', 'sku', 'code', 'ref'
    ],
    negativeKeywords: ['باركود', 'barcode', 'مستودع', 'مخزن', 'رف', 'مندوب', 'صفحة', 'warehouse', 'rack', 'page', 'rep', 'internal_wh'],
    weight: 85
  },
  {
    targetField: 'bonusQty',
    exactMatches: [
      'بونص', 'كمية البونص', 'مجاني', 'كمية مجانية', 'هدية', 'كمية مجانا',
      'bonus', 'free', 'bonus qty', 'free qty', 'bonus_qty', 'free_units'
    ],
    partialKeywords: [
      'بونص', 'مجان', 'هدي', 'bonus', 'free'
    ],
    negativeKeywords: [],
    weight: 90
  },
  {
    targetField: 'unit',
    exactMatches: [
      'الوحدة', 'وحدة القياس', 'التعبئة', 'وحدة الصرف', 'شكل التعبئة',
      'unit', 'uom', 'pack', 'package', 'packaging', 'unit_of_measure'
    ],
    partialKeywords: [
      'وحد', 'تعبئ', 'pack', 'uom', 'unit'
    ],
    negativeKeywords: ['سعر', 'price'],
    weight: 80
  },
  {
    targetField: 'notes',
    exactMatches: [
      'ملاحظات', 'ملاحظة', 'البيان الإضافي', 'تفاصيل',
      'notes', 'note', 'remarks', 'comments', 'description_extra'
    ],
    partialKeywords: [
      'ملاحظ', 'remark', 'note', 'comment'
    ],
    negativeKeywords: [],
    weight: 75
  }
];

export class ColumnIntelligence {
  /**
   * Normalizes header text by stripping accents, symbols, multiple spaces, and converting to lower case
   */
  static normalizeHeader(header: string): string {
    if (!header) return '';
    return header
      .toLowerCase()
      .replace(/[_\-./\\:;,#|()[\]{}]/g, ' ')
      .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Arabic tashkeel / diacritics
      .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا') // Normalize alef variants
      .replace(/\u0629/g, 'ه') // Normalize taa marbuta to haa
      .replace(/\u0649/g, 'ي') // Normalize alef maksura to yaa
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Scores and matches a raw column header against known target fields
   */
  static matchColumnHeader(
    rawHeader: string,
    sampleValues: string[] = []
  ): { targetField: TargetField; confidence: number } {
    const normalized = this.normalizeHeader(rawHeader);
    if (!normalized) {
      return { targetField: 'ignore', confidence: 0 };
    }

    // Explicit check for known irrelevant supplier columns
    const IGNORE_PATTERNS = [
      'صفحة', 'page', 'موقع', 'رف', 'مستودع', 'مخزن', 'مندوب', 'سائق', 'شاحنة',
      'موقع الرف', 'رمز المستودع', 'كود المخزن', 'اسم المندوب', 'بلد المنشأ', 'بلد', 'منشا',
      'country', 'origin', 'rack', 'bin', 'warehouse', 'rep', 'internal rack', 'internal_wh'
    ];
    if (IGNORE_PATTERNS.some(ign => normalized.includes(this.normalizeHeader(ign)))) {
      return { targetField: 'ignore', confidence: 95 };
    }

    let bestField: TargetField = 'ignore';
    let bestScore = 0;

    const words = normalized.split(' ');

    for (const rule of FIELD_RULES) {
      // Check negative keywords first
      if (rule.negativeKeywords && rule.negativeKeywords.some(neg => {
        const normNeg = this.normalizeHeader(neg);
        return normalized.includes(normNeg);
      })) {
        continue;
      }

      // 1. Exact match check (100% rule confidence)
      const isExact = rule.exactMatches.some(exact => {
        const normExact = this.normalizeHeader(exact);
        return normalized === normExact;
      });

      if (isExact) {
        const score = rule.weight;
        if (score > bestScore) {
          bestScore = score;
          bestField = rule.targetField;
        }
        continue;
      }

      // 2. Partial / word boundary match check
      for (const keyword of rule.partialKeywords) {
        const normKeyword = this.normalizeHeader(keyword);
        const isLatin = /^[a-z0-9]+$/i.test(normKeyword);
        const matched = isLatin
          ? words.some(w => w === normKeyword || (normKeyword.length >= 4 && w.startsWith(normKeyword)))
          : normalized.includes(normKeyword);

        if (matched) {
          // Calculate closeness score
          const ratio = normKeyword.length / normalized.length;
          const score = Math.round(rule.weight * (0.7 + 0.3 * ratio));
          if (score > bestScore) {
            bestScore = score;
            bestField = rule.targetField;
          }
        }
      }
    }

    // 3. Fallback heuristic from Sample Values if header was obscure or numeric index
    if (bestScore < 60 && sampleValues && sampleValues.length > 0) {
      const valueInference = this.inferFieldFromSampleValues(sampleValues);
      if (valueInference.confidence > bestScore) {
        bestField = valueInference.targetField;
        bestScore = valueInference.confidence;
      }
    }

    return {
      targetField: bestScore >= 50 ? bestField : 'ignore',
      confidence: bestScore
    };
  }

  /**
   * Inspects sample cell values in the column to deduce field type
   */
  static inferFieldFromSampleValues(samples: string[]): { targetField: TargetField; confidence: number } {
    const validSamples = samples.filter(s => s && s.trim().length > 0);
    if (validSamples.length === 0) return { targetField: 'ignore', confidence: 0 };

    // Check Barcode pattern (8-14 consecutive digits)
    const isBarcode = validSamples.every(s => /^\d{8,14}$/.test(s.trim()));
    if (isBarcode) return { targetField: 'barcode', confidence: 75 };

    // Check Expiry Date pattern (YYYY-MM-DD, DD/MM/YYYY, etc.)
    const isDate = validSamples.every(s => {
      const clean = s.trim();
      return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(clean) ||
             /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(clean) ||
             /^\d{1,2}[-/.]\d{4}$/.test(clean);
    });
    if (isDate) return { targetField: 'expiryDate', confidence: 75 };

    return { targetField: 'ignore', confidence: 0 };
  }

  /**
   * Analyzes an entire array of raw headers and creates an optimal column mapping layout
   * ensuring no duplicate target assignments (assigns to highest confidence).
   */
  static analyzeHeaders(
    headers: string[],
    samplesByColumn: string[][] = []
  ): ColumnDefinition[] {
    const candidates: Array<{
      index: number;
      rawHeader: string;
      normalizedHeader: string;
      mappedField: TargetField;
      confidence: number;
      sampleValues: string[];
    }> = [];

    // Step 1: Compute initial mapping for all columns
    headers.forEach((rawHeader, idx) => {
      const samples = samplesByColumn[idx] || [];
      const match = this.matchColumnHeader(rawHeader, samples);
      candidates.push({
        index: idx,
        rawHeader: rawHeader || `Column ${idx + 1}`,
        normalizedHeader: this.normalizeHeader(rawHeader),
        mappedField: match.targetField,
        confidence: match.confidence,
        sampleValues: samples
      });
    });

    // Step 2: Resolve conflicts (if two columns mapped to same target field like 'productName', keep higher confidence)
    const assignedFields = new Set<TargetField>();
    
    // Sort candidates by confidence descending
    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);

    for (const item of sorted) {
      if (item.mappedField === 'ignore') continue;

      if (assignedFields.has(item.mappedField)) {
        // Already assigned by a higher confidence column -> re-evaluate or set to ignore
        item.mappedField = 'ignore';
        item.confidence = Math.max(0, item.confidence - 40);
      } else {
        assignedFields.add(item.mappedField);
      }
    }

    // Step 3: Handle 4-column, 5-column, 6-column, 10-column fallback heuristics
    // If productName or quantity are still missing, try standard positional defaults for simple sheets
    const hasProduct = candidates.some(c => c.mappedField === 'productName');
    const hasQty = candidates.some(c => c.mappedField === 'quantity');

    if (!hasProduct && candidates.length > 0) {
      // Pick first non-ignored text column
      const textCandidate = candidates.find(c => c.mappedField === 'ignore');
      if (textCandidate) {
        textCandidate.mappedField = 'productName';
        textCandidate.confidence = 65;
      }
    }

    if (!hasQty && candidates.length > 1) {
      // Pick next numeric candidate
      const qtyCandidate = candidates.find(c => c.mappedField === 'ignore');
      if (qtyCandidate) {
        qtyCandidate.mappedField = 'quantity';
        qtyCandidate.confidence = 60;
      }
    }

    return candidates.map(c => ({
      ...c,
      isAutoMapped: c.confidence >= 60 && c.mappedField !== 'ignore'
    }));
  }
}
