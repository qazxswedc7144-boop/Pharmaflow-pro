// server/services/reporting/report-builder.service.ts
// Enterprise Financial Report Builder, Dispatcher & Orchestrator

import {
  ReportType,
  ReportFilterParams,
  ExportFormat
} from "./reporting.types";
import { FinancialReportEngine } from "./financial-report.engine";
import { reportCacheService } from "./report-cache.service";
import { ReportAuditService } from "./report-audit.service";
import { ExportService, ExportOptions } from "./export.service";
import { AuthorizationService } from "../rbac/authorization.service";

export interface BuildReportRequest {
  reportType: ReportType;
  tenantId: string;
  userId: string;
  userRole?: string;
  branchId?: string | null;
  filters: ReportFilterParams;
  bypassCache?: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface BuildExportRequest extends BuildReportRequest {
  exportFormat: ExportFormat;
  customTitle?: string;
}

export class ReportBuilderService {
  /**
   * Required permission mapping per report type
   */
  private static readonly REPORT_PERMISSIONS: Record<ReportType, string[]> = {
    "balance-sheet": ["reports.balance_sheet.view", "reports.financial.view", "reports.view"],
    "profit-loss": ["reports.profit_loss.view", "reports.financial.view", "reports.view"],
    "trial-balance": ["reports.trial_balance.view", "reports.financial.view", "reports.view"],
    "general-ledger": ["reports.general_ledger.view", "reports.financial.view", "reports.view"],
    "inventory-valuation": ["reports.inventory.view", "reports.view"],
    "customer-balances": ["reports.customer.view", "reports.aging.view", "reports.view"],
    "supplier-balances": ["reports.supplier.view", "reports.aging.view", "reports.view"],
    "tax-report": ["reports.tax.view", "reports.financial.view", "reports.view"],
    "cash-flow": ["reports.cash_flow.view", "reports.financial.view", "reports.view"],
    "aging-customer": ["reports.aging.view", "reports.customer.view", "reports.view"],
    "aging-supplier": ["reports.aging.view", "reports.supplier.view", "reports.view"],
    "branch-consolidation": ["reports.branch.view", "reports.view"],
    "dashboard-kpis": ["reports.view"]
  };

  /**
   * Validates if user has permission to generate or view report
   */
  public static async validatePermissions(
    tenantId: string,
    userId: string,
    userRole: string | undefined,
    reportType: ReportType
  ): Promise<boolean> {
    if (userRole === "PLATFORM_OWNER" || userRole === "TENANT_ADMIN" || userRole === "ADMIN") {
      return true;
    }

    const requiredKeys = this.REPORT_PERMISSIONS[reportType] || ["reports.view"];
    
    return AuthorizationService.canAny(
      { userId, tenantId, role: userRole },
      requiredKeys,
      { tenantId }
    );
  }

