// server/routes/reporting.routes.ts
// Enterprise Financial Reporting API Routes

import { Router, Request, Response } from "express";
import { ReportBuilderService } from "../services/reporting/report-builder.service";
import { ReportType, ExportFormat } from "../services/reporting/reporting.types";
import { reportCacheService } from "../services/reporting/report-cache.service";
import { ReportAuditService } from "../services/reporting/report-audit.service";
import { authenticateToken } from "../middleware/auth.middleware";
import { tenantContextMiddleware } from "../middleware/tenant.middleware";
import { subscriptionGuard } from "../middleware/subscription.middleware";

export const reportingRouter = Router();

// Apply auth, tenant context, and subscription middleware to all report endpoints
reportingRouter.use(authenticateToken);
reportingRouter.use(tenantContextMiddleware);
reportingRouter.use(subscriptionGuard);

/**
 * Generic Report Generation Handler
 */
async function handleReportGeneration(
  reportType: ReportType,
  req: Request,
  res: Response
) {
  try {
    const user = (req as any).user;
    const tenantId = (req as any).tenantId || user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context is required" });
    }

    const {
      startDate,
      endDate,
      asOfDate,
      branchId,
      accountId,
      customerId,
      supplierId,
      productId,
      category,
      bypassCache,
      search
    } = req.query;

    const report = await ReportBuilderService.buildReport({
      reportType,
      tenantId,
      userId: user.id || user.userId || "system",
      userRole: user.role,
      branchId: (branchId as string) || user.branchId || null,
      filters: {
        tenantId,
        branchId: (branchId as string) || null,
        startDate: startDate as string,
        endDate: endDate as string,
        asOfDate: asOfDate as string,
        accountId: accountId as string,
        customerId: customerId as string,
        supplierId: supplierId as string,
        productId: productId as string,
        category: category as string,
        search: search as string
      },
      bypassCache: bypassCache === "true" || bypassCache === "1",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    return res.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    console.error(`[ReportingAPI] Error generating ${reportType}:`, error);
    const status = error.message?.includes("Unauthorized") ? 403 : 500;
    return res.status(status).json({
      success: false,
      error: error.message || "Failed to generate financial report"
    });
  }
}

// 1. Balance Sheet Endpoint
reportingRouter.get("/balance-sheet", (req, res) => handleReportGeneration("balance-sheet", req, res));

// 2. Profit & Loss Statement Endpoint
reportingRouter.get("/profit-loss", (req, res) => handleReportGeneration("profit-loss", req, res));

// 3. Trial Balance Endpoint
reportingRouter.get("/trial-balance", (req, res) => handleReportGeneration("trial-balance", req, res));

// 4. General Ledger Statement Endpoint
reportingRouter.get("/general-ledger", (req, res) => handleReportGeneration("general-ledger", req, res));

// 5. Inventory Valuation & Stock Expiry Endpoint
reportingRouter.get("/inventory-valuation", (req, res) => handleReportGeneration("inventory-valuation", req, res));

// 6. Customer Balances & Aging Endpoint
reportingRouter.get("/customers", (req, res) => handleReportGeneration("customer-balances", req, res));

// 7. Supplier Balances & Aging Endpoint
reportingRouter.get("/suppliers", (req, res) => handleReportGeneration("supplier-balances", req, res));

// 8. VAT & Tax Declaration Endpoint
reportingRouter.get("/tax", (req, res) => handleReportGeneration("tax-report", req, res));

// 9. Cash Flow Statement Endpoint
reportingRouter.get("/cash-flow", (req, res) => handleReportGeneration("cash-flow", req, res));

// 10. Dashboard Executive KPIs Endpoint
reportingRouter.get("/dashboard-kpis", (req, res) => handleReportGeneration("dashboard-kpis", req, res));

// 11. Report Audit Logs Endpoint
reportingRouter.get("/audit-logs", (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = (req as any).tenantId || user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context is required" });
    }

    const { reportType, userId, branchId, limit } = req.query;
    const logs = ReportAuditService.getAuditLogs(tenantId, {
      reportType: reportType as ReportType,
      userId: userId as string,
      branchId: branchId as string,
      limit: limit ? parseInt(limit as string, 10) : 100
    });

    return res.json({ success: true, logs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 12. Multi-Format Export Endpoint (PDF, Excel, CSV)
reportingRouter.post("/export", async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = (req as any).tenantId || user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context is required" });
    }

    const { reportType, format, filters, customTitle } = req.body;

    if (!reportType || !format) {
      return res.status(400).json({ error: "reportType and format are required" });
    }

    const result = await ReportBuilderService.exportReport({
      reportType: reportType as ReportType,
      exportFormat: format as ExportFormat,
      customTitle,
      tenantId,
      userId: user.id || user.userId || "system",
      userRole: user.role,
      branchId: filters?.branchId || user.branchId || null,
      filters: filters || { tenantId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.send(result.content);
  } catch (error: any) {
    console.error("[ReportingAPI] Export error:", error);
    const status = error.message?.includes("Unauthorized") ? 403 : 500;
    return res.status(status).json({
      success: false,
      error: error.message || "Failed to export report"
    });
  }
});

// 13. Invalidate Report Cache Endpoint
reportingRouter.post("/cache/clear", (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = (req as any).tenantId || user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context is required" });
    }

    const { reportType } = req.body;
    let count = 0;
    if (reportType) {
      count = reportCacheService.invalidateReportType(tenantId, reportType);
    } else {
      count = reportCacheService.invalidateTenant(tenantId);
    }

    return res.json({
      success: true,
      clearedEntries: count,
      stats: reportCacheService.getStats()
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
