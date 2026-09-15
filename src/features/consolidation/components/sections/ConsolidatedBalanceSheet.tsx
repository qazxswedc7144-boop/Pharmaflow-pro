import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidatedBalanceSheet as BalanceSheetType } from '../../consolidation.types';
import { 
  CheckCircle, 
  AlertTriangle, 
  Layers, 
  ArrowRight, 
  FileSpreadsheet, 
  RefreshCw,
  Loader2
} from 'lucide-react';

interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

const FinancialCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  color: 'emerald' | 'rose' | 'teal';
  items: Array<{ label: string; value: number }>;
  totalLabel: string;
  totalValue: number;
}> = ({ title, icon, color, items, totalLabel, totalValue }) => {
  const colorClasses = {
    emerald: {
      header: 'text-emerald-700',
      bg: 'bg-emerald-50/50',
      text: 'text-emerald-700',
      border: 'border-emerald-100'
    },
    rose: {
      header: 'text-rose-700',
      bg: 'bg-rose-50/50',
      text: 'text-rose-700',
      border: 'border-rose-100'
    },
    teal: {
      header: 'text-[#064e46]',
      bg: 'bg-emerald-50/50',
      text: 'text-[#064e46]',
      border: 'border-emerald-100'
    }
  };

  const classes = colorClasses[color];

  return (
    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:shadow-md transition-shadow duration-200">
      <h4 className={`text-xs font-black ${classes.header} border-b border-slate-100 pb-2 flex justify-between items-center`}>
        <span>{title}</span>
        {icon}
      </h4>
      <div className="space-y-2 text-xs" role="list" aria-label={title}>
        {items.map((item, index) => (
          <div key={index} className="flex justify-between" role="listitem">
            <span className="text-slate-500">{item.label}:</span>
            <span className="font-mono font-bold text-slate-800" aria-label={`${item.label}: ${item.value}`}>
              {item.value.toLocaleString('ar-SA')}
            </span>
          </div>
        ))}
        <div className={`flex justify-between border-t ${classes.border} pt-2 font-black ${classes.text} ${classes.bg} p-2 rounded-xl`}>
          <span>{totalLabel}:</span>
          <span className="font-mono text-sm" aria-label={`${totalLabel}: ${totalValue}`}>
            {totalValue.toLocaleString('ar-SA')}
          </span>
        </div>
      </div>
    </div>
  );
};

const LoadingScreen: React.FC<{ text: string }> = ({ text }) => (
  <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6 text-center" dir="rtl" role="status" aria-live="polite">
    <Loader2 className="w-16 h-16 text-[#064e46] animate-spin mb-6" aria-hidden="true" />
    <p className="text-slate-600 font-bold text-sm sm:text-base animate-pulse max-w-xs leading-relaxed">
      {text}
    </p>
  </div>
);

const ErrorScreen: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4" dir="rtl">
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full text-center space-y-4">
      <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto" aria-hidden="true">
        <AlertTriangle size={24} />
      </div>
      <h3 className="font-black text-slate-800 text-base">حدث خطأ في تحميل البيانات</h3>
      <p className="text-xs text-slate-500 font-bold">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="w-full h-10 bg-[#064e46] text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-[#0a6b60] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#064e46] focus:ring-offset-2"
        aria-label="إعادة محاولة تحميل البيانات"
      >
        <RefreshCw size={14} aria-hidden="true" />
        <span>إعادة المحاولة</span>
      </button>
    </div>
  </div>
);