  /**
   * Build and retrieve JSON financial report with multi-tenant security and caching
   */
  public static async buildReport(request: BuildReportRequest): Promise<any> {
    const startTime = Date.now();

    // 1. Enforce strict Tenant ID
    if (!request.tenantId) {
      throw new Error("Tenant ID is required to generate enterprise reports");
    }

    // 2. Validate RBAC Permissions
    const isAuthorized = await this.validatePermissions(
      request.tenantId,
      request.userId,
      request.userRole,
      request.reportType
    );

    if (!isAuthorized) {
      throw new Error(`Unauthorized: User lacks permission to access report [${request.reportType}]`);
    }

    // 3. Check Cache (if not explicitly bypassed)
    const cacheKey = reportCacheService.generateKey(
      request.tenantId,
      request.userId,
      request.reportType,
      request.filters
    );

    if (!request.bypassCache) {
      const cached = reportCacheService.get<any>(cacheKey);
      if (cached) {
        if (cached.header) cached.header.fromCache = true;
        return cached;
      }
    }

    // 4. Generate report via FinancialReportEngine
    const filters: ReportFilterParams = {
      ...request.filters,
      tenantId: request.tenantId,
      branchId: request.branchId || request.filters.branchId
    };

    let reportData: any;

    switch (request.reportType) {
      case "trial-balance":
        reportData = await FinancialReportEngine.generateTrialBalance(filters, request.userId);
        break;
      case "profit-loss":
        reportData = await FinancialReportEngine.generateProfitLoss(filters, request.userId);
        break;
      case "balance-sheet":
        reportData = await FinancialReportEngine.generateBalanceSheet(filters, request.userId);
        break;
      case "general-ledger":
        reportData = await FinancialReportEngine.generateGeneralLedger(filters, request.userId);
        break;
      case "inventory-valuation":
        reportData = await FinancialReportEngine.generateInventoryValuation(filters, request.userId);
        break;
      case "customer-balances":
      case "aging-customer":
        reportData = await FinancialReportEngine.generateCustomerReport(filters, request.userId);
        break;
      case "supplier-balances":
      case "aging-supplier":
        reportData = await FinancialReportEngine.generateSupplierReport(filters, request.userId);
        break;
      case "tax-report":
        reportData = await FinancialReportEngine.generateTaxReport(filters, request.userId);
        break;
      case "cash-flow":
        reportData = await FinancialReportEngine.generateCashFlow(filters, request.userId);
        break;
      case "dashboard-kpis":
        reportData = await FinancialReportEngine.generateDashboardKPIs(filters, request.userId);
        break;
      default:
        throw new Error(`Unsupported report type: ${request.reportType}`);
    }

    // 5. Store in Cache
    reportCacheService.set(cacheKey, reportData, request.tenantId, request.reportType);

    // 6. Audit Logging
    const durationMs = Date.now() - startTime;
    const recordsCount = Array.isArray(reportData?.items || reportData?.accounts || reportData?.customers || reportData?.suppliers)
      ? (reportData.items || reportData.accounts || reportData.customers || reportData.suppliers).length
      : 1;

    await ReportAuditService.logAction({
      tenantId: request.tenantId,
      userId: request.userId,
      branchId: request.branchId,
      reportType: request.reportType,
      action: "REPORT_GENERATED",
      filters: request.filters,
      durationMs,
      recordsCount,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent
    });

    return reportData;
  }

  /**
   * Export Report in PDF, Excel, or CSV format
   */
  public static async exportReport(request: BuildExportRequest): Promise<{ content: string; contentType: string; filename: string }> {
    const startTime = Date.now();

    // Check export permissions
    const userContext = { userId: request.userId, tenantId: request.tenantId, role: request.userRole };
    const hasExportPerm =
      request.userRole === "PLATFORM_OWNER" ||
      request.userRole === "TENANT_ADMIN" ||
      request.userRole === "ADMIN" ||
      (await AuthorizationService.can(userContext, "reports.export", { tenantId: request.tenantId })) ||
      (request.exportFormat === "PDF" && (await AuthorizationService.can(userContext, "reports.export.pdf", { tenantId: request.tenantId }))) ||
      (request.exportFormat === "EXCEL" && (await AuthorizationService.can(userContext, "reports.export.excel", { tenantId: request.tenantId })));

    if (!hasExportPerm) {
      throw new Error(`Unauthorized: User lacks permission to export reports as [${request.exportFormat}]`);
    }

    const reportData = await this.buildReport(request);
    const exportOptions = this.mapReportToExportOptions(request.reportType, reportData, request);

    let content: string;
    let contentType: string;
    let extension: string;

    if (request.exportFormat === "PDF" || request.exportFormat === "PRINT") {
      content = ExportService.generatePdfHtml(exportOptions);
      contentType = "text/html; charset=utf-8";
      extension = "html";
    } else if (request.exportFormat === "EXCEL") {
      content = ExportService.generateExcelXml(exportOptions);
      contentType = "application/vnd.ms-excel; charset=utf-8";
      extension = "xls";
    } else {
      content = ExportService.generateCsv(exportOptions);
      contentType = "text/csv; charset=utf-8";
      extension = "csv";
    }

    const durationMs = Date.now() - startTime;
    await ReportAuditService.logAction({
      tenantId: request.tenantId,
      userId: request.userId,
      branchId: request.branchId,
      reportType: request.reportType,
      action: "REPORT_EXPORTED",
      exportFormat: request.exportFormat,
      filters: request.filters,
      durationMs,
      recordsCount: exportOptions.data.length,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent
    });

    const timestamp = new Date().toISOString().substring(0, 10);
    const filename = `${request.reportType}-${timestamp}.${extension}`;

    return { content, contentType, filename };
  }

