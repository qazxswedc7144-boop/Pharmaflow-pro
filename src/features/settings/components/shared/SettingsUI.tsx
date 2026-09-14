import { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SettingsCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: React.ElementType;
}

export const SettingsCard = ({ title, description, children, icon: Icon }: SettingsCardProps) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-6">
    <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-700 flex items-center gap-4 bg-slate-50/70 dark:bg-slate-700/50">
      {Icon && (
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#1E4D4D]/10 text-[#1E4D4D] dark:text-emerald-400 flex items-center justify-center shrink-0">
          <Icon size={22} />
        </div>
      )}
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 font-cairo">{title}</h3>
        {description && <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-cairo mt-0.5">{description}</p>}
      </div>
    </div>
    <div className="p-5 sm:p-6 space-y-6">
      {children}
    </div>
  </div>
);

export const Accordion = ({ title, children, defaultOpen = false }: { title: string, children: ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden mb-4 bg-white dark:bg-slate-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <span className="font-bold text-slate-700 dark:text-slate-200 font-cairo text-sm sm:text-base">{title}</span>
        {isOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: any;
  onChange: (checked: boolean) => void;
  icon?: React.ElementType;
  disabled?: boolean;
}

export const SettingToggle = ({ label, description, checked, onChange, icon: Icon, disabled = false }: SettingToggleProps) => (
  <div className={`flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-[#1E4D4D]/20 transition-colors shadow-sm ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    <div className="flex items-center gap-3">
      {Icon && <div className="p-2 bg-slate-50 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400"><Icon size={18} /></div>}
      <div>
        <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 block font-cairo">{label}</span>
        {description && <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 block mt-0.5 font-cairo">{description}</span>}
      </div>
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none shrink-0 ${checked ? 'bg-[#1E4D4D]' : 'bg-slate-200 dark:bg-slate-700'}`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'left-1 translate-x-6' : 'left-1'}`} />
    </button>
  </div>
);

interface SettingInputProps {
  label: string;
  value: any;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
}

export const SettingInput = ({ label, value, onChange, type = 'text', placeholder = '', disabled = false, description }: SettingInputProps) => (
  <div className="space-y-1.5">
    <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 font-cairo">{label}</label>
    {description && <p className="text-xs text-slate-500 dark:text-slate-400 font-cairo mb-2">{description}</p>}
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D] dark:text-white transition-all font-cairo disabled:opacity-50"
    />
  </div>
);

interface SettingSelectProps {
  label: string;
  value: any;
  onChange?: (value: string) => void;
  options: { value: string; label: string }[];
  description?: string;
  disabled?: boolean;
}

export const SettingSelect = ({ label, value, onChange, options, description, disabled = false }: SettingSelectProps) => (
  <div className="space-y-1.5">
    <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 font-cairo">{label}</label>
    {description && <p className="text-xs text-slate-500 dark:text-slate-400 font-cairo mb-2">{description}</p>}
    <select
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D] dark:text-white transition-all font-cairo disabled:opacity-50"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

export const LoadingSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    {[1, 2].map(i => (
      <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-100 rounded-xl" />
          <div className="space-y-2">
            <div className="h-5 w-48 bg-slate-100 rounded" />
            <div className="h-4 w-64 bg-slate-50 rounded" />
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="h-16 bg-slate-50 rounded-xl w-full" />
          <div className="h-16 bg-slate-50 rounded-xl w-full" />
        </div>
      </div>
    ))}
  </div>
);
