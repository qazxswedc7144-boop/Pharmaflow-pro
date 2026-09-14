/**
 * PharmaFlow AI Domain Context Adapter - Accounting & Financials
 * Retrieves financial metrics, income statements, and aging data via accountingService & AccountingReportsService.
 * STRICT RULE: No direct database (Dexie/Prisma) queries inside AI adapters.
 */

import { accountingService } from '@/features/accounting/services/accountingService';
import { AccountingReportsService } from '@/features/accounting/services/AccountingReportsService';
import { AIUserContext, FinancialContextData } from '../types';

export class AccountingContextAdapter {
  private cache: { data: FinancialContextData; timestamp: number } | null = null;
  private CACHE_TTL_MS = 20000; // 20 seconds short-lived cache

  /**
   * Retrieves financial context with strict role controls and caching.
   */
  public async getContext(userContext: AIUserContext): Promise<FinancialContextData> {
    // Role-Based Access Control: Financial data restricted to Admin, Accountant, Manager
    const allowedRoles = ['admin', 'accountant', 'manager'];
    if (!allowedRoles.includes(userContext.userRole)) {
      return {
        grossProfitMargin: 0,
        netProfit: 0,
        totalAccountsReceivable: 0,
        totalAccountsPayable: 0,
      };
    }

    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < this.CACHE_TTL_MS) {
      return this.cache.data;
    }

    try {
      // Parallel retrieval via Business Services
      const [metrics, incomeStmt, customerAging, supplierAging] = await Promise.all([
        accountingService.getFinancialMetricsAsync().catch(() => ({
          margin: 0,
          net: 0,
          income: 0,
          outcome: 0,
          grossProfit: 0,
          cogs: 0,
        })),
        AccountingReportsService.getIncomeStatement().catch(() => null),
        accountingService.getAgingReport('CUSTOMER').catch(() => []),
        accountingService.getAgingReport('SUPPLIER').catch(() => []),
      ]);

      const grossProfitMargin = Number(metrics.margin || (incomeStmt as any)?.margin || 0);
      const netProfit = Number(metrics.net || (incomeStmt as any)?.netProfit || 0);

      // Sum receivables from customer aging buckets
      let totalAccountsReceivable = 0;
      if (Array.isArray(customerAging)) {
        for (const item of customerAging) {
          if (item?.buckets) {
            totalAccountsReceivable += Number(item.buckets.total ?? (
              Number(item.buckets.current || 0) +
              Number(item.buckets.overdue30 || 0) +
              Number(item.buckets.overdue60 || 0) +
              Number(item.buckets.overdue90 || 0)
            ));
          }
        }
      }

      // Sum payables from supplier aging buckets
      let totalAccountsPayable = 0;
      if (Array.isArray(supplierAging)) {
        for (const item of supplierAging) {
          if (item?.buckets) {
            totalAccountsPayable += Number(item.buckets.total ?? (
              Number(item.buckets.current || 0) +
              Number(item.buckets.overdue30 || 0) +
              Number(item.buckets.overdue60 || 0) +
              Number(item.buckets.overdue90 || 0)
            ));
          }
        }
      }

      const result: FinancialContextData = {
        grossProfitMargin: Math.round(grossProfitMargin * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        totalAccountsReceivable: Math.round(totalAccountsReceivable * 100) / 100,
        totalAccountsPayable: Math.round(totalAccountsPayable * 100) / 100,
        cogs: Math.round(Number(metrics.cogs || (incomeStmt as any)?.cogs || 0) * 100) / 100,
        revenue: Math.round(Number(metrics.income || (incomeStmt as any)?.revenue || 0) * 100) / 100,
        expenseTrends: [
          { category: 'مصروفات تشغيلية', amount: Number(metrics.outcome || 1200), month: new Date().toISOString().substring(0, 7) },
        ],
        trialBalanceAnomalies: [],
        cashFlowStatus: netProfit >= 0 ? 'positive' : 'tight',
      };

      this.cache = { data: result, timestamp: now };
      return result;
    } catch (error) {
      console.error('❌ [AccountingContextAdapter] Error assembling context:', error);
      return {
        grossProfitMargin: 0,
        netProfit: 0,
        totalAccountsReceivable: 0,
        totalAccountsPayable: 0,
      };
    }
  }

  /**
   * Helper to estimate token usage for accounting context
   */
  public estimateTokens(data: FinancialContextData): number {
    const jsonStr = JSON.stringify(data);
    return Math.ceil(jsonStr.length / 4);
  }
}

export const accountingContextAdapter = new AccountingContextAdapter();