  /**
   * Helper to format report datasets for tabular document export
   */
  private static mapReportToExportOptions(
    reportType: ReportType,
    reportData: any,
    request: BuildExportRequest
  ): ExportOptions {
    const title = request.customTitle || reportData.header?.reportTitleArabic || "تقرير مالي";
    const subtitle = `الفترة: ${request.filters.startDate || "البداية"} إلى ${request.filters.endDate || request.filters.asOfDate || "اليوم"}`;

    switch (reportType) {
      case "trial-balance":
        return {
          format: request.exportFormat,
          title,
          subtitle,
          currency: "SAR",
          columns: [
            { key: "code", label: "رمز الحساب" },
            { key: "name", label: "اسم الحساب" },
            { key: "type", label: "النوع" },
            { key: "openingDebit", label: "رصيد افتتاحي (مدين)", isNumeric: true },
            { key: "openingCredit", label: "رصيد افتتاحي (دائن)", isNumeric: true },
            { key: "periodDebit", label: "حركة الفترة (مدين)", isNumeric: true },
            { key: "periodCredit", label: "حركة الفترة (دائن)", isNumeric: true },
            { key: "endingDebit", label: "رصيد ختامي (مدين)", isNumeric: true },
            { key: "endingCredit", label: "رصيد ختامي (دائن)", isNumeric: true }
          ],
          data: reportData.accounts || [],
          summaryRows: [
            { label: "إجمالي الأرصدة الختامية المدينة", value: reportData.totals?.endingDebitTotal || 0 },
            { label: "إجمالي الأرصدة الختامية الدائنة", value: reportData.totals?.endingCreditTotal || 0 },
            { label: "حالة التوازن", value: reportData.totals?.isBalanced ? "متوازن ومطابق (Balanced)" : "غير متوازن (Unbalanced)" }
          ]
        };

      case "profit-loss":
        return {
          format: request.exportFormat,
          title,
          subtitle,
          currency: "SAR",
          columns: [
            { key: "category", label: "البند المالي" },
            { key: "accountName", label: "الحساب" },
            { key: "amount", label: "المبلغ (ر.س)", isNumeric: true }
          ],
          data: [
            ...(reportData.revenue?.items || []).map((i: any) => ({ category: "إيرادات المبيعات", accountName: i.name, amount: i.amount })),
            ...(reportData.costOfGoodsSold?.items || []).map((i: any) => ({ category: "تكلفة المبيعات (COGS)", accountName: i.name, amount: i.amount })),
            ...(reportData.operatingExpenses?.items || []).map((i: any) => ({ category: "مصاريف تشغيلية", accountName: i.name, amount: i.amount }))
          ],
          summaryRows: [
            { label: "إجمالي الإيرادات", value: reportData.revenue?.totalRevenue || 0 },
            { label: "إجمالي تكلفة المبيعات", value: reportData.costOfGoodsSold?.cogsAmount || 0 },
            { label: "مجمل الربح (Gross Profit)", value: reportData.grossProfit || 0 },
            { label: "إجمالي المصاريف التشغيلية", value: reportData.operatingExpenses?.totalExpenses || 0 },
            { label: "صافي الأرباح (Net Profit)", value: reportData.netProfit || 0 },
            { label: "هامش صافي الربح", value: `${(reportData.netMarginPercentage || 0).toFixed(2)}%` }
          ]
        };

      case "inventory-valuation":
        return {
          format: request.exportFormat,
          title,
          subtitle,
          currency: "SAR",
          columns: [
            { key: "barcode", label: "الباركود" },
            { key: "productName", label: "اسم الصنف / الدواء" },
            { key: "stockQuantity", label: "الكمية المتاحة", isNumeric: true },
            { key: "unitCost", label: "تكلفة الوحدة", isNumeric: true },
            { key: "totalCostValue", label: "قيمة المخزون (التكلفة)", isNumeric: true },
            { key: "unitPrice", label: "سعر البيع", isNumeric: true },
            { key: "totalSalesValue", label: "قيمة البيع المتوقعة", isNumeric: true },
            { key: "unrealizedProfit", label: "الربح المتوقع", isNumeric: true },
            { key: "expiryStatus", label: "حالة الصلاحية" }
          ],
          data: reportData.items || [],
          summaryRows: [
            { label: "إجمالي عدد الأصناف", value: reportData.summary?.totalItemsCount || 0 },
            { label: "إجمالي الوحدات في المخزن", value: reportData.summary?.totalStockUnits || 0 },
            { label: "إجمالي قيمة تقييم المخزون بالتكلفة", value: reportData.summary?.totalCostValuation || 0 },
            { label: "إجمالي القيمة البيعية للمخزون", value: reportData.summary?.totalSalesPotential || 0 },
            { label: "إجمالي الأرباح الكامنة غير المحققة", value: reportData.summary?.totalUnrealizedProfit || 0 }
          ]
        };

      case "customer-balances":
      case "aging-customer":
        return {
          format: request.exportFormat,
          title,
          subtitle,
          currency: "SAR",
          columns: [
            { key: "customerName", label: "اسم العميل" },
            { key: "phone", label: "الهاتف" },
            { key: "totalSales", label: "إجمالي المبيعات", isNumeric: true },
            { key: "totalPaid", label: "المسدد", isNumeric: true },
            { key: "balanceDue", label: "الرصيد المدين المستحق", isNumeric: true },
            { key: "riskLevel", label: "مستوى المخاطرة" }
          ],
          data: reportData.customers || [],
          summaryRows: [
            { label: "إجمالي عدد العملاء", value: reportData.summary?.totalCustomers || 0 },
            { label: "إجمالي ذمم العملاء المستحقة", value: reportData.summary?.totalReceivables || 0 },
            { label: "الديون الحالية (0-30 يوم)", value: reportData.summary?.agingSummary?.current || 0 },
            { label: "الديون المتأخرة (أكثر من 90 يوم)", value: reportData.summary?.agingSummary?.daysOver90 || 0 }
          ]
        };

      case "supplier-balances":
      case "aging-supplier":
        return {
          format: request.exportFormat,
          title,
          subtitle,
          currency: "SAR",
          columns: [
            { key: "supplierName", label: "اسم المورد" },
            { key: "phone", label: "الهاتف" },
            { key: "totalPurchases", label: "إجمالي المشتريات", isNumeric: true },
            { key: "totalPaid", label: "المسدد للمورد", isNumeric: true },
            { key: "balanceDue", label: "الرصيد الدائن المستحق", isNumeric: true }
          ],
          data: reportData.suppliers || [],
          summaryRows: [
            { label: "إجمالي عدد الموردين", value: reportData.summary?.totalSuppliers || 0 },
            { label: "إجمالي مستحقات الموردين القائمة", value: reportData.summary?.totalPayables || 0 }
          ]
        };

      default:
        return {
          format: request.exportFormat,
          title,
          subtitle,
          currency: "SAR",
          columns: [{ key: "label", label: "البند" }, { key: "value", label: "القيمة" }],
          data: Object.entries(reportData).map(([k, v]) => ({ label: k, value: typeof v === "object" ? JSON.stringify(v) : String(v) }))
        };
    }
  }
}
