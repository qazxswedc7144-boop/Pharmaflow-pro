// server/modules/consolidation/consolidation.audit.ts
// Enterprise Centralized Audit Service for Financial Consolidation

import crypto from "crypto";
import { ConsolidationRepository } from "./consolidation.repository";
import { ConsolidationLogger } from "./consolidation.logger";

export interface ConsolidationAuditEvent {
  eventId: string;
  correlationId: string;
  requestId: string;
  tenantId: string;
  userId: string;
  action: string;
  reportType: string;
  status: "SUCCESS" | "WARNING" | "FAILURE";
  durationMs: number;
  timestamp: string;
  parameters: Record<string, any>;
  resultFingerprint?: string;
  financialIntegrity?: {
    isBalanced: boolean;
    discrepancy: number;
    checkType: string;
  };
  cacheStatus: "HIT" | "MISS" | "BYPASS";
  errorDetails?: {
    code: string;
    message: string;
    stack?: string;
  };
  ipAddress?: string;
}

export class ConsolidationAuditService {
  /**
   * Computes a cryptographic SHA-256 fingerprint of the financial report data
   * to guarantee non-repudiation and state immutability proof in audits.
   */
  public static generateFingerprint(data: any): string {
    try {
      const serialized = typeof data === "string" ? data : JSON.stringify(data);
      return crypto.createHash("sha256").update(serialized).digest("hex");
    } catch {
      return "FINGERPRINT_UNAVAILABLE";
    }
  }

  /**
   * Dispatches an audit event asynchronously without blocking the financial calculation response.
   */
  public static async recordAuditEvent(event: Omit<ConsolidationAuditEvent, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }): Promise<ConsolidationAuditEvent> {
    const fullEvent: ConsolidationAuditEvent = {
      eventId: event.eventId || crypto.randomUUID(),
      timestamp: event.timestamp || new Date().toISOString(),
      ...event,
    };

    // Log the structured audit event immediately
    ConsolidationLogger.info(
      `[AUDIT EVENT] ${fullEvent.action} (${fullEvent.reportType}) executed for tenant ${fullEvent.tenantId} in ${fullEvent.durationMs}ms [${fullEvent.status}]`,
      {
        tenantId: fullEvent.tenantId,
        correlationId: fullEvent.correlationId,
        requestId: fullEvent.requestId,
        component: "ConsolidationAuditService",
        durationMs: fullEvent.durationMs,
        context: {
          action: fullEvent.action,
          reportType: fullEvent.reportType,
          status: fullEvent.status,
          cacheStatus: fullEvent.cacheStatus,
          resultFingerprint: fullEvent.resultFingerprint,
          financialIntegrity: fullEvent.financialIntegrity,
          parameters: fullEvent.parameters,
        },
      }
    );

    // Asynchronous non-blocking persistence to database
    Promise.resolve().then(async () => {
      try {
        await ConsolidationRepository.writeAuditLog(
          fullEvent.tenantId,
          fullEvent.userId === "SYSTEM" ? null : fullEvent.userId,
          fullEvent.action,
          `${fullEvent.reportType}:${fullEvent.eventId}`,
          {
            correlationId: fullEvent.correlationId,
            requestId: fullEvent.requestId,
            reportType: fullEvent.reportType,
            status: fullEvent.status,
            durationMs: fullEvent.durationMs,
            parameters: fullEvent.parameters,
            resultFingerprint: fullEvent.resultFingerprint,
            financialIntegrity: fullEvent.financialIntegrity,
            cacheStatus: fullEvent.cacheStatus,
            errorDetails: fullEvent.errorDetails,
          },
          fullEvent.ipAddress
        );

        // Also publish to sync event pipeline for multi-branch sync auditability
        await ConsolidationRepository.publishSyncEvent(
          fullEvent.tenantId,
          fullEvent.eventId,
          `CONSOLIDATION_${fullEvent.reportType}_GENERATED`,
          fullEvent.eventId,
          {
            reportType: fullEvent.reportType,
            status: fullEvent.status,
            fingerprint: fullEvent.resultFingerprint,
            isBalanced: fullEvent.financialIntegrity?.isBalanced ?? true,
          },
          fullEvent.userId === "SYSTEM" ? null : fullEvent.userId
        );
      } catch (err) {
        ConsolidationLogger.warn(
          `[ConsolidationAuditService] Non-blocking audit persistence failure: ${err instanceof Error ? err.message : String(err)}`,
          {
            tenantId: fullEvent.tenantId,
            correlationId: fullEvent.correlationId,
            component: "ConsolidationAuditService",
          }
        );
      }
    });

    return fullEvent;
  }
}
