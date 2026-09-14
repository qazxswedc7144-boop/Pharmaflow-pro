
import { db } from '@/core/db';
import { Currency } from '@/types';
import { eventBus, EVENTS } from '@/services/eventBus';

export interface CurrencyMetadata {
  code: string;
  name: string;
  symbol: string;
}

export const KNOWN_CURRENCIES: Record<string, CurrencyMetadata> = {
  YER: { code: 'YER', name: 'ريال يمني', symbol: 'ر.ي' },
  SAR: { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' },
  USD: { code: 'USD', name: 'دولار أمريكي', symbol: '$' },
  AED: { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ' },
  EGP: { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م' },
};

export class CurrencyService {
  private static ACTIVE_CURRENCY_KEY = 'ACTIVE_CURRENCY';
  private static CURRENCY_NAME_KEY = 'ACTIVE_CURRENCY_NAME';

  /**
   * Returns current active currency code synchronously from window or localStorage
   */
  static getCurrentCurrencyCode(): string {
    if (typeof window !== 'undefined') {
      const cached = (window as any).currentSystemCurrency || 
                     localStorage.getItem('pharmaflow_currency') || 
                     localStorage.getItem('pharma_currency');
      if (cached && typeof cached === 'string') {
        return cached.toUpperCase();
      }
    }
    return 'YER';
  }

  /**
   * Get currency symbol from currency code
   */
  static getCurrencySymbol(code?: string): string {
    const c = (code || this.getCurrentCurrencyCode()).toUpperCase();
    return KNOWN_CURRENCIES[c]?.symbol || c;
  }

  /**
   * Get localized currency name from currency code
   */
  static getCurrencyName(code?: string): string {
    const c = (code || this.getCurrentCurrencyCode()).toUpperCase();
    return KNOWN_CURRENCIES[c]?.name || c;
  }

  /**
   * Format a numeric amount with current or given currency symbol/code
   */
  static formatAmount(
    amount: number | string | null | undefined,
    currencyCode?: string,
    options?: { showSymbol?: boolean; showCode?: boolean; decimals?: number }
  ): string {
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0)) || 0;
    const formattedNum = num.toLocaleString('ar-EG', {
      minimumFractionDigits: options?.decimals ?? 0,
      maximumFractionDigits: options?.decimals ?? 2,
    });

    const code = (currencyCode || this.getCurrentCurrencyCode()).toUpperCase();
    if (options?.showCode) {
      return `${formattedNum} ${code}`;
    }
    const symbol = this.getCurrencySymbol(code);
    return `${formattedNum} ${symbol}`;
  }

  /**
   * دالة تحديث العملة للنظام بالكامل
   * @param {string} code - رمز العملة (مثل YER)
   * @param {string} label - اسم العملة (مثل ريال يمني)
   * @param {boolean} isNew - هل هي عملة جديدة تضاف لأول مرة؟
   */
  static async setGlobalCurrency(code: string, label?: string, isNew: boolean = false) {
    const upperCode = code.toUpperCase();
    const resolvedLabel = label || this.getCurrencyName(upperCode);
    
    // 1. إذا كانت عملة جديدة، تضاف لقائمة العملات المتاحة مستقبلاً
    if (isNew) {
      const newCurrency: Currency = {
        id: db.generateId('CUR'),
        code: upperCode,
        name: resolvedLabel,
        symbol: this.getCurrencySymbol(upperCode),
        isBase: upperCode === 'YER',
        lastModified: new Date().toISOString()
      };
      await db.saveCurrency(newCurrency);
    }

    // 2. تعيين العملة كـ "عملة نشطة" للنظام بالكامل في الإعدادات
    await db.runTransaction(async () => {
      await db.saveSetting(this.ACTIVE_CURRENCY_KEY, upperCode);
      await db.saveSetting('currency', upperCode);
      await db.saveSetting(this.CURRENCY_NAME_KEY, resolvedLabel);
      await db.saveSetting('currencyLabel', resolvedLabel);
    }, ['settings']);

    // 3. تحديث الذاكرة المؤقتة (للتوافق مع الكود القديم إن وجد)
    if (typeof window !== 'undefined') {
      (window as any).currentSystemCurrency = upperCode;
      localStorage.setItem('pharmaflow_currency', upperCode);
      localStorage.setItem('pharma_currency', upperCode);
    }

    // 4. إرسال حدث لتنبيه الواجهة بالتغيير
    eventBus.emit(EVENTS.CURRENCY_CHANGED, { code: upperCode, label: resolvedLabel });
    
    if (typeof document !== 'undefined') {
      document.querySelectorAll(".currency-label").forEach((el: Element) => {
        (el as HTMLElement).innerText = upperCode;
      });
    }

    console.log(`✅ النظام الآن يعمل بعملة: ${resolvedLabel} (${upperCode})`);
    return upperCode;
  }

  /**
   * جلب العملة النشطة الحالية
   */
  static async getActiveCurrency(): Promise<{ code: string; label: string }> {
    const code = await db.getSetting(this.ACTIVE_CURRENCY_KEY, 'YER');
    const label = await db.getSetting(this.CURRENCY_NAME_KEY, 'ريال يمني');
    
    // Update window cache
    if (typeof window !== 'undefined') {
      (window as any).currentSystemCurrency = code;
      localStorage.setItem('pharmaflow_currency', code);
      localStorage.setItem('pharma_currency', code);
    }
    
    return { code, label };
  }

  /**
   * مراقب يقوم بتحديث الرموز في الواجهة تلقائياً
   * في بيئة Dexie، نعتمد على eventBus بدلاً من onSnapshot
   */
  static startCurrencyObserver(onUpdate: (code: string, label: string) => void) {
    // جلب القيمة الحالية فوراً
    this.getActiveCurrency()
      .then(curr => onUpdate(curr.code, curr.label))
      .catch(err => console.error("[CurrencyService] Observer initial fetch failed:", err));

    // الاشتراك في التغييرات المستقبلية
    return eventBus.subscribe(EVENTS.CURRENCY_CHANGED, (data: any) => {
      if (data && data.code) {
        onUpdate(data.code, data.label);
        
        if (typeof document !== 'undefined') {
          document.querySelectorAll(".currency-label").forEach((el: Element) => {
            (el as HTMLElement).innerText = data.code;
          });
        }
      }
    });
  }

  /**
   * تحويل المبلغ إلى العملة الأساسية (Base Currency)
   */
  static async convertToBase(amount: number, fromCurrency: string, date?: string) {
    const baseCurrency = await db.getSetting('BASE_CURRENCY', 'YER');
    
    if (fromCurrency === baseCurrency) {
      return { baseAmount: amount, rate: 1 };
    }

    // البحث عن سعر الصرف في قاعدة البيانات
    const rates = await db.getExchangeRates(date);
    const rateEntry = rates.find((r: any) => r.fromCurrency === fromCurrency && r.toCurrency === baseCurrency);
    
    if (rateEntry) {
      return { baseAmount: amount * rateEntry.rate, rate: rateEntry.rate };
    }

    // سعر صرف افتراضي إذا لم يوجد (لأغراض العرض)
    const defaultRates: Record<string, number> = {
      'USD': 530,
      'SAR': 140,
      'YER': 1.0,
      'AED': 144,
      'EGP': 11
    };

    const rate = defaultRates[fromCurrency] || 1;
    return { baseAmount: amount * rate, rate };
  }

  /**
   * تحويل المبلغ بين أي عملتين
   */
  static async convert(amount: number, from: string, to: string, date?: string) {
    if (from === to) return amount;
    
    // convert from to base
    const fromToBase = await this.convertToBase(amount, from, date);
    
    // if to is base, return
    const baseCurrency = await db.getSetting('BASE_CURRENCY', 'YER');
    if (to === baseCurrency) return fromToBase.baseAmount;
    
    // convert from base to to
    const rates = await db.getExchangeRates(date);
    const rateEntry = rates.find((r: any) => r.fromCurrency === baseCurrency && r.toCurrency === to);
    
    if (rateEntry) {
      return fromToBase.baseAmount * rateEntry.rate;
    }
    
    // Default fallback
    const defaultRates: Record<string, number> = {
      'USD': 530,
      'SAR': 140,
      'YER': 1.0,
      'AED': 144,
      'EGP': 11
    };
    
    const rate = (defaultRates[to] || 1) / (defaultRates[from] || 1);
    return amount * rate;
  }
}

