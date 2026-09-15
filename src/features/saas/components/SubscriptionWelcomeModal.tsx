// src/features/saas/components/SubscriptionWelcomeModal.tsx
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowLeft, 
  Building2, 
  Users, 
  Activity, 
  Zap
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { SubscriptionContactFooter, UNIFIED_SUPPORT_NUMBER } from './SubscriptionContactFooter';

export interface SubscriptionWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTrial?: () => void;
  supportNumber?: string;
  systemVersion?: string;
}

export const SubscriptionWelcomeModal: React.FC<SubscriptionWelcomeModalProps> = ({
  isOpen,
  onClose,
  onStartTrial,
  supportNumber = UNIFIED_SUPPORT_NUMBER,
  systemVersion = "2.5.0"
}) => {
  const setSubscriptionOnboardingOpen = useUIStore((state) => state.setSubscriptionOnboardingOpen);

  useEffect(() => {
    if (isOpen) {
      setSubscriptionOnboardingOpen(true);
    }
    return () => {
      setSubscriptionOnboardingOpen(false);
    };
  }, [isOpen, setSubscriptionOnboardingOpen]);

  if (!isOpen) return null;

  const handleStart = () => {
    if (onStartTrial) {
      onStartTrial();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div 
        id="subscription-welcome-modal-overlay"
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[2500] flex items-center justify-center p-2.5 sm:p-6 overflow-hidden overscroll-none" 
        dir="rtl"
        style={{
          minHeight: '100dvh',
          height: '100dvh',
          paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.625rem, env(safe-area-inset-right))'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div 
          id="subscription-welcome-modal-container"
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-[24px] sm:rounded-[28px] border border-emerald-100 dark:border-emerald-950/60 shadow-2xl shadow-emerald-950/20 text-right flex flex-col overflow-hidden"
          style={{
            maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.25rem)'
          }}
        >
          {/* خلفيات هيدر الطابع الزمردي الأنيق (Emerald Theme Accents) */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-36 h-36 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-36 h-36 bg-emerald-600/10 dark:bg-emerald-600/10 rounded-full blur-2xl pointer-events-none" />

          {/* رأس النافذة والهوية الزمردية - Fixed/Pinned at Top */}
          <div className="shrink-0 p-4 sm:p-5 pb-2.5 sm:pb-3 border-b border-slate-100 dark:border-slate-800/80 relative z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs">
            {/* زر الإغلاق: في زاوية متناسقة ونظيفة بصرياً بعيداً عن الشريط الأخضر */}
            <button 
              id="btn-close-subscription-welcome"
              type="button"
              onClick={onClose} 
              aria-label="إغلاق النافذة"
              className="absolute top-3.5 left-3.5 sm:top-4 sm:left-4 w-8 h-8 flex items-center justify-center bg-slate-100/90 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-500 dark:text-gray-400 rounded-full transition-all duration-150 cursor-pointer z-20"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3 sm:gap-3.5 pl-8">
              <div className="relative flex-shrink-0">
                <div className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-emerald-600/25">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-emerald-100 dark:bg-emerald-900 border-2 border-white dark:border-gray-900 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <div className="pr-0.5 min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[10px] sm:text-[11px] font-bold mb-1">
                  <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">النسخة السحابية المعتمدة | ترحيب الصيدلية</span>
                </div>
                <h2 className="text-base sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  مرحباً بك في PharmaFlow Pro
                </h2>
                <p className="text-[10.5px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1 whitespace-normal">
                  نظامك السيادي لإدارة الصيدليات جاهز للعمل.. استكشف كافة المزايا عبر التجربة المجانية.
                </p>
              </div>
            </div>
          </div>

          {/* الحاوية الداخلية القابلة للتمرير بسلاسة على كافة الشاشات */}
          <div 
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 pt-2.5 sm:pt-3 space-y-3 custom-scrollbar"
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain'
            }}
          >
            {/* بطاقات المؤشرات الزمردية الرشيقة (2x2 على الموبايل) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-50/90 dark:bg-gray-800/60 p-2 sm:p-2.5 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-0.5">
                  <Activity className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">العمليات المجانية</span>
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">200 عملية</span>
              </div>

              <div className="bg-slate-50/90 dark:bg-gray-800/60 p-2 sm:p-2.5 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-0.5">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">الفروع النشطة</span>
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">1 فرع رئيسي</span>
              </div>

              <div className="bg-slate-50/90 dark:bg-gray-800/60 p-2 sm:p-2.5 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-0.5">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">المستخدمين</span>
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">مستخدم كامل</span>
              </div>

              <div className="bg-slate-50/90 dark:bg-gray-800/60 p-2 sm:p-2.5 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">الدعم الفني</span>
                </div>
                <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">مباشر وموحد</span>
              </div>
            </div>

            {/* قائمة التحقق السريعة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] sm:text-xs font-bold text-slate-600 dark:text-gray-300 py-0.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>مزامنة سحابية لحظية ومقاومة لانقطاع النت</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>استيراد ذكي بالـ OCR وتحليل الأمان الدوائي</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>إدارة نقاط البيع والكاشير والباركود المزدوج</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>تقارير مالية وجردية دقيقة وقابلة للتصدير</span>
              </div>
            </div>

            {/* زر البدء الأساسي بالطابع الزمردي الرائد */}
            <button
              id="btn-start-subscription-trial"
              type="button"
              onClick={handleStart}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-2.5 sm:py-3 px-5 rounded-xl font-black text-xs sm:text-sm transition-all duration-200 shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer group"
            >
              <span>ابدأ التجربة المجانية الآن</span>
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            </button>

            {/* قنوات التواصل الموحدة عبر الفوتر المحدث برقم 772093714 */}
            <SubscriptionContactFooter supportNumber={supportNumber} systemVersion={systemVersion} />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Export alias for seamless backward compatibility
export const SubscriptionOnboardingModal = SubscriptionWelcomeModal;
