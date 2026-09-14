import { useState, Suspense, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Search, SlidersHorizontal } from 'lucide-react';
import { LoadingSkeleton } from '../components/shared/SettingsUI';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from '../data/settingsSectionsMetadata';
import { SettingsSectionItem } from '../types/settingsNavigation.types';
import { SettingsHeader } from '../components/navigation/SettingsHeader';
import { SettingsGroupCard } from '../components/navigation/SettingsGroupCard';
import { SettingsSidebar } from '../components/navigation/SettingsSidebar';

interface SettingsModuleProps {
  onNavigate?: (view: string, params?: any) => void;
  initialTab?: string;
}

export default function SettingsModule({ onNavigate, initialTab }: SettingsModuleProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'general');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>(initialTab ? 'detail' : 'list');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      setMobileView('detail');
    }
  }, [initialTab]);

  // Filter sections based on search query matching title, description, or keywords
  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SETTINGS_SECTIONS;

    return SETTINGS_SECTIONS.filter((section) => {
      const matchTitle = section.title.toLowerCase().includes(q);
      const matchDesc = section.description.toLowerCase().includes(q);
      const matchKeywords = section.keywords.some((k) => k.toLowerCase().includes(q));
      return matchTitle || matchDesc || matchKeywords;
    });
  }, [searchQuery]);

  const activeSectionMeta: SettingsSectionItem = useMemo(() => {
    const found = SETTINGS_SECTIONS.find((s) => s.id === activeTab);
    if (found) return found;
    const defaultSection = SETTINGS_SECTIONS[0];
    if (defaultSection) return defaultSection;
    throw new Error('No settings sections configured');
  }, [activeTab]);

  const ActiveComponent = activeSectionMeta.component;

  const handleSelectSection = (sectionId: string) => {
    setActiveTab(sectionId);
    setMobileView('detail');
  };

  const handleBackToCardList = () => {
    setMobileView('list');
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    // Dispatch system-wide sync wakeup
    window.dispatchEvent(new CustomEvent('SYNC_WAKEUP'));

    setTimeout(() => {
      setIsSaving(false);
      setToastMessage('تم حفظ الإعدادات بنجاح وتحديث المتغيرات في المنظومة');
      setTimeout(() => setToastMessage(''), 3000);
    }, 800);
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden box-border font-cairo relative" dir="rtl">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-4 left-1/2 z-50 px-5 sm:px-6 py-3 bg-[#1E4D4D] text-white rounded-xl shadow-2xl font-cairo text-xs sm:text-sm font-bold flex items-center gap-2.5 border border-emerald-400/30 backdrop-blur-md"
          >
            <CheckCircle2 size={18} className="text-emerald-400 animate-pulse shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Header Section (shrink-0) */}
      <div className="shrink-0 mb-3 sm:mb-4">
        <SettingsHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSave={handleManualSave}
          isSaving={isSaving}
          onBackToDashboard={onNavigate ? () => onNavigate('dashboard') : undefined}
          onBackToCardList={handleBackToCardList}
          isMobileDrillDown={mobileView === 'detail'}
          activeSectionTitle={activeSectionMeta.title}
          activeSectionDescription={activeSectionMeta.description}
          activeSectionIcon={activeSectionMeta.icon}
        />
      </div>

      {/* Scrollable Content Container (flex-1 min-h-0 overflow-y-auto) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* =======================================================================
            MOBILE VIEW (< lg breakpoint): 
            - Grouped vertical card navigation OR drilldown view into selected tab
           ======================================================================= */}
        <div className="block lg:hidden w-full pb-28">
          {mobileView === 'list' ? (
            <div className="space-y-3.5">
              {/* Search feedback indicator on mobile */}
              {searchQuery && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 font-bold">
                  <div className="flex items-center gap-2">
                    <Search size={15} className="text-emerald-700 dark:text-emerald-400" />
                    <span>نتائج البحث عن: "{searchQuery}"</span>
                  </div>
                  <span className="bg-emerald-200/60 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-black">
                    {filteredSections.length} نتيجة
                  </span>
                </div>
              )}

              {/* Vertical Grouped Cards Navigation */}
              {SETTINGS_GROUPS.map((group) => {
                const itemsInGroup = filteredSections.filter((s) => s.groupId === group.id);
                if (itemsInGroup.length === 0) return null;

                return (
                  <SettingsGroupCard
                    key={group.id}
                    group={group}
                    items={itemsInGroup}
                    onSelectSection={handleSelectSection}
                    activeSectionId={activeTab}
                    isCompact={true}
                  />
                );
              })}

              {/* Empty state when no sections match search query */}
              {filteredSections.length === 0 && (
                <div className="bg-white dark:bg-slate-850 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 text-center space-y-2.5 shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <SlidersHorizontal size={22} />
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    لم يتم العثور على أي إعدادات مطابقة
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    جرب البحث بكلمات أخرى مثل "عملة"، "نسخ"، "مستخدم"، "مبيعات"، أو "أمان"
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Mobile Drill-Down Section Content View */
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-3.5"
            >
              {/* Group category breadcrumb indicator */}
              {(() => {
                const parentGroup = SETTINGS_GROUPS.find((g) => g.id === activeSectionMeta.groupId);
                return (
                  parentGroup && (
                    <div className="flex items-center justify-between px-1">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${parentGroup.colorClass}`}>
                        {parentGroup.title}
                      </span>
                    </div>
                  )
                );
              })()}

              {/* Lazy Section Tab Component */}
              <div className="w-full box-border">
                <Suspense fallback={<LoadingSkeleton />}>
                  <ActiveComponent activeTab={activeTab} />
                </Suspense>
              </div>
            </motion.div>
          )}
        </div>

        {/* =======================================================================
            DESKTOP VIEW (lg: breakpoint and above):
            - Sidebar on right (RTL) + Content Panel on left
           ======================================================================= */}
        <div className="hidden lg:flex items-start gap-4 xl:gap-5 w-full h-full min-h-0 pb-6">
          {/* Right Column: Sticky Sidebar with 4 Groups Accordion */}
          <SettingsSidebar
            groups={SETTINGS_GROUPS}
            sections={filteredSections}
            activeSectionId={activeTab}
            onSelectSection={handleSelectSection}
            searchQuery={searchQuery}
          />

          {/* Left Column: Active Section Content Panel */}
          <main className="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar space-y-4 px-1">
            {/* Active Section Banner Header */}
            {(() => {
              const ActiveIcon = activeSectionMeta.icon;
              const parentGroup = SETTINGS_GROUPS.find((g) => g.id === activeSectionMeta.groupId);

              return (
                <div className="bg-white dark:bg-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 shadow-xs flex items-center justify-between gap-4 w-full">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-[#1E4D4D]/10 dark:bg-emerald-950/40 text-[#1E4D4D] dark:text-emerald-400 flex items-center justify-center shrink-0 border border-[#1E4D4D]/20">
                      <ActiveIcon size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-black text-slate-850 dark:text-slate-100 font-cairo truncate">
                          {activeSectionMeta.title}
                        </h2>
                        {parentGroup && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${parentGroup.colorClass}`}>
                            {parentGroup.title}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-cairo mt-0.5 truncate">
                        {activeSectionMeta.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Lazy Component Tab Body */}
            <div className="w-full box-border">
              <Suspense fallback={<LoadingSkeleton />}>
                <ActiveComponent activeTab={activeTab} />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

