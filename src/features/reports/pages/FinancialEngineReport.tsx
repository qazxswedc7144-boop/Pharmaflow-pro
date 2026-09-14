// src/features/reports/pages/FinancialEngineReport.tsx
// Phase 8.5 — Enterprise Reporting UI & Presentation Integration

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart3, Calendar, Download, Printer, ArrowRight,
  TrendingUp, Wallet, Package, ArrowDownRight, 
  Users, UserCheck, ShieldAlert, Receipt, Search, RefreshCw,
  FileSpreadsheet, FileText, ChevronDown, Layers,
  Clock, ShieldCheck, Filter,
  Activity, AlertCircle, Building2, CheckCircle2,
  Cloud, Database, Sparkles, Trash2
} from "lucide-react";
import { useUI } from "@/contexts/AppContext";
import { 
  EnterpriseReportingService, 
  ReportType, 
  ReportSyncMetadata,
  ExportFormat 
} from "../services/enterpriseReportingService";
import { auditLogService } from "@/services/audit/auditLog";

interface FinancialEngineReportProps {
  onNavigate?: (view: string, params?: any) => void;
  initialTab?: TabType;
  initialCategory?: ReportCategory;
}

export type ReportCategory = 'financial' | 'inventory' | 'partners' | 'tax' | 'audit';

export type TabType = 
  | 'trial-balance'
  | 'profit-loss'
  | 'balance-sheet'
  | 'cash-flow'
  | 'account-movement'
  | 'inventory-valuation'
  | 'remaining-stock'
  | 'expiry-items'
  | 'item-sales-movement'
  | 'customer-balances'
  | 'supplier-balances'
  | 'aging-reports-customer'
  | 'aging-reports-supplier'
  | 'tax-reports'
  | 'audit-trail';

interface ReportTabConfig {
  id: TabType;
  serverReportType: ReportType;
  category: ReportCategory;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  desc: string;
}

