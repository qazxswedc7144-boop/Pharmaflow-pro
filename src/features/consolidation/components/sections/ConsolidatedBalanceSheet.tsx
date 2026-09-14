import React, { useEffect, useState } from 'react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidatedBalanceSheet as BalanceSheetType } from '../../consolidation.types';
import { CheckCircle, AlertTriangle } from 'lucide-react';

export const ConsolidatedBalanceSheet: React.FC = () => {
  const [data, setData] = useState<BalanceSheetType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    financialApiClient
      .get('/api/consolidation/balance-sheet')
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch((err) => console.warn('Failed to load balance sheet:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-bold animate-pulse">جاري تحميل الميزانية الموحدة...</div>;
  }

  if (!data) {
    return <div className="p-4 text-xs text-slate-400 text-center">لا توجد بيانات ميزانية عمومية متوفرة.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">آخر تحديث: {new Date(data.timestamp).toLocaleString('ar-SA')}</span>
        <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 ${data.isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {data.isBalanced ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
          {data.isBalanced ? 'الميزانية متوازنة تماماً' : 'غير متوازنة - يوجد فارق تسوية'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Assets */}
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
          <h4 className="text-xs font-black text-[#1E4D4D] border-b pb-2">الأصول الموحدة (Assets)</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">النقدية وما يعادلها:</span>
              <span className="font-mono font-bold">${data.assets.cashAndCashEquivalents.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ذمم مديرة/عملاء:</span>
              <span className="font-mono font-bold">${data.assets.accountsReceivable.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">مخزون الأدوية والبضائع:</span>
              <span className="font-mono font-bold">${data.assets.inventoryValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-black text-[#1E4D4D]">
              <span>إجمالي الأصول:</span>
              <span className="font-mono text-sm">${data.assets.totalAssets.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Liabilities */}
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
          <h4 className="text-xs font-black text-rose-700 border-b pb-2">الالتزامات الموحدة (Liabilities)</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">ذمم دائنة/موردين:</span>
              <span className="font-mono font-bold">${data.liabilities.accountsPayable.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">التزامات متداولة أخرى:</span>
              <span className="font-mono font-bold">${data.liabilities.otherCurrentLiabilities.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-black text-rose-700">
              <span>إجمالي الالتزامات:</span>
              <span className="font-mono text-sm">${data.liabilities.totalLiabilities.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Equity */}
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
          <h4 className="text-xs font-black text-emerald-700 border-b pb-2">حقوق الملكية (Equity)</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">رأس المال المشترك:</span>
              <span className="font-mono font-bold">${data.equity.shareCapital.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الأرباح المبقاة المجمعة:</span>
              <span className="font-mono font-bold">${data.equity.retainedEarnings.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-black text-emerald-700">
              <span>إجمالي حقوق الملكية:</span>
              <span className="font-mono text-sm">${data.equity.totalEquity.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
