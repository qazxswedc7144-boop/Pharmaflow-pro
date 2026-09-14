/**
 * PharmaFlow Prompt Manager
 * Central repository for system instructions, template variables, and safety guardrails.
 */

import { PromptTemplate, AIUserContext } from './types';

export class PromptManager {
  private static templates: Map<string, PromptTemplate> = new Map([
    [
      'inventory_audit_assistant',
      {
        id: 'inventory_audit_assistant',
        name: 'Inventory Audit & Reorder AI',
        description: 'Analyzes stock levels, expiration risks, and recommends optimal purchasing quantities.',
        systemInstruction: `أنت مساعد الذكاء الاصطناعي لإدارة مخزون الصيدليات بـ PharmaFlow ERP.
مهامك:
1. تحليل أصناف المخزون الراكد، القريب من انتهاء الصلاحية، والمنخفض.
2. اقتراح الكميات المثالية لإعادة الطلب دون تجاوز السقف المالي.
3. التنبيه الفوري لأي صنف به انحراف أو هدر.
شروط صارمة:
- لا تقم أبداً بتشجيع تجاوز مدة الصلاحية.
- اكتب الإجابة باللغة العربية المهنية.
- استند فقط إلى البيانات المزودة في السياق المرفق.`,
        userTemplate: `سياق المخزون المتاح:
{{inventoryContext}}

السؤال / الطلب:
{{userQuery}}`,
        requiredScopes: [{ module: 'inventory', action: 'analyze', requiredRole: 'pharmacist' }],
        responseFormat: 'text',
      },
    ],
    [
      'drug_interaction_checker',
      {
        id: 'drug_interaction_checker',
        name: 'Drug Interaction Guard',
        description: 'Checks potential drug-drug or drug-disease contraindications based on active ingredients.',
        systemInstruction: `أنت صيدلي استشاري رقمي متخصص في التحقق من التداخلات الدوائية والجرعات.
الهدف:
فحص المادة الفعالة والتداخلات الدوائية والتحذير من أي مخاطر سمية أو تعارض دوائي.
شروط صارمة:
- لا تعطي بدائل دوائية دون توضيح المادة الفعالة والتركيز.
- يجب دائماً تضمين تنبيه مراجعة الصيدلي المسؤول.`,
        userTemplate: `بيانات الدواء / المواد الفعالة:
{{drugContext}}

استفسار التداخل:
{{userQuery}}`,
        requiredScopes: [{ module: 'drugs', action: 'recommend', requiredRole: 'pharmacist' }],
        responseFormat: 'text',
      },
    ],
    [
      'SMART_PHARMACY_INTELLIGENCE',
      {
        id: 'SMART_PHARMACY_INTELLIGENCE',
        name: 'Smart Pharmacy Intelligence Engine',
        description: 'Read-only comprehensive analysis across inventory, sales, procurement, and financials.',
        systemInstruction: `أنت المحرك الذكي المتقدم للرصد والتحليل الصيدلاني بنظام PharmaFlow ERP.
وظيفتك: قراءة سياق المخزون والمبيعات والمشتريات والمالية وتحليلها بصورة قراءة فقط (READ-ONLY) بالكامل.

تعليمات صارمة:
1. توليد تقرير تحليلي دقيق بصيغة JSON مفصلة ومطابقة للهيكل التالي:
[
  {
    "type": "FACT | INSIGHT | WARNING | RECOMMENDATION | ANOMALY",
    "severity": "INFO | LOW | MEDIUM | HIGH | CRITICAL",
    "confidence": 0.95,
    "domain": "inventory | sales | purchasing | accounting | pharmacy",
    "title": "عنوان باللغة العربية",
    "summary": "ملخص تحليلي استراتيجي",
    "evidence": ["دليل حقيقي من البيانات"],
    "recommendation": "توصية استرشادية واضحة",
    "requiresHumanReview": true
  }
]
2. التمييز الصارم بين الحقائق الموثقة والأرقام وبين التوصيات الاسترشادية والتحذيرات.
3. عدم التوصية أبداً بتجاوز مدة الصلاحية أو تعديل أي سجلات تلقائياً.
4. عند رصد أي انحراف استخدم عبارة "تحديد انحراف محتمل" وليس عبارات جزافية.
5. إذا كانت بيانات الدواء غير متوفرة، صرّح فوراً بأن مصدر المعرفة الدوائية غير متاح ولا تبتكر معلومات.
6. ممنوع تماماً إجراء أية عمليات كتابة أو إنشاء فواتير أو تعديل مخزون.`,
        userTemplate: `سياق النظام المتاح للتحليل:
{{consolidatedContext}}

طلب التحليل الذكي:
{{userQuery}}`,
        requiredScopes: [{ module: 'analytics', action: 'analyze', requiredRole: 'pharmacist' }],
        responseFormat: 'json',
      },
    ],
    [
      'FINANCIAL_HEALTH_AUDIT',
      {
        id: 'FINANCIAL_HEALTH_AUDIT',
        name: 'Financial Health Audit',
        description: 'Audits pharmacy financial health, profit margins, and liquidity.',
        systemInstruction: `أنت المستشار المالي الرقمي لـ PharmaFlow ERP. قدم تحليلاً مالياً شاملاً وقراءة دقيقة لهوامش الربح والسيولة بدون تعديل أية سجلات.`,
        userTemplate: `سياق البيانات المالية:
{{financialContext}}

السؤال:
{{userQuery}}`,
        requiredScopes: [{ module: 'accounting', action: 'analyze', requiredRole: 'accountant' }],
        responseFormat: 'text',
      },
    ],
    [
      'INVENTORY_RISK_CHECK',
      {
        id: 'INVENTORY_RISK_CHECK',
        name: 'Inventory Risk Check',
        description: 'Audits expiring medicines and low stock levels.',
        systemInstruction: `أنت المنسق الذكي للمخزون الصيدلاني. قم بتحليل مخاطر الصلاحية والنواقص واقترح خطط التصريف المناسبة.`,
        userTemplate: `سياق المخزون:
{{inventoryContext}}

السؤال:
{{userQuery}}`,
        requiredScopes: [{ module: 'inventory', action: 'analyze', requiredRole: 'pharmacist' }],
        responseFormat: 'text',
      },
    ],
    [
      'BUSINESS_ANALYTICS',
      {
        id: 'BUSINESS_ANALYTICS',
        name: 'Executive Business Summary',
        description: 'Provides holistic executive performance summary.',
        systemInstruction: `أنت محلل الأعمال التنفيذي بـ PharmaFlow ERP. ملخص شامل وأداء كلي متوازن.`,
        userTemplate: `السياق العام:
{{consolidatedContext}}

السؤال:
{{userQuery}}`,
        requiredScopes: [{ module: 'analytics', action: 'analyze', requiredRole: 'manager' }],
        responseFormat: 'text',
      },
    ],
  ]);

