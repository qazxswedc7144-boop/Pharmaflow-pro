// src/features/saas/components/SubscriptionContactFooter.tsx
import React from 'react';
import { PhoneCall, MessageCircle, MessageSquare, Headphones } from 'lucide-react';

export interface SubscriptionContactFooterProps {
  supportNumber?: string;
  systemVersion?: string;
  className?: string;
}

export const UNIFIED_SUPPORT_NUMBER = "772093714";
export const UNIFIED_WHATSAPP_LINK = "https://wa.me/967772093714";
export const UNIFIED_TEL_LINK = "tel:772093714";
export const UNIFIED_SMS_LINK = "sms:772093714";

export const SubscriptionContactFooter: React.FC<SubscriptionContactFooterProps> = ({ 
  supportNumber = UNIFIED_SUPPORT_NUMBER, 
  systemVersion = "2.5.0",
  className = ""
}) => {
  // Direct communication channels to unified support: 772093714
  const whatsappUrl = `https://wa.me/967772093714?text=${encodeURIComponent('مرحباً إدارة PharmaFlow Pro، أود الاستفسار عن باقات الترقية وتفعيل الاشتراك السحابي.')}`;
  const phoneUrl = "tel:772093714";
  const smsUrl = `sms:772093714?body=${encodeURIComponent('مرحباً، أود ترقية وتفعيل اشتراك صيدليتي في PharmaFlow Pro.')}`;

  return (
    <div className={`mt-6 pt-5 border-t border-emerald-100/70 dark:border-emerald-900/40 text-center font-sans ${className}`} dir="rtl">
      <div className="flex items-center justify-center gap-1.5 mb-3 text-emerald-800 dark:text-emerald-300">
        <Headphones className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-bounce" />
        <p className="text-xs font-bold">
          لطلب الترقية الفورية أو الدعم الفني المباشر، تواصل مع الإدارة:
        </p>
      </div>
      
      {/* شبكة أزرار الاتصال الموحدة بالطابع الزمردي الأنيق */}
      <div className="grid grid-cols-3 gap-2.5 max-w-md mx-auto">
        {/* زر الواتساب الموحد */}
        <a 
          id="btn-contact-whatsapp-unified"
          href={whatsappUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 hover:shadow-md hover:shadow-emerald-500/30 transition-all active:scale-95"
        >
          <MessageCircle className="w-4 h-4" />
          <span>واتساب</span>
        </a>

        {/* زر الاتصال المباشر الموحد */}
        <a 
          id="btn-contact-phone-unified"
          href={phoneUrl}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-black bg-emerald-100/80 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border border-emerald-200/80 dark:border-emerald-800/60 transition-all active:scale-95"
        >
          <PhoneCall className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>اتصال</span>
        </a>

        {/* زر رسالة SMS الموحد */}
        <a 
          id="btn-contact-sms-unified"
          href={smsUrl}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-gray-700 transition-all active:scale-95"
        >
          <MessageSquare className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <span>رسالة SMS</span>
        </a>
      </div>

      {/* رقم العرض الموحد بدقة أسفل الأزرار */}
      <div className="mt-3.5 flex items-center justify-center gap-2 text-[11px] font-mono text-emerald-700/80 dark:text-emerald-400/80 bg-emerald-50/60 dark:bg-emerald-950/30 py-1.5 px-3 rounded-lg border border-emerald-100/60 dark:border-emerald-900/30 w-fit mx-auto">
        <span className="font-sans font-bold">الرقم الموحد:</span>
        <span className="font-black text-emerald-800 dark:text-emerald-300 dir-ltr select-all">{supportNumber} (967+)</span>
        <span className="text-slate-300 dark:text-gray-700">|</span>
        <span className="text-[10px] font-sans text-slate-400 dark:text-slate-500">v{systemVersion}</span>
      </div>
    </div>
  );
};
