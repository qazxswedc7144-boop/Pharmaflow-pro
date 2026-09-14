import React from 'react';
import { Settings, Search, Save, X, LucideIcon } from 'lucide-react';
import { BackButton } from '@/components/shared/BackButton';

interface SettingsHeaderProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onSave: () => void;
  isSaving: boolean;
  onBackToDashboard?: () => void;
  onBackToCardList?: () => void;
  isMobileDrillDown?: boolean;
  activeSectionTitle?: string;
  activeSectionDescription?: string;
  activeSectionIcon?: React.ComponentType<any> | React.ElementType | LucideIcon;
  showSearch?: boolean;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  searchQuery,
  onSearchChange,
  onSave,
  isSaving,
  onBackToDashboard,
  onBackToCardList,
  isMobileDrillDown = false,
  activeSectionTitle,
  activeSectionDescription,
  activeSectionIcon: ActiveIcon = Settings,
  showSearch = true
}) => {
  // Determine back navigation action
  const handleBack = () => {
    if (isMobileDrillDown && onBackToCardList) {
      onBackToCardList();
    } else if (onBackToDashboard) {
      onBackToDashboard();
    }
  };

  const backTitle = isMobileDrillDown ? "العودة لقائمة الإعدادات" : "العودة للرئيسية";
  const displayTitle = isMobileDrillDown && activeSectionTitle ? activeSectionTitle : "الإعدادات";
  const displaySubtitle = isMobileDrillDown 
    ? (activeSectionDescription || "إدارة وتخصيص خيارات هذا القسم") 
    : "إدارة وضبط إعدادات النظام";

  const IconComponent = isMobileDrillDown && ActiveIcon ? ActiveIcon : Settings;

  return (
    <header 
      className="bg-gradient-to-r from-[#0A3D3A] via-[#0F4F4C] to-[#14534F] text-white border border-emerald-800/50 rounded-2xl sm:rounded-3xl shadow-md shadow-emerald-950/20 p-3 sm:p-4 box-border w-full shrink-0 transition-all"
      dir="rtl"
    >
      {/* Primary Top Bar: [Back Arrow] -> [Section Icon] -> [Title] ... [Search] ... [Save Button] */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 w-full min-w-0">
        
        {/* Right Section (RTL Start): Navigation + Section Icon + Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Unified Back Button */}
          <BackButton
            onClick={handleBack}
            title={backTitle}
            variant="emerald"
            size="md"
          />

          {/* Section Icon container */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-950/70 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-500/30 shadow-inner">
            <IconComponent size={22} className="shrink-0 transition-transform duration-500 hover:rotate-45" />
          </div>

          {/* Section Name & Subtitle */}
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base md:text-lg font-black text-white font-cairo leading-tight truncate">
              {displayTitle}
            </h1>
            <p className="text-[11px] sm:text-xs text-emerald-100/75 font-cairo hidden sm:block truncate mt-0.5 font-medium">
              {displaySubtitle}
            </p>
          </div>
        </div>

        {/* Center Section: Desktop Integrated Search Bar */}
        {showSearch && (
          <div className="hidden md:flex flex-1 max-w-xs lg:max-w-md mx-2 lg:mx-4 items-center justify-center">
            <div className="relative w-full">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-300/70 pointer-events-none" size={16} />
              <input
                type="text"
                placeholder="ابحث في الإعدادات، الفروع، المستخدمين..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-10 py-2 bg-emerald-950/60 border border-emerald-700/50 rounded-xl text-xs text-white placeholder:text-emerald-200/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all font-cairo font-medium"
                aria-label="البحث في إعدادات النظام"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-300 hover:text-white p-1 rounded-full hover:bg-emerald-800/50 transition-colors"
                  aria-label="مسح البحث"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Left Section (RTL End): Primary Save Button (Always fully reachable & visible) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onSave}
            disabled={isSaving}
            className={`min-h-[44px] sm:min-h-[48px] px-3 sm:px-5 py-2 rounded-xl font-black font-cairo text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-all shadow-md cursor-pointer active:scale-95 border
              ${
                isSaving
                  ? 'bg-emerald-700 text-emerald-200 border-emerald-600/40 cursor-not-allowed opacity-90'
                  : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-emerald-300 shadow-emerald-950/40 hover:shadow-lg'
              }
            `}
            aria-label="حفظ وتطبيق جميع التغييرات"
            title="حفظ التغييرات"
          >
            <Save size={17} className={isSaving ? 'animate-spin' : 'shrink-0'} />
            <span className="whitespace-nowrap hidden xs:inline">{isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
            <span className="whitespace-nowrap xs:hidden">{isSaving ? 'حفظ...' : 'حفظ'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Search Bar (< md screens) */}
      {showSearch && (
        <div className="mt-3 md:hidden w-full">
          <div className="relative w-full">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-300/70 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="ابحث في الإعدادات، العملات، المستخدمين، الأمان..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 min-h-[44px] bg-emerald-950/60 border border-emerald-700/50 rounded-xl text-xs text-white placeholder:text-emerald-200/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all font-cairo"
              aria-label="البحث في إعدادات النظام للموبايل"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-300 hover:text-white p-1.5 rounded-full hover:bg-emerald-800/60"
                aria-label="مسح البحث"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
