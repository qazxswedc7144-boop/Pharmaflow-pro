import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Lock, ShieldCheck, Download, Key, RefreshCw, Eye, EyeOff, 
  Copy, Check, FileText, AlertCircle, Filter, Calendar
} from 'lucide-react';
import { EncryptedAuditExportService } from '@/services/data/EncryptedAuditExportService';
import { FinancialAuditEntry } from '@/types';
import { authService } from '@features/auth/services/authService';

interface EncryptedAuditExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: (FinancialAuditEntry | any)[];
}

export const EncryptedAuditExportModal: React.FC<EncryptedAuditExportModalProps> = ({
  isOpen,
  onClose,
  logs
}) => {
  const currentUser = authService.getCurrentUser();
  const [password, setPassword] = useState<string>('PharmaPass2026!');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [reportTitle, setReportTitle] = useState<string>('تقرير تدقيق الأمان والامتثال المالي للصيدلية');
  const [logFilter, setLogFilter] = useState<'ALL' | 'ADD' | 'UPDATE' | 'DELETE'>('ALL');
  const [timeRange, setTimeRange] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [exportResultInfo, setExportResultInfo] = useState<{ filename: string; passwordUsed: string; hash: string } | null>(null);

  // توليد كلمة مرور عشوائية قوية
  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = 'PF#';
    for (let i = 0; i < 8; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(res);
  };

  // فلترة السجلات حسب الخيارات المختارة
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // فلترة حسب نوع التغيير
    if (logFilter !== 'ALL') {
      result = result.filter(l => (l.Change_Type || l.status) === logFilter);
    }

    // فلترة حسب المدى الزمني
    if (timeRange !== 'ALL') {
      const now = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      result = result.filter(l => {
        const dateVal = l.Modified_At ? new Date(l.Modified_At).getTime() : (l.timestamp ? new Date(l.timestamp).getTime() : 0);
        if (!dateVal) return true;
        const diff = now - dateVal;
        if (timeRange === 'TODAY') return diff <= oneDay;
        if (timeRange === 'WEEK') return diff <= oneDay * 7;
        if (timeRange === 'MONTH') return diff <= oneDay * 30;
        return true;
      });
    }

    return result;
  }, [logs, logFilter, timeRange]);

  const handleExport = async () => {
    if (filteredLogs.length === 0) return;
    setIsExporting(true);
    try {
      const timeRangeLabel = timeRange === 'TODAY' ? 'اليوم' : timeRange === 'WEEK' ? 'الأسبوع الحالي' : timeRange === 'MONTH' ? 'الشهر الحالي' : 'كافة السجلات';
      const result = await EncryptedAuditExportService.exportEncryptedAuditPDF({
        logs: filteredLogs,
        password: password,
        reportTitle: reportTitle,
        dateFilterRange: timeRangeLabel,
        exportedBy: currentUser?.User_Email || 'مدير الصيدلية'
      });

      setExportResultInfo({
        filename: result.filename,
        passwordUsed: result.passwordUsed,
        hash: result.securityHash
      });
      setExportSuccess(true);
    } catch (error) {
      console.error('Failed to export encrypted audit log PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyPassword = () => {
    if (password) {
      navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResetModal = () => {
    setExportSuccess(false);
    setExportResultInfo(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md font-cairo" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[32px] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-[#1E4D4D] text-white p-6 flex items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-white/5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-400/30 shadow-inner">
                <Lock size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg text-white">تصدير تقرير التدقيق المالي المشفر</h3>
                <p className="text-emerald-200 text-xs font-bold mt-0.5">توليد ملف PDF محمي بكلمة مرور ومعتمد للامتثال</p>
              </div>
            </div>
            <button 
              onClick={handleResetModal}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer relative z-10"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
            {!exportSuccess ? (
              <>
                {/* 🔑 حقل كلمة المرور والتشفير */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Key size={15} className="text-amber-500" />
                      كلمة مرور التشفير للفتح (Encryption Password)
                    </label>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={12} /> كلمة مرور عشوائية
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="أدخل كلمة مرور حماية الـ PDF..."
                      className="w-full text-sm font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[#10B981] outline-none pl-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    سيتم قفل ملف الـ PDF المعالج بتقنية AES لن يتسنى لأحد فتحه دون كلمة المرور هذه.
                  </p>
                </div>

                {/* 📝 خيارات التقرير والنطاق */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 block">
                      عنوان التقرير الرسمي
                    </label>
                    <input
                      type="text"
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      className="w-full text-xs font-bold p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[#10B981] outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <Filter size={13} className="text-indigo-500" /> نوع العمليات
                      </label>
                      <select
                        value={logFilter}
                        onChange={(e: any) => setLogFilter(e.target.value)}
                        className="w-full text-xs font-bold p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[#10B981] outline-none cursor-pointer"
                      >
                        <option value="ALL">كافة الحركات (All Logs)</option>
                        <option value="ADD">سجلات الإضافة فقط (Adds)</option>
                        <option value="UPDATE">سجلات التعديل فقط (Updates)</option>
                        <option value="DELETE">سجلات الحذف والблоки (Deletes)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <Calendar size={13} className="text-emerald-500" /> النطاق الزمني
                      </label>
                      <select
                        value={timeRange}
                        onChange={(e: any) => setTimeRange(e.target.value)}
                        className="w-full text-xs font-bold p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[#10B981] outline-none cursor-pointer"
                      >
                        <option value="ALL">كافة الأرشيف التاريخي</option>
                        <option value="TODAY">سجلات اليوم</option>
                        <option value="WEEK">سجلات آخر 7 أيام</option>
                        <option value="MONTH">سجلات آخر 30 يوماً</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 📊 بطاقة معاينة التقرير والمصادقة */}
                <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 space-y-2">
                  <div className="flex justify-between items-center text-xs font-black text-emerald-900 dark:text-emerald-200">
                    <span className="flex items-center gap-1.5">
                      <FileText size={15} className="text-emerald-600 dark:text-emerald-400" />
                      عدد السجلات المشمولة للتصدير:
                    </span>
                    <span className="bg-emerald-600 text-white px-2.5 py-0.5 rounded-full font-bold">
                      {filteredLogs.length} سجل
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    <span>المسؤول المصدّر للتقرير:</span>
                    <span className="text-emerald-700 dark:text-emerald-300">{currentUser?.User_Email || 'مدير الصيدلية'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    <span>التوقيع والبصمة الرقمية:</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">SHA-256 Verified Stamp</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleExport}
                    disabled={isExporting || filteredLogs.length === 0}
                    className="w-full bg-[#1E4D4D] hover:bg-[#163b3b] text-white py-3.5 px-6 rounded-2xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        جاري معالجة وتشفير ملف PDF...
                      </>
                    ) : (
                      <>
                        <Download size={18} className="text-emerald-400" />
                        تصدير وتشفير تقرير PDF المالي الآن ({filteredLogs.length} سجل)
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* 🎉 Success View */
              <div className="py-6 text-center space-y-5">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <ShieldCheck size={36} />
                </div>

                <div className="space-y-1">
                  <h4 className="font-black text-lg text-slate-800 dark:text-slate-100">تم تصدير وتشفير التقرير بنجاح!</h4>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">تم تمكين حماية AES وتنزيل الملف على جهازك.</p>
                </div>

                {/* Password Box with Copy */}
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md mx-auto space-y-2">
                  <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 block">كلمة مرور فتح الملف المعتمدة:</span>
                  <div className="flex items-center justify-center gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400 tracking-wider">
                      {exportResultInfo?.passwordUsed || password}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 p-1.5 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center gap-1 cursor-pointer"
                    >
                      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      {copied ? 'تم النسخ' : 'نسخ'}
                    </button>
                  </div>
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                    <AlertCircle size={12} />
                    احفظ كلمة المرور هذه لتتمكن من مشاركتها مع مراجع الحسابات أو الجهات المعنية.
                  </p>
                </div>

                <div className="text-[10px] font-mono text-slate-400">
                  SHA-256 Checksum: {exportResultInfo?.hash}
                </div>

                <button
                  onClick={handleResetModal}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-black text-xs py-3 px-8 rounded-xl transition-all cursor-pointer"
                >
                  إغلاق النافذة
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
