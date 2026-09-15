
import React, { useState, useEffect, useMemo } from 'react';
import { AuditRepository } from '@/database/repositories/AuditRepository';
import { FinancialAuditEntry } from '@/types';
import { useUI } from '@/contexts/AppContext';
import { Card } from '@/components/shared/SharedUI';
import { 
  History, Search, 
  Clock, ChevronRight,
  ShieldCheck, FileText, Trash2, Plus,
  Lock
} from 'lucide-react';
import { EncryptedAuditExportModal } from '@/components/shared/EncryptedAuditExportModal';
import { SettingsSectionHeader } from '../components/navigation/SettingsSectionHeader';

interface AuditHistoryModuleProps {
  onNavigate?: (view: any, params?: any, options?: any) => void;
  recordId?: string; 
  tableName?: string;
  initialFilter?: 'ALL' | 'ADD' | 'UPDATE' | 'DELETE';
  from?: string;
}

const AuditHistoryModule: React.FC<AuditHistoryModuleProps> = ({ 
  onNavigate, 
  recordId, 
  tableName,
  initialFilter = 'ALL',
  from
}) => {
  const { version } = useUI();
  const [logs, setLogs] = useState<FinancialAuditEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'ADD' | 'UPDATE' | 'DELETE'>(initialFilter);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    // Reset window and any enclosing scroll container immediately to 0
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    if (initialFilter) {
      setFilterType(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    const fetchAuditLogs = async () => {
      setLoading(true);
      try {
        let allLogs: FinancialAuditEntry[] = [];
        if (recordId) {
          allLogs = await AuditRepository.getByRecord(recordId);
        } else {
          allLogs = await AuditRepository.getAll();
        }
        
        if (tableName) {
          allLogs = allLogs.filter(log => log.Table_Name === tableName);
        }

        setLogs(allLogs);
      } finally {
        setLoading(false);
      }
    };
    fetchAuditLogs();
  }, [version, recordId, tableName]);

  const filteredLogs = useMemo(() => {
    let list = [...logs];
    if (filterType !== 'ALL') {
      list = list.filter(l => l.Change_Type === filterType);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(l => 
        (l.Record_ID || '').toLowerCase().includes(term) || 
        (l.Modified_By || '').toLowerCase().includes(term) ||
        (l.Column_Name || '').toLowerCase().includes(term)
      );
    }
    return list;
  }, [logs, searchTerm, filterType]);

  const getActionStyles = (type: string) => {
    switch (type) {
      case 'ADD': return { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <Plus size={14}/>, label: 'إضافة سجل' };
      case 'UPDATE': return { bg: 'bg-blue-50', text: 'text-blue-600', icon: <History size={14}/>, label: 'تحديث بيانات' };
      case 'DELETE': return { bg: 'bg-red-50', text: 'text-red-600', icon: <Trash2 size={14}/>, label: 'حذف نهائي' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-400', icon: <FileText size={14}/>, label: 'عملية نظام' };
    }
  };

  return (
    <div className="p-2 sm:p-4 space-y-4 sm:space-y-5 bg-[#F8FAFA] min-h-full pb-32 animate-in fade-in w-full" dir="rtl">
      {/* Unified Settings Section Header */}
      <SettingsSectionHeader
        title="سجل الرقابة النهائية"
        subtitle={recordId ? `تاريخ تدقيق المستند: #${recordId}` : 'سجل تدقيق غير قابل للتلاعب'}
        icon={ShieldCheck}
        onBack={onNavigate ? () => onNavigate(from || 'dashboard', null, { replace: true }) : undefined}
        backTitle={from === 'settings' ? 'العودة للإعدادات' : 'العودة للرئيسية'}
        badge={
          <div className="inline-flex items-center gap-1.5 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/30 text-emerald-200">
            <Lock size={11} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-wider">Immutable Logs</span>
          </div>
        }
        actions={
          <button 
            onClick={() => setShowExportModal(true)} 
            className="flex-1 sm:flex-none bg-emerald-400 hover:bg-emerald-300 text-slate-950 px-4 sm:px-5 py-2.5 rounded-xl sm:rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Lock size={15} className="text-slate-950" />
            <span>تصدير PDF مشفر</span>
          </button>
        }
      />

      {/* Filters Section - Unified Filter Card */}
      <div className="bg-white p-2 sm:p-3 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
        <div className="flex p-1 bg-slate-100/80 rounded-xl sm:rounded-2xl overflow-x-auto no-scrollbar gap-1">
          {(['ALL', 'ADD', 'UPDATE', 'DELETE'] as const).map(type => (
            <button 
              key={type} 
              onClick={() => setFilterType(type)} 
              className={`px-4 sm:px-6 py-2 rounded-lg sm:rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                filterType === type 
                  ? 'bg-white text-[#1E4D4D] shadow-sm' 
                  : 'text-slate-500 hover:text-[#1E4D4D]'
              }`}
            >
              {type === 'ALL' ? 'الكل' : type === 'ADD' ? 'الإضافة' : type === 'UPDATE' ? 'التعديلات' : 'الحذف'}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <input 
            type="text" 
            placeholder="بحث بالمرجع أو المسؤول..." 
            className="w-full bg-slate-50/80 border border-slate-200/80 rounded-xl sm:rounded-2xl px-10 py-2.5 text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#1E4D4D] transition-all outline-none" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
          <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <Card noPadding className="shadow-lg border-slate-200/80 overflow-hidden !rounded-3xl sm:!rounded-[36px] bg-white">
        {loading ? (
          <div className="py-24 sm:py-32 flex flex-col items-center justify-center space-y-4">
             <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accessing Sealed Logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 sm:py-24 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 mb-1 border border-slate-200/80">
              <ShieldCheck size={32} className="text-slate-400" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-[#1E4D4D]">لا توجد سجلات تدقيق حالياً</h3>
            <p className="text-xs text-slate-400 font-semibold max-w-sm">
              لم يتم العثور على أي عمليات مسجلة في سجل الرقابة وفقاً لمعايير البحث المحددة.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right text-[11px]">
              <thead className="bg-[#F8FAFA] text-slate-400 font-black uppercase border-b-2 border-slate-100">
                <tr>
                  <th className="px-8 py-6">العملية</th>
                  <th className="px-8 py-6">المصدر / الحقل</th>
                  <th className="px-8 py-6">قبل (Before)</th>
                  <th className="px-8 py-6">بعد (After)</th>
                  <th className="px-8 py-6">المسؤول / الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredLogs.map(log => {
                  const styles = getActionStyles(log.Change_Type);
                  return (
                    <tr key={log.Log_ID} className="hover:bg-slate-50 transition-all group border-r-4 border-transparent hover:border-r-slate-200">
                      <td className="px-8 py-6">
                         <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-black text-[9px] ${styles.bg} ${styles.text}`}>
                            {styles.icon} {styles.label}
                         </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className="space-y-1">
                            <p className="font-black text-slate-800 text-sm">#{log.Record_ID}</p>
                            <p className="text-[9px] font-bold text-slate-400 flex items-center gap-1 uppercase">
                               <FileText size={10}/> {log.Table_Name} <ChevronRight size={8}/> {log.Column_Name}
                            </p>
                         </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className="max-w-[180px] truncate bg-slate-50 px-3 py-2 rounded-xl text-slate-400 font-bold border border-slate-100 shadow-inner italic">
                            {log.Old_Value || 'NULL'}
                         </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className={`max-w-[180px] truncate px-3 py-2 rounded-xl font-black border-2 ${log.Change_Type === 'DELETE' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                            {log.New_Value}
                         </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                               <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-[10px] font-black shadow-sm">
                                  {log.Modified_By.charAt(0).toUpperCase()}
                               </div>
                               <span className="font-black text-slate-700">{log.Modified_By.split('@')[0]}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 font-bold">
                               <Clock size={10}/>
                               <span className="text-[10px]">{new Date(log.Modified_At).toLocaleString('ar-SA')}</span>
                            </div>
                         </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-4 bg-[#1E4D4D]/5 p-6 rounded-[32px] border-2 border-dashed border-[#1E4D4D]/20">
         <ShieldCheck className="text-[#1E4D4D] shrink-0" size={28} />
         <p className="text-[11px] font-bold text-[#1E4D4D] leading-relaxed">
            نظام الرقابة السيادي: كافة السجلات المعروضة هنا هي سجلات "نهائية" يتم توثيقها لحظة وقوع الحركة في قاعدة البيانات. 
            يمنع النظام برمجياً أي محاولة لتعديل أو حذف هذه الأسطر لضمان الشفافية المطلقة والمطابقة المحاسبية المستمرة.
         </p>
      </div>

      <EncryptedAuditExportModal 
        isOpen={showExportModal} 
        onClose={() => setShowExportModal(false)} 
        logs={filteredLogs} 
      />
    </div>
  );
};

export default AuditHistoryModule;
