// src/features/saas/components/SubscriptionWidgets.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, CheckCircle, XCircle, ArrowUpRight,
  Settings, CreditCard, X
} from 'lucide-react';
import { 
  SubscriptionEntitlementService, 
  SubscriptionEntitlement 
} from '@/services/saas/subscriptionEntitlementService';
import { UsageMeterService } from '@/services/saas/usageMeterService';
import { SubscriptionContactFooter, UNIFIED_SUPPORT_NUMBER } from './SubscriptionContactFooter';
import { SubscriptionWelcomeModal, SubscriptionOnboardingModal } from './SubscriptionWelcomeModal';
import { useAuthStore } from '@/store/authStore';
import { configurationService } from '@/services/config/configurationService';

export { SubscriptionContactFooter, SubscriptionWelcomeModal, SubscriptionOnboardingModal };

/**
 * Top Global Usage Ribbon Component
 * Displays real-time progress of the trial transactions with dynamic color coding:
 * - 0 to 100: Emerald Green
 * - 101 to 170: Amber Orange
 * - 171 to 200: Crimson Red
 */
export function SubscriptionGlobalUsageRibbon({ onUpgrade }: { onUpgrade: () => void }) {
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement();
      setEntitlement(ent);
    } catch (e) {
      console.warn('[Ribbon] Failed to fetch subscription entitlement:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('saas-usage-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('saas-usage-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  if (!entitlement || !entitlement.isTrial) return null;

  // Compute color states matching thresholds specified
  let ribbonColors = "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
  let ribbonProgressColor = "bg-emerald-500";
  if (entitlement.currentUsage >= 101 && entitlement.currentUsage <= 170) {
    ribbonColors = "text-amber-600 bg-amber-500/10 border-amber-500/20";
    ribbonProgressColor = "bg-amber-500";
  } else if (entitlement.currentUsage > 170) {
    ribbonColors = "text-rose-600 bg-rose-500/10 border-rose-500/20";
    ribbonProgressColor = "bg-rose-500";
  }

  const durationPercentage = (entitlement.currentUsage / entitlement.trialLimit) * 100;

  return (
    <div id="subscription-global-usage-ribbon" className="w-full bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/60 px-4 sm:px-6 py-2 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-right">
        {/* Metric Label */}
        <div className="flex items-center gap-3">
          <div className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${ribbonColors} flex items-center gap-1.5`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
            <span>التجربة المجانية</span>
          </div>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
            تم استخدام: <strong className="text-slate-900 dark:text-white font-black">{entitlement.currentUsage}</strong> / {entitlement.trialLimit} عملية 
            <span className="mx-2 text-slate-300 dark:text-slate-700">|</span>
            متبقي: <strong className="text-slate-900 dark:text-white font-black">{entitlement.remaining}</strong> عملية
          </span>
        </div>

        {/* Progress bar visual */}
        <div className="flex-1 max-w-xs h-1 px-4 hidden md:block">
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-full ${ribbonProgressColor} transition-all duration-300`} 
              style={{ width: `${Math.min(100, Math.max(0, durationPercentage))}%` }} 
            />
          </div>
        </div>

        {/* Upgrade conversion action button */}
        <button 
          id="btn-ribbon-upgrade"
          type="button"
          onClick={onUpgrade}
          className="flex items-center gap-1 text-[11px] font-black bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95"
        >
          <span>[ ترقية الاشتراك ]</span>
          <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  );
}

/**
 * Warning Interceptor Modal (At >= 180 and < 200 Transactions)
 * Non-blocking warning toast/modal informing the user that trial quota is almost exhausted.
 */
export function SubscriptionWarningInterceptor({ onUpgrade }: { onUpgrade?: () => void }) {
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(null);
  const [hasDismissed, setHasDismissed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement();
      setEntitlement(ent);
    } catch (e) {
      console.warn('[WarningInterceptor] Error fetching entitlement:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('saas-usage-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('saas-usage-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  if (!entitlement || !entitlement.isWarning || hasDismissed) return null;

  return (
    <AnimatePresence>
      <div id="subscription-warning-interceptor" className="fixed bottom-6 left-6 z-[900] max-w-sm w-full p-1" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-amber-400 p-5 shadow-2xl text-right flex flex-col gap-3 relative overflow-hidden"
        >
          {/* Colored warning border indicator */}
          <div className="absolute top-0 right-0 w-2.5 h-full bg-amber-400" />

          <button 
            id="btn-dismiss-warning-interceptor"
            type="button"
            onClick={() => setHasDismissed(true)}
            aria-label="إغلاق التنبيه"
            className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>

          <div className="pr-2">
            <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-500">
              <ShieldAlert size={18} />
              <h4 className="text-xs font-black">تحذير: شارف مخزون العمليات على الانتهاء</h4>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
              بقي لديك <strong className="text-amber-600 dark:text-amber-400 font-black">{entitlement.remaining}</strong> عملية فقط! لضمان استمرار العمليات دون انقطاع قم بترقية الاشتراك الآن.
            </p>
          </div>

          <div className="flex gap-2 justify-end mt-1">
            <button 
              id="btn-warning-upgrade-now"
              type="button"
              onClick={() => {
                setHasDismissed(true);
                if (onUpgrade) {
                  onUpgrade();
                } else {
                  window.location.hash = "#/saas-portal";
                }
              }} 
              className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black px-4 py-2 rounded-lg transition-all cursor-pointer shadow-xs active:scale-95"
            >
              ترقية الآن
            </button>
            <button 
              id="btn-warning-dismiss"
              type="button"
              onClick={() => setHasDismissed(true)} 
              className="bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 text-[10px] font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
            >
              لاحقاً
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Total Trial Blockade UI Component (At >= 200 Transactions or Expired Subscription)
 * Strictly blocks new commercial mutations while maintaining full access to read-only views,
 * reports, export, settings, and support.
 */
export function SubscriptionBlockadeBackdrop({ onUpgrade }: { onUpgrade: () => void }) {
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement();
      setEntitlement(ent);
    } catch (e) {
      console.warn('[BlockadeBackdrop] Error fetching entitlement:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('saas-usage-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('saas-usage-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  if (!entitlement || !entitlement.isBlocked) return null;

  return (
    <div 
      id="subscription-blockade-backdrop" 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[2000] flex items-center justify-center p-4 overflow-y-auto" 
      dir="rtl"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="bg-white dark:bg-gray-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-2xl max-w-xl w-full text-right p-6 sm:p-8 relative overflow-hidden"
      >
        {/* Warning Badge & Title inside Blockade */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/45 text-rose-500 rounded-full flex items-center justify-center animate-bounce shadow-sm">
            <ShieldAlert size={36} />
          </div>
        </div>

        <h3 className="text-xl font-black text-rose-600 text-center mb-2">انتهت النسخة التجريبية</h3>
        <p className="text-slate-600 dark:text-gray-400 text-xs font-bold text-center mb-6 leading-relaxed">
          لقد استهلكت {entitlement.currentUsage} من أصل {entitlement.trialLimit} عملية مجانية متاحة. تم قفل إنشاء العمليات الجديدة للمحافظة على سلامة البيانات.
        </p>

        {/* Feature Matrix lists */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Allowed actions check */}
          <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-900/30 rounded-2xl p-4">
            <span className="text-[11px] font-black text-emerald-600 block mb-2">العمليات المسموح بها:</span>
            <ul className="space-y-2 text-xs font-bold text-slate-600 dark:text-gray-300">
              <li className="flex items-center gap-2">
                <CheckCircle className="text-emerald-500 flex-shrink-0" size={14} />
                <span>عرض البيانات والتقارير المحاسبية</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-emerald-500 flex-shrink-0" size={14} />
                <span>تصدير تقارير PDF وإكسيل</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-emerald-500 flex-shrink-0" size={14} />
                <span>إدارة حساب الصيدلية والمستخدمين</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-emerald-500 flex-shrink-0" size={14} />
                <span>الوصول لبوابة إدارة الاشتراكات</span>
              </li>
            </ul>
          </div>

          {/* Blocked Actions crosses */}
          <div className="bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100/50 dark:border-rose-900/30 rounded-2xl p-4">
            <span className="text-[11px] font-black text-rose-600 block mb-2">العمليات المحظورة (مغلقة):</span>
            <ul className="space-y-2 text-xs font-bold text-slate-600 dark:text-gray-300">
              <li className="flex items-center gap-2">
                <XCircle className="text-rose-500 flex-shrink-0" size={14} />
                <span>إنشاء فواتير بيع (كاشير مبيعات)</span>
              </li>
              <li className="flex items-center gap-2">
                <XCircle className="text-rose-500 flex-shrink-0" size={14} />
                <span>إدخال وتوريد مشتريات</span>
              </li>
              <li className="flex items-center gap-2">
                <XCircle className="text-rose-500 flex-shrink-0" size={14} />
                <span>تحويل مخزون دوائي بين الفروع</span>
              </li>
              <li className="flex items-center gap-2">
                <XCircle className="text-rose-500 flex-shrink-0" size={14} />
                <span>إثبات مرتجعات أو تسويات جديدة</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Action controls */}
        <div className="space-y-3">
          <button 
            id="btn-blockade-subscribe-now"
            type="button"
            onClick={onUpgrade}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 cursor-pointer transition-all duration-200"
          >
            <CreditCard size={16} />
            <span>اشترك الآن (طلب الترقية والتفعيل)</span>
          </button>
          
          <div className="text-center">
            <span className="text-[10px] text-slate-400 font-bold block">
              يرجى التواصل مع الإدارة لترقية الاشتراك واستئناف كافة الصلاحيات فوراً.
            </span>
          </div>
          
          <SubscriptionContactFooter supportNumber={UNIFIED_SUPPORT_NUMBER} systemVersion="2.5.0" />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Super Admin / Reviewer Controller Panel
 * Strictly restricted to Development mode or authenticated Super Admin / Platform Owner roles.
 */
export function ReviewerSaaSTester() {
  const { user } = useAuthStore();
  const [offsetVal, setOffsetVal] = useState(0);

  const isDev = Boolean(import.meta.env?.DEV || process.env.NODE_ENV !== 'production');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'OWNER' || (user as any)?.role === 'PLATFORM_OWNER';

  useEffect(() => {
    const storedStr = configurationService.getSync<string>('saas_qa_test_offset');
    const stored = parseInt(storedStr || '0', 10);
    setOffsetVal(isNaN(stored) ? 0 : stored);
  }, []);

  // Strict Security Gate: Never render for normal users or in production without super admin privileges
  if (!isDev && !isSuperAdmin) {
    return null;
  }

  const handleOffsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setOffsetVal(val);
    UsageMeterService.setQaSimulationOffset(val);
  };

  const handleQuickReset = () => {
    setOffsetVal(0);
    UsageMeterService.resetQaSimulation();
  };

  return (
    <div id="reviewer-saas-tester-panel" className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl text-right mt-4">
      <div className="flex items-center gap-2 mb-3 text-purple-600 dark:text-purple-400">
        <Settings size={18} />
        <h4 className="text-xs font-black">أداة محاكاة تدقيق اشتراك SaaS (QA / Super Admin Tester)</h4>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed font-bold">
        مخصصة للمراجع لاختبار عتبات التحذير والحظر ومطابقة السلوك بأمان أثناء جلسة الفحص.
      </p>

      <div className="space-y-4">
        {/* Sliders offset */}
        <div>
          <label className="text-[11px] text-slate-700 dark:text-slate-300 font-extrabold flex justify-between">
            <span>تعديل إجمالي المعاملات المحاكية:</span>
            <span className="text-purple-600 dark:text-purple-400 font-black">{offsetVal} معاملة إضافية</span>
          </label>
          <input 
            type="range" 
            min="0" 
            max="250" 
            value={offsetVal}
            onChange={handleOffsetChange}
            className="w-full accent-purple-600 mt-2 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1">
            <span>0 (طبيعي)</span>
            <span className="text-amber-500 font-bold">180 (تحذير)</span>
            <span className="text-rose-500 font-black">200 (حظر)</span>
            <span>250</span>
          </div>
        </div>

        {/* Shortcuts */}
        <div className="flex justify-between items-center bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-100 dark:border-gray-700">
          <span className="text-[10px] font-bold text-slate-500">مفاتيح اختبار سريعة:</span>
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={() => {
                setOffsetVal(182);
                UsageMeterService.setQaSimulationOffset(182);
              }}
              className="px-2.5 py-1 text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 rounded-lg border border-amber-200 cursor-pointer"
            >
              شغّل تحذير (182)
            </button>
            <button 
              type="button"
              onClick={() => {
                setOffsetVal(203);
                UsageMeterService.setQaSimulationOffset(203);
              }}
              className="px-2.5 py-1 text-[9px] font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 rounded-lg border border-rose-200 cursor-pointer"
            >
              شغّل حظر (203)
            </button>
            <button 
              type="button"
              onClick={handleQuickReset}
              className="px-2.5 py-1 text-[9px] font-bold text-slate-600 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-lg border border-slate-200 cursor-pointer"
            >
              إعادة تصفير
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Centered modal shown when trial count is exceeded.
 */
export function TrialBlockedModal({ onClose, onUpgrade }: { onClose: () => void; onUpgrade?: () => void }) {
  return (
    <div id="trial-blocked-modal" className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[3000] flex items-center justify-center p-4 text-center" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-[32px] border border-slate-100 dark:border-gray-800 shadow-2xl max-w-md w-full overflow-hidden p-6 sm:p-8 relative"
      >
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/45 text-rose-500 rounded-full flex items-center justify-center animate-bounce">
            <ShieldAlert size={36} />
          </div>
        </div>
        
        <h3 className="text-xl font-black text-rose-600 mb-2">انتهت النسخة التجريبية</h3>
        <p className="text-slate-600 dark:text-gray-300 text-xs font-bold leading-relaxed mb-6">
          تم الوصول للحد التجريبي 200 عملية. يرجى الاشتراك واستكمال التفعيل لمتابعة إنشاء العمليات.
        </p>

        <div className="space-y-3">
          <button
            id="btn-trial-modal-upgrade"
            type="button"
            onClick={() => {
              if (onUpgrade) {
                onUpgrade();
              }
              onClose();
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 cursor-pointer transition-all"
          >
            <CreditCard size={16} />
            <span>طلب ترقية وتفعيل الاشتراك</span>
          </button>

          <button
            id="btn-trial-modal-close"
            type="button"
            onClick={onClose}
            className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-300 font-black py-3 rounded-2xl text-xs cursor-pointer transition-all"
          >
            إغلاق النافذة
          </button>
        </div>
      </motion.div>
    </div>
  );
}
