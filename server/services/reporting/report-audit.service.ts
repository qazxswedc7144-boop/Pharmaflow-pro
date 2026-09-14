// server/services/reporting/report-audit.service.ts
// Enterprise Financial Reporting Audit Logging Service

import { prisma } from "../../database/prisma";
import { ReportType, ExportFormat } from "./reporting.types";

export type ReportAuditAction =
  | "REPORT_GENERATED"
  | "REPORT_EXPORTED"
  | "REPORT_VIEWED"
  | "REPORT_FILTER_USED"
  | "REPORT_CACHE_PURGED";

export interface ReportAuditEntry {
  id: string;
  tenantId: string;
  userId: string;
  userName?: string;
  branchId?: string | null;
  reportType: ReportType;
  action: ReportAuditAction;
  exportFormat?: ExportFormat;
  filters: Record<string, any>;
  durationMs: number;
  recordsCount: number;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export class ReportAuditService {
  private static inMemoryAuditLogs: ReportAuditEntry[] = [];
  private static MAX_IN_MEMORY = 2000;

  public static async logAction(entry: Omit<ReportAuditEntry, "id" | "timestamp">): Promise<ReportAuditEntry> {
    const fullEntry: ReportAuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    // Store in memory ring buffer
    this.inMemoryAuditLogs.unshift(fullEntry);
    if (this.inMemoryAuditLogs.length > this.MAX_IN_MEMORY) {
      this.inMemoryAuditLogs.pop();
    }

    // Persist to Prisma AuditLog table if available
    try {
      if (prisma && prisma.auditLog) {
        await prisma.auditLog.create({
          data: {
            tenantId: entry.tenantId,
            userId: entry.userId,
            action: entry.action as any,
            entityType: `REPORT_${entry.reportType.toUpperCase()}`,
            entityId: entry.reportType,
            details: JSON.stringify({
              branchId: entry.branchId,
              exportFormat: entry.exportFormat,
              durationMs: entry.durationMs,
              recordsCount: entry.recordsCount,
              filters: entry.filters
            }),
            ipAddress: entry.ipAddress || null,
            userAgent: entry.userAgent || null
          }
        }).catch(() => {
          // Fallback safely if DB schema is not connected
        });
      }
    } catch {
      // Non-blocking fallback
    }

    return fullEntry;
  }

  public static getAuditLogs(
    tenantId: string,
    filters?: {
      reportType?: ReportType;
      userId?: string;
      branchId?: string;
      limit?: number;
    }
  ): ReportAuditEntry[] {
    let logs = this.inMemoryAuditLogs.filter(l => l.tenantId === tenantId);

    if (filters?.reportType) {
      logs = logs.filter(l => l.reportType === filters.reportType);
    }
    if (filters?.userId) {
      logs = logs.filter(l => l.userId === filters.userId);
    }
    if (filters?.branchId) {
      logs = logs.filter(l => l.branchId === filters.branchId);
    }

    const limit = filters?.limit || 100;
    return logs.slice(0, limit);
  }

  public static clearLogsForTenant(tenantId: string): void {
    this.inMemoryAuditLogs = this.inMemoryAuditLogs.filter(l => l.tenantId !== tenantId);
  }
}
