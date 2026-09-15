// server/modules/consolidation/consolidation.router.ts
// Enterprise Financial Consolidation Router with Request Correlation, Structured Logging & Observability

import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { authenticateToken, requireRoles, AuthenticatedRequest } from "../../middleware/auth.middleware";
import { ConsolidationService } from "./consolidation.service";
import { getCurrentTenantId, runWithTenantContext } from "../../context/tenantContext";
import { Role } from "@prisma/client";
import { ConsolidationLogger } from "./consolidation.logger";
import { ConsolidationMetrics } from "./consolidation.metrics";
import { formatErrorResponse, TenantIsolationError } from "./consolidation.errors";

const router = Router();

// Define RBAC rule guarding all endpoints to ADMIN, ACCOUNTANT, AUDITOR roles
const permittedRoles: Role[] = [Role.ADMIN, Role.ACCOUNTANT, Role.AUDITOR];
const rbacGuards = [authenticateToken, requireRoles(permittedRoles)];

interface RequestContextInfo {
  tenantId: string;
  userId: string;
  role?: string;
  correlationId: string;
  requestId: string;
  ipAddress: string;
}

function resolveRequestContext(req: AuthenticatedRequest, res: Response): RequestContextInfo {
  const correlationId = (req.headers["x-correlation-id"] as string)?.trim() || randomUUID();
  const requestId = (req.headers["x-request-id"] as string)?.trim() || randomUUID();
  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "SYSTEM";

  // Echo tracing headers on HTTP response for client non-repudiation and distributed tracing
  res.setHeader("x-correlation-id", correlationId);
  res.setHeader("x-request-id", requestId);

  const rawTenantId = req.user?.tenantId || (req as any).tenantId || (req.headers["x-tenant-id"] as string) || getCurrentTenantId();
  if (!rawTenantId || !rawTenantId.trim()) {
    throw new TenantIsolationError("Zero Data Leak Policy Violation: A valid non-empty tenantId is strictly required for financial consolidation.", {
      correlationId,
    });
  }

  const tenantId = rawTenantId.trim();
  const userId = req.user?.userId || "SYSTEM";
  const role = req.user?.role;

  return {
    tenantId,
    userId,
    role,
    correlationId,
    requestId,
    ipAddress,
  };
}

/**
 * GET /api/consolidation/summary
 * Retrieves master group financial summary
 */
router.get("/summary", rbacGuards, async (req: AuthenticatedRequest, res: Response) => {
  let ctx: RequestContextInfo | undefined;
  try {
    ctx = resolveRequestContext(req, res);
    const force = req.query.refresh === "true";

    const summary = await runWithTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        correlationId: ctx.correlationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
      },
      () => ConsolidationService.generateMasterConsolidationSummary(ctx!.tenantId, ctx!.userId, force)
    );

    res.json(summary);
  } catch (err: unknown) {
    const errorPayload = formatErrorResponse(err, ctx?.correlationId);
    ConsolidationLogger.error("GET /api/consolidation/summary failed", err, {
      tenantId: ctx?.tenantId,
      correlationId: ctx?.correlationId,
      requestId: ctx?.requestId,
      component: "ConsolidationRouter",
    });
    res.status(errorPayload.statusCode).json(errorPayload);
  }
});

/**
 * GET /api/consolidation/balance-sheet
 * Retrieves Consolidated Balance Sheet
 */
router.get("/balance-sheet", rbacGuards, async (req: AuthenticatedRequest, res: Response) => {
  let ctx: RequestContextInfo | undefined;
  try {
    ctx = resolveRequestContext(req, res);
    const force = req.query.refresh === "true";

    const balanceSheet = await runWithTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        correlationId: ctx.correlationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
      },
      () => ConsolidationService.generateBalanceSheet(ctx!.tenantId, ctx!.userId, force)
    );

    res.json(balanceSheet);
  } catch (err: unknown) {
    const errorPayload = formatErrorResponse(err, ctx?.correlationId);
    ConsolidationLogger.error("GET /api/consolidation/balance-sheet failed", err, {
      tenantId: ctx?.tenantId,
      correlationId: ctx?.correlationId,
      requestId: ctx?.requestId,
      component: "ConsolidationRouter",
    });
    res.status(errorPayload.statusCode).json(errorPayload);
  }
});

/**
 * GET /api/consolidation/income-statement
 * Retrieves Consolidated Income Statement
 */
router.get("/income-statement", rbacGuards, async (req: AuthenticatedRequest, res: Response) => {
  let ctx: RequestContextInfo | undefined;
  try {
    ctx = resolveRequestContext(req, res);
    const force = req.query.refresh === "true";

    const incomeStatement = await runWithTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        correlationId: ctx.correlationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
      },
      () => ConsolidationService.generateIncomeStatement(ctx!.tenantId, ctx!.userId, force)
    );

    res.json(incomeStatement);
  } catch (err: unknown) {
    const errorPayload = formatErrorResponse(err, ctx?.correlationId);
    ConsolidationLogger.error("GET /api/consolidation/income-statement failed", err, {
      tenantId: ctx?.tenantId,
      correlationId: ctx?.correlationId,
      requestId: ctx?.requestId,
      component: "ConsolidationRouter",
    });
    res.status(errorPayload.statusCode).json(errorPayload);
  }
});

