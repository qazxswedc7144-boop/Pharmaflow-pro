// src/components/AccessDenied.tsx
import React from 'react';
import { ShieldAlert, ArrowRight, Lock, KeyRound } from 'lucide-react';
import { motion } from 'motion/react';

interface AccessDeniedProps {
  requiredPermission?: string;
  moduleName?: string;
  onBack?: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  requiredPermission = 'ACCESS_RESTRICTED',
  moduleName = 'هذه الصفحة',
  onBack
}) => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 p-8 text-center"
      >
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
          <ShieldAlert size={32} />
        </div>

        <h2 className="text-xl font-black text-slate-800 mb-2">
          تم رفض الوصول (403 Forbidden)
        </h2>
        
        <p className="text-sm font-medium text-slate-500 mb-6 leading-relaxed">
          حسابك الحالي لا يمتلك الصلاحيات الكافية للوصول إلى {moduleName}. تم تطبيق قيود الأمان وحماية البيانات المؤسسية.
        </p>

        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 mb-6 text-right space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500">الصلاحية المطلوبة:</span>
            <span className="font-mono font-bold text-xs bg-red-100/80 text-red-700 px-2.5 py-1 rounded-lg">
              {requiredPermission}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
            <Lock size={13} className="text-slate-400" />
            <span>يتم تدقيق وتسجيل محاولات الوصول غير المصرح بها أمنياً.</span>
          </div>
        </div>

        <div className="space-y-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-full py-3.5 px-6 bg-[#1E4D4D] hover:bg-[#153838] text-white rounded-2xl font-bold text-xs shadow-lg shadow-emerald-950/15 flex items-center justify-center gap-2 transition-all"
            >
              <ArrowRight size={16} />
              <span>العودة إلى لوحة التحكم الرئيسية</span>
            </button>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-bold pt-2">
            <KeyRound size={14} />
            <span>لطلب الترقية، تواصل مع مدير النظام (Tenant Admin)</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AccessDenied;
