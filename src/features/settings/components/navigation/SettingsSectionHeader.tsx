import React from 'react';
import { BackButton } from '@/components/shared/BackButton';
import { LucideIcon } from 'lucide-react';

export interface SettingsSectionHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon | React.ComponentType<any> | React.ElementType;
  onBack?: () => void;
  backTitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  onBack,
  backTitle = "العودة",
  badge,
  actions,
  className = ""
}) => {
  return (
    <div 
      className={`bg-gradient-to-r from-[#0A3D3A] via-[#0F4F4C] to-[#14534F] text-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-emerald-800/50 shadow-md shadow-emerald-950/25 transition-all w-full box-border ${className}`}
      dir="rtl"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4 w-full">
        {/* Right Section in RTL: [Back Button] → [Section Icon] → [Section Title & Subtitle] */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
          {/* Back Navigation Arrow */}
          {onBack && (
            <BackButton 
              onClick={onBack} 
              title={backTitle}
              variant="emerald"
              size="md"
            />
          )}

          {/* Section Icon container */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-950/70 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-500/30 shadow-inner">
            <Icon size={22} className="shrink-0" />
          </div>

          {/* Titles & Badge */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-base sm:text-lg md:text-xl font-black text-white font-cairo tracking-tight truncate">
                {title}
              </h1>
              {badge && (
                <div className="shrink-0">
                  {badge}
                </div>
              )}
            </div>
            {subtitle && (
              <p className="text-emerald-100/75 text-xs sm:text-sm font-cairo font-medium truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Left Section in RTL: Actions / Buttons */}
        {actions && (
          <div className="flex items-center flex-wrap gap-2 shrink-0 self-stretch sm:self-auto justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
