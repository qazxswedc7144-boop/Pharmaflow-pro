import React from 'react';
import { ArrowRight, Layers, RefreshCw } from 'lucide-react';

interface FinancialIntegrationHeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: string;
  onNavigateBack?: () => void;
}

export const FinancialIntegrationHeader: React.FC<FinancialIntegrationHeaderProps> = ({
  onRefresh,
  isRefreshing = false,
  lastUpdated = "5:41:57 م",
  onNavigateBack,
}) => {
  const handleBack = () => {
    if (onNavigateBack) {
      onNavigateBack();
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 dir-rtl text-right" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* الجزء الأيمن: زر العودة + الأيقونة + شارة النسخة والعنوان */}
        <div className="flex items-start md:items-center gap-3">
          
          {/* 1. زر العودة أقصى اليمين */}
          <button
            onClick={handleBack}
            title="العودة للوحة التحكم الرئيسية"
            className="flex items-center justify-center p-2.5 rounded-xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-all duration-200 mt-1 md:mt-0 shrink-0 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* 2. الأيقونة الخضراء */}
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0 mt-1 md:mt-0">
            <Layers className="w-6 h-6" />
          </div>

          {/* 3. الشارة والعنوان الرئيسي */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block px-2.5 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-100/60 rounded-full">
                النسخة القياسية 4.3
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 leading-snug">
              بوابة الاندماج المالي والتحليلات الفيدرالية الموحدة
            </h1>
          </div>

        </div>

        {/* الجزء الأيسر: آخر تحديث وزر التنسيق/التحديث */}
        <div className="flex items-center gap-3 self-end md:self-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
          <div className="text-right px-2">
            <p className="text-[11px] text-slate-400 font-medium">آخر تحديث فيدرالي</p>
            <p className="text-xs font-bold text-slate-700 dir-ltr">{lastUpdated}</p>
          </div>
          <button 
            onClick={onRefresh}
            disabled={isRefreshing}
            title="تحديث البيانات"
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors shadow-none hover:shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

      </div>

      {/* النص الوصفي تحت العنوان مباشرة */}
      <p className="text-sm text-slate-500 mt-3 pr-14 md:pr-24 leading-relaxed">
        تجميع فوري للمركز المالي للأرصدة والذمم والمخزون عبر كافة صيدليات المجموعة مع إلغاء المعاملات البينية.
      </p>
    </div>
  );
};

export default FinancialIntegrationHeader;
