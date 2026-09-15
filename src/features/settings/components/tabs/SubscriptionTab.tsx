// src/features/settings/components/tabs/SubscriptionTab.tsx
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CreditCard, 
  ShieldCheck, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight, 
  RefreshCw, 
  Building2, 
  Server, 
  Zap, 
  PhoneCall, 
  Copy, 
  Check, 
  X,
  Activity
} from 'lucide-react';
import { 
  SubscriptionEntitlementService, 
  SubscriptionEntitlement,
  SubscriptionPlanCode 
} from '@/services/saas/subscriptionEntitlementService';
import { SubscriptionContactFooter, UNIFIED_SUPPORT_NUMBER } from '@/features/saas/components/SubscriptionContactFooter';
import { db } from '@/core/db';

export default function SubscriptionTab() {
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanCode>('BUSINESS');
  const [selectedPeriodMonths, setSelectedPeriodMonths] = useState<number>(12);
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false);
  const [upgradeSuccessMessage, setUpgradeSuccessMessage] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Live Local DB Stats
  const [dbStats, setDbStats] = useState({
    productsCount: 0,
    salesCount: 0,
    purchasesCount: 0,
    vouchersCount: 0
  });

  const fetchEntitlement = useCallback(async () => {
    try {
      const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement();
      setEntitlement(ent);
    } catch (e) {
      console.error('[SubscriptionTab] Error fetching entitlement:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDbStats = useCallback(async () => {
    try {
      const [pCount, sCount, puCount, vCount] = await Promise.all([
        db.products.count().catch(() => 0),
        db.sales.count().catch(() => 0),
        db.purchases.count().catch(() => 0),
        db.vouchers?.count().catch(() => 0) || Promise.resolve(0)
      ]);
      setDbStats({
        productsCount: pCount,
        salesCount: sCount,
        purchasesCount: puCount,
        vouchersCount: vCount
      });
    } catch (e) {
      console.warn('[SubscriptionTab] Error fetching DB stats:', e);
    }
  }, []);

  useEffect(() => {
    fetchEntitlement();
    fetchDbStats();

    const handleUpdate = () => {
      fetchEntitlement();
      fetchDbStats();
    };

    window.addEventListener('saas-usage-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('saas-usage-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [fetchEntitlement, fetchDbStats]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleApplyUpgradeOrRenewal = async () => {
    if (!entitlement) return;
    setIsProcessingUpgrade(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + selectedPeriodMonths * 30 * 24 * 60 * 60 * 1000).toISOString();

      await SubscriptionEntitlementService.applyVerifiedLicense({
        tenantId: entitlement.tenantId || 'TEN_MAIN_DALLAH_09',
        plan: selectedPlan,
        startsAt: now.toISOString(),
        expiresAt: expiresAt
      });

      window.dispatchEvent(new CustomEvent('saas-usage-updated'));
      await fetchEntitlement();

      const planArabicNames: Record<SubscriptionPlanCode, string> = {
        TRIAL: 'التجربة المجانية',
        BASIC: 'الباقة الأساسية',
        BUSINESS: 'باقة الأعمال المتقدمة',
        ENTERPRISE: 'باقة المؤسسات والشركات'
      };

      setUpgradeSuccessMessage(`تم تفعيل ${planArabicNames[selectedPlan]} بنجاح لمدة ${selectedPeriodMonths} شهر!`);
      setTimeout(() => {
        setIsUpgradeModalOpen(false);
        setUpgradeSuccessMessage(null);
      }, 1800);
    } catch (err: any) {
      console.error('[SubscriptionTab] Upgrade failed:', err);
      alert('حدث خطأ أثناء ترقية الاشتراك: ' + (err?.message || 'يرجى المحاولة مجدداً'));
    } finally {
      setIsProcessingUpgrade(false);
    }
  };

  const calculateDaysRemaining = (expiresAtStr?: string) => {
    if (!expiresAtStr) return 0;
    const expiryTime = new Date(expiresAtStr).getTime();
    if (isNaN(expiryTime)) return 0;
    const diff = expiryTime - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  if (isLoading || !entitlement) {
    return (
      <div className="w-full p-8 flex flex-col items-center justify-center gap-3 text-slate-500 font-bold">
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">جاري تحميل بيانات الاشتراك والترخيص...</span>
      </div>
    );
  }

  const isTrial = entitlement.isTrial || entitlement.plan === 'TRIAL';
  const isExpired = entitlement.subscriptionStatus === 'EXPIRED' || (entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() <= Date.now());
  const isActivePaid = !isTrial && entitlement.subscriptionStatus === 'ACTIVE' && !isExpired;
  const daysRemaining = calculateDaysRemaining(entitlement.expiresAt);

  // Progress Bar for Trial
  const usagePercentage = Math.min(100, Math.max(0, (entitlement.currentUsage / entitlement.trialLimit) * 100));
  let progressColor = "bg-emerald-500";
  let statusBadgeColor = "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300";
  if (entitlement.currentUsage >= 101 && entitlement.currentUsage <= 170) {
    progressColor = "bg-amber-500";
    statusBadgeColor = "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300";
  } else if (entitlement.currentUsage > 170 || entitlement.isBlocked) {
    progressColor = "bg-rose-500";
    statusBadgeColor = "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300";
  }

  const getPlanNameBadge = (plan: SubscriptionPlanCode) => {
    switch (plan) {
      case 'BASIC':
        return { label: 'الباقة الأساسية (BASIC)', color: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300' };
      case 'BUSINESS':
        return { label: 'باقة الأعمال المتقدمة (BUSINESS)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300' };
      case 'ENTERPRISE':
        return { label: 'باقة المؤسسات والشركات (ENTERPRISE)', color: 'text-purple-700 bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300' };
      default:
        return { label: 'التجربة المجانية (TRIAL)', color: statusBadgeColor };
    }
  };

  const currentPlanMeta = getPlanNameBadge(entitlement.plan);

  return (
    <div className="space-y-6" dir="rtl">
      {/* ========================================================================= */}
      {/* 1. PRIMARY AUTHORITATIVE SUBSCRIPTION STATUS CARD                         */}
      {/* ========================================================================= */}
      <div 
        id="settings-subscription-status-card"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-100 dark:border-slate-700/80 overflow-hidden"
      >
        {/* Card Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-700/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <CreditCard size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-cairo">
                  حالة الاشتراك والخطة
                </h3>
                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${currentPlanMeta.color}`}>
                  {currentPlanMeta.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-cairo mt-1">
                المصدر المركزي المعتمد لإدارة تراخيص المنظومة واستهلاك العمليات
              </p>
            </div>
          </div>

          {/* Action Trigger in Header */}
          <div className="flex items-center gap-2">
            {isTrial && (
              <button
                id="btn-settings-upgrade-trial"
                type="button"
                onClick={() => setIsUpgradeModalOpen(true)}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={14} />
                <span>ترقية الاشتراك</span>
                <ArrowUpRight size={14} />
              </button>
            )}

            {isActivePaid && (
              <button
                id="btn-settings-renew-active"
                type="button"
                onClick={() => setIsUpgradeModalOpen(true)}
                className="w-full sm:w-auto bg-[#1E4D4D] hover:bg-[#163a3a] text-white text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>إدارة أو تجديد الاشتراك</span>
              </button>
            )}

            {isExpired && (
              <button
                id="btn-settings-renew-expired"
                type="button"
                onClick={() => setIsUpgradeModalOpen(true)}
                className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap size={14} />
                <span>تجديد الاشتراك الآن</span>
              </button>
            )}
          </div>
        </div>

        {/* Card Body — Specific States per Specification */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* CASE A: TRIAL USER */}
          {isTrial && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Metric 1: Current Plan */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    الخطة الحالية
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    التجربة المجانية
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    الحد الأقصى: 200 عملية
                  </div>
                </div>

                {/* Metric 2: Used Operations */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    العمليات المستخدمة
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    {entitlement.currentUsage} / {entitlement.trialLimit} عملية
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    معدل الاستهلاك: {usagePercentage.toFixed(1)}%
                  </div>
                </div>

                {/* Metric 3: Remaining Operations */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    العمليات المتبقية
                  </span>
                  <span className={`text-sm font-black ${entitlement.remaining <= 20 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {entitlement.remaining} عملية
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    {entitlement.isBlocked ? 'انتهت العمليات المتاحة' : 'عملية مجانية متبقية'}
                  </div>
                </div>
              </div>

              {/* Progress Bar with Exact Percentage & Visual Color Coding */}
              <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>مؤشر استهلاك العمليات التجريبية</span>
                  <span className="font-mono">{entitlement.currentUsage} / 200 ({usagePercentage.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${progressColor} transition-all duration-500 rounded-full`}
                    style={{ width: `${usagePercentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <span>0 عملية (بداية التجربة)</span>
                  <span>100 عملية (طبيعي)</span>
                  <span>170 عملية (تحذير)</span>
                  <span>200 عملية (قفل)</span>
                </div>
              </div>

              {/* Status Note */}
              <div className="flex items-center justify-between p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 text-xs">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
                  <Activity size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>حالة الحساب التجريبي:</span>
                  <span className="font-black underline">{entitlement.isBlocked ? 'محظور لبلوغ الحد (BLOCKED)' : 'نشط (ACTIVE)'}</span>
                </div>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                  {entitlement.isBlocked ? 'قم بالترقية لاستئناف إصدار الفواتير' : 'كافة الميزات مفتوحة للاستكشاف'}
                </span>
              </div>
            </div>
          )}

          {/* CASE B: ACTIVE PAID SUBSCRIBER */}
          {isActivePaid && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                {/* Metric 1: Current Plan */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    الخطة الحالية
                  </span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                    {entitlement.plan}
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    عمليات وفواتير غير محدودة
                  </div>
                </div>

                {/* Metric 2: Status */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    حالة الاشتراك
                  </span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    <span>نشط (ACTIVE)</span>
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    ترخيص سحابي مفعل
                  </div>
                </div>

                {/* Metric 3: Expiry Date */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    تاريخ انتهاء الاشتراك
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                    {entitlement.expiresAt ? new Date(entitlement.expiresAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : 'غير محدد'}
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    التجديد التلقائي متاح
                  </div>
                </div>

                {/* Metric 4: Days Remaining */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    الأيام المتبقية
                  </span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {daysRemaining} يوم
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    صلاحية سارية
                  </div>
                </div>
              </div>

              {/* Active Plan Highlights */}
              <div className="p-4 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                  <span>اشتراكك يتمتع بحماية البيانات السحابية والمزامنة اللحظية بدون حدود للعمليات اليومية.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  ترقية أو تمديد الخطة ←
                </button>
              </div>
            </div>
          )}

          {/* CASE C: EXPIRED SUBSCRIPTION */}
          {isExpired && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Metric 1: Current Plan */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    الخطة السابقة
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    {entitlement.plan}
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    بحاجة إلى تجديد الترخيص
                  </div>
                </div>

                {/* Metric 2: Status */}
                <div className="bg-rose-50/60 dark:bg-rose-950/30 p-4 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 block mb-1">
                    حالة الاشتراك
                  </span>
                  <span className="text-sm font-black text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    <span>منتهي الصلاحية (EXPIRED)</span>
                  </span>
                  <div className="mt-2 text-[10px] text-rose-500/80">
                    العمليات الجديدة مقفلة
                  </div>
                </div>

                {/* Metric 3: Expiry Date */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    تاريخ الانتهاء
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                    {entitlement.expiresAt ? new Date(entitlement.expiresAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : 'غير محدد'}
                  </span>
                  <div className="mt-2 text-[10px] text-slate-400">
                    0 يوم متبقي
                  </div>
                </div>
              </div>

              {/* Expired Warning Banner */}
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-900 dark:text-rose-200 font-bold">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                  <span>انتهت صلاحية اشتراكك السحابي. بياناتك وسجلاتك محفوظة بأمان، يرجى التجديد لمتابعة إصدار الفواتير.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-black px-4 py-2 rounded-xl transition-all shrink-0 cursor-pointer shadow-xs"
                >
                  تجديد الاشتراك الآن
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TENANT & SYSTEM METRICS SECTION                                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card A: Organization & Tenant License */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-100 dark:border-slate-700/80 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/80 pb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">بيانات المنشأة والترخيص</h4>
              <p className="text-xs text-slate-400">معرف العميل والفرع المربوط</p>
            </div>
          </div>

          <div className="space-y-3 text-xs font-bold">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">معرف المستأجر (Tenant ID):</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-900 dark:text-white">{entitlement.tenantId || 'TEN_MAIN_DALLAH_09'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(entitlement.tenantId || 'TEN_MAIN_DALLAH_09', 'tenant')}
                  className="text-slate-400 hover:text-emerald-600 cursor-pointer p-1"
                  title="نسخ"
                >
                  {copiedText === 'tenant' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">إصدار المنظومة:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">v2.5.0 Enterprise Pro</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">بروتوكول الأمان والتشفير:</span>
              <span className="text-slate-700 dark:text-slate-300">AES-256 / Offline-First DB</span>
            </div>
          </div>
        </div>

        {/* Card B: IndexedDB Resource Stats */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-100 dark:border-slate-700/80 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/80 pb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Server size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">سجلات قاعدة البيانات المحلية</h4>
              <p className="text-xs text-slate-400">حجم العمليات المحفوظة في قاعدة بيانات المتصفح</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold mb-1">الأدوية والمنتجات</span>
              <span className="text-sm font-black text-slate-900 dark:text-white font-mono">{dbStats.productsCount} صنف</span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold mb-1">فواتير المبيعات</span>
              <span className="text-sm font-black text-slate-900 dark:text-white font-mono">{dbStats.salesCount} فاتورة</span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold mb-1">فواتير المشتريات</span>
              <span className="text-sm font-black text-slate-900 dark:text-white font-mono">{dbStats.purchasesCount} توريد</span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold mb-1">السندات والقيود</span>
              <span className="text-sm font-black text-slate-900 dark:text-white font-mono">{dbStats.vouchersCount} سند</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. UNIFIED TECHNICAL SUPPORT FOOTER (772093714)                            */}
      {/* ========================================================================= */}
      <div className="pt-2">
        <SubscriptionContactFooter supportNumber={UNIFIED_SUPPORT_NUMBER} systemVersion="2.5.0" />
      </div>

      {/* ========================================================================= */}
      {/* 4. INTERACTIVE UPGRADE / RENEWAL MODAL                                    */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isUpgradeModalOpen && (
          <div 
            id="subscription-upgrade-modal-backdrop"
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[2000] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
            dir="rtl"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-2xl max-w-2xl w-full text-right p-5 sm:p-7 relative overflow-hidden my-auto"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => setIsUpgradeModalOpen(false)}
                className="absolute top-5 left-5 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white font-cairo">
                    ترقية وتجديد الاشتراك السحابي
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-cairo">
                    اختر الباقة المناسبة لصيدليتك مع فتح كافة العمليات والمزامنة بدون حدود
                  </p>
                </div>
              </div>

              {/* Success Notification */}
              {upgradeSuccessMessage && (
                <div className="mb-4 p-4 bg-emerald-500 text-white rounded-2xl text-xs font-black flex items-center gap-2 animate-bounce">
                  <CheckCircle2 size={18} />
                  <span>{upgradeSuccessMessage}</span>
                </div>
              )}

              {/* Plans Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                {/* Plan 1: BASIC */}
                <div
                  onClick={() => setSelectedPlan('BASIC')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    selectedPlan === 'BASIC'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400">الأساسية</span>
                      {selectedPlan === 'BASIC' && <CheckCircle2 size={16} className="text-blue-600" />}
                    </div>
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-snug mb-3">
                      للصيدليات الفردية: فرع واحد، 3 مستخدمين، عمليات غير محدودة.
                    </p>
                  </div>
                  <div className="text-xs font-mono font-black text-slate-900 dark:text-white">
                    BASIC
                  </div>
                </div>

                {/* Plan 2: BUSINESS */}
                <div
                  onClick={() => setSelectedPlan('BUSINESS')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                    selectedPlan === 'BUSINESS'
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-md shadow-emerald-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="absolute top-0 left-0 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-br-lg">
                    الأكثر طلباً
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">الأعمال المتقدمة</span>
                      {selectedPlan === 'BUSINESS' && <CheckCircle2 size={16} className="text-emerald-600" />}
                    </div>
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-snug mb-3">
                      حتى 5 فروع، 15 مستخدم، الذكاء الاصطناعي والمزامنة اللحظية.
                    </p>
                  </div>
                  <div className="text-xs font-mono font-black text-slate-900 dark:text-white">
                    BUSINESS
                  </div>
                </div>

                {/* Plan 3: ENTERPRISE */}
                <div
                  onClick={() => setSelectedPlan('ENTERPRISE')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    selectedPlan === 'ENTERPRISE'
                      ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-purple-600 dark:text-purple-400">المؤسسات</span>
                      {selectedPlan === 'ENTERPRISE' && <CheckCircle2 size={16} className="text-purple-600" />}
                    </div>
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-snug mb-3">
                      فروع ومستخدمين غير محدودين، خادم مخصص ودعم على مدار الساعة.
                    </p>
                  </div>
                  <div className="text-xs font-mono font-black text-slate-900 dark:text-white">
                    ENTERPRISE
                  </div>
                </div>
              </div>

              {/* Period Selector */}
              <div className="mb-5 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">مدة الاشتراك:</span>
                <div className="flex items-center gap-2">
                  {[
                    { months: 1, label: 'شهر' },
                    { months: 6, label: '6 أشهر' },
                    { months: 12, label: 'سنة كاملة (خصم 20%)' }
                  ].map((p) => (
                    <button
                      key={p.months}
                      type="button"
                      onClick={() => setSelectedPeriodMonths(p.months)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                        selectedPeriodMonths === p.months
                          ? 'bg-[#1E4D4D] text-white shadow-xs'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  id="btn-confirm-apply-license"
                  type="button"
                  disabled={isProcessingUpgrade}
                  onClick={handleApplyUpgradeOrRenewal}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white py-3 px-6 rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessingUpgrade ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>تأكيد تفعيل الاشتراك الآن</span>
                    </>
                  )}
                </button>

                <a
                  href={`tel:${UNIFIED_SUPPORT_NUMBER}`}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-3 px-5 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <PhoneCall size={15} />
                  <span>طلب فاتورة / تواصل مع المبيعات</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
