import React, { useEffect, useState } from 'react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidatedIncomeStatement as IncomeStatementType } from '../../consolidation.types';

export const ConsolidatedIncomeStatement: React.FC = () => {
  const [data, setData] = useState<IncomeStatementType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    financialApiClient
      .get('/api/consolidation/income-statement')
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch((err) => console.warn('Failed to load income statement:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-bold animate-pulse">جاري تحميل قائمة الدخل الموحدة...</div>;
  }

  if (!data) {
    return <div className="p-4 text-xs text-slate-400 text-center">لا توجد بيانات قائمة دخل متوفرة.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
          <p className="text-[11px] text-slate-500 mb-1">إجمالي المبيعات/الإيرادات</p>
          <h4 className="text-lg font-mono font-black text-[#1E4D4D]">${data.revenue.toLocaleString()}</h4>
        </div>
        <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl">
          <p className="text-[11px] text-slate-500 mb-1">تكلفة البضاعة المباعة (COGS)</p>
          <h4 className="text-lg font-mono font-black text-rose-700">${data.costOfGoodsSold.toLocaleString()}</h4>
        </div>
        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
          <p className="text-[11px] text-slate-500 mb-1">مجمل الربح (Gross Profit)</p>
          <h4 className="text-lg font-mono font-black text-blue-700">${data.grossProfit.toLocaleString()}</h4>
        </div>
        <div className="p-4 bg-emerald-100/60 border border-emerald-200 rounded-xl">
          <p className="text-[11px] text-slate-600 mb-1">صافي الدخل النهائي</p>
          <h4 className="text-lg font-mono font-black text-emerald-800">${data.netIncome.toLocaleString()}</h4>
        </div>
      </div>

      {/* OPEX Breakdown */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
        <h4 className="text-xs font-black text-slate-700 border-b pb-2">تفاصيل المصروفات التشغيلية الموحدة (OPEX)</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block mb-0.5">الرواتب والأجور:</span>
            <span className="font-mono font-bold text-slate-700">${data.operatingExpenses.salary.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">الإيجارات:</span>
            <span className="font-mono font-bold text-slate-700">${data.operatingExpenses.rent.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">المرافق والخدمات:</span>
            <span className="font-mono font-bold text-slate-700">${data.operatingExpenses.utilities.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">المصروفات الأخرى:</span>
            <span className="font-mono font-bold text-slate-700">${data.operatingExpenses.other.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
