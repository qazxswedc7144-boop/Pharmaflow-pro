import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { SettingsGroup, SettingsSectionItem, SettingsGroupId } from '../../types/settingsNavigation.types';

interface SettingsSidebarProps {
  groups: SettingsGroup[];
  sections: SettingsSectionItem[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  searchQuery?: string;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  groups,
  sections,
  activeSectionId,
  onSelectSection,
  searchQuery
}) => {
  // Find which group contains the active section
  const activeSectionGroup = sections.find((s) => s.id === activeSectionId)?.groupId;

  // Track accordion state per group; default to all groups open
  const [openGroups, setOpenGroups] = useState<Record<SettingsGroupId, boolean>>({
    system: true,
    i18n: true,
    business: true,
    maintenance: true
  });

  // Ensure active group is opened when activeSection changes
  useEffect(() => {
    if (activeSectionGroup) {
      setOpenGroups((prev) => ({
        ...prev,
        [activeSectionGroup]: true
      }));
    }
  }, [activeSectionGroup]);

  // When searching, auto-expand groups that have matches
  useEffect(() => {
    if (searchQuery && searchQuery.trim().length > 0) {
      const newOpen: Record<SettingsGroupId, boolean> = {
        system: false,
        i18n: false,
        business: false,
        maintenance: false
      };
      sections.forEach((item) => {
        newOpen[item.groupId] = true;
      });
      setOpenGroups(newOpen);
    }
  }, [searchQuery, sections]);

  const toggleGroup = (groupId: SettingsGroupId) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  return (
    <aside 
      className="w-full lg:w-72 xl:w-80 shrink-0 bg-white dark:bg-slate-850 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-3 sm:p-4 shadow-xs space-y-2.5 h-full max-h-full overflow-y-auto custom-scrollbar sticky top-0 box-border"
      aria-label="شريط التنقل الجانبي لأقسام الإعدادات"
    >
      {groups.map((group) => {
        const groupItems = sections.filter((s) => s.groupId === group.id);
        if (groupItems.length === 0) return null;

        const GroupIcon = group.icon;
        const isOpen = openGroups[group.id] ?? true;
        const hasActiveChild = groupItems.some((item) => item.id === activeSectionId);

        return (
          <div 
            key={group.id} 
            className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/40 dark:bg-slate-900/40 transition-colors"
          >
            {/* Accordion Group Header */}
            <button
              onClick={() => toggleGroup(group.id)}
              className={`w-full text-right px-3 py-2.5 flex items-center justify-between gap-2.5 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E4D4D]/30 min-h-[44px]
                ${
                  hasActiveChild
                    ? 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-900 dark:text-white'
                    : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }
              `}
              aria-expanded={isOpen}
              aria-controls={`group-content-${group.id}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${group.colorClass}`}>
                  <GroupIcon size={13} />
                </div>
                <span className="text-xs font-black font-cairo truncate">
                  {group.title}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700">
                  {groupItems.length}
                </span>
                <ChevronDown
                  size={15}
                  className={`text-slate-400 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-[#1E4D4D] dark:text-emerald-400' : ''
                  }`}
                />
              </div>
            </button>

            {/* Accordion Group Items List */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`group-content-${group.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="p-1.5 space-y-1 bg-white/60 dark:bg-slate-850/60 border-t border-slate-100 dark:border-slate-800">
                    {groupItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = activeSectionId === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => onSelectSection(item.id)}
                          className={`w-full text-right px-2.5 py-2 rounded-lg text-xs font-bold font-cairo transition-all flex items-center justify-between gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/25 min-h-[44px]
                            ${
                              isActive
                                ? 'bg-[#1E4D4D] text-white shadow-xs font-black'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }
                          `}
                          aria-label={`الانتقال إلى ${item.title}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors
                                ${
                                  isActive
                                    ? 'bg-white/20 text-emerald-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                }
                              `}
                            >
                              <ItemIcon size={15} />
                            </div>
                            <span className="truncate leading-tight">{item.title}</span>
                          </div>

                          <ChevronLeft
                            size={14}
                            className={`shrink-0 transition-transform ${
                              isActive ? 'text-emerald-300 -translate-x-0.5' : 'text-slate-400'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {sections.length === 0 && (
        <div className="p-5 text-center text-xs text-slate-500 dark:text-slate-400 font-cairo space-y-1 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
          <p className="font-bold">لا توجد نتائج مطابقة</p>
          <p className="text-[11px] text-slate-400">"{searchQuery}"</p>
        </div>
      )}
    </aside>
  );
};
