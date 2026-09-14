
import React, { useState, useMemo, useRef, useDeferredValue, useEffect } from 'react';
import { useAccounting, useUI } from '@/contexts/AppContext';
import { AccountingEntry } from '@/types';
import { FixedSizeList as List } from 'react-window';
import { Button, Modal } from '@/components/shared/SharedUI';
import { 
  FileText, Filter,
  ArrowUpRight, ArrowDownLeft, Layers, CheckCircle2, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BackButton } from '@/components/shared/BackButton';

interface AccountingModuleProps {
  onNavigate?: (view: string) => void;
}

interface FlattenedJournalLine {
  id: string;
  entryId: string;
  date: string;
  description: string;
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  runningBalance: number;
  sourceId?: string;
  status?: string;
  sourceType?: string;
  entry: AccountingEntry;
}

const AccountingModule: React.FC<AccountingModuleProps> = ({ onNavigate }) => {
  const { journalEntries } = useAccounting();
  const { currency, formatCurrency } = useUI();
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [selectedEntry, setSelectedEntry] = useState<AccountingEntry | null>(null);
  const [showFullArchive, setShowFullArchive] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(500);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        // Reserve height for header and summary footer inside container
        const available = containerRef.current.clientHeight - 48 - 56;
        setListHeight(Math.max(available, 350));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const flattenedLines = useMemo(() => {
    const lines: FlattenedJournalLine[] = [];
    let runningBalance = 0;
    
    // Sort entries by date
    const sortedEntries = [...journalEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sortedEntries.forEach(entry => {
      entry.lines.forEach(line => {
        runningBalance += (line.debit - line.credit);
        
        lines.push({
          ...line,
          date: entry.date,
          description: entry.description || '',
          sourceId: entry.sourceId,
          sourceType: entry.sourceType,
          status: entry.status,
          runningBalance,
          entry
        });
      });
    });
    
    // Reverse for display (newest first)
    return lines.reverse();
  }, [journalEntries]);

  const filteredLines = useMemo(() => {
    let baseData = (deferredSearch.trim() || showFullArchive) ? flattenedLines : flattenedLines.slice(0, 500);
    
    if (!deferredSearch.trim()) return baseData;
    
    const term = deferredSearch.toLowerCase();
    return flattenedLines.filter(l => 
      l.accountName?.toLowerCase().includes(term) ||
      l.description?.toLowerCase().includes(term) ||
      l.sourceId?.toLowerCase().includes(term) ||
      l.accountId?.toLowerCase().includes(term)
    );
  }, [flattenedLines, deferredSearch, showFullArchive]);

  const stats = useMemo(() => ({
    totalVolume: journalEntries.reduce((acc, e) => acc + (e.lines.reduce((s, l) => s + l.debit, 0)), 0),
    entryCount: journalEntries.length
  }), [journalEntries]);

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const line = filteredLines[index];
    if (!line) return null;
    
    const findEntry = () => {
      const entry = journalEntries.find(e => e.id === line.entryId || e.entry_id === line.entryId);
      if (entry) setSelectedEntry(entry);
    };
    
    return (
      <div style={style} className="px-0">
        <motion.div 
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border-b border-slate-100 h-full flex items-center px-0 hover:bg-slate-50/80 transition-colors group cursor-pointer"
          onClick={findEntry}
        >
          <div className="w-[16%] md:w-[15%] px-4 text-right truncate">
            <p className="text-[11px] font-black text-[#1E4D4D]">{new Date(line.date).toLocaleDateString('ar-SA')}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">#{line.sourceId}</p>
          </div>

          <div className="w-[24%] md:w-[22%] px-4 text-right truncate">
            <p className="text-[11px] font-black text-[#1E4D4D] truncate">{line.accountName}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">كود: {line.accountId}</p>
          </div>

          <div className="flex-1 px-4 text-right min-w-[120px] truncate">
            <p className="text-[11px] font-medium text-slate-600 truncate">{line.description || '—'}</p>
          </div>

          <div className="w-[18%] md:w-[16%] px-4 text-center">
            {line.credit > 0 ? (
              <div className="inline-flex items-center justify-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                <span className="text-[11px] font-black">{line.credit.toLocaleString()}</span>
                <ArrowUpRight size={13} className="stroke-[2.5px]" />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center gap-1 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                <span className="text-[11px] font-black">{line.debit.toLocaleString()}</span>
                <ArrowDownLeft size={13} className="stroke-[2.5px]" />
              </div>
            )}
          </div>

          <div className="w-[18%] md:w-[16%] px-4 text-left">
            <p className={`text-[11px] font-black ${line.runningBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {line.runningBalance.toLocaleString()} <span className="text-[9px] font-normal opacity-60">{currency}</span>
            </p>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-full w-full px-2 sm:px-4 py-2 sm:py-4 font-cairo space-y-4" dir="rtl">
      {/* Modern Header Section */}
      <header className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden shrink-0 w-full">
        {/* Row 1: Back Button & Title */}
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            {onNavigate && (
              <BackButton onClick={() => onNavigate('dashboard')} />
            )}
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[#1E4D4D] tracking-tight">دفتر الأستاذ العام</h2>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">General Ledger & Journal Entries</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-emerald-50/80 text-[#1E4D4D] px-3.5 py-1.5 rounded-xl border border-emerald-100">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span className="text-xs font-bold">النظام المحاسبي متوازن</span>
          </div>
        </div>

        {/* Row 2: Search & Controls */}
        <div className="px-4 sm:px-6 py-3.5 flex flex-col md:flex-row items-center gap-3 bg-slate-50/50">
          <div className="relative flex-1 w-full">
            <input 
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-4 text-xs font-bold text-slate-800 focus:border-[#1E4D4D] focus:ring-2 focus:ring-[#1E4D4D]/10 outline-none shadow-xs transition-all text-right placeholder:text-slate-400" 
              placeholder="ابحث في القيود، اسم الحساب، المرجع، أو البيان..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button 
              onClick={() => setShowFullArchive(!showFullArchive)}
              className={`px-4 h-11 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${showFullArchive ? 'bg-[#1E4D4D] text-white border-[#1E4D4D] shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <Layers size={14} /> {showFullArchive ? 'الأرشيف الكامل' : 'عرض المعاملات الأخيرة'}
            </button>
            <button 
              className="w-11 h-11 bg-white text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-50 border border-slate-200 shadow-xs"
              title="تصفية"
            >
              <Filter size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Ledger Content Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[500px]" ref={containerRef}>
        {/* Table Header */}
        <div className="bg-slate-50 border-b border-slate-200 flex items-center text-[11px] font-black text-slate-500 uppercase tracking-wider shrink-0 h-12">
          <div className="w-[16%] md:w-[15%] px-4 text-right">التاريخ والمرجع</div>
          <div className="w-[24%] md:w-[22%] px-4 text-right">الحساب والتصنيف</div>
          <div className="flex-1 px-4 text-right">البيان / الوصف</div>
          <div className="w-[18%] md:w-[16%] px-4 text-center">المبلغ (دائن/مدين)</div>
          <div className="w-[18%] md:w-[16%] px-4 text-left">الرصيد التراكمي</div>
        </div>

        {/* Journal Entries List */}
        <div className="flex-1 min-h-0 bg-white">
          {filteredLines.length > 0 ? (
            <List
              height={listHeight}
              itemCount={filteredLines.length}
              itemSize={60}
              width="100%"
              className="custom-scrollbar"
            >
              {Row}
            </List>
          ) : (
            <div className="h-full min-h-[380px] flex flex-col items-center justify-center p-8 text-center my-auto space-y-4">
              <div className="w-16 h-16 bg-emerald-50 text-[#1E4D4D] rounded-2xl flex items-center justify-center border border-emerald-100 shadow-xs">
                <FileText size={32} className="stroke-[1.75]" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-base font-black text-[#1E4D4D]">لا توجد قيود مسجلة حالياً</h3>
                <p className="text-xs font-semibold text-slate-400 leading-relaxed">
                  سيتم تسطير وتسجيل القيود المحاسبية تلقائياً في دفتر الأستاذ فور إجراء أي عمليات مبيعات، مشتريات، أو سندات.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Integrated Stats Footer Bar */}
        <div className="bg-slate-50 border-t border-slate-200/80 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 rounded-b-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#1E4D4D] text-emerald-300 rounded-xl flex items-center justify-center shadow-xs">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">إجمالي حجم العمليات</p>
              <p className="text-sm font-black text-[#1E4D4D]">
                {formatCurrency ? formatCurrency(stats.totalVolume) : `${stats.totalVolume.toLocaleString()} ${currency}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-bold text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">إجمالي القيود:</span>
              <span className="font-black text-[#1E4D4D] bg-white px-2.5 py-1 rounded-lg border border-slate-200">{stats.entryCount} قيد</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">الصفوف المعروضة:</span>
              <span className="font-black text-[#1E4D4D] bg-white px-2.5 py-1 rounded-lg border border-slate-200">{filteredLines.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Entry Detail Modal */}
      <AnimatePresence>
        {selectedEntry && (
          <Modal isOpen={!!selectedEntry} onClose={() => setSelectedEntry(null)} title="تفاصيل القيد المحاسبي" noPadding>
            <div className="flex flex-col h-[80vh] font-sans" dir="rtl">
              <div className="p-6 sm:p-8 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-1">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">تاريخ القيد</p>
                    <p className="text-sm font-black text-[#1E4D4D]">{new Date(selectedEntry.date).toLocaleDateString('ar-SA')}</p>
                  </div>
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-1">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">المرجع / المصدر</p>
                    <p className="text-sm font-black text-[#1E4D4D]">{selectedEntry.sourceType} #{selectedEntry.sourceId}</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">البيان المحاسبي</p>
                  <p className="text-sm font-bold text-[#1E4D4D] leading-relaxed">{selectedEntry.description || '—'}</p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mr-1">تفاصيل الحسابات (Double Entry)</h4>
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-xs custom-scrollbar">
                    <table className="w-full text-right min-w-[500px]">
                      <thead className="bg-slate-50 text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-3.5 px-6">الحساب</th>
                          <th className="py-3.5 px-6 text-center">مدين (Debit)</th>
                          <th className="py-3.5 px-6 text-left">دائن (Credit)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-bold">
                        {selectedEntry.lines.map((l, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 px-6">
                              <p className="font-black text-[#1E4D4D]">{l.accountName}</p>
                              <p className="text-[10px] text-slate-400 uppercase mt-0.5">كود: {l.accountId}</p>
                            </td>
                            <td className="py-4 px-6 text-center font-black text-rose-600">
                              {l.debit > 0 ? l.debit.toLocaleString() : '-'}
                            </td>
                            <td className="py-4 px-6 text-left font-black text-emerald-700">
                              {l.credit > 0 ? l.credit.toLocaleString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-black">
                        <tr>
                          <td className="py-4 px-6 text-[#1E4D4D]">الإجمالي المتوازن</td>
                          <td className="py-4 px-6 text-center text-rose-600">
                            {selectedEntry.lines.reduce((acc, l) => acc + l.debit, 0).toLocaleString()}
                          </td>
                          <td className="py-4 px-6 text-left text-emerald-700">
                            {selectedEntry.lines.reduce((acc, l) => acc + l.credit, 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 shrink-0 flex gap-3 bg-slate-50/50">
                <Button variant="neutral" className="flex-1 !rounded-xl" onClick={() => setSelectedEntry(null)}>إغلاق</Button>
                <Button variant="primary" className="flex-1 !rounded-xl shadow-md" onClick={() => window.print()}>طباعة القيد</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountingModule;
