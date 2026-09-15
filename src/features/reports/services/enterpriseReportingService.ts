// src/features/reports/services/enterpriseReportingService.ts
// Enterprise Reporting Client Service with Cloud Authoritative & Offline Fallback Support

import { ReportEngine } from '@/services/reports/reportEngine';
import { ExportService } from '@/services/data/exportService';
import { db } from '@/core/db';
import { TokenProvider } from '@/services/auth/tokenProvider';
import { unifiedTransport } from '@/shared/network/transport/unifiedTransport';

export type ReportType =
  | 'balance-sheet'
  | 'profit-loss'
  | 'trial-balance'
  | 'general-ledger'
  | 'account-movement'
  | 'inventory-valuation'
  | 'customer-balances'
  | 'supplier-balances'
  | 'tax-report'
  | 'cash-flow'
  | 'aging-customer'
  | 'aging-supplier'
  | 'branch-consolidation'
  | 'dashboard-kpis'
  | 'remaining-stock'
  | 'expiry-items'
  | 'item-sales-movement'
  | 'audit-trail';

export type ExportFormat = 'PDF' | 'EXCEL' | 'CSV' | 'PRINT';

export type ReportingSyncTag =
  | 'CLOUD_AUTHORITATIVE'
  | 'SYNCED'
  | 'LOCAL_UNSYNCED'
  | 'PARTIALLY_SYNCED'
  | 'CONFLICTED'
  | 'LOCAL_OFFLINE';

export interface ReportSyncMetadata {
  overallState: ReportingSyncTag;
  hasUnsyncedData: boolean;
  hasConflictedData: boolean;
  syncWarningArabic?: string;
  syncWarningEnglish?: string;
  authoritativeRecordsCount: number;
  syncedRecordsCount: number;
  unsyncedRecordsCount: number;
  conflictedRecordsCount: number;
  asOfServerTimestamp: number;
  source?: 'ENTERPRISE_CORE' | 'LOCAL_CACHE';
  freshnessSeconds?: number;
}

export interface ClientReportFilterParams {
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  branchId?: string | null;
  tenantId?: string;
  search?: string;
  bypassCache?: boolean;
}

export interface EnterpriseReportResponse<T = any> {
  success: boolean;
  reportType: string;
  data: T;
  syncMetadata: ReportSyncMetadata;
  generatedAt: string;
  executionTimeMs?: number;
  source: 'ENTERPRISE_SERVER' | 'LOCAL_OFFLINE';
  error?: string;
}

export class EnterpriseReportingService {
  private static getApiUrl(endpoint: string): string {
    const base = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    return `${base}/api/v1/reports${endpoint}`;
  }

  /**
   * Retrieves active tenant and auth headers for reporting requests
   */
  private static getAuthContext() {
    const session = TokenProvider.getCurrentSession();
    const user = session.user;
    const token = TokenProvider.getAccessToken() || '';

    const tenantId = session.tenantId || user?.tenant_id || user?.tenantId || 'DEFAULT_PHARMA_TENANT';
    const userId = user?.id || user?.user_id || 'admin';
    const userRole = user?.Role || user?.role || 'ADMIN';

    return {
      tenantId,
      userId,
      userRole,
      token
    };
  }

  /**
   * Builds an enterprise financial report, preferring the authoritative backend engine
   * with seamless local fallback to client Dexie / IndexedDB if offline or server is unavailable.
   */
  public static async fetchReport(
    reportType: ReportType,
    filters: ClientReportFilterParams
  ): Promise<EnterpriseReportResponse> {
    const auth = this.getAuthContext();
    const startTime = Date.now();

    // 1. Attempt authoritative server-side report build
    try {
      const json = await unifiedTransport.post<any>(this.getApiUrl('/build'), {
        reportType,
        tenantId: auth.tenantId,
        userId: auth.userId,
        userRole: auth.userRole,
        branchId: filters.branchId || null,
        filters: {
          tenantId: auth.tenantId,
          branchId: filters.branchId || null,
          startDate: filters.startDate,
          endDate: filters.endDate,
          asOfDate: filters.asOfDate || filters.endDate,
          search: filters.search
        },
        bypassCache: filters.bypassCache ?? false
      });

      if (json && json.success && json.data) {
        return {
          success: true,
          reportType,
          data: json.data,
          syncMetadata: json.syncMetadata || {
            overallState: 'CLOUD_AUTHORITATIVE',
            hasUnsyncedData: false,
            hasConflictedData: false,
            authoritativeRecordsCount: 100,
            syncedRecordsCount: 100,
            unsyncedRecordsCount: 0,
            conflictedRecordsCount: 0,
            asOfServerTimestamp: Date.now(),
            source: 'ENTERPRISE_CORE',
            freshnessSeconds: 0
          },
          generatedAt: json.generatedAt || new Date().toISOString(),
          executionTimeMs: json.executionTimeMs || (Date.now() - startTime),
          source: 'ENTERPRISE_SERVER'
        };
      }
    } catch (serverErr) {
      console.warn('[EnterpriseReportingService] Server API unavailable, gracefully switching to client fallback engine:', serverErr);
    }

    // 2. Client-side Local Fallback Engine (Offline resilient)
    const localData = await this.buildLocalFallbackReport(reportType, filters);
    return {
      success: true,
      reportType,
      data: localData,
      syncMetadata: {
        overallState: 'LOCAL_OFFLINE',
        hasUnsyncedData: true,
        hasConflictedData: false,
        syncWarningArabic: 'يعمل التقرير حالياً بالوضع المحلي غير المتزامن لحين استعادة الاتصال بالخادم المركزي.',
        authoritativeRecordsCount: 0,
        syncedRecordsCount: 0,
        unsyncedRecordsCount: 1,
        conflictedRecordsCount: 0,
        asOfServerTimestamp: Date.now(),
        source: 'LOCAL_CACHE',
        freshnessSeconds: 0
      },
      generatedAt: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
      source: 'LOCAL_OFFLINE'
    };
  }

