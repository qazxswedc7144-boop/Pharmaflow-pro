import React, { useEffect, useState } from 'react';
import { Sparkles, ShieldAlert } from 'lucide-react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidationSummary } from '../../consolidation.types';

export const FinancialAIReport: React.FC = () => {
  const [summary, setSummary] = useState<ConsolidationSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    financialApiClient
      .get('/api/consolidation/summary')
      .then((res) => {
        if (res.data) setSummary(res.data);
      })
      .catch((err) => console.warn('Failed to load summary for AI report:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 font-bold animate-pulse">
        جاري تحميل تقرير الذكاء المالي التحليلي...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gemini AI Insights Banner */}
      <div className="p-6 bg-gradient-to-br from-[#1E4D4D] to-[#123131] rounded-[24px] text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px]"></div>

        <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-4 mb-6 gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-emerald-400 text-[#1E4D4D] rounded-2xl shadow-lg animate-pulse">
              <Sparkles size={20} />
            </span>
            <div>
              <h3 className="text-base font-black tracking-tight">
                خدمة التحليل المالي والآفاق الفيدرالية المتقدمة (Gemini AI)
              </h3>
              <p className="text-[11px] text-emerald-300">
                تقرير استشاري رفيع المستوى لوحدات اتخاذ القرار بالمجموعة الصيدلية.
              </p>
            </div>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[1.5px] px-3 py-1 bg-white/10 rounded-full">
            تحليل اللحظة الفورية
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-black text-emerald-300 mb-2">أداء وحجم نمو المجموعة</h4>
              <p className="text-xs leading-relaxed text-slate-100">
                {summary?.insights?.revenueGrowthTrends || 'جاري ربط واستقراء بيانات الإيرادات المجمعة للفروع...'}
              </p>
            </div>
          </div>

          <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-black text-emerald-300 mb-2">تحليل الربحية والهياكل</h4>
              <p className="text-xs leading-relaxed text-slate-100">
                {summary?.insights?.profitabilityAnalysis || 'جاري احتساب هامش صافي الربح والتدفق النقد التشغيلي...'}
              </p>
            </div>
          </div>

          <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-black text-emerald-300 mb-2">محرك المخزون واللوجستيات</h4>
              <p className="text-xs leading-relaxed text-slate-100">
                {summary?.insights?.inventoryTurnoverAnalysis || 'جاري تحليل معدل دوران أصناف الأدوية والتوزيع بين الفروع...'}
              </p>
            </div>
          </div>
        </div>

        {summary?.insights?.stockRiskWarnings && summary.insights.stockRiskWarnings.length > 0 && (
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="text-amber-400 shrink-0" size={18} />
            <div>
              <h5 className="text-xs font-black text-amber-300">تحذيرات أمنية من المخزون الراكد أو شحيح الفعالية</h5>
              <ul className="list-disc list-inside text-xs text-slate-200 mt-1.5 space-y-1">
                {summary.insights.stockRiskWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Key Metrics Bento */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[11px] text-slate-400 font-bold mb-1">إجمالي الإيرادات</p>
          <h4 className="text-lg font-mono font-black text-[#1E4D4D]">
            ${summary?.aggregateRevenue?.toLocaleString() || '0.00'}
          </h4>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[11px] text-slate-400 font-bold mb-1">صافي الأرباح</p>
          <h4 className="text-lg font-mono font-black text-emerald-600">
            ${summary?.aggregateNetIncome?.toLocaleString() || '0.00'}
          </h4>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[11px] text-slate-400 font-bold mb-1">أصول المجموعة</p>
          <h4 className="text-lg font-mono font-black text-[#1E4D4D]">
            ${summary?.aggregateAssets?.toLocaleString() || '0.00'}
          </h4>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[11px] text-slate-400 font-bold mb-1">عدد الفروع الفعالة</p>
          <h4 className="text-lg font-mono font-black text-slate-800">
            {summary?.activeBranchesCount || 0} فروع
          </h4>
        </div>
      </div>
    </div>
  );
};