export const ConsolidatedBalanceSheet: React.FC = () => {
  const [data, setData] = useState<BalanceSheetType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState('جاري تشغيل محرك الاندماج ومعالجة الموازين الفيدرالية...');
  
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingText('جاري تشغيل محرك الاندماج ومعالجة الموازين الفيدرالية...');

      const response = await financialApiClient.get<any>(
        '/api/consolidation/balance-sheet'
      );

      if (!isMountedRef.current) return;

      const payload: BalanceSheetType = response.data?.data || response.data;

      if (!payload) {
        throw new Error('البيانات المستلمة غير صالحة أو فارغة');
      }

      const requiredFields = [
        'assets.cashAndCashEquivalents',
        'assets.accountsReceivable',
        'assets.inventoryValue',
        'assets.totalAssets',
        'liabilities.accountsPayable',
        'liabilities.otherCurrentLiabilities',
        'liabilities.totalLiabilities',
        'equity.shareCapital',
        'equity.retainedEarnings',
        'equity.totalEquity'
      ];

      const missingFields = requiredFields.filter(field => {
        const value = field.split('.').reduce((obj: any, key) => obj?.[key], payload);
        return value === undefined || value === null || typeof value !== 'number';
      });

      if (missingFields.length > 0) {
        throw new Error(`البيانات ناقصة أو غير صحيحة: ${missingFields.join(', ')}`);
      }

      setData(payload);
    } catch (err) {
      if (!isMountedRef.current) return;
      
      const apiError = err as ApiError;
      console.error('Failed to load balance sheet:', apiError);
      
      let errorMessage = 'حدث خطأ غير متوقع أثناء تحميل البيانات';
      if (apiError?.message) {
        errorMessage = apiError.message;
      } else if (apiError?.code === 'NETWORK_ERROR' || apiError?.message?.includes('Network')) {
        errorMessage = 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت';
      }
      
      setError(errorMessage);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    const timer1 = setTimeout(() => {
      if (isMountedRef.current) setLoadingText('تجميع أرصدة الفروع وإلغاء الحسابات المتبادلة بين الفروع...');
    }, 1000);

    const timer2 = setTimeout(() => {
      if (isMountedRef.current) setLoadingText('جارٍ معالجة العمليات البينية والتحقق من التوازن...');
    }, 2500);

    fetchData();

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [fetchData]);

  const formattedData = useMemo(() => {
    if (!data) return null;
    
    const dateObj = data.timestamp ? new Date(data.timestamp) : new Date();
    const isValidDate = !isNaN(dateObj.getTime());

    return {
      ...data,
      timestamp: isValidDate 
        ? dateObj.toLocaleString('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'غير محدد'
    };
  }, [data]);

  if (loading) {
    return <LoadingScreen text={loadingText} />;
  }

  if (error) {
    return (
      <ErrorScreen 
        message={error} 
        onRetry={() => {
          fetchData();
        }} 
      />
    );
  }

  if (!formattedData) {
    return (
      <ErrorScreen 
        message="لا توجد بيانات متاحة للميزانية العمومية الموحدة" 
        onRetry={() => fetchData()} 
      />
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-2 py-3 sm:px-4 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto space-y-4">
        
        <header className="bg-[#064e46] text-white rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/10 hover:bg-white/20 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="العودة للصفحة السابقة"
              >
                <ArrowRight size={20} aria-hidden="true" />
              </button>
              <div>
                <h1 className="text-base sm:text-lg font-black flex items-center gap-2">
                  <Layers className="text-emerald-300" size={20} aria-hidden="true" />
                  المركز المالي الموحد (الاندماج)
                </h1>
                <p className="text-[11px] text-emerald-100/80 font-medium">
                  آخر تحديث: {formattedData.timestamp}
                </p>
              </div>
            </div>
            <span 
              className={`text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 border ${
                formattedData.isBalanced 
                  ? 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30' 
                  : 'bg-rose-400/20 text-rose-300 border-rose-400/30'
              }`}
              role="status"
              aria-label={formattedData.isBalanced ? 'الميزانية متوازنة' : 'الميزانية غير متوازنة'}
            >
              {formattedData.isBalanced ? <CheckCircle size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
              {formattedData.isBalanced ? 'الميزانية متوازنة تماماً' : 'غير متوازنة'}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <FinancialCard
            title="الأصول الموحدة (Assets)"
            icon={<FileSpreadsheet size={16} aria-hidden="true" />}
            color="teal"
            items={[
              { label: 'النقدية وما يعادلها', value: formattedData.assets.cashAndCashEquivalents },
              { label: 'ذمم مدينة / عملاء', value: formattedData.assets.accountsReceivable },
              { label: 'مخزون الأدوية والبضائع', value: formattedData.assets.inventoryValue }
            ]}
            totalLabel="إجمالي الأصول"
            totalValue={formattedData.assets.totalAssets}
          />

          <FinancialCard
            title="الالتزامات الموحدة (Liabilities)"
            icon={<FileSpreadsheet size={16} aria-hidden="true" />}
            color="rose"
            items={[
              { label: 'ذمم دائنة / موردين', value: formattedData.liabilities.accountsPayable },
              { label: 'التزامات متداولة أخرى', value: formattedData.liabilities.otherCurrentLiabilities }
            ]}
            totalLabel="إجمالي الالتزامات"
            totalValue={formattedData.liabilities.totalLiabilities}
          />

          <FinancialCard
            title="حقوق الملكية (Equity)"
            icon={<FileSpreadsheet size={16} aria-hidden="true" />}
            color="emerald"
            items={[
              { label: 'رأس المال المشترك', value: formattedData.equity.shareCapital },
              { label: 'الأرباح المبقاة المجمعة', value: formattedData.equity.retainedEarnings }
            ]}
            totalLabel="إجمالي حقوق الملكية"
            totalValue={formattedData.equity.totalEquity}
          />

        </div>
      </div>
    </div>
  );
};

export default ConsolidatedBalanceSheet;