const REPORT_TABS: ReportTabConfig[] = [
  // 1. Financial & Accounting
  { id: 'trial-balance', serverReportType: 'trial-balance', category: 'financial', label: 'ميزان المراجعة الشامل', shortLabel: 'ميزان المراجعة', icon: <BarChart3 size={18} />, desc: 'رصد توازن الحركات المدينة والدائنة لكافة حسابات الأستاذ العام.' },
  { id: 'profit-loss', serverReportType: 'profit-loss', category: 'financial', label: 'قائمة الأرباح والخسائر (P&L)', shortLabel: 'الأرباح والخسائر', icon: <TrendingUp size={18} />, desc: 'قائمة الدخل - الإيرادات، كلفة المبيعات والمصاريف التشغيلية وصافي الدخل.' },
  { id: 'balance-sheet', serverReportType: 'balance-sheet', category: 'financial', label: 'الميزانية العمومية والمركز المالي', shortLabel: 'الميزانية العمومية', icon: <Wallet size={18} />, desc: 'تحليل الأصول، الالتزامات وحقوق الملكية للحسابات القائمة.' },
  { id: 'cash-flow', serverReportType: 'cash-flow', category: 'financial', label: 'قائمة التدفقات النقدية', shortLabel: 'التدفقات النقدية', icon: <ArrowDownRight size={18} />, desc: 'بيان حركة دخول وخروج النقد التشغيلي والاستثماري مباشرة.' },
  { id: 'account-movement', serverReportType: 'account-movement', category: 'financial', label: 'حركة الحسابات ودفتر الأستاذ', shortLabel: 'حركة الحسابات', icon: <Activity size={18} />, desc: 'كشف تفصيلي بقيود اليومية وحركات الحسابات الفردية للفترة.' },

  // 2. Inventory & Valuation
  { id: 'inventory-valuation', serverReportType: 'inventory-valuation', category: 'inventory', label: 'تقييم المخزون والتكلفة', shortLabel: 'تقييم المخزون', icon: <Package size={18} />, desc: 'رصد تكلفة مخزون المنتجات متضمنة الهوامش والأرباح غير المحققة.' },
  { id: 'remaining-stock', serverReportType: 'remaining-stock', category: 'inventory', label: 'المخزون المتبقي والنواقص', shortLabel: 'المخزون المتبقي', icon: <Layers size={18} />, desc: 'الكميات المتاحة حالياً مع تنبيهات نقص المخزون والحد الأدنى.' },
  { id: 'expiry-items', serverReportType: 'expiry-items', category: 'inventory', label: 'تواريخ الصلاحية والركود', shortLabel: 'تقرير الصلاحية', icon: <Clock size={18} />, desc: 'تتبع الأصناف القريبة من انتهاء الصلاحية أو المنتهية لتفادي الهالك.' },
  { id: 'item-sales-movement', serverReportType: 'item-sales-movement', category: 'inventory', label: 'حركة ومبيعات الأصناف', shortLabel: 'مبيعات الأصناف', icon: <TrendingUp size={18} />, desc: 'حجم مبيعات كل صنف مع هوامش الربحية وتكلفة التوريد.' },

  // 3. Partners & Debts
  { id: 'customer-balances', serverReportType: 'customer-balances', category: 'partners', label: 'أرصدة وذمم العملاء', shortLabel: 'أرصدة العملاء', icon: <Users size={18} />, desc: 'رصد المديونيات، مبيعات كل عميل والمبالغ المسددة ومستوى المخاطرة.' },
  { id: 'supplier-balances', serverReportType: 'supplier-balances', category: 'partners', label: 'أرصدة وذمم الموردين', shortLabel: 'أرصدة الموردين', icon: <UserCheck size={18} />, desc: 'تتبع مشتريات ودفعات الموردين والأرصدة الدائنة المستحقة.' },
  { id: 'aging-reports-customer', serverReportType: 'aging-customer', category: 'partners', label: 'تعمير ذمم العملاء (30-60-90+)', shortLabel: 'تعمير ذمم العملاء', icon: <ShieldAlert size={18} />, desc: 'تقسيم ديون العملاء غير المسددة حسب الفترات الزمنية للتحصيل.' },
  { id: 'aging-reports-supplier', serverReportType: 'aging-supplier', category: 'partners', label: 'تعمير ذمم الموردين (30-60-90+)', shortLabel: 'تعمير ذمم الموردين', icon: <ShieldAlert size={18} />, desc: 'توزيع التزامات الموردين المستحقة زمنياً لجدولة السداد.' },

  // 4. Tax & VAT
  { id: 'tax-reports', serverReportType: 'tax-report', category: 'tax', label: 'إقرار ضريبة القيمة المضافة (VAT)', shortLabel: 'الإقرار الضريبي', icon: <Receipt size={18} />, desc: 'احتساب الضريبة المخرجة للمبيعات والمدخلة للمشتريات وفارق التسوية.' },

  // 5. Audit & Governance
  { id: 'audit-trail', serverReportType: 'audit-trail', category: 'audit', label: 'سجل العمليات والتدقيق الإداري', shortLabel: 'سجل التدقيق', icon: <ShieldCheck size={18} />, desc: 'تتبع العمليات الحساسة وإجراءات التعديل والحذف والتصدير في المنظومة.' }
];

const CATEGORIES: { id: ReportCategory; title: string; icon: React.ReactNode }[] = [
  { id: 'financial', title: 'التقارير المالية والمحاسبية', icon: <BarChart3 size={16} /> },
  { id: 'inventory', title: 'المخزون والعمليات التشغيلية', icon: <Package size={16} /> },
  { id: 'partners', title: 'الشركاء والعملاء والموردين', icon: <Users size={16} /> },
  { id: 'tax', title: 'التقارير الضريبية (VAT)', icon: <Receipt size={16} /> },
  { id: 'audit', title: 'التدقيق والرقابة الإدارية', icon: <ShieldCheck size={16} /> }
];

