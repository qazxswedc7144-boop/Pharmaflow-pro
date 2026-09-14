import { lazy } from 'react';
import { RefreshCw } from 'lucide-react';

// Helper for retrying dynamic imports with retry resilience
export const lazyWithRetry = (componentImport: () => Promise<any>) =>
  lazy(async () => {
    const refreshTimestampStr = window.sessionStorage.getItem('page-force-refresh-timestamp');
    const refreshTimestamp = refreshTimestampStr ? parseInt(refreshTimestampStr, 10) : 0;
    const now = Date.now();
    // Reset force refresh flag if more than 15 seconds have passed
    const pageHasBeenForceRefreshed = refreshTimestamp > 0 && (now - refreshTimestamp < 15000);

    let attempts = 3;
    for (let i = 0; i < attempts; i++) {
      try {
        const result = await componentImport();
        // If successful, reset force refresh flag
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('page-force-refresh-timestamp');
          window.sessionStorage.removeItem('page-has-been-force-refreshed');
        }
        return result;
      } catch (error: any) {
        console.warn(`Dynamic lazy-load attempt ${i + 1} of ${attempts} failed:`, error);
        
        // If ServiceWorker or stale chunk issue, attempt clearing cache or unregistering SW
        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              await registration.unregister();
            }
          } catch {
            // ignore
          }
        }

        if (i < attempts - 1) {
          // Wait longer on each successive attempt (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
        } else {
          if (!pageHasBeenForceRefreshed) {
            window.sessionStorage.setItem('page-force-refresh-timestamp', Date.now().toString());
            window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
            // Force hard reload to fetch fresh build bundle asset manifest
            window.location.reload();
            return { default: () => null };
          }

          console.warn('Dynamic chunk outdated or unavailable after reload:', error?.message || error);
          
          // Render safe UI recovery component instead of throwing unhandled exception
          return {
            default: () => (
              <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 my-6 text-center shadow-sm">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                  <RefreshCw size={24} className="animate-spin" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base mb-1">
                  تم تحديث ملفات النظام
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
                  تتوفر نسخة جديدة من هذا القسم. يرجى الضغط على الزر أدناه لإعادة تحميل الصفحة.
                </p>
                <button
                  onClick={() => {
                    window.sessionStorage.removeItem('page-force-refresh-timestamp');
                    window.sessionStorage.removeItem('page-has-been-force-refreshed');
                    window.location.reload();
                  }}
                  className="px-4 py-2 bg-[#1E4D4D] text-white rounded-xl text-xs font-bold hover:bg-[#153737] transition-all shadow-sm cursor-pointer flex items-center gap-2"
                >
                  <RefreshCw size={14} />
                  <span>إعادة تحميل الصفحة</span>
                </button>
              </div>
            )
          };
        }
      }
    }
    return { default: () => null };
  });

