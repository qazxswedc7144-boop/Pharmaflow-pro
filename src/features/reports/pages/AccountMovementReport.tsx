
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/core/db';
import { useUI, useAccounting } from '@/contexts/AppContext';
import ReportPageLayout from '../components/ReportPageLayout';
import { Badge } from '@/components/shared/SharedUI';
import { Hash, ArrowUpRight, ArrowDownLeft, Wallet, CreditCard } from 'lucide-react';
import { ExportService } from '@/services/data/exportService';
import { FixedSizeList as List } from 'react-window';

const AccountMovementReport: React.FC<{ onNavigate?: (view: any) => void }> = ({ onNavigate }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState({ from: "", to: "", accountId: "" });
  const { currency } = useUI();
  const { accounts } = useAccounting();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const entries = await db.getJournalEntries();
        const movements: any[] = [];
        
        // Sort entries by date first
        entries.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const accountBalances: Record<string, number> = {};

        entries.forEach((entry: any) => {
          if (!entry.lines) return;
          entry.lines.forEach((line: any) => {
            const accId = line.accountId || line.account_id;
            if (accountBalances[accId] === undefined) accountBalances[accId] = 0;
            
            accountBalances[accId] += (line.debit - line.credit);
            
            movements.push({
              id: line.id || line.lineId || Math.random().toString(),
              accountId: accId,
              date: entry.date,
              ref: entry.reference_id || entry.id,
              type: entry.sourceType || 'قيد يدوي',
              description: entry.description || 'لا يوجد وصف',
              accountName: line.accountName,
              amount: line.debit > 0 ? line.debit : -line.credit,
              balanceAfter: accountBalances[accId]
            });
          });
        });

        setData(movements.reverse());
      } catch (error) {
        console.error("Failed to fetch account movements:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(m => {
      const matchesSearch = (m.accountName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) || 
                            (m.description?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                            (m.ref?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      const matchesFrom = !dateFilter.from || m.date >= dateFilter.from;
      const matchesTo = !dateFilter.to || m.date <= dateFilter.to;
      const matchesAccount = !dateFilter.accountId || m.accountId === dateFilter.accountId;
      return matchesSearch && matchesFrom && matchesTo && matchesAccount;
    });
  }, [data, searchTerm, dateFilter]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      if (curr.amount > 0) acc.debit += curr.amount;
      else acc.credit += Math.abs(curr.amount);
      return acc;
    }, { debit: 0, credit: 0 });
  }, [filteredData]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-[#1E4D4D] border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <ReportPageLayout
      title="حركة الحسابات"
      onBack={() => onNavigate?.('reports')}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      onFilterChange={(from, to, accountId) => setDateFilter({ from, to, accountId: accountId || "" })}
      filterOptions={accounts.map(acc => ({ label: acc.name || acc.account_name || "", value: acc.id || acc.account_id || "" }))}
      filterLabel="تصفية حسب الحساب"
      summaryCards={[
        { label: "إجمالي المدين", value: `${totals.debit.toLocaleString()} ${currency}`, icon: <ArrowDownLeft size={16} />, color: "bg-emerald-50 text-emerald-600" },
        { label: "إجمالي الدائن", value: `${totals.credit.toLocaleString()} ${currency}`, icon: <ArrowUpRight size={16} />, color: "bg-red-50 text-red-600" },
        { label: "صافي التغير", value: `${(totals.debit - totals.credit).toLocaleString()} ${currency}`, icon: <Wallet size={16} />, color: "bg-blue-50 text-blue-600" },
        { label: "عدد العمليات", value: filteredData.length, icon: <CreditCard size={16} />, color: "bg-purple-50 text-purple-600" }
      ]}
      onExportExcel={() => ExportService.exportToCSV(filteredData, "AccountMovementReport")}
      onExportPDF={() => ExportService.exportToPDFFile(
        "تقرير حركة الحسابات",
        ["التاريخ", "المرجع", "النوع", "الحساب", "المبلغ", "الرصيد"],
        filteredData.map(d => [d.date, d.ref, d.type, d.accountName, d.amount, d.balanceAfter]),
        "AccountMovementReport"
      )}
      onPrint={() => window.print()}
    >
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="bg-[#F8FAFA] text-slate-400 font-black text-[10px] uppercase tracking-widest border-b border-slate-100 flex px-6 py-4">
          <div className="w-2/12 text-right">التاريخ</div>
          <div className="w-2/12 text-right">رقم العملية</div>
          <div className="w-2/12 text-right">نوع العملية</div>
          <div className="w-3/12 text-right">الحساب</div>
          <div className="w-1/12 text-center">المبلغ</div>
          <div className="w-2/12 text-center">الرصيد بعد العملية</div>
        </div>

        {filteredData.length === 0 ? (
          <div className="px-6 py-20 text-center text-slate-300 font-black italic">
            لا توجد نتائج تطابق البحث أو الفلترة المختارة
          </div>
        ) : (
          <List
            height={Math.min(500, Math.max(200, filteredData.length * 60))}
            itemCount={filteredData.length}
            itemSize={60}
            width="100%"
            className="custom-scrollbar divide-y divide-slate-50"
          >
            {({ index, style }) => {
              const m = filteredData[index];
              if (!m) return null;

              return (
                <div
                  style={style}
                  key={index}
                  className="flex items-center text-right text-xs px-6 py-3 hover:bg-slate-50/80 transition-colors border-b border-slate-50"
                >
                  <div className="w-2/12 font-bold text-slate-500">
                    {new Date(m.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="w-2/12 text-slate-700 font-bold truncate">
                    <div className="flex items-center gap-2">
                      <Hash size={12} className="text-slate-300 shrink-0" />
                      <span className="truncate">{m.ref}</span>
                    </div>
                  </div>
                  <div className="w-2/12">
                    <Badge variant="info">{m.type}</Badge>
                  </div>
                  <div className="w-3/12 font-bold text-slate-700 truncate">
                    {m.accountName}
                  </div>
                  <div className={`w-1/12 text-center font-black ${m.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {m.amount.toLocaleString()} {currency}
                  </div>
                  <div className="w-2/12 text-center font-black text-[#1E4D4D]">
                    {m.balanceAfter.toLocaleString()} {currency}
                  </div>
                </div>
              );
            }}
          </List>
        )}
      </div>
    </ReportPageLayout>
  );
};

export default AccountMovementReport;
