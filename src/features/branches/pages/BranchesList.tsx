// src/features/branches/pages/BranchesList.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Building2, MapPin, Phone, SlidersHorizontal, 
  Plus, Search, Edit2, RotateCw, ArrowLeftRight, 
  Activity, UserCheck, Clock, CheckCircle2, 
  AlertTriangle, Wifi, ShieldCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { Branch, BranchMetrics } from '@/types';
import { BranchService } from '../services/BranchService';
import { useUI } from '@/contexts/AppContext';
import { BackButton } from '@/components/shared/BackButton';
import { 
  BranchFormModal, 
  BranchSettingsModal, 
  BranchTransferModal, 
  BranchAnalyticsModal 
} from './BranchModals';

interface BranchesListProps {
  onNavigate?: (view: string, params?: any) => void;
}

export const BranchesList: React.FC<BranchesListProps> = ({ onNavigate }) => {
  const { addToast, currency } = useUI();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, BranchMetrics>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Partial<Branch> | null>(null);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsBranch, setSettingsBranch] = useState<Branch | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceBranchId, setTransferSourceBranchId] = useState<string>('');

  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [analyticsBranch, setAnalyticsBranch] = useState<Branch | null>(null);

  const fetchBranchesData = useCallback(async (showToast = false) => {
    setIsRefreshing(true);
    try {
      const data = await BranchService.getBranches();
      setBranches(data);

      const metrics = await BranchService.getAllBranchMetrics();
      setMetricsMap(metrics);

      if (showToast) {
        addToast('تم تحديث بيانات الفروع والمؤشرات بنجاح', 'success');
      }
    } catch {
      addToast('خطأ أثناء جلب بيانات الفروع والمؤشرات', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchBranchesData();
  }, [fetchBranchesData]);

  // Offline-first instant multi-field search
  const filteredBranches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return branches;

    return branches.filter((b) => {
      const codeMatch = (b.code || '').toLowerCase().includes(q);
      const nameMatch = (b.name || '').toLowerCase().includes(q);
      const managerMatch = (b.managerName || '').toLowerCase().includes(q);
      const locationMatch = (b.location || b.address || '').toLowerCase().includes(q);
      const phoneMatch = (b.phone || '').toLowerCase().includes(q);

      return codeMatch || nameMatch || managerMatch || locationMatch || phoneMatch;
    });
  }, [branches, searchTerm]);

  // Summary Metrics calculations
  const summaryStats = useMemo(() => {
    const total = branches.length;
    const active = branches.filter(b => b.isActive !== false).length;
    
    let totalSalesToday = 0;
    let totalLowStockCount = 0;

    Object.values(metricsMap).forEach(m => {
      totalSalesToday += m.salesToday || 0;
      totalLowStockCount += m.lowStockCount || 0;
    });

    return {
      total,
      active,
      totalSalesToday: parseFloat(totalSalesToday.toFixed(2)),
      totalLowStockCount,
    };
  }, [branches, metricsMap]);

  return (
    <div className="space-y-4 sm:space-y-5 w-full pb-12 max-w-7xl mx-auto px-2 sm:px-4" dir="rtl">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-br from-[#0c312d] via-[#0f3834] to-[#08221f] rounded-[28px] p-5 sm:p-6 text-white shadow-xl relative overflow-hidden w-full">
        {/* Background ambient lighting */}
        <div className="absolute left-0 top-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-0 bottom-0 w-48 h-48 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header Top Section: Title, Subtitle, Icon */}
        <div className="flex justify-between items-start gap-3 sm:gap-4 mb-5 relative z-10">
          <div className="flex items-start gap-3 flex-1">
            {onNavigate && (
              <BackButton 
                onClick={() => onNavigate('dashboard')} 
                variant="emerald" 
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight">
                  إدارة شبكة الفروع والمخازن
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                  <ShieldCheck size={13} />
                  <span>ERP Enterprise</span>
                </span>
              </div>
              <p className="text-xs md:text-sm text-emerald-200/90 font-medium mt-1 leading-relaxed max-w-2xl">
                إدارة شاملة للمخازن والتحويلات البينية ومؤشرات الأداء مع عزل كامل للصلاحيات والمزامنة المحلية
              </p>
            </div>
          </div>
          <div className="w-11 h-11 sm:w-13 sm:h-13 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-300 shrink-0 shadow-inner">
            <Building2 size={24} />
          </div>
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center gap-2.5 relative z-10">
          <button
            type="button"
            onClick={() => {
              setEditingBranch({
                code: '',
                name: '',
                location: '',
                address: '',
                phone: '',
                managerName: '',
                workingHours: '08:00 ص - 12:00 م',
                allowedDiscount: 5,
                isMain: branches.length === 0,
                isActive: true,
              });
              setIsFormModalOpen(true);
            }}
            className="flex-1 sm:flex-initial bg-[#00c88c] hover:bg-[#00b07b] text-white font-bold text-xs sm:text-sm px-5 py-3 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus size={18} />
            <span>إضافة فرع جديد</span>
          </button>

          <button
            type="button"
            onClick={() => fetchBranchesData(true)}
            disabled={isRefreshing}
            title="تحديث البيانات والمؤشرات"
            className="w-11 h-11 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/50 rounded-2xl flex items-center justify-center text-white transition-all cursor-pointer shrink-0 active:scale-95 disabled:opacity-50"
          >
            <RotateCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('branch-reports')}
              className="hidden sm:flex items-center gap-2 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/50 text-emerald-200 font-bold text-xs px-4 py-3 rounded-2xl transition-all cursor-pointer"
            >
              <Activity size={16} />
              <span>التقارير التحليلية المجمعة</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Metric Statistics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">الفروع النشطة</span>
            <span className="text-base sm:text-lg font-black text-slate-800">
              {summaryStats.active} <span className="text-xs font-bold text-slate-400">/ {summaryStats.total}</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Building2 size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">إجمالي مبيعات اليوم</span>
            <span className="text-base sm:text-lg font-black text-emerald-700">
              {summaryStats.totalSalesToday.toLocaleString()} <span className="text-xs font-bold text-emerald-600">{currency}</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">نواقص المخزون بالشبكة</span>
            <span className={`text-base sm:text-lg font-black ${summaryStats.totalLowStockCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {summaryStats.totalLowStockCount} <span className="text-xs font-bold text-slate-400">صنف</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">حالة المزامنة السحابية</span>
            <span className="text-xs sm:text-sm font-black text-emerald-700 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>متصل ويعمل محلياً</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Wifi size={18} />
          </div>
        </div>
      </div>

      {/* 3. Search Bar */}
      <div className="relative w-full">
        <input
          type="text"
          placeholder="ابحث برمز الفرع، الاسم، الصيدلي المسؤول، العنوان أو الهاتف..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-4 pr-11 py-3 text-xs sm:text-sm bg-white border border-slate-200/90 rounded-2xl focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 text-slate-800 placeholder:text-slate-400 shadow-sm transition-all"
        />
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      </div>

      {/* 4. Branch Cards Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[28px] border border-slate-100 shadow-sm">
          <div className="w-9 h-9 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-400 font-bold">جاري تحميل بيانات شبكة الفروع والمخازن...</p>
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="bg-white rounded-[28px] p-12 text-center border border-slate-100 shadow-sm">
          <Building2 className="mx-auto text-slate-300 mb-3" size={42} />
          <h3 className="text-sm font-black text-slate-700">لا توجد فروع مطابقة لمعايير البحث</h3>
          <p className="text-xs text-slate-400 font-medium mt-1">
            جرب البحث بكلمات أخرى أو أضف فرعاً جديداً للشبكة.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredBranches.map((branch) => {
            const metrics = metricsMap[branch.id] || {
              branchId: branch.id,
              salesToday: 0,
              salesTodayCount: 0,
              inventoryValue: 0,
              lowStockCount: 0,
              totalProductsCount: 0,
              syncStatus: 'ONLINE',
            };

            const isMainBranch = branch.isMain || branch.is_main || branch.code?.includes('MAIN');

            return (
              <motion.div
                layout
                key={branch.id}
                className="bg-white rounded-[24px] p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between"
              >
                {/* Visual side accent bar */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    branch.isActive !== false ? 'bg-emerald-500' : 'bg-slate-300'
                  } rounded-l-2xl`}
                />

                <div>
                  {/* Top Badges Row */}
                  <div className="flex justify-between items-center gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-black bg-[#eefaf6] text-emerald-800 px-3 py-0.5 rounded-full uppercase tracking-wider border border-emerald-100">
                        {branch.code}
                      </span>
                      {isMainBranch && (
                        <span className="text-[10px] font-black bg-teal-50 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200">
                          الفرع الرئيسي
                        </span>
                      )}
                    </div>

                    {/* Operational & Sync Status */}
                    <div className="flex items-center gap-1">
                      {metrics.syncStatus === 'ONLINE' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>متصل</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>محلي</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Branch Name */}
                  <h3 className="text-sm sm:text-base font-black text-slate-800 mb-3 leading-snug">
                    {branch.name}
                  </h3>

                  {/* Branch Contact & Management Details */}
                  <div className="space-y-1.5 text-xs text-slate-500 mb-4 bg-slate-50/70 p-3 rounded-2xl border border-slate-100/80">
                    {branch.managerName && (
                      <div className="flex items-center gap-2">
                        <UserCheck size={14} className="text-emerald-600 shrink-0" />
                        <span className="font-bold text-slate-700">{branch.managerName}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate font-medium">{branch.location || branch.address || 'بدون عنوان محدد'}</span>
                    </div>

                    {branch.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-slate-400 shrink-0" />
                        <span dir="ltr" className="text-right font-medium text-slate-600">{branch.phone}</span>
                      </div>
                    )}

                    {branch.workingHours && (
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-500 text-[11px]">{branch.workingHours}</span>
                      </div>
                    )}
                  </div>

                  {/* Financial / Inventory Real-Time Summary */}
                  <div className="grid grid-cols-3 gap-1.5 mb-4 p-2.5 bg-emerald-50/30 rounded-2xl border border-emerald-100/60 text-center">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">مبيعات اليوم</span>
                      <span className="text-xs font-black text-emerald-700 block mt-0.5">
                        {metrics.salesToday.toLocaleString()} <span className="text-[9px]">{currency}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">قيمة المخزون</span>
                      <span className="text-xs font-black text-slate-800 block mt-0.5">
                        {metrics.inventoryValue.toLocaleString()} <span className="text-[9px]">{currency}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">نواقص المخزون</span>
                      <span className={`text-xs font-black block mt-0.5 ${metrics.lowStockCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {metrics.lowStockCount} صنف
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom Actions Row */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                  {/* Transfer Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setTransferSourceBranchId(branch.id);
                      setIsTransferModalOpen(true);
                    }}
                    title="مناقلة مخزنية"
                    className="flex-1 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <ArrowLeftRight size={14} />
                    <span>تحويل</span>
                  </button>

                  {/* Analytics Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyticsBranch(branch);
                      setIsAnalyticsModalOpen(true);
                    }}
                    title="تحليلات الفرع"
                    className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95"
                  >
                    <Activity size={15} />
                  </button>

                  {/* Settings Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsBranch(branch);
                      setIsSettingsModalOpen(true);
                    }}
                    title="خيارات التنبؤ والطلب التلقائي"
                    className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95"
                  >
                    <SlidersHorizontal size={15} />
                  </button>

                  {/* Edit Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBranch(branch);
                      setIsFormModalOpen(true);
                    }}
                    title="تعديل بيانات الفرع"
                    className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Add / Edit Branch Form Modal */}
      <BranchFormModal
        isOpen={isFormModalOpen}
        branch={editingBranch}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingBranch(null);
        }}
        onSuccess={() => fetchBranchesData()}
      />

      {/* Modal 2: Branch Auto-Reorder / Forecast Settings Modal */}
      <BranchSettingsModal
        isOpen={isSettingsModalOpen}
        branch={settingsBranch}
        onClose={() => {
          setIsSettingsModalOpen(false);
          setSettingsBranch(null);
        }}
      />

      {/* Modal 3: Inter-Branch Stock Transfer Modal */}
      <BranchTransferModal
        isOpen={isTransferModalOpen}
        sourceBranchId={transferSourceBranchId}
        branches={branches}
        onClose={() => {
          setIsTransferModalOpen(false);
          setTransferSourceBranchId('');
        }}
        onSuccess={() => fetchBranchesData()}
      />

      {/* Modal 4: Real-time Analytics & Low Stock Predictions Modal */}
      <BranchAnalyticsModal
        isOpen={isAnalyticsModalOpen}
        branch={analyticsBranch}
        metrics={analyticsBranch ? metricsMap[analyticsBranch.id] || null : null}
        onClose={() => {
          setIsAnalyticsModalOpen(false);
          setAnalyticsBranch(null);
        }}
      />
    </div>
  );
};
