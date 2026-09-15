
import { db } from '@/core/db';
import { Currency } from '@/types';
import { eventBus, EVENTS } from '@/services/eventBus';
import { configurationService } from '@/services/config/configurationService';

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
  /**
   * Returns current active currency code synchronously from configurationService or window
   */
  static getCurrentCurrencyCode(): string {
    const cached = configurationService.getSync<string>('system.currency');
    if (cached) return String(cached).toUpperCase();

    if (typeof window !== 'undefined') {
      const winVal = (window as any).currentSystemCurrency;
      if (winVal && typeof winVal === 'string') {
        return winVal.toUpperCase();
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
   * Updates global system currency through configurationService
   */
  static async setGlobalCurrency(code: string, label?: string, isNew: boolean = false) {
    const upperCode = code.toUpperCase();
    const resolvedLabel = label || this.getCurrencyName(upperCode);
    
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

    // Persist via configurationService
    await configurationService.set('system.currency', upperCode);
    await configurationService.set('system.currency_label', resolvedLabel);

    if (typeof window !== 'undefined') {
      (window as any).currentSystemCurrency = upperCode;
    }

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
   * Get current active currency
   */
  static async getActiveCurrency(): Promise<{ code: string; label: string }> {
    const code = await configurationService.get<string>('system.currency') || 'YER';
    const label = await configurationService.get<string>('system.currency_label') || 'ريال يمني';
    
    if (typeof window !== 'undefined') {
      (window as any).currentSystemCurrency = code;
    }
    
    return { code, label };
  }

  /**
   * Currency observer
   */
  static startCurrencyObserver(onUpdate: (code: string, label: string) => void) {
    this.getActiveCurrency()
      .then(curr => onUpdate(curr.code, curr.label))
      .catch(err => console.error("[CurrencyService] Observer initial fetch failed:", err));

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
   * Convert amount to base currency
   */
  static async convertToBase(amount: number, fromCurrency: string, date?: string) {
    const baseCurrency = await configurationService.get<string>('system.currency') || 'YER';
    
    if (fromCurrency === baseCurrency) {
      return { baseAmount: amount, rate: 1 };
    }

    const rates = await db.getExchangeRates(date);
    const rateEntry = rates.find((r: any) => r.fromCurrency === fromCurrency && r.toCurrency === baseCurrency);
    
    if (rateEntry) {
      return { baseAmount: amount * rateEntry.rate, rate: rateEntry.rate };
    }

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
   * Convert amount between two currencies
   */
  static async convert(amount: number, from: string, to: string, date?: string) {
    if (from === to) return amount;
    
    const fromToBase = await this.convertToBase(amount, from, date);
    const baseCurrency = await configurationService.get<string>('system.currency') || 'YER';
    if (to === baseCurrency) return fromToBase.baseAmount;
    
    const rates = await db.getExchangeRates(date);
    const rateEntry = rates.find((r: any) => r.fromCurrency === baseCurrency && r.toCurrency === to);
    
    if (rateEntry) {
      return fromToBase.baseAmount * rateEntry.rate;
    }
    
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