  /**
   * Retrieves prompt template by ID with normalized lookup.
   */
  public static getTemplate(templateId: string): PromptTemplate | undefined {
    if (!templateId) return undefined;
    const direct = this.templates.get(templateId);
    if (direct) return direct;

    const lowerKey = templateId.toLowerCase();
    const aliasMap: Record<string, string> = {
      'financial_health_audit': 'FINANCIAL_HEALTH_AUDIT',
      'inventory_risk_check': 'INVENTORY_RISK_CHECK',
      'business_analytics': 'BUSINESS_ANALYTICS',
      'drug_interaction_check': 'DRUG_INTERACTION_CHECK',
      'expiring_medicines_audit': 'EXPIRING_MEDICINES_AUDIT',
      'stock_reorder_suggestions': 'STOCK_REORDER_SUGGESTIONS',
      'revenue_margin_analysis': 'REVENUE_MARGIN_ANALYSIS',
      'receivable_payable_review': 'RECEIVABLE_PAYABLE_REVIEW',
      'ledger_audit': 'LEDGER_AUDIT',
      'inventory_lookup_guide': 'INVENTORY_LOOKUP_GUIDE',
      'smart_pharmacy_intelligence': 'SMART_PHARMACY_INTELLIGENCE',
    };

    const mappedKey = aliasMap[lowerKey];
    if (mappedKey && this.templates.has(mappedKey)) {
      return this.templates.get(mappedKey);
    }

    for (const [key, tpl] of this.templates.entries()) {
      if (key.toLowerCase() === lowerKey) return tpl;
    }

    return undefined;
  }

  /**
   * Compiles template string with variable values.
   */
  public static compilePrompt(
    templateStr: string,
    variables: Record<string, unknown>
  ): string {
    let result = templateStr;
    for (const [key, val] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      const stringifiedVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
      result = result.replaceAll(placeholder, stringifiedVal);
    }
    return result;
  }

  /**
   * Checks if user has necessary role to execute prompt template.
   */
  public static authorizeUserForTemplate(
    template: PromptTemplate,
    userContext: AIUserContext
  ): { authorized: boolean; reason?: string } {
    const userRole = userContext.userRole as string;
    if (userRole === 'admin') {
      return { authorized: true };
    }

    for (const scope of template.requiredScopes) {
      if (scope.requiredRole === 'admin' && userRole !== 'admin') {
        return { authorized: false, reason: 'صلاحيات المدير الإداري مطلوبة لهذا الاستعلام.' };
      }
      if (scope.requiredRole === 'accountant' && !['admin', 'accountant', 'manager'].includes(userRole)) {
        return { authorized: false, reason: 'صلاحيات المحاسب المالي مطلوبة لهذا الاستعلام.' };
      }
      if (scope.requiredRole === 'pharmacist' && !['admin', 'pharmacist', 'manager'].includes(userRole)) {
        return { authorized: false, reason: 'صلاحيات الصيدلي المسؤول مطلوبة لهذا الاستعلام.' };
      }
    }

    return { authorized: true };
  }
}
