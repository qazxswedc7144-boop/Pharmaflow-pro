import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { SettingsGroup, SettingsSectionItem } from '../../types/settingsNavigation.types';

interface SettingsGroupCardProps {
  group: SettingsGroup;
  items: SettingsSectionItem[];
  onSelectSection: (sectionId: string) => void;
  activeSectionId?: string;
  isCompact?: boolean;
}

export const SettingsGroupCard: React.FC<SettingsGroupCardProps> = ({
  group,
  items,
  onSelectSection,
  activeSectionId,
  isCompact = false
}) => {
  if (items.length === 0) return null;

  const GroupIcon = group.icon;

  return (
    <section 
      className="bg-white dark:bg-slate-850 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl shadow-xs p-3.5 sm:p-5 transition-all w-full box-border"
      aria-labelledby={`group-title-${group.id}`}
    >
      {/* Group Header Badge & Info */}
      <div className="flex items-center justify-between gap-3 mb-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 border ${group.colorClass}`}>
            <GroupIcon size={17} />
          </div>
          <div className="min-w-0">
            <h2 
              id={`group-title-${group.id}`} 
              className="text-sm sm:text-base font-black text-slate-850 dark:text-slate-100 font-cairo leading-tight truncate"
            >
              {group.title}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-cairo truncate mt-0.5">
              {group.description}
            </p>
          </div>
        </div>

        <span className="text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-cairo shrink-0 border border-slate-200/50 dark:border-slate-700">
          {items.length} {items.length === 1 ? 'قسم' : 'أقسام'}
        </span>
      </div>

      {/* Vertical Grouped Cards List (1 column on mobile, responsive grid if specified) */}
      <div className={`flex flex-col gap-2.5 w-full ${isCompact ? '' : 'sm:grid sm:grid-cols-2'}`}>
        {items.map((item) => {
          const ItemIcon = item.icon;
          const isActive = activeSectionId === item.id;

          return (
            <motion.button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              whileTap={{ scale: 0.99 }}
              className={`w-full text-right p-3.5 sm:p-4 rounded-xl border transition-all flex items-center justify-between gap-3 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/25 min-h-[56px]
                ${
                  isActive
                    ? 'bg-[#1E4D4D]/5 dark:bg-emerald-950/20 border-[#1E4D4D] dark:border-emerald-500 shadow-xs'
                    : 'bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100/90 dark:hover:bg-slate-800 border-slate-200/80 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }
              `}
              aria-label={`الدخول إلى قسم ${item.title}`}
            >
              {/* Right content in RTL: Icon + Title + Description */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105
                    ${
                      isActive
                        ? 'bg-[#1E4D4D] text-white shadow-xs'
                        : 'bg-white dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-600 group-hover:text-[#1E4D4D] dark:group-hover:text-emerald-400 group-hover:border-[#1E4D4D]/30'
                    }
                  `}
                >
                  <ItemIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-850 dark:text-slate-100 font-cairo leading-tight truncate group-hover:text-[#1E4D4D] dark:group-hover:text-emerald-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-cairo mt-0.5 line-clamp-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Left indicator in RTL: Chevron Arrow pointing left */}
              <div className="shrink-0 w-8 h-8 rounded-lg bg-white dark:bg-slate-700/70 flex items-center justify-center text-slate-400 group-hover:text-[#1E4D4D] dark:group-hover:text-emerald-400 group-hover:-translate-x-1 transition-all border border-slate-200/60 dark:border-slate-650">
                <ChevronLeft size={18} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
};