  /**
   * Local Client-Side Calculation Fallback
   */
  private static async buildLocalFallbackReport(
    reportType: ReportType,
    filters: ClientReportFilterParams
  ): Promise<any> {
    const startDate = filters.startDate || '2020-01-01';
    const endDate = filters.endDate || new Date().toISOString().substring(0, 10);

    try {
      switch (reportType) {
        case 'trial-balance':
          return await ReportEngine.getTrialBalance(startDate, endDate);
        case 'profit-loss':
          return await ReportEngine.getProfitLoss(startDate, endDate);
        case 'balance-sheet':
          return await ReportEngine.getBalanceSheet(endDate);
        case 'cash-flow':
          return await ReportEngine.getCashFlow(startDate, endDate);
        case 'general-ledger':
        case 'account-movement':
          return await ReportEngine.getAccountMovement(startDate, endDate);
        case 'inventory-valuation':
          try {
            return await ReportEngine.getInventoryValue();
          } catch {
            return { totalCost: 0, totalRetail: 0, itemCount: 0, estimatedProfit: 0 };
          }
        case 'remaining-stock': {
          try {
            const products = await db.getProducts();
            return products.map((p: any) => ({
              id: p.id,
              name: p.name,
              code: p.barcode || 'N/A',
              category: p.categoryName || 'عام',
              stock: Number(p.stock ?? p.StockQuantity ?? 0),
              minStock: Number(p.MinStockLevel ?? p.minStock ?? 5),
              costPrice: Number(p.CostPrice ?? p.LastPurchasePrice ?? 0),
              salePrice: Number(p.price ?? 0),
              status: Number(p.stock ?? p.StockQuantity ?? 0) <= 0 ? 'نفد المخزون' : (Number(p.stock ?? p.StockQuantity ?? 0) <= Number(p.MinStockLevel ?? 5) ? 'منخفض' : 'متوفر')
            }));
          } catch {
            return [];
          }
        }
        case 'expiry-items': {
          try {
            const products = await db.getProducts();
            const today = new Date();
            return products
              .filter((p: any) => p.expiryDate || p.ExpiryDate)
              .map((p: any) => {
                const exp = new Date(p.expiryDate || p.ExpiryDate);
                const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return {
                  id: p.id,
                  name: p.name,
                  barcode: p.barcode || 'N/A',
                  expiryDate: (p.expiryDate || p.ExpiryDate || '').substring(0, 10),
                  daysRemaining: diffDays,
                  stock: Number(p.stock ?? p.StockQuantity ?? 0),
                  cost: Number(p.CostPrice ?? p.LastPurchasePrice ?? 0),
                  status: diffDays < 0 ? 'منتهي' : (diffDays <= 90 ? 'قريب الانتهاء' : 'صالح')
                };
              })
              .sort((a: any, b: any) => a.daysRemaining - b.daysRemaining);
          } catch {
            return [];
          }
        }
        case 'item-sales-movement': {
          try {
            const sales = await db.invoices.where('type').equals('SALE').toArray();
            const itemMap: Record<string, { name: string; qty: number; totalSales: number; profit: number }> = {};
            
            sales.forEach((s: any) => {
              const d = s.date || s.Date || '';
              if (startDate && d < startDate) return;
              if (endDate && d > endDate) return;

              (s.items || []).forEach((it: any) => {
                const key = it.productId || it.id || it.name;
                if (!itemMap[key]) {
                  itemMap[key] = { name: it.name || 'صنف', qty: 0, totalSales: 0, profit: 0 };
                }
                const itemQty = Number(it.quantity || it.qty || 1);
                const lineTotal = Number(it.total || (it.price * itemQty) || 0);
                const lineCost = Number(it.costPrice || 0) * itemQty;
                itemMap[key].qty += itemQty;
                itemMap[key].totalSales += lineTotal;
                itemMap[key].profit += (lineTotal - lineCost);
              });
            });

            return Object.entries(itemMap).map(([id, info]) => ({
              id,
              name: info.name,
              quantitySold: info.qty,
              totalSales: info.totalSales,
              estimatedProfit: info.profit,
              marginPct: info.totalSales > 0 ? (info.profit / info.totalSales) * 100 : 0
            })).sort((a, b) => b.totalSales - a.totalSales);
          } catch {
            return [];
          }
        }
        case 'customer-balances':
          try {
            return await ReportEngine.getCustomerBalances();
          } catch {
            return [];
          }
        case 'supplier-balances':
          try {
            return await ReportEngine.getSupplierBalances();
          } catch {
            return [];
          }
        case 'aging-customer':
          try {
            return await ReportEngine.getAgingReport('CUSTOMER');
          } catch {
            return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0, details: [] };
          }
        case 'aging-supplier':
          try {
            return await ReportEngine.getAgingReport('SUPPLIER');
          } catch {
            return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0, details: [] };
          }
        case 'tax-report':
          return await ReportEngine.getTaxReport(startDate, endDate);
        case 'audit-trail':
          return await ReportEngine.getAuditSummary(startDate, endDate, 300);
        default:
          return await ReportEngine.getTrialBalance(startDate, endDate);
      }
    } catch (e) {
      console.warn('[EnterpriseReportingService] Local fallback calculation error:', e);
      return [];
    }
  }

  /**
   * Retrieves available branches for consolidation filtering
   */
  public static async fetchBranches(): Promise<{ id: string; name: string; code?: string }[]> {
    const auth = this.getAuthContext();
    try {
      const json = await unifiedTransport.get<any>(this.getApiUrl(`/meta/branches?tenantId=${auth.tenantId}`));
      if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    } catch (e) {
      console.warn('[EnterpriseReportingService] Failed to load server branches, using local list:', e);
    }

    // Fallback: local branches if any
    return [
      { id: 'all', name: 'المركز المالي الموحد (كافة الفروع)' },
      { id: 'main', name: 'الفرع الرئيسي - الصيدلية المركزية' },
      { id: 'branch-2', name: 'فرع صيدلية الأمل' }
    ];
  }

  /**
   * Clear cache on the enterprise reporting engine
   */
  public static async clearCache(): Promise<boolean> {
    const auth = this.getAuthContext();
    try {
      const json = await unifiedTransport.post<any>(this.getApiUrl('/cache/clear'), { tenantId: auth.tenantId });
      return !!json;
    } catch (e) {
      console.error('[EnterpriseReportingService] Cache clear error:', e);
      return false;
    }
  }

  /**
   * Unified Export Handler (Server-side or Client fallback)
   */
  public static async exportReport(
    format: ExportFormat,
    reportType: ReportType,
    reportTitle: string,
    data: any,
    filters: ClientReportFilterParams
  ): Promise<void> {
    const auth = this.getAuthContext();
    const fileName = `Financial_${reportType}_${filters.startDate || 'start'}_to_${filters.endDate || 'end'}`;

    // Attempt server-side export first
    try {
      const response = await unifiedTransport.request<Response>({
        url: this.getApiUrl('/export'),
        method: 'POST',
        raw: true,
        body: {
          reportType,
          exportFormat: format,
          tenantId: auth.tenantId,
          userId: auth.userId,
          userRole: auth.userRole,
          branchId: filters.branchId || null,
          filters: {
            tenantId: auth.tenantId,
            branchId: filters.branchId || null,
            startDate: filters.startDate,
            endDate: filters.endDate
          },
          customTitle: reportTitle
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.${format.toLowerCase() === 'excel' ? 'xlsx' : format.toLowerCase() === 'pdf' ? 'pdf' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch (serverErr) {
      console.warn('[EnterpriseReportingService] Server export failed, falling back to client ExportService:', serverErr);
    }

    // Client fallback export
    if (format === 'EXCEL' || format === 'CSV') {
      let rows: any[] = [];
      if (Array.isArray(data)) {
        rows = data;
      } else if (typeof data === 'object' && data !== null) {
        rows = Object.entries(data).map(([key, val]) => ({
          'البيان': key,
          'القيمة': typeof val === 'object' ? JSON.stringify(val) : val
        }));
      }
      ExportService.exportToExcel(rows, fileName);
    } else if (format === 'PDF') {
      const pdfRows = Array.isArray(data)
        ? data.map(d => [d.name || d.code || d.id || 'عنصر', String(d.total || d.balance || d.stock || d.amount || 0)])
        : Object.entries(data || {}).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
      await ExportService.exportToPDFFile(reportTitle, ['البيان', 'القيمة'], pdfRows, fileName);
    } else if (format === 'PRINT') {
      window.print();
    }
  }
}
