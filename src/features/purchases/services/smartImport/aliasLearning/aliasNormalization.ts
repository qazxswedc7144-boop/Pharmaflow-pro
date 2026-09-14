// src/features/purchases/services/smartImport/aliasLearning/aliasNormalization.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.3: Comprehensive Arabic & English Normalization & Pharmaceutical Safety Guard
 */

import { NormalizedPharmaceuticalInfo, DosageFormSafetyResult } from './aliasLearning.types';

export class AliasNormalization {
  /**
   * Arabic Diacritics Regex (Tashkeel)
   */
  private static readonly ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;

  /**
   * Arabic Tatweel (Kashida)
   */
  private static readonly ARABIC_TATWEEL = /\u0640/g;

  /**
   * Common Pharmaceutical Dosage Form Mapping
   */
  private static readonly FORM_MAP: Record<string, string> = {
    // Tablets
    tablet: 'tab',
    tablets: 'tab',
    tab: 'tab',
    tabs: 'tab',
    tbl: 'tab',
    t: 'tab',
    قرص: 'tab',
    أقراص: 'tab',
    اقراص: 'tab',
    حبوب: 'tab',
    حبة: 'tab',

    // Capsules
    capsule: 'cap',
    capsules: 'cap',
    cap: 'cap',
    caps: 'cap',
    كبسول: 'cap',
    كبسولة: 'cap',
    كبسولات: 'cap',

    // Syrup / Liquid
    syrup: 'syrup',
    syr: 'syrup',
    liquid: 'syrup',
    elixir: 'syrup',
    شراب: 'syrup',
    محلول: 'syrup',

    // Suspension
    suspension: 'susp',
    susp: 'susp',
    معلق: 'susp',

    // Injections / Vials / Ampoules
    injection: 'inj',
    inj: 'inj',
    vial: 'inj',
    vials: 'inj',
    ampoule: 'inj',
    ampoules: 'inj',
    amp: 'inj',
    amps: 'inj',
    iv: 'inj',
    im: 'inj',
    حقن: 'inj',
    حقنة: 'inj',
    امبول: 'inj',
    أمبول: 'inj',
    أمبولات: 'inj',
    فيل: 'inj',
    فيال: 'inj',

    // Drops
    drop: 'drops',
    drops: 'drops',
    guttae: 'drops',
    gtt: 'drops',
    قطرة: 'drops',
    نقط: 'drops',

    // Creams / Ointments / Gel
    cream: 'cream',
    crm: 'cream',
    كريم: 'cream',
    ointment: 'oint',
    oint: 'oint',
    مرهم: 'oint',
    دهان: 'oint',
    gel: 'gel',
    جل: 'gel',

    // Sachets / Effervescent
    sachet: 'sachet',
    sachets: 'sachet',
    sac: 'sachet',
    فوار: 'sachet',
    اكياس: 'sachet',
    أكياس: 'sachet',
    كيس: 'sachet',
    effervescent: 'eff',
    eff: 'eff',

    // Suppositories
    suppository: 'supp',
    suppositories: 'supp',
    supp: 'supp',
    تحاميل: 'supp',
    لبوس: 'supp',

    // Spray / Inhaler
    spray: 'spray',
    inhaler: 'spray',
    بخاخ: 'spray'
  };

  /**
   * Normalizes text for alias matching and deduplication
   */
  static normalize(text: string): string {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text.trim();

    // 1. Remove Arabic Diacritics and Tatweel
    cleaned = cleaned.replace(this.ARABIC_DIACRITICS, '');
    cleaned = cleaned.replace(this.ARABIC_TATWEEL, '');

    // 2. Normalize Arabic Hamzas and Letters
    cleaned = cleaned
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي');

    // 3. Lowercase English letters
    cleaned = cleaned.toLowerCase();

    // 4. Standardize spacing around pharmaceutical dosage units
    // e.g. "500 mg" -> "500mg", "1000 mg" -> "1000mg", "5 ml" -> "5ml", "200 mcg" -> "200mcg"
    cleaned = cleaned
      .replace(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|iu|gm|%|ug)\b/gi, '$1$2')
      .replace(/(\d+(?:\.\d+)?)\s*(مجم|ملجم|جم|مل|مكجم|وحدة)\b/gi, '$1$2');

    // 5. Replace non-alphanumeric separators (except dot/slash for dosages) with single spaces
    cleaned = cleaned.replace(/[^a-z0-9\u0621-\u064A./%]/gi, ' ');

    // 6. Collapse multiple whitespaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Normalizes an entity name (Supplier or Customer) by removing legal entity suffixes
   */
  static normalizeSupplierName(name: string): string {
    let norm = this.normalize(name);

    // Remove common corporate suffixes in Arabic and English
    const suffixes = [
      /\bcompany\b/gi,
      /\bco\b/gi,
      /\bcorp\b/gi,
      /\binc\b/gi,
      /\bltd\b/gi,
      /\bllc\b/gi,
      /\bpharmaceuticals\b/gi,
      /\bpharma\b/gi,
      /\bindustries\b/gi,
      /\bdistributors\b/gi,
      /\bstore\b/gi,
      /\bشركة\b/gi,
      /\bمؤسسة\b/gi,
      /\bللادوية\b/gi,
      /\bللتجارة\b/gi,
      /\bوالتوكيلات\b/gi,
      /\bالمحدودة\b/gi
    ];

    for (const suffix of suffixes) {
      norm = norm.replace(suffix, ' ');
    }

    return norm.replace(/\s+/g, ' ').trim();
  }

