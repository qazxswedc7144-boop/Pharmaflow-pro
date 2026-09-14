// src/domain/primitives.types.ts
import { CurrencyCode } from "./enums.types";

/**
 * Standardized Money Representation
 * Default Currency: Yemeni Rial (YER)
 */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

/**
 * Currency Configuration Entity
 */
export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  exchangeRateToDefault: number;
  isDefault: boolean;
}

/**
 * Exchange Rate Definition
 */
export interface ExchangeRate {
  id: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  effectiveDate: string;
}

/**
 * Tax Profile Contract
 */
export interface TaxProfile {
  id: string;
  name: string;
  rate: number; // e.g., 0.05 for 5%
  isInclusive: boolean;
  isDefault: boolean;
}

/**
 * Standardized Quantity Definition
 */
export interface Quantity {
  value: number;
  unit: string;
}

/**
 * Date Range Contract
 */
export interface PeriodRange {
  startDate: string;
  endDate: string;
}

/**
 * Helper factory to create standardized YER Money objects
 */
export function createMoney(amount: number, currency: CurrencyCode = CurrencyCode.YER): Money {
  return {
    amount: Number(amount) || 0,
    currency,
  };
}
