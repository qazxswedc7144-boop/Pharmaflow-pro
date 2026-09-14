import React from 'react';
import { ArrowRight } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  title?: string;
  variant?: 'light' | 'dark' | 'emerald' | 'emerald-ghost';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  title = "العودة",
  variant = 'emerald',
  className = "",
  size = 'md'
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-100 hover:text-white border border-emerald-600/40 active:bg-emerald-950 shadow-sm',
    'emerald-ghost': 'bg-white/10 hover:bg-white/20 text-white border border-white/20 active:bg-white/30',
    light: 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700',
    dark: 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700'
  };

  const sizeStyles = {
    sm: 'w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl',
    md: 'w-10 h-10 sm:w-11 sm:h-11 min-w-[44px] min-h-[44px] rounded-xl sm:rounded-2xl',
    lg: 'w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl'
  };

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      type="button"
      className={`flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      <ArrowRight size={20} className="shrink-0 transition-transform group-hover:-translate-x-0.5" />
    </button>
  );
};

