import React from 'react';

interface MobilePageLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  bottomBar?: React.ReactNode;
  dir?: 'rtl' | 'ltr';
}

export const MobilePageLayout: React.FC<MobilePageLayoutProps> = ({
  children,
  header,
  bottomBar,
  dir = 'rtl',
}) => {
  return (
    <div 
      className="flex flex-col h-dvh min-h-dvh max-h-dvh h-[100dvh] bg-[#F8FAFA] font-cairo w-full relative overflow-hidden" 
      dir={dir}
    >
      {header && (
        <header className="sticky top-0 z-[100] shrink-0 bg-white border-b border-slate-100 shadow-sm">
          {header}
        </header>
      )}
      
      <main className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFA] custom-scrollbar px-4 py-3 md:p-6 pb-28 md:pb-24">
        <div className="max-w-7xl mx-auto space-y-4">
          {children}
        </div>
      </main>

      {bottomBar && (
        <div className="shrink-0 sticky bottom-0 w-full z-50 bg-white border-t border-slate-200 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_12px_rgba(0,0,0,0.05)] md:static md:shadow-none md:border-t-0 md:bg-transparent md:px-0 md:py-0">
          <div className="max-w-7xl mx-auto">
            {bottomBar}
          </div>
        </div>
      )}
    </div>
  );
};
