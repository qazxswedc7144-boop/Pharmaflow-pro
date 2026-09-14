/**
 * PharmaFlow AI Copilot - Role-Based Prompt Suggestions Component
 * Provides context-aware quick suggestion chips for Admin, Pharmacist, Accountant, and Staff.
 */

import React, { memo } from 'react';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  FileSpreadsheet,
  Pill,
  DollarSign,
  PackageCheck,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';

export interface PromptSuggestionItem {
  id: string;
  title: string;
  description: string;
  promptText: string;
  contexts?: Array<'inventory' | 'sales' | 'purchases' | 'financials' | 'drugInfo'>;
  promptId?: string;
  icon: React.ElementType;
  badge: string;
}

interface PromptSuggestionsProps {
  userRole: 'admin' | 'pharmacist' | 'accountant' | 'manager' | 'staff';
  onSelectPrompt: (
    promptText: string,
    contexts?: Array<'inventory' | 'sales' | 'purchases' | 'financials' | 'drugInfo'>,
    promptId?: string
  ) => void;
}

const ROLE_SUGGESTIONS: Record<string, PromptSuggestionItem[]> = {
  admin: [
    {
      id: 'admin_fin',
      title: 'تقرير الصحة المالية والإيرادات',
      description: 'تحليل هامش الربح والسيولة والأداء المالي',
      promptText: 'قم بتحليل الصحة المالية العامة للصيدلية وهامش الربح الإجمالي وصافي الربح للخدمة الميدانية.',
      contexts: ['financials', 'sales'],
      promptId: 'FINANCIAL_HEALTH_AUDIT',
      icon: TrendingUp,
      badge: 'مالية',
    },
    {
      id: 'admin_inv_risk',
      title: 'فحص مخاطر وتواريخ انتهاء المخزون',
      description: 'مراجعة المنتجات المنتهية والمخزون المنخفض',
      promptText: 'اعرض لي تقريراً شاملاً بمخاطر المخزون والأدوية القريبة من الانتهاء والأصناف المطلوبة.',
      contexts: ['inventory'],
      promptId: 'INVENTORY_RISK_CHECK',
      icon: ShieldAlert,
      badge: 'مخزون',
    },
    {
      id: 'admin_biz_analytics',
      title: 'ملخص الأداء التنفيذي',
      description: 'نظرة شمولية على المبيعات والمشتريات والنمو',
      promptText: 'أعطني ملخصاً تنفيذياً شمولياً لأداء المبيعات والمشتريات والمخزون الحالي.',
      contexts: ['sales', 'inventory', 'financials'],
      promptId: 'BUSINESS_ANALYTICS',
      icon: FileSpreadsheet,
      badge: 'إدارة',
    },
  ],
  pharmacist: [
    {
      id: 'pharm_drug_check',
      title: 'فحص التداخلات وموانع الاستعمال',
      description: 'التحقق من سلامة الأدوية والجرعات الصيدلانية',
      promptText: 'أريد التحقق من المادة الفعالة والتداخلات الدوائية وموانع الاستعمال لهذا الدواء.',
      contexts: ['drugInfo'],
      promptId: 'DRUG_INTERACTION_CHECK',
      icon: Pill,
      badge: 'دواء',
    },
    {
      id: 'pharm_expiry_audit',
      title: 'تدقيق الأدوية القريبة من الانتهاء',
      description: 'مراجعة الأكواد والتصريف قبل الانتهاء',
      promptText: 'قم بتدقيق الأدوية القريبة من الانتهاء واقترح إجراءات التصريف المناسبة.',
      contexts: ['inventory'],
      promptId: 'EXPIRING_MEDICINES_AUDIT',
      icon: AlertTriangle,
      badge: 'صلاحية',
    },
    {
      id: 'pharm_reorder',
      title: 'توصيات إعادة الطلب والنواقص',
      description: 'تحديد الأصناف دون حد الأمان الصيدلاني',
      promptText: 'اقترح قائمة بالأدوية النواقص المطلوبة لإعادة النواقص طبقاً لمعدل الاستهلاك.',
      contexts: ['inventory', 'purchases'],
      promptId: 'STOCK_REORDER_SUGGESTIONS',
      icon: PackageCheck,
      badge: 'إعادة طلب',
    },
  ],
  accountant: [
    {
      id: 'acc_margin',
      title: 'تحليل الربحية وهوامش المبيعات',
      description: 'فحص ربحية المنتجات والعملاء والأصناف',
      promptText: 'قم بتحليل هوامش مبيعات الصيدلية وتحديد المنتجات والعملاء الأكثر ربحية.',
      contexts: ['financials', 'sales'],
      promptId: 'REVENUE_MARGIN_ANALYSIS',
      icon: DollarSign,
      badge: 'محاسبة',
    },
    {
      id: 'acc_receivables',
      title: 'مراجعة الذمم والديون المترتبة',
      description: 'تحليل أعمار الديون للموردين والعملاء',
      promptText: 'حلل الذمم المدينة والدائنة وأعمار الديون وأعطني توصيات بالتحصيل والسداد.',
      contexts: ['financials'],
      promptId: 'RECEIVABLE_PAYABLE_REVIEW',
      icon: TrendingUp,
      badge: 'ذمم',
    },
    {
      id: 'acc_ledger',
      title: 'تدقيق القيود والالتزامات',
      description: 'مراجعة الميزانية والتزامات الصيدلية',
      promptText: 'أجرِ تدقيقاً على القيود الحسابية والالتزامات المالية القائمة للفرع.',
      contexts: ['financials'],
      promptId: 'LEDGER_AUDIT',
      icon: FileSpreadsheet,
      badge: 'تدقيق',
    },
  ],
  staff: [
    {
      id: 'staff_inv',
      title: 'استعلام سريع عن الأصناف',
      description: 'فحص توفر الأدوية والكميات المتاحة',
      promptText: 'هل الأصناف الأساسية متوفرة في المخزون وما هي حالة الكميات الآن؟',
      contexts: ['inventory'],
      promptId: 'INVENTORY_LOOKUP_GUIDE',
      icon: PackageCheck,
      badge: 'مخزون',
    },
    {
      id: 'staff_guide',
      title: 'دليل استخدام المساعد الذكي',
      description: 'كيف يساعدك الكوبايلوت في أعمالك اليومية',
      promptText: 'كيف يمكن للمساعد الذكي مساعدتي في مهام الصيدلية اليومية بفعالية؟',
      contexts: [],
      icon: HelpCircle,
      badge: 'مساعدة',
    },
  ],
};

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = memo(({ userRole, onSelectPrompt }) => {
  const suggestions = ROLE_SUGGESTIONS[userRole] || ROLE_SUGGESTIONS.staff || [];

  return (
    <div className="w-full space-y-3" dir="rtl">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1">
        <Sparkles size={14} className="text-teal-600 animate-pulse" />
        <span>مقترحات ذكية مخصصة لدورك ({userRole}):</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {suggestions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelectPrompt(item.promptText, item.contexts, item.promptId)}
              className="flex items-start gap-3 p-3 text-right bg-white hover:bg-teal-50/60 border border-slate-200 hover:border-teal-300 rounded-2xl transition-all shadow-xs group cursor-pointer"
            >
              <div className="p-2 rounded-xl bg-teal-50 group-hover:bg-teal-600 text-teal-600 group-hover:text-white transition-colors shrink-0 mt-0.5">
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-xs font-bold text-slate-800 group-hover:text-teal-900 truncate">
                    {item.title}
                  </span>
                  <span className="text-[10px] font-semibold text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-full shrink-0">
                    {item.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight line-clamp-1">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

PromptSuggestions.displayName = 'PromptSuggestions';