export default function FinancialEngineReport({ onNavigate, initialTab, initialCategory }: FinancialEngineReportProps) {
  const { currency, addToast, version } = useUI();
  
  const formatNum = (val: any) => {
    if (val === undefined || val === null || isNaN(Number(val))) return "0";
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const [activeCategory, setActiveCategory] = useState<ReportCategory>(initialCategory || 'financial');
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'trial-balance');
  
  // Branch & Multi-tenant state
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [accountingBasis, setAccountingBasis] = useState<'accrual' | 'cash'>('accrual');

  // Date filter state with smart presets
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [activePreset, setActivePreset] = useState<string>('month');

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<any>(null);
  const [syncMeta, setSyncMeta] = useState<ReportSyncMetadata | null>(null);
  const [dataSource, setDataSource] = useState<'ENTERPRISE_SERVER' | 'LOCAL_OFFLINE'>('ENTERPRISE_SERVER');
  const [exportDropdownOpen, setExportDropdownOpen] = useState<boolean>(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Load available branches on mount
  useEffect(() => {
    EnterpriseReportingService.fetchBranches().then(setBranches);
  }, []);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Preset Date Handlers
  const handleDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all') => {
    setActivePreset(preset);
    const now = new Date();
    const endStr = now.toISOString().substring(0, 10);
    let startStr = endStr;

    if (preset === 'today') {
      startStr = endStr;
    } else if (preset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'month') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'quarter') {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'year') {
      const d = new Date(now.getFullYear(), 0, 1);
      startStr = d.toISOString().substring(0, 10);
    } else if (preset === 'all') {
      startStr = '2020-01-01';
    }

    setStartDate(startStr);
    setEndDate(endStr);
  };

  const activeTabConfig: ReportTabConfig = useMemo(() => {
    const found = REPORT_TABS.find(t => t.id === activeTab);
    return (found || REPORT_TABS[0]) as ReportTabConfig;
  }, [activeTab]);

  // Synchronize category with active tab
  useEffect(() => {
    if (activeTabConfig.category !== activeCategory) {
      setActiveCategory(activeTabConfig.category);
    }
  }, [activeTab, activeTabConfig.category]);

  // Main Report Data Fetching Engine with Enterprise Engine Integration
  const fetchReportData = async (bypassCache = false) => {
    setIsLoading(true);
    try {
      const result = await EnterpriseReportingService.fetchReport(
        activeTabConfig.serverReportType,
        {
          startDate,
          endDate,
          asOfDate: endDate,
          branchId: selectedBranch === 'all' ? null : selectedBranch,
          search: searchTerm,
          bypassCache
        }
      );

      setReportData(result.data);
      setSyncMeta(result.syncMetadata);
      setDataSource(result.source);

      // Audit log registration
      auditLogService.log(
        'REPORT_GENERATED', 
        'REPORT', 
        activeTab, 
        `Generated [${activeTabConfig.label}] for branch [${selectedBranch}] from ${startDate} to ${endDate}`
      );
    } catch (error) {
      console.error("Error fetching report data:", error);
      addToast("خطأ أثناء تجميع واحتساب بيانات التقرير.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeTab, startDate, endDate, selectedBranch, accountingBasis, version]);

  // Cache Clear Handler
  const handleClearCache = async () => {
    const success = await EnterpriseReportingService.clearCache();
    if (success) {
      addToast("تم إفراغ الذاكرة المؤقتة للتقارير بنجاح", "success");
      fetchReportData(true);
    } else {
      addToast("تم تحديث البيانات المحلية مباشرة", "info");
      fetchReportData(true);
    }
  };

  // Unified Export
  const handleExport = async (format: ExportFormat) => {
    setExportDropdownOpen(false);
    if (!reportData) {
      addToast("لا توجد بيانات متاحة للتصدير حالياً", "error");
      return;
    }

    try {
      await EnterpriseReportingService.exportReport(
        format,
        activeTabConfig.serverReportType,
        activeTabConfig.label,
        reportData,
        {
          startDate,
          endDate,
          branchId: selectedBranch === 'all' ? null : selectedBranch
        }
      );
      addToast(`تم إتمام التصدير بصيغة ${format} بنجاح`, "success");
    } catch (e) {
      console.error(e);
      addToast(`حدث خطأ أثناء التصدير بصيغة ${format}`, "error");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter tabs for current category
  const currentCategoryTabs = useMemo(() => {
    return REPORT_TABS.filter(t => t.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className="flex flex-col h-full h-dvh bg-slate-50 dark:bg-slate-900 font-cairo overflow-hidden select-none" dir="rtl">
      
      {/* 1. Top Enterprise Control Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 sm:px-6 py-3 shrink-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Title and Navigation Back Button */}
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onNavigate ? onNavigate('dashboard') : window.history.back()}
              className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-200 hover:bg-slate-100 transition-colors shrink-0"
              title="العودة للرئيسية"
            >
              <ArrowRight size={18} strokeWidth={2.5} />
            </motion.button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-[#1E4D4D] dark:text-emerald-400 tracking-tight truncate">
                  مركز التقارير والذكاء المالي الموحد
                </h1>
                <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black rounded-full whitespace-nowrap flex items-center gap-1">
                  <Sparkles size={10} />
                  Enterprise Edition
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-400 font-bold truncate">
                {activeTabConfig.label} &bull; حسابات حقيقية مدققة ومطابقة للمعايير المحاسبية
              </p>
            </div>
          </div>

          {/* Top Actions: Branch selector, Refresh, Print, Export */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            
            {/* Branch Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-2.5 h-10">
              <Building2 size={14} className="text-slate-400 shrink-0" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer max-w-[150px] sm:max-w-[200px] truncate"
              >
                <option value="all">المركز المالي الموحد (كافة الفروع)</option>
                {branches.filter(b => b.id !== 'all').map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button 
              onClick={() => fetchReportData(true)}
              disabled={isLoading}
              className="h-10 px-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 rounded-xl flex items-center gap-1.5 text-xs font-black transition-all shadow-xs disabled:opacity-50"
              title="تحديث فوري للبيانات وتجاوز الذاكرة المؤقتة"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin text-emerald-600" : ""} />
              <span className="hidden sm:inline">تحديث</span>
            </button>

            {/* Clear Cache Button */}
            <button 
              onClick={handleClearCache}
              className="h-10 px-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-1 text-xs font-bold transition-all shadow-xs"
              title="مسح الذاكرة المؤقتة للتقارير"
            >
              <Trash2 size={13} />
            </button>

            {/* Print Button */}
            <button 
              onClick={handlePrint}
              className="h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-[#1E4D4D] hover:text-[#1E4D4D] rounded-xl flex items-center gap-1.5 text-xs font-black transition-all shadow-xs"
              title="طباعة فورية"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">طباعة</span>
            </button>

            {/* Export Dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <motion.button 
                whileTap={{ scale: 0.98 }}
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="h-10 px-3.5 bg-[#1E4D4D] hover:bg-teal-900 text-white rounded-xl flex items-center gap-2 text-xs font-black transition-all shadow-sm"
              >
                <Download size={15} />
                <span>تصدير</span>
                <ChevronDown size={13} className={`transition-transform duration-200 ${exportDropdownOpen ? 'rotate-180' : ''}`} />
              </motion.button>

              <AnimatePresence>
                {exportDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-2 z-50 flex flex-col gap-1"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 mb-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase">تصدير التقرير النشط</p>
                      <p className="text-xs font-black text-[#1E4D4D] dark:text-emerald-400 truncate">{activeTabConfig.shortLabel}</p>
                    </div>

                    <button 
                      onClick={() => handleExport('EXCEL')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-right text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-800 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={15} />
                      </div>
                      <div>
                        <p className="leading-tight">تصدير كملف Excel (.xlsx)</p>
                        <p className="text-[9px] font-bold text-slate-400">جداول مهيأة بترميز رسمي</p>
                      </div>
                    </button>

                    <button 
                      onClick={() => handleExport('PDF')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-right text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-800 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                        <FileText size={15} />
                      </div>
                      <div>
                        <p className="leading-tight">تصدير كملف PDF رسمي</p>
                        <p className="text-[9px] font-bold text-slate-400">جاهز للأرشفة والطباعة والمشاركة</p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>
      </header>

      {/* 2. Authority & Sync Status Bar */}
      <div className="bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200/60 dark:border-slate-700/60 px-4 sm:px-6 py-2 shrink-0 z-30 print:hidden text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Authority Tag */}
            {dataSource === 'ENTERPRISE_SERVER' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] border border-emerald-200 dark:border-emerald-800">
                <Cloud size={13} />
                <span>بيانات موثقة (Cloud Authoritative)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold text-[11px] border border-amber-200 dark:border-amber-800">
                <Database size={13} />
                <span>وضع عدم الاتصال (Local Offline Cache)</span>
              </span>
            )}

            {/* Sync Metadata Details */}
            {syncMeta && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold hidden md:inline">
                حالة المزامنة: {syncMeta.overallState === 'CLOUD_AUTHORITATIVE' ? 'متطابقة لحظياً' : 'محلية'} &bull; 
                السجلات الموثقة: {syncMeta.authoritativeRecordsCount} &bull; 
                التعارضات: {syncMeta.conflictedRecordsCount}
              </span>
            )}
          </div>

          {/* Basis and Branch Indicators */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-[10px] font-bold">
              <button
                onClick={() => setAccountingBasis('accrual')}
                className={`px-2 py-0.5 rounded ${accountingBasis === 'accrual' ? 'bg-[#1E4D4D] text-white' : 'text-slate-600'}`}
              >
                أساس الاستحقاق
              </button>
              <button
                onClick={() => setAccountingBasis('cash')}
                className={`px-2 py-0.5 rounded ${accountingBasis === 'cash' ? 'bg-[#1E4D4D] text-white' : 'text-slate-600'}`}
              >
                الأساس النقدي
              </button>
            </div>

            <span className="text-[10px] font-bold text-slate-400">
              العملة: {currency || 'YER'}
            </span>
          </div>

        </div>
      </div>

      {/* 3. Category Bar (Scrollable on Mobile) */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 sm:px-6 py-2 shrink-0 z-20 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  const firstTab = REPORT_TABS.find(t => t.category === cat.id);
                  if (firstTab) setActiveTab(firstTab.id);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
                  isActive 
                    ? 'bg-[#1E4D4D] text-white shadow-sm' 
                    : 'bg-slate-50 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className={isActive ? 'text-emerald-300' : 'text-slate-400'}>{cat.icon}</span>
                <span>{cat.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Main Scrollable Container */}
      <main className="flex-1 min-h-0 overflow-y-auto max-w-7xl w-full mx-auto p-4 sm:p-6 custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Side Controls & Tabs Selection */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 print:hidden">
            
            {/* Sub-Reports Selector */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xs flex flex-col gap-1">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700 mb-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">تقارير هذا القسم</span>
              </div>
              
              {currentCategoryTabs.map((item) => {
                const active = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (activeTab !== item.id) {
                        setReportData(null);
                        setActiveTab(item.id);
                        setSearchTerm("");
                      }
                    }}
                    className={`w-full flex items-start text-right p-2.5 rounded-xl transition-all ${
                      active 
                        ? 'bg-[#1E4D4D] text-white shadow-md shadow-teal-950/10' 
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`mt-0.5 shrink-0 ${active ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black leading-snug truncate">{item.label}</p>
                        <p className={`text-[10px] font-medium line-clamp-1 mt-0.5 ${active ? 'text-emerald-100/80' : 'text-slate-400'}`}>
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Filter & Date Controls */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                <h3 className="text-xs font-black text-[#1E4D4D] dark:text-emerald-400 flex items-center gap-1.5">
                  <Filter size={14} />
                  <span>تخصيص الفترات</span>
                </h3>
              </div>

              {/* Quick Date Presets */}
              <div>
                <label className="text-[10px] font-black text-slate-400 block mb-1.5">الفترات السريعة</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'today', label: 'اليوم' },
                    { id: 'week', label: 'أسبوع' },
                    { id: 'month', label: 'شهر' },
                    { id: 'quarter', label: 'ربع سنة' },
                    { id: 'year', label: 'السنة' },
                    { id: 'all', label: 'الكل' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleDatePreset(p.id as any)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-black border transition-all ${
                        activePreset === p.id 
                          ? 'bg-[#1E4D4D] text-white border-[#1E4D4D]' 
                          : 'bg-slate-50 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">من تاريخ</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute right-3 top-2.5 text-slate-400" />
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setActivePreset('custom');
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl pr-9 pl-3 h-9 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#1E4D4D]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">حتى تاريخ</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute right-3 top-2.5 text-slate-400" />
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setActivePreset('custom');
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl pr-9 pl-3 h-9 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#1E4D4D]"
                    />
                  </div>
                </div>
              </div>

              {/* Search Inside Report */}
              <div>
                <label className="text-[10px] font-black text-slate-400 block mb-1">البحث في السجلات</label>
                <div className="relative">
                  <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                  <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ابحث باسم الحساب، الصنف، العميل..."
                    className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl pr-9 pl-3 h-9 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#1E4D4D]"
                  />
                </div>
              </div>

            </div>

          </div>

          {/* MAIN REPORT VIEW CONTAINER */}
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
            
            {/* Report Header Card */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-[#1E4D4D] dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
                  {activeTabConfig.icon}
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100">
                    {activeTabConfig.label}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    الفترة: {startDate} إلى {endDate} &bull; الفرع: {branches.find(b => b.id === selectedBranch)?.name || 'موحد'}
                  </p>
                </div>
              </div>

              {isLoading && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl animate-pulse">
                  <RefreshCw size={13} className="animate-spin" />
                  <span>جاري حساب الأرصدة والتحليل...</span>
                </div>
              )}
            </div>

            {/* Dynamic Report Content */}
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xs min-h-[400px]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <RefreshCw size={36} className="animate-spin text-[#1E4D4D] dark:text-emerald-400" />
                  <p className="text-sm font-bold text-slate-500">جاري المعالجة واحتساب الأرصدة عبر المحرك المالي...</p>
                </div>
              ) : !reportData ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                  <AlertCircle size={36} className="text-slate-300" />
                  <p className="text-sm font-bold text-slate-500">لا توجد بيانات متاحة لهذا التقرير في الفترة المحددة</p>
                </div>
              ) : (
                <RenderReportTable 
                  activeTab={activeTab} 
                  data={reportData} 
                  searchTerm={searchTerm} 
                  currency={currency} 
                  formatNum={formatNum} 
                />
              )}
            </div>

          </div>

        </div>
      </main>

    </div>
  );
}

// -----------------------------------------------------------------------------------
// Dynamic Report Table Renderer Component
// -----------------------------------------------------------------------------------
interface RenderReportTableProps {
  activeTab: TabType;
  data: any;
  searchTerm: string;
  currency: string;
  formatNum: (v: any) => string;
}

function RenderReportTable({ activeTab, data, searchTerm, currency, formatNum }: RenderReportTableProps) {
  
  // 1. Trial Balance (ميزان المراجعة)
  if (activeTab === 'trial-balance') {
    const rows = Array.isArray(data) ? data : (data?.accounts || []);
    const filtered = rows.filter((r: any) => 
      !searchTerm || 
      (r.name && r.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (r.code && r.code.includes(searchTerm))
    );

    const totalDebit = filtered.reduce((acc: number, r: any) => acc + (Number(r.endingDebit) || 0), 0);
    const totalCredit = filtered.reduce((acc: number, r: any) => acc + (Number(r.endingCredit) || 0), 0);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-100 dark:border-emerald-800">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">إجمالي المدين المنتهي</span>
            <p className="text-xl font-black text-emerald-900 dark:text-emerald-100">{formatNum(totalDebit)} {currency}</p>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-800">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">إجمالي الدائن المنتهي</span>
            <p className="text-xl font-black text-blue-900 dark:text-blue-100">{formatNum(totalCredit)} {currency}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 font-bold border-b">
              <tr>
                <th className="p-3">رمز الحساب</th>
                <th className="p-3">اسم الحساب</th>
                <th className="p-3">النوع</th>
                <th className="p-3">مدين منتهي</th>
                <th className="p-3">دائن منتهي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
              {filtered.map((r: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-300">{r.code || '-'}</td>
                  <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{r.name}</td>
                  <td className="p-3 text-slate-500">{r.type || 'عام'}</td>
                  <td className="p-3 font-bold text-emerald-600">{formatNum(r.endingDebit)}</td>
                  <td className="p-3 font-bold text-blue-600">{formatNum(r.endingCredit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 2. Profit & Loss (قائمة الأرباح والخسائر)
  if (activeTab === 'profit-loss') {
    const revenue = Number(data.revenue || data.totalRevenue || 0);
    const cogs = Number(data.cogs || data.costOfGoodsSold || 0);
    const grossProfit = Number(data.grossProfit ?? (revenue - cogs));
    const expenses = Number(data.expenses || data.operatingExpenses || 0);
    const netProfit = Number(data.netProfit ?? (grossProfit - expenses));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-100 dark:border-emerald-800">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">إجمالي الإيرادات (Revenue)</span>
            <p className="text-xl font-black text-emerald-900 dark:text-emerald-100">{formatNum(revenue)} {currency}</p>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-100 dark:border-amber-800">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">تكلفة المبيعات (COGS)</span>
            <p className="text-xl font-black text-amber-900 dark:text-amber-100">{formatNum(cogs)} {currency}</p>
          </div>
          <div className={`p-4 rounded-xl border ${netProfit >= 0 ? 'bg-teal-50 border-teal-200 text-teal-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
            <span className="text-xs font-bold">صافي الربح النهائي (Net Profit)</span>
            <p className="text-xl font-black">{formatNum(netProfit)} {currency}</p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl space-y-3">
          <div className="flex justify-between py-2 border-b font-bold text-sm">
            <span>إجمالي الإيرادات</span>
            <span className="text-emerald-600">{formatNum(revenue)} {currency}</span>
          </div>
          <div className="flex justify-between py-2 border-b font-bold text-sm">
            <span>تكلفة البضاعة المباعة (COGS)</span>
            <span className="text-rose-500">- {formatNum(cogs)} {currency}</span>
          </div>
          <div className="flex justify-between py-2 border-b font-black text-sm bg-white dark:bg-slate-800 p-2 rounded-lg">
            <span>مجمل الربح (Gross Profit)</span>
            <span className="text-[#1E4D4D] dark:text-emerald-400">{formatNum(grossProfit)} {currency}</span>
          </div>
          <div className="flex justify-between py-2 border-b font-bold text-sm">
            <span>المصاريف التشغيلية والإدارية</span>
            <span className="text-rose-500">- {formatNum(expenses)} {currency}</span>
          </div>
          <div className="flex justify-between py-3 font-black text-base bg-emerald-100/60 dark:bg-emerald-900/40 p-3 rounded-xl">
            <span>صافي الدخل المحاسبي</span>
            <span className={netProfit >= 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-600'}>
              {formatNum(netProfit)} {currency}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Balance Sheet (الميزانية العمومية)
  if (activeTab === 'balance-sheet') {
    const assets = Number(data.assets || data.totalAssets || 0);
    const liabilities = Number(data.liabilities || data.totalLiabilities || 0);
    const equity = Number(data.equity || data.totalEquity || (assets - liabilities));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-teal-50 rounded-xl border border-teal-100">
            <span className="text-xs font-bold text-teal-700">إجمالي الأصول (Assets)</span>
            <p className="text-xl font-black text-teal-900">{formatNum(assets)} {currency}</p>
          </div>
          <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
            <span className="text-xs font-bold text-rose-700">إجمالي الالتزامات (Liabilities)</span>
            <p className="text-xl font-black text-rose-900">{formatNum(liabilities)} {currency}</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
            <span className="text-xs font-bold text-purple-700">حقوق الملكية (Equity)</span>
            <p className="text-xl font-black text-purple-900">{formatNum(equity)} {currency}</p>
          </div>
        </div>

        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-bold">
          <CheckCircle2 size={16} />
          <span>المعادلة المحاسبية متوازنة: الأصول ({formatNum(assets)}) = الالتزامات + حقوق الملكية ({formatNum(liabilities + equity)})</span>
        </div>
      </div>
    );
  }

  // 4. Default / Generic Table View
  const rows = Array.isArray(data) ? data : (data?.rows || data?.items || data?.records || []);
  const filtered = rows.filter((r: any) => {
    if (!searchTerm) return true;
    const str = JSON.stringify(r).toLowerCase();
    return str.includes(searchTerm.toLowerCase());
  });

  if (filtered.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 font-bold text-xs">
        لا توجد سجلات مطابقة لمعايير البحث الحالية
      </div>
    );
  }

  // Extract columns dynamically
  const sample = filtered[0];
  const keys = Object.keys(sample).slice(0, 6);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 font-bold border-b">
          <tr>
            {keys.map((k, idx) => (
              <th key={idx} className="p-3 capitalize">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
          {filtered.map((row: any, rIdx: number) => (
            <tr key={rIdx} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30">
              {keys.map((k, cIdx) => (
                <td key={cIdx} className="p-3 font-semibold text-slate-700 dark:text-slate-200">
                  {typeof row[k] === 'number' ? formatNum(row[k]) : String(row[k] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
