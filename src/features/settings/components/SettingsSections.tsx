import React from 'react';
import { Section } from '@/components/shared/Section';
import { ShieldCheck, KeyRound, Info } from 'lucide-react';
import { ReviewerSaaSTester } from '@features/saas/components/SubscriptionWidgets';
import { useAuthStore } from '@/store/authStore';

export const SettingsSections: React.FC<{
  openSection: string | null;
  toggleSection: (section: string) => void;
}> = ({ openSection, toggleSection }) => {
  const { user } = useAuthStore();
  const isDev = Boolean(import.meta.env?.DEV || process.env.NODE_ENV !== 'production');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'OWNER' || (user as any)?.role === 'PLATFORM_OWNER';
  const canAccessTester = isDev || isSuperAdmin;

  return (
    <div className="space-y-4">
      {/* Compliance & Dev APIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-gray-850 rounded-2xl border border-slate-100 dark:border-gray-700 text-right space-y-1">
          <p className="text-[10px] text-slate-400 dark:text-gray-400 font-black uppercase font-sans">معيار الامتثال الدولي والأمني</p>
          <p className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>HL7 FHIR R4 Compliant Sandbox</span>
          </p>
        </div>
        <div className="p-4 bg-slate-50 dark:bg-gray-850 rounded-2xl border border-slate-100 dark:border-gray-700 text-right space-y-1">
          <p className="text-[10px] text-slate-400 dark:text-gray-400 font-black uppercase font-sans">مفاتيح المطورين والاتصال البرمجي</p>
          <p className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1">
            <KeyRound size={14} className="text-indigo-500" />
            <span>بوابة المطورين REST API نشطة</span>
          </p>
        </div>
      </div>

      {/* Reviewer QA Sandbox Control Panel - Restricted to Dev & Super Admin */}
      {canAccessTester && (
        <div className="p-5 bg-slate-50 dark:bg-gray-850 rounded-3xl border border-slate-100 dark:border-gray-700/65 space-y-4">
          <h4 className="text-sm font-black text-indigo-650 dark:text-indigo-400 flex items-center gap-2">
            <span>💳 لوحة محاكاة وتدقيق الاشتراك والترخيص (Reviewer QA Control Panel)</span>
          </h4>
          <ReviewerSaaSTester />
        </div>
      )}

      <Section 
        title="حول النظام وسياسة حماية البيانات" 
        desc="تفاصيل محرك الفواتير والتراخيص وسياسات الخصوصية وشروطه" 
        icon={Info} 
        isOpen={openSection === 'about'} 
        toggle={() => toggleSection('about')}
      >
        <div className="space-y-6 text-right" dir="rtl">
          {/* ... About content ... */}
        </div>
      </Section>
    </div>
  );
};

