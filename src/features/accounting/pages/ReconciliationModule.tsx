import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Search,
  FileCheck,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';

interface AuditItem {
  id: string;
  date: string;
  type: 'INVENTORY' | 'BRANCH_TRANSFER' | 'CASH_DRAWER' | 'BANK_STATEMENT';
  title: string;
  systemValue: number;
  actualValue: number;
  difference: number;
  status: 'MATCHED' | 'DISCREPANCY' | 'PENDING';
}

interface ReconciliationModuleProps {
  onNavigate?: (view: string, params?: any) => void;
}

export const ReconciliationModule: React.FC<ReconciliationModuleProps> = ({ onNavigate }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'MATCHED' | 'DISCREPANCY' | 'PENDING'>('ALL');

  const [auditItems] = useState<AuditItem[]>([
    {
      id: 'AUD-101',
      date: '2026-09-01',
      type: 'INVENTORY',
      title: 'مطابقة مخزون الباراسيتامول 500ملغم',
      systemValue: 150,
      actualValue: 145,
      difference: -5,
      status: 'DISCREPANCY',
    },
    {
      id: 'AUD-102',
      date: '2026-09-01',
      type: 'CASH_DRAWER',
      title: 'إغلاق الدرج - الوردية الصباحية',
      systemValue: 45000,
      actualValue: 45000,
      difference: 0,
      status: 'MATCHED',
    },
    {
      id: 'AUD-103',
      date: '2026-08-31',
      type: 'BRANCH_TRANSFER',
      title: 'تحويل شحنة أدوية لفرع الأمل',
      systemValue: 12000,
      actualValue: 12000,
      difference: 0,
      status: 'MATCHED',
    },
    {
      id: 'AUD-104',
      date: '2026-08-30',
      type: 'BANK_STATEMENT',
      title: 'مطابقة حساب كاك بنك - كشف أغسطس',
      systemValue: 350000,
      actualValue: 342000,
      difference: -8000,
      status: 'PENDING',
    },
  ]);

  const filteredItems = useMemo(() => {
    return auditItems.filter((item) => {
      const matchesSearch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [auditItems, search, filterStatus]);

  const stats = useMemo(() => {
    const total = auditItems.length;
    const matched = auditItems.filter((i) => i.status === 'MATCHED').length;
    const discrepancy = auditItems.filter((i) => i.status === 'DISCREPANCY').length;
    const pending = auditItems.filter((i) => i.status === 'PENDING').length;
    return { total, matched, discrepancy, pending };
  }, [auditItems]);

  const handleBack = () => {
    if (onNavigate) {
      onNavigate('back');
    } else {
      window.history.back();
    }
  };

  return (
    <div dir="rtl" className="min-h-screen w-full bg-[#f7f9f9] text-slate-800 px-[1px] pb-8 font-sans">
      <div className="w-full max-w-6xl mx-auto space-y-3">
        {/* HEADER */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={handleBack}
                aria-label="رجوع"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#064e46] text-white flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              >
                <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-black text-[#064e46] leading-tight">
                  مركز المطابقة والتدقيق
                </h1>
                <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  AUDIT & RECONCILIATION CENTER
                </p>
              </div>
            </div>

            <div className="hidden sm:flex shrink-0 w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center text-[#064e46]">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>

          {/* SEARCH & FILTERS */}
          <div className="mt-4 space-y-2.5">
            <div className="relative w-full">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#064e46] pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم عملية المطابقة، رقم البند..."
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-3 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {[
                { id: 'ALL', label: 'الكل' },
                { id: 'DISCREPANCY', label: 'يوجد فروقات' },
                { id: 'PENDING', label: 'قيد التدقيق' },
                { id: 'MATCHED', label: 'مطابق' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setFilterStatus(st.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all ${
                    filterStatus === st.id
                      ? 'bg-[#064e46] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
          <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-2xs">
            <p className="text-[10px] font-bold text-slate-400">إجمالي عمليات المطابقة</p>
            <p className="mt-0.5 text-base sm:text-xl font-black text-[#064e46]">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-2xs">
            <p className="text-[10px] font-bold text-emerald-600">عمليات مطابقة بنجاح</p>
            <p className="mt-0.5 text-base sm:text-xl font-black text-emerald-600">{stats.matched}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-2xs">
            <p className="text-[10px] font-bold text-red-500">فروقات تحتاج معالجة</p>
            <p className="mt-0.5 text-base sm:text-xl font-black text-red-600">{stats.discrepancy}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-2xs">
            <p className="text-[10px] font-bold text-amber-500">قيد المراجعة والتدقيق</p>
            <p className="mt-0.5 text-base sm:text-xl font-black text-amber-600">{stats.pending}</p>
          </div>
        </section>

        {/* MAIN CONTAINER */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#064e46]" />
              <h2 className="text-xs sm:text-sm font-black text-slate-800">سجل المطابقات والتدقيق</h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#064e46] text-[10px] font-black">
              {filteredItems.length} بند
            </span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-bold text-xs">
              لا توجد عناصر مطابقة مطابقة لخيارات التصفية
            </div>
          ) : (
            <>
              {/* MOBILE CARDS */}
              <div className="block md:hidden divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <div key={item.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-slate-400">{item.id}</span>
                      <span className="text-slate-500 font-bold">{item.date}</span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-800">{item.title}</h3>

                    <div className="grid grid-cols-3 gap-1 bg-slate-50 p-2 rounded-xl text-center text-[10px]">
                      <div>
                        <span className="text-slate-400 block">النظام</span>
                        <span className="font-bold text-slate-700">{item.systemValue}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">الفعلي</span>
                        <span className="font-bold text-slate-700">{item.actualValue}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">الفرق</span>
                        <span
                          className={`font-black ${
                            item.difference < 0
                              ? 'text-red-600'
                              : item.difference > 0
                              ? 'text-blue-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {item.difference}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                          item.status === 'MATCHED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : item.status === 'DISCREPANCY'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {item.status === 'MATCHED' && <CheckCircle2 className="w-3 h-3" />}
                        {item.status === 'DISCREPANCY' && <AlertTriangle className="w-3 h-3" />}
                        {item.status === 'PENDING' && <HelpCircle className="w-3 h-3" />}
                        {item.status === 'MATCHED' ? 'مطابق' : item.status === 'DISCREPANCY' ? 'فروقات' : 'قيد النظر'}
                      </span>

                      <button className="px-3 py-1 bg-[#064e46] text-white rounded-lg text-xs font-bold">
                        معالجة
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP TABLE */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="p-3 font-bold">معرف البند</th>
                      <th className="p-3 font-bold">التاريخ</th>
                      <th className="p-3 font-bold">عملية المطابقة</th>
                      <th className="p-3 font-bold text-center">قيمة النظام</th>
                      <th className="p-3 font-bold text-center">القيمة الفعلية</th>
                      <th className="p-3 font-bold text-center">الفارق</th>
                      <th className="p-3 font-bold text-center">الحالة</th>
                      <th className="p-3 font-bold text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono font-bold text-slate-700">{item.id}</td>
                        <td className="p-3 text-slate-500">{item.date}</td>
                        <td className="p-3 font-bold text-slate-800">{item.title}</td>
                        <td className="p-3 text-center font-bold text-slate-700">{item.systemValue}</td>
                        <td className="p-3 text-center font-bold text-slate-700">{item.actualValue}</td>
                        <td
                          className={`p-3 text-center font-black ${
                            item.difference < 0
                              ? 'text-red-600'
                              : item.difference > 0
                              ? 'text-blue-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {item.difference}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`text-[10px] px-2 py-1 rounded-md font-bold inline-flex items-center gap-1 ${
                              item.status === 'MATCHED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : item.status === 'DISCREPANCY'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {item.status === 'MATCHED' ? 'مطابق' : item.status === 'DISCREPANCY' ? 'فروقات' : 'معلق'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button className="px-3 py-1 bg-[#064e46] text-white rounded-lg text-xs font-bold">
                            تسوية
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ReconciliationModule;
      
