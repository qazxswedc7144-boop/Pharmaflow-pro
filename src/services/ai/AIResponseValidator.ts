/**
 * PharmaFlow AI Response Validator Engine
 * Enforces medical safety rules, financial integrity checks, and output sanitization.
 */

import { AISafetyCheckResult } from './types';

export class AIResponseValidator {
  // Prohibited pattern rules
  private static DANGEROUS_DOSAGE_PATTERNS = [
    /increase\s+dose\s+to\s+\d+\s*mg/i,
    /override\s+prescription/i,
    /ignore\s+contraindication/i,
    /bypass\t+pharmacist/i,
    /do\s+not\s+consult\s+doctor/i,
  ];

  private static FINANCIAL_AUTHORIZATION_PATTERNS = [
    /auto-approve\s+discount/i,
    /waive\s+debt/i,
    /zero-out\s+balance/i,
    /override\s+tax/i,
  ];

  /**
   * Validates raw text output from AI model.
   */
  public static validateTextResponse(rawText: string, contextModule?: string): AISafetyCheckResult {
    const flaggedCategories: AISafetyCheckResult['flaggedCategories'] = [];
    let isSafe = true;
    let blockReason: string | undefined;

    // Check dangerous pharmacy/dosage claims
    for (const pattern of this.DANGEROUS_DOSAGE_PATTERNS) {
      if (pattern.test(rawText)) {
        isSafe = false;
        flaggedCategories.push('medical_safety');
        blockReason = 'AI response contained unauthorized dosage or prescription override suggestions.';
        break;
      }
    }

    // Check financial authorization claims
    for (const pattern of this.FINANCIAL_AUTHORIZATION_PATTERNS) {
      if (pattern.test(rawText)) {
        isSafe = false;
        flaggedCategories.push('financial_risk');
        blockReason = 'AI response attempted unauthorized financial transaction modifications.';
        break;
      }
    }

    // Append mandatory advisory disclaimer for pharmaceutical Q&A
    let sanitizedText = rawText;
    if (contextModule === 'drugs' || rawText.includes('dosage') || rawText.includes('drug')) {
      if (!sanitizedText.includes('⚠️ تنبيه طبي')) {
        sanitizedText += '\n\n---\n*⚠️ تنبيه طبي: هذه الإرادات مولدة بواسطة الذكاء الاصطناعي كمساعد تحليلي فقط. يجب مراجعة وتأكيد كافة الجرعات والتفاعلات الدوائية من قبل الصيدلي المسؤول قبل اتخاذ أي قرار سريري.*';
      }
    }

    if (contextModule === 'accounting' || contextModule === 'financials') {
      if (!sanitizedText.includes('⚠️ تنبيه المراجعة المالية')) {
        sanitizedText += '\n\n---\n*⚠️ تنبيه المراجعة المالية: التوصيات الماليّة الاسترشادية تتطلب قيام المحاسب المالي المعتمد بالمراجعة ولا تعد إذنًا بالسداد أو التسوية.*';
      }
    }

    return {
      isSafe,
      blockReason,
      flaggedCategories,
      sanitizedText: isSafe ? sanitizedText : undefined,
    };
  }

  /**
   * Validates JSON structured response from AI model.
   */
  public static validateJSONResponse<T>(jsonString: string): { isValid: boolean; parsed?: T; error?: string } {
    try {
      const parsed = JSON.parse(jsonString) as T;
      return { isValid: true, parsed };
    } catch (e: any) {
      return { isValid: false, error: `Invalid JSON returned by AI model: ${e.message}` };
    }
  }
}
