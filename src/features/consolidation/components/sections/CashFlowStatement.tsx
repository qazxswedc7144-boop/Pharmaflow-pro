import React, { useEffect, useState } from 'react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidatedCashFlow } from '../../consolidation.types';

export const CashFlowStatement: React.FC = () => {
  const [data, setData] = useState<ConsolidatedCashFlow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    financialApiClient
      .get('/api/consolidation/cash-flow')
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch((err) => console.warn('Failed to load cash flow:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-bold animate-pulse">جاري تحميل قائمة التدفقات النقدية...</div>;
  }

  if (!data) {
    return <div className="p-4 text-xs text-slate-400 text-center">لا توجد بيانات تدفقات نقدية متوفرة.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
          <h4 className="text-xs font-black text-[#1E4D4D] border-b pb-2">الأنشطة التشغيلية (Operating)</h4>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">التدفقات النقدية من المبيعات:</span>
            <span className="font-mono font-bold">${data.operatingActivities.cashInflowSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">مدفوعات شراء المخزون:</span>
            <span className="font-mono font-bold text-rose-600">-${data.operatingActivities.cashOutflowInventory.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs border-t pt-2 font-black text-[#1E4D4D]">
            <span>صافي النقد التشغيلي:</span>
            <span className="font-mono">${data.operatingActivities.netOperatingCash.toLocaleString()}</span>
          </div>
        </div>

        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
          <h4 className="text-xs font-black text-[#1E4D4D] border-b pb-2">الأنشطة الاستثمارية (Investing)</h4>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">الأصول والتجهيزات:</span>
            <span className="font-mono font-bold text-rose-600">-${data.investingActivities.capitalExpenditure.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs border-t pt-2 font-black text-[#1E4D4D]">
            <span>صافي النقد الاستثماري:</span>
            <span className="font-mono">${data.investingActivities.netInvestingCash.toLocaleString()}</span>
          </div>
        </div>

        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
          <h4 className="text-xs font-black text-[#1E4D4D] border-b pb-2">الأنشطة التمويلية (Financing)</h4>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">التسهيلات والقروض:</span>
            <span className="font-mono font-bold">${data.financingActivities.equityIssued.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs border-t pt-2 font-black text-[#1E4D4D]">
            <span>صافي النقد التمويلي:</span>
            <span className="font-mono">${data.financingActivities.netFinancingCash.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
        <span className="font-bold text-emerald-900">رصيد النقدية النهائي للفروع المجمعة:</span>
        <span className="font-mono font-black text-base text-emerald-800">${data.endingCashBalance.toLocaleString()}</span>
      </div>
    </div>
  );
};