/**
 * GET /api/consolidation/cash-flow
 * Retrieves Consolidated Cash Flow
 */
router.get("/cash-flow", rbacGuards, async (req: AuthenticatedRequest, res: Response) => {
  let ctx: RequestContextInfo | undefined;
  try {
    ctx = resolveRequestContext(req, res);
    const force = req.query.refresh === "true";

    const cashFlow = await runWithTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        correlationId: ctx.correlationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
      },
      () => ConsolidationService.generateCashFlow(ctx!.tenantId, ctx!.userId, force)
    );

    res.json(cashFlow);
  } catch (err: unknown) {
    const errorPayload = formatErrorResponse(err, ctx?.correlationId);
    ConsolidationLogger.error("GET /api/consolidation/cash-flow failed", err, {
      tenantId: ctx?.tenantId,
      correlationId: ctx?.correlationId,
      requestId: ctx?.requestId,
      component: "ConsolidationRouter",
    });
    res.status(errorPayload.statusCode).json(errorPayload);
  }
});

/**
 * GET /api/consolidation/trial-balance
 * Retrieves Consolidated Trial Balance
 */
router.get("/trial-balance", rbacGuards, async (req: AuthenticatedRequest, res: Response) => {
  let ctx: RequestContextInfo | undefined;
  try {
    ctx = resolveRequestContext(req, res);
    const force = req.query.refresh === "true";

    const trialBalance = await runWithTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        correlationId: ctx.correlationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
      },
      () => ConsolidationService.generateTrialBalance(ctx!.tenantId, ctx!.userId, force)
    );

    res.json(trialBalance);
  } catch (err: unknown) {
    const errorPayload = formatErrorResponse(err, ctx?.correlationId);
    ConsolidationLogger.error("GET /api/consolidation/trial-balance failed", err, {
      tenantId: ctx?.tenantId,
      correlationId: ctx?.correlationId,
      requestId: ctx?.requestId,
      component: "ConsolidationRouter",
    });
    res.status(errorPayload.statusCode).json(errorPayload);
  }
});

/**
 * GET /api/consolidation/inventory
 * Retrieves Consolidated Inventory Valuation and velocity analytics
 */
router.get("/inventory", rbacGuards, async (req: AuthenticatedRequest, res: Response) => {
  let ctx: RequestContextInfo | undefined;
  try {
    ctx = resolveRequestContext(req, res);
    const force = req.query.refresh === "true";

    const inventory = await runWithTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        correlationId: ctx.correlationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
      },
      () => ConsolidationService.generateInventoryValuation(ctx!.tenantId, force)
    );

    res.json(inventory);
  } catch (err: unknown) {
    const errorPayload = formatErrorResponse(err, ctx?.correlationId);
    ConsolidationLogger.error("GET /api/consolidation/inventory failed", err, {
      tenantId: ctx?.tenantId,
      correlationId: ctx?.correlationId,
      requestId: ctx?.requestId,
      component: "ConsolidationRouter",
    });
    res.status(errorPayload.statusCode).json(errorPayload);
  }
});

/**
 * GET /api/consolidation/metrics
 * Exposes real-time performance and financial observability metrics
 * Supports Prometheus exposition format via Accept: text/plain
 */
router.get("/metrics", rbacGuards, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const acceptHeader = req.headers["accept"] || "";
    if (acceptHeader.includes("text/plain")) {
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.send(ConsolidationMetrics.toPrometheusFormat());
      return;
    }

    const tenantId = req.user?.tenantId || (req.headers["x-tenant-id"] as string);
    const snapshot = ConsolidationMetrics.getSnapshot(tenantId);
    res.json(snapshot);
  } catch (err: unknown) {
    const errorPayload = formatErrorResponse(err);
    res.status(errorPayload.statusCode).json(errorPayload);
  }
});

/**
 * GET /api/consolidation/health
 * Lightweight liveness and financial integrity check
 */
router.get("/health", rbacGuards, async (_req: AuthenticatedRequest, res: Response) => {
  const snapshot = ConsolidationMetrics.getSnapshot();
  res.json({
    status: "UP",
    activeCalculations: snapshot.activeCalculations,
    cacheHitRatio: snapshot.globalSummary.cacheHitRatio,
    imbalanceCount: snapshot.globalSummary.imbalanceCount,
    uptimeSeconds: snapshot.uptimeSeconds,
    timestamp: new Date().toISOString(),
  });
});

export { router as consolidationRouter };