  /**
   * Extracts pharmaceutical dosage, units, and dosage form from text
   */
  static extractPharmaceuticalInfo(text: string): NormalizedPharmaceuticalInfo {
    const rawText = text || '';
    const normalizedText = this.normalize(rawText);

    const result: NormalizedPharmaceuticalInfo = {
      rawText,
      normalizedText
    };

    // 1. Extract Dosage (e.g. 500mg, 1000mg, 1g, 250mcg, 125mg/5ml, 5%, 5000iu)
    const dosageRegex = /(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|iu|gm|%|ug|مجم|ملجم|جم|مل|مكجم)/i;
    const dosageMatch = rawText.match(dosageRegex) || normalizedText.match(dosageRegex);

    if (dosageMatch) {
      const val = parseFloat(dosageMatch[1]);
      let unit = dosageMatch[2].toLowerCase();

      // Normalize Arabic units to standard English
      if (unit === 'مجم' || unit === 'ملجم' || unit === 'gm') unit = 'mg';
      else if (unit === 'جم') unit = 'g';
      else if (unit === 'مل') unit = 'ml';
      else if (unit === 'مكجم' || unit === 'ug') unit = 'mcg';
      else if (unit === '%') unit = 'percent';

      // Standardize grams to mg if unit is 'g' for uniform comparisons (e.g. 1g = 1000mg)
      let canonicalValue = val;
      let canonicalUnit = unit;
      if (unit === 'g' && val < 50) {
        canonicalValue = val * 1000;
        canonicalUnit = 'mg';
      }

      result.dosage = {
        value: canonicalValue,
        unit: canonicalUnit,
        raw: dosageMatch[0]
      };
    }

    // 2. Extract Pharmaceutical Form
    const tokens = normalizedText.split(' ');
    for (const token of tokens) {
      if (this.FORM_MAP[token]) {
        result.form = this.FORM_MAP[token];
        break;
      }
    }

    // Check raw text if not found in normalized tokens
    if (!result.form) {
      for (const [key, canonicalForm] of Object.entries(this.FORM_MAP)) {
        if (new RegExp(`\\b${key}\\b`, 'i').test(rawText)) {
          result.form = canonicalForm;
          break;
        }
      }
    }

    // 3. Extract Pack Size (e.g. 20 Tab, 10 Amp, 30 Cap, x20, 2x10)
    const packRegex = /(?:pack\s*of|\bx|\*|\bstrip\s*of)\s*(\d+)|\b(\d+)\s*(?:tabs?|caps?|amp|sachets?|ق)/i;
    const packMatch = rawText.match(packRegex);
    if (packMatch) {
      const pSize = parseInt(packMatch[1] || packMatch[2], 10);
      if (!isNaN(pSize) && pSize > 0 && pSize <= 1000) {
        result.packSize = pSize;
      }
    }

    return result;
  }

  /**
   * Validates pharmaceutical safety before linking or auto-matching an alias.
   * Prevents critical medical errors such as:
   * - Linking 500mg to 250mg or 1000mg
   * - Linking Syrup to Tablets or Injections
   */
  static checkDosageAndFormSafety(
    importedText: string,
    masterProductText: string
  ): DosageFormSafetyResult {
    const importedInfo = this.extractPharmaceuticalInfo(importedText);
    const masterInfo = this.extractPharmaceuticalInfo(masterProductText);

    // Check 1: Dosage Discrepancy
    if (importedInfo.dosage && masterInfo.dosage) {
      const sameUnit = importedInfo.dosage.unit === masterInfo.dosage.unit;
      const sameValue = Math.abs(importedInfo.dosage.value - masterInfo.dosage.value) < 0.001;

      if (sameUnit && !sameValue) {
        return {
          isSafe: false,
          severity: 'CRITICAL',
          reason: `تعارض في الجرعة الدوائية: المستورد (${importedInfo.dosage.value}${importedInfo.dosage.unit}) يختلف عن الصنف المخزن (${masterInfo.dosage.value}${masterInfo.dosage.unit})`,
          importedInfo,
          targetProductInfo: masterInfo
        };
      }

      if (!sameUnit) {
        // e.g. one is % and other is mg
        return {
          isSafe: false,
          severity: 'CRITICAL',
          reason: `تعارض في وحدة الجرعة: المستورد (${importedInfo.dosage.raw}) يختلف عن المخزن (${masterInfo.dosage.raw})`,
          importedInfo,
          targetProductInfo: masterInfo
        };
      }
    }

    // Check 2: Pharmaceutical Form Discrepancy
    if (importedInfo.form && masterInfo.form) {
      if (importedInfo.form !== masterInfo.form) {
        return {
          isSafe: false,
          severity: 'CRITICAL',
          reason: `تعارض في الشكل الدوائي: المستورد (${importedInfo.form}) يختلف عن المخزن (${masterInfo.form})`,
          importedInfo,
          targetProductInfo: masterInfo
        };
      }
    }

    return {
      isSafe: true,
      severity: 'INFO',
      importedInfo,
      targetProductInfo: masterInfo
    };
  }
}
