import React, { useEffect, useState } from 'react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidatedTrialBalance } from '../../consolidation.types';

export const SharedTrialBalance: React.FC = () => {
  const [data, setData] = useState<ConsolidatedTrialBalance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    financialApiClient
      .get('/api/consolidation/trial-balance')
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch((err) => console.warn('Failed to load trial balance:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-bold animate-pulse">جاري تحميل ميزان المراجعة المشترك...</div>;
  }

  if (!data || !data.rows || data.rows.length === 0) {
    return <div className="p-4 text-xs text-slate-400 text-center">لا توجد حركات في ميزان المراجعة الموحد حالياً.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b">
            <tr>
              <th className="p-3">رمز الحساب</th>
              <th className="p-3">اسم الحساب</th>
              <th className="p-3">مدين (Debit)</th>
              <th className="p-3">دائن (Credit)</th>
              <th className="p-3">الرصيد الصافي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((row) => (
              <tr key={row.accountCode} className="hover:bg-slate-50">
                <td className="p-3 font-mono font-bold text-slate-600">{row.accountCode}</td>
                <td className="p-3 font-bold text-slate-800">{row.accountName}</td>
                <td className="p-3 font-mono text-emerald-700">${row.debit.toLocaleString()}</td>
                <td className="p-3 font-mono text-rose-700">${row.credit.toLocaleString()}</td>
                <td className="p-3 font-mono font-black text-slate-800">${row.netBalance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100 font-black border-t">
            <tr>
              <td colSpan={2} className="p-3">المجموع الموحد</td>
              <td className="p-3 font-mono text-emerald-800">${data.totalDebit.toLocaleString()}</td>
              <td className="p-3 font-mono text-rose-800">${data.totalCredit.toLocaleString()}</td>
              <td className="p-3 font-mono text-slate-900">${(data.totalDebit - data.totalCredit).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
