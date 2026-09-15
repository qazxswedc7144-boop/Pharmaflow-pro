// server/modules/consolidation/consolidation.service.ts
// Production Financial Consolidation Service (Zero Fake Multipliers, Zero Plugs)
// Integrated with Centralized Audit, Structured Logging, Metrics, and Financial Integrity Observability

import { randomUUID } from "crypto";
const uuidv4 = () => randomUUID();

import { ConsolidationRepository } from "./consolidation.repository";
import { CONSOLIDATION_DEFAULTS } from "./consolidation.constants";
import { RedisConnectionManager } from "../../database/redis";
import { getCurrentTenantId, getCorrelationId, getRequestId } from "../../context/tenantContext";
import {
  ConsolidatedBalanceSheet,
  ConsolidatedIncomeStatement,
  ConsolidatedCashFlow,
  ConsolidatedTrialBalance,
  ConsolidatedInventoryValuation,
  AIConsolidationInsights,
  ConsolidationSummary,
} from "./consolidation.types";

import { LedgerBalanceCalculator } from "./calculators/ledger-balance.calculator";
import { InventoryValuationCalculator } from "./calculators/inventory-valuation.calculator";
import { FinancialStatementCalculator } from "./calculators/financial-statement.calculator";
import { CashFlowCalculator } from "./calculators/cash-flow.calculator";
import { TrialBalanceCalculator } from "./calculators/trial-balance.calculator";

import { ConsolidationLogger } from "./consolidation.logger";
import { ConsolidationMetrics } from "./consolidation.metrics";
import { ConsolidationAuditService } from "./consolidation.audit";
import { ConsolidationIntegrityMonitor } from "./consolidation.integrity";
import {
  ConsolidationError,
  ConsolidationCalculationError,
} from "./consolidation.errors";

export class ConsolidationService {
  private static async getGeminiClient(): Promise<any> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      ConsolidationLogger.debug("[GEMINI WORKER] No GEMINI_API_KEY in environment. Fallback deterministic rules active.", {
        component: "ConsolidationService",
      });
      return null;
    }
    try {
      const mod = await Function("return import('@google/genai')")();
      const GoogleGenAIClass = mod.GoogleGenAI;
      return new GoogleGenAIClass({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (e) {
      ConsolidationLogger.warn("[GEMINI CLIENT] Failed to initialize GoogleGenAI client:", {
        component: "ConsolidationService",
        context: { error: e instanceof Error ? e.message : String(e) },
      });
      return null;
    }
  }

  private static tryParse<T>(value: string | null): T | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Generates Consolidated Balance Sheet
   * Source of Truth: General Ledger & Physical Inventory Valuation
   * Zero Fake Multipliers (No * 15, no * 0.85)
   * Zero Balancing Plugs (Retained Earnings is derived from actual accounts, not Assets - Liab - Capital)
   */
  static async generateBalanceSheet(
    tenantId: string = getCurrentTenantId(),
    userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedBalanceSheet> {
    const validTenantId = ConsolidationRepository.assertValidTenantId(tenantId);
    const correlationId = getCorrelationId() || uuidv4();
    const requestId = getRequestId() || uuidv4();
    const startTime = performance.now();

    ConsolidationMetrics.incrementActive();

    try {
      const cacheKey = `${CONSOLIDATION_DEFAULTS.BALANCE_SHEET_CACHE_KEY}:${validTenantId}`;
      if (!forceRefresh) {
        const cached = await RedisConnectionManager.get(cacheKey);
        if (cached) {
          const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
          const parsed = JSON.parse(cached) as ConsolidatedBalanceSheet;

          ConsolidationMetrics.recordExecution({
            reportType: "BALANCE_SHEET",
            tenantId: validTenantId,
            durationMs,
            status: "SUCCESS",
            cacheStatus: "HIT",
          });

          ConsolidationLogger.info("Consolidated Balance Sheet cache hit", {
            tenantId: validTenantId,
            correlationId,
            requestId,
            durationMs,
            component: "ConsolidationService",
          });

          return parsed;
        }
      }

      const [branches, journalLines, inventoryValuation, completedTransfers, products] = await Promise.all([
        ConsolidationRepository.getBranches(validTenantId),
        ConsolidationRepository.getAllPostedJournalLines(validTenantId),
        this.generateInventoryValuation(validTenantId, forceRefresh),
        ConsolidationRepository.getCompletedBranchTransfers(validTenantId),
        ConsolidationRepository.getProductCatalog(validTenantId),
      ]);

      const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

      // Compute current period net income from income statement for unclosed period equity reconciliation
      const incomeStatement = await this.generateIncomeStatement(validTenantId, userId, forceRefresh);

      const result = FinancialStatementCalculator.calculateBalanceSheet(
        ledgerState,
        inventoryValuation.totalInventoryValue,
        branches,
        completedTransfers,
        products,
        incomeStatement.netIncome
      );

      // Financial Integrity Verification
      const integrity = ConsolidationIntegrityMonitor.verifyBalanceSheet(result, validTenantId, correlationId);
      result.isBalanced = integrity.isBalanced;

      // Tenant-scoped Redis Cache
      await RedisConnectionManager.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
      );

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const fingerprint = ConsolidationAuditService.generateFingerprint(result);

      // Non-blocking Audit Logging
      await ConsolidationAuditService.recordAuditEvent({
        correlationId,
        requestId,
        tenantId: validTenantId,
        userId,
        action: "GENERATE_BALANCE_SHEET",
        reportType: "BALANCE_SHEET",
        status: integrity.isBalanced ? "SUCCESS" : "WARNING",
        durationMs,
        parameters: { forceRefresh },
        resultFingerprint: fingerprint,
        financialIntegrity: integrity,
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      // Performance Metrics Recording
      ConsolidationMetrics.recordExecution({
        reportType: "BALANCE_SHEET",
        tenantId: validTenantId,
        durationMs,
        status: integrity.isBalanced ? "SUCCESS" : "WARNING",
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
        isImbalanced: !integrity.isBalanced,
      });

      return result;
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      ConsolidationMetrics.recordExecution({
        reportType: "BALANCE_SHEET",
        tenantId: validTenantId,
        durationMs,
        status: "FAILURE",
        cacheStatus: "MISS",
      });

      ConsolidationLogger.error("Failed to generate Consolidated Balance Sheet", err, {
        tenantId: validTenantId,
        correlationId,
        requestId,
        durationMs,
        component: "ConsolidationService",
      });

      await ConsolidationAuditService.recordAuditEvent({
        correlationId,
        requestId,
        tenantId: validTenantId,
        userId,
        action: "GENERATE_BALANCE_SHEET",
        reportType: "BALANCE_SHEET",
        status: "FAILURE",
        durationMs,
        parameters: { forceRefresh },
        cacheStatus: "MISS",
        errorDetails: {
          code: err instanceof ConsolidationError ? err.code : "CALCULATION_ERROR",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
      });

      if (err instanceof ConsolidationError) throw err;
      throw new ConsolidationCalculationError(`Failed to generate balance sheet: ${err instanceof Error ? err.message : String(err)}`, {
        tenantId: validTenantId,
        correlationId,
      });
    } finally {
      ConsolidationMetrics.decrementActive();
    }
  }

  /**
   * Generates Consolidated Income Statement
   * Source of Truth: General Ledger & Actual Inter-Branch Internal Invoices
   * Zero Fake Multipliers (No * 0.1, no * 0.90)
   */
  static async generateIncomeStatement(
    tenantId: string = getCurrentTenantId(),
    userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedIncomeStatement> {
    const validTenantId = ConsolidationRepository.assertValidTenantId(tenantId);
    const correlationId = getCorrelationId() || uuidv4();
    const requestId = getRequestId() || uuidv4();
    const startTime = performance.now();

    ConsolidationMetrics.incrementActive();

    try {
      const cacheKey = `${CONSOLIDATION_DEFAULTS.INCOME_STATEMENT_CACHE_KEY}:${validTenantId}`;
      if (!forceRefresh) {
        const cached = await RedisConnectionManager.get(cacheKey);
        if (cached) {
          const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
          const parsed = JSON.parse(cached) as ConsolidatedIncomeStatement;

          ConsolidationMetrics.recordExecution({
            reportType: "INCOME_STATEMENT",
            tenantId: validTenantId,
            durationMs,
            status: "SUCCESS",
            cacheStatus: "HIT",
          });

          ConsolidationLogger.info("Consolidated Income Statement cache hit", {
            tenantId: validTenantId,
            correlationId,
            requestId,
            durationMs,
            component: "ConsolidationService",
          });

          return parsed;
        }
      }

      const [branches, journalLines, invoices, products] = await Promise.all([
        ConsolidationRepository.getBranches(validTenantId),
        ConsolidationRepository.getAllPostedJournalLines(validTenantId),
        ConsolidationRepository.getInvoices(validTenantId, 1, 1000, { type: "SALE" }),
        ConsolidationRepository.getProductCatalog(validTenantId),
      ]);

      const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

      const result = FinancialStatementCalculator.calculateIncomeStatement(
        ledgerState,
        branches,
        invoices,
        products
      );

      // Tenant-scoped Redis Cache
      await RedisConnectionManager.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
      );

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const fingerprint = ConsolidationAuditService.generateFingerprint(result);

      // Non-blocking Audit Logging
      await ConsolidationAuditService.recordAuditEvent({
        correlationId,
        requestId,
        tenantId: validTenantId,
        userId,
        action: "GENERATE_INCOME_STATEMENT",
        reportType: "INCOME_STATEMENT",
        status: "SUCCESS",
        durationMs,
        parameters: { forceRefresh },
        resultFingerprint: fingerprint,
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      // Performance Metrics Recording
      ConsolidationMetrics.recordExecution({
        reportType: "INCOME_STATEMENT",
        tenantId: validTenantId,
        durationMs,
        status: "SUCCESS",
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      return result;
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      ConsolidationMetrics.recordExecution({
        reportType: "INCOME_STATEMENT",
        tenantId: validTenantId,
        durationMs,
        status: "FAILURE",
        cacheStatus: "MISS",
      });

      ConsolidationLogger.error("Failed to generate Consolidated Income Statement", err, {
        tenantId: validTenantId,
        correlationId,
        requestId,
        durationMs,
        component: "ConsolidationService",
      });

      if (err instanceof ConsolidationError) throw err;
      throw new ConsolidationCalculationError(`Failed to generate income statement: ${err instanceof Error ? err.message : String(err)}`, {
        tenantId: validTenantId,
        correlationId,
      });
    } finally {
      ConsolidationMetrics.decrementActive();
    }
  }

  /**
   * Generates Consolidated Cash Flow Statement
   * Source of Truth: Real Cash Journal Lines & Exact Reconciliation with Balance Sheet
   * Zero Fake Multipliers (No * 0.90, no * 10, no fake 50000 baseline)
   */
  static async generateCashFlow(
    tenantId: string = getCurrentTenantId(),
    userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedCashFlow> {
    const validTenantId = ConsolidationRepository.assertValidTenantId(tenantId);
    const correlationId = getCorrelationId() || uuidv4();
    const requestId = getRequestId() || uuidv4();
    const startTime = performance.now();

    ConsolidationMetrics.incrementActive();

    try {
      const cacheKey = `${CONSOLIDATION_DEFAULTS.CASH_FLOW_CACHE_KEY}:${validTenantId}`;
      if (!forceRefresh) {
        const cached = await RedisConnectionManager.get(cacheKey);
        if (cached) {
          const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
          const parsed = JSON.parse(cached) as ConsolidatedCashFlow;

          ConsolidationMetrics.recordExecution({
            reportType: "CASH_FLOW",
            tenantId: validTenantId,
            durationMs,
            status: "SUCCESS",
            cacheStatus: "HIT",
          });

          ConsolidationLogger.info("Consolidated Cash Flow cache hit", {
            tenantId: validTenantId,
            correlationId,
            requestId,
            durationMs,
            component: "ConsolidationService",
          });

          return parsed;
        }
      }

      const [branches, journalLines, completedTransfers] = await Promise.all([
        ConsolidationRepository.getBranches(validTenantId),
        ConsolidationRepository.getAllPostedJournalLines(validTenantId),
        ConsolidationRepository.getCompletedBranchTransfers(validTenantId),
      ]);

      const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

      // Filter cash journal lines directly
      const cashJournalLines = journalLines.filter(line => {
        const category = LedgerBalanceCalculator.classifyAccount(
          line.account.type,
          line.account.code,
          line.account.name
        );
        return category === "CASH";
      });

      const result = CashFlowCalculator.calculate(
        ledgerState,
        cashJournalLines,
        branches,
        completedTransfers
      );

      // Financial Integrity Check: Reconcile with Balance Sheet cash
      const integrity = ConsolidationIntegrityMonitor.verifyCashFlow(
        result,
        ledgerState.cashTotal,
        validTenantId,
        correlationId
      );

      // Cache with tenant-scoped key
      await RedisConnectionManager.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
      );

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const fingerprint = ConsolidationAuditService.generateFingerprint(result);

      // Non-blocking Audit Logging
      await ConsolidationAuditService.recordAuditEvent({
        correlationId,
        requestId,
        tenantId: validTenantId,
        userId,
        action: "GENERATE_CASH_FLOW",
        reportType: "CASH_FLOW",
        status: integrity.isBalanced ? "SUCCESS" : "WARNING",
        durationMs,
        parameters: { forceRefresh },
        resultFingerprint: fingerprint,
        financialIntegrity: integrity,
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      ConsolidationMetrics.recordExecution({
        reportType: "CASH_FLOW",
        tenantId: validTenantId,
        durationMs,
        status: integrity.isBalanced ? "SUCCESS" : "WARNING",
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
        isImbalanced: !integrity.isBalanced,
      });

      return result;
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      ConsolidationMetrics.recordExecution({
        reportType: "CASH_FLOW",
        tenantId: validTenantId,
        durationMs,
        status: "FAILURE",
        cacheStatus: "MISS",
      });

      ConsolidationLogger.error("Failed to generate Consolidated Cash Flow", err, {
        tenantId: validTenantId,
        correlationId,
        requestId,
        durationMs,
        component: "ConsolidationService",
      });

      if (err instanceof ConsolidationError) throw err;
      throw new ConsolidationCalculationError(`Failed to generate cash flow: ${err instanceof Error ? err.message : String(err)}`, {
        tenantId: validTenantId,
        correlationId,
      });
    } finally {
      ConsolidationMetrics.decrementActive();
    }
  }

  /**
   * Generates Consolidated Trial Balance
   * Source of Truth: Complete Account Ledger with Debit == Credit Invariant Verification
   * Zero Fake Multipliers (No clearingRow.debit * 0.15)
   */
  static async generateTrialBalance(
    tenantId: string = getCurrentTenantId(),
    userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidatedTrialBalance> {
    const validTenantId = ConsolidationRepository.assertValidTenantId(tenantId);
    const correlationId = getCorrelationId() || uuidv4();
    const requestId = getRequestId() || uuidv4();
    const startTime = performance.now();

    ConsolidationMetrics.incrementActive();

    try {
      const cacheKey = `${CONSOLIDATION_DEFAULTS.TRIAL_BALANCE_CACHE_KEY}:${validTenantId}`;
      if (!forceRefresh) {
        const cached = await RedisConnectionManager.get(cacheKey);
        if (cached) {
          const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
          const parsed = JSON.parse(cached) as ConsolidatedTrialBalance;

          ConsolidationMetrics.recordExecution({
            reportType: "TRIAL_BALANCE",
            tenantId: validTenantId,
            durationMs,
            status: "SUCCESS",
            cacheStatus: "HIT",
          });

          ConsolidationLogger.info("Consolidated Trial Balance cache hit", {
            tenantId: validTenantId,
            correlationId,
            requestId,
            durationMs,
            component: "ConsolidationService",
          });

          return parsed;
        }
      }

      const [branches, journalLines, completedTransfers] = await Promise.all([
        ConsolidationRepository.getBranches(validTenantId),
        ConsolidationRepository.getAllPostedJournalLines(validTenantId),
        ConsolidationRepository.getCompletedBranchTransfers(validTenantId),
      ]);

      const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(journalLines, branches);

      const result = TrialBalanceCalculator.calculate(
        ledgerState,
        branches,
        completedTransfers
      );

      // Financial Integrity Verification
      const integrity = ConsolidationIntegrityMonitor.verifyTrialBalance(result, validTenantId, correlationId);
      result.isBalanced = integrity.isBalanced;

      // Cache with tenant-scoped key
      await RedisConnectionManager.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
      );

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const fingerprint = ConsolidationAuditService.generateFingerprint(result);

      // Non-blocking Audit Logging
      await ConsolidationAuditService.recordAuditEvent({
        correlationId,
        requestId,
        tenantId: validTenantId,
        userId,
        action: "GENERATE_TRIAL_BALANCE",
        reportType: "TRIAL_BALANCE",
        status: integrity.isBalanced ? "SUCCESS" : "WARNING",
        durationMs,
        parameters: { forceRefresh },
        resultFingerprint: fingerprint,
        financialIntegrity: integrity,
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      ConsolidationMetrics.recordExecution({
        reportType: "TRIAL_BALANCE",
        tenantId: validTenantId,
        durationMs,
        status: integrity.isBalanced ? "SUCCESS" : "WARNING",
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
        isImbalanced: !integrity.isBalanced,
      });

      return result;
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      ConsolidationMetrics.recordExecution({
        reportType: "TRIAL_BALANCE",
        tenantId: validTenantId,
        durationMs,
        status: "FAILURE",
        cacheStatus: "MISS",
      });

      ConsolidationLogger.error("Failed to generate Consolidated Trial Balance", err, {
        tenantId: validTenantId,
        correlationId,
        requestId,
        durationMs,
        component: "ConsolidationService",
      });

      if (err instanceof ConsolidationError) throw err;
      throw new ConsolidationCalculationError(`Failed to generate trial balance: ${err instanceof Error ? err.message : String(err)}`, {
        tenantId: validTenantId,
        correlationId,
      });
    } finally {
      ConsolidationMetrics.decrementActive();
    }
  }

  /**
   * Generates Consolidated Inventory Valuation & Velocity Analytics
   * Source of Truth: Real physical branch levels, actual batch FIFO costs, real catalog pricing, real sales
   * Zero Fallback Multipliers (No || 12, no || 15, no Math.random())
   */
  static async generateInventoryValuation(
    tenantId: string = getCurrentTenantId(),
    forceRefresh = false
  ): Promise<ConsolidatedInventoryValuation> {
    const validTenantId = ConsolidationRepository.assertValidTenantId(tenantId);
    const correlationId = getCorrelationId() || uuidv4();
    const requestId = getRequestId() || uuidv4();
    const startTime = performance.now();

    ConsolidationMetrics.incrementActive();

    try {
      const cacheKey = `${CONSOLIDATION_DEFAULTS.INVENTORY_CACHE_KEY}:${validTenantId}`;
      if (!forceRefresh) {
        const cached = await RedisConnectionManager.get(cacheKey);
        if (cached) {
          const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
          const parsed = JSON.parse(cached) as ConsolidatedInventoryValuation;

          ConsolidationMetrics.recordExecution({
            reportType: "INVENTORY_VALUATION",
            tenantId: validTenantId,
            durationMs,
            status: "SUCCESS",
            cacheStatus: "HIT",
          });

          ConsolidationLogger.info("Consolidated Inventory Valuation cache hit", {
            tenantId: validTenantId,
            correlationId,
            requestId,
            durationMs,
            component: "ConsolidationService",
          });

          return parsed;
        }
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const [branches, products, batches, inventoryLevels, recentSaleInvoices] = await Promise.all([
        ConsolidationRepository.getBranches(validTenantId),
        ConsolidationRepository.getProductCatalog(validTenantId),
        ConsolidationRepository.getInventoryBatches(validTenantId),
        ConsolidationRepository.getBranchInventoryLevels(validTenantId),
        ConsolidationRepository.getInvoices(validTenantId, 1, 1000, {
          startDate: ninetyDaysAgo,
          type: "SALE",
        }),
      ]);

      const result = InventoryValuationCalculator.calculate(
        inventoryLevels,
        products,
        batches,
        branches,
        recentSaleInvoices
      );

      // Cache with tenant-scoped key
      await RedisConnectionManager.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
      );

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const fingerprint = ConsolidationAuditService.generateFingerprint(result);

      // Non-blocking Audit Logging
      await ConsolidationAuditService.recordAuditEvent({
        correlationId,
        requestId,
        tenantId: validTenantId,
        userId: "SYSTEM",
        action: "GENERATE_INVENTORY_VALUATION",
        reportType: "INVENTORY_VALUATION",
        status: "SUCCESS",
        durationMs,
        parameters: { forceRefresh },
        resultFingerprint: fingerprint,
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      ConsolidationMetrics.recordExecution({
        reportType: "INVENTORY_VALUATION",
        tenantId: validTenantId,
        durationMs,
        status: "SUCCESS",
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      return result;
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      ConsolidationMetrics.recordExecution({
        reportType: "INVENTORY_VALUATION",
        tenantId: validTenantId,
        durationMs,
        status: "FAILURE",
        cacheStatus: "MISS",
      });

      ConsolidationLogger.error("Failed to generate Consolidated Inventory Valuation", err, {
        tenantId: validTenantId,
        correlationId,
        requestId,
        durationMs,
        component: "ConsolidationService",
      });

      if (err instanceof ConsolidationError) throw err;
      throw new ConsolidationCalculationError(`Failed to generate inventory valuation: ${err instanceof Error ? err.message : String(err)}`, {
        tenantId: validTenantId,
        correlationId,
      });
    } finally {
      ConsolidationMetrics.decrementActive();
    }
  }

  /**
   * AI Financial Insight Generational Pipeline with Gemini Observability & Deterministic Fallbacks
   * Interprets statistical output without modifying financial figures
   * Financial report delivery NEVER blocks on AI availability
   */
  static async generateAIInsights(
    balanceSheet: ConsolidatedBalanceSheet,
    incomeStatement: ConsolidatedIncomeStatement,
    inventory: ConsolidatedInventoryValuation
  ): Promise<AIConsolidationInsights> {
    const aiStartTime = performance.now();
    const ai = await this.getGeminiClient();

    const summaryContext = {
      activeBranches: Object.keys(balanceSheet.branchBreakdown).length,
      totalAssets: balanceSheet.assets.totalAssets,
      totalLiabilities: balanceSheet.liabilities.totalLiabilities,
      retainedEarnings: balanceSheet.equity.retainedEarnings,
      totalRevenue: incomeStatement.revenue,
      grossProfit: incomeStatement.grossProfit,
      opex: incomeStatement.operatingExpenses.totalOPEX,
      netIncome: incomeStatement.netIncome,
      totalInventoryQuantity: inventory.totalInventoryQuantity,
      totalInventoryValue: inventory.totalInventoryValue,
      branchInventorySplit: Object.entries(inventory.branchBreakdown).map(
        ([, d]) => `${d.branchName}: ${d.quantity} units, $${d.value}`
      ),
      slowMovingCount: inventory.slowMovingProducts.length,
      deadStockCount: inventory.deadStock.length,
      topSlowProducts: inventory.slowMovingProducts
        .slice(0, 3)
        .map(p => `${p.name} (SKU: ${p.sku}) Units: ${p.stockQuantity}`),
      warnings: inventory.deadStock
        .slice(0, 3)
        .map(d => `${d.name} has ${d.stockQuantity} dead units valued at $${d.totalValue}`),
    };

    let generatedText = "";
    let aiSuccess = false;

    if (ai) {
      try {
        const prompt = `
          Translate statistical metrics from a multi-branch pharmacy ERP system into highly professional, analytical, direct financial insights for the Board.
          
          Metrics Summary:
          - Active Branches: ${summaryContext.activeBranches}
          - Total Assets: $${summaryContext.totalAssets.toFixed(2)}
          - Total Liabilities: $${summaryContext.totalLiabilities.toFixed(2)}
          - Group Retained Earnings: $${summaryContext.retainedEarnings.toFixed(2)}
          - Consolidated Group Revenue: $${summaryContext.totalRevenue.toFixed(2)}
          - Gross profit: $${summaryContext.grossProfit.toFixed(2)}
          - OPEX: $${summaryContext.opex.toFixed(2)}
          - Consolidated Net Income: $${summaryContext.netIncome.toFixed(2)}
          - Inventory Stock quantity: ${summaryContext.totalInventoryQuantity} units
          - Group Inventory Value: $${summaryContext.totalInventoryValue.toFixed(2)}
          - Inventory Branch distribution: ${summaryContext.branchInventorySplit.join("; ")}
          - Slow moving indicators: ${summaryContext.warnings.join("; ")}

          Generate an objective financial analysis with exactly the following JSON structure model:
          {
            "revenueGrowthTrends": "Short professional explanation describing the current group revenue and sales potential...",
            "profitabilityAnalysis": "Analysis on gross profit margins and opex structures of the consolidated organization...",
            "inventoryTurnoverAnalysis": "Turnover metrics and deadstock reduction actions...",
            "stockRiskWarnings": ["Warning about overstocking in specific branches", "Dead stock alerts..."],
            "reorderRecommendations": [
              {
                "productId": "PID-01",
                "sku": "SKU-990",
                "productName": "Example Amoxicillin 500mg",
                "currentStock": 5,
                "reorderQuantity": 50,
                "percentageGap": 90
              }
            ]
          }

          RULES:
          - RETURN ONLY VALID PARSABLE JSON. No markdown code blocks like \`\`\`json.
          - Make recommendations mathematically accurate.
          - Do not praise or use sales hype. Keep it analytical and Swiss-school objective.
        `;

        const modelsList = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-flash-latest"];
        let response: any = null;
        let lastErr: any = null;

        for (const m of modelsList) {
          try {
            response = await ai.models.generateContent({
              model: m,
              contents: prompt,
              config: {
                responseMimeType: "application/json",
              },
            });
            break;
          } catch (modelErr) {
            lastErr = modelErr;
          }
        }

        if (!response && lastErr) {
          throw lastErr;
        }

        generatedText = response.text || "";
        aiSuccess = true;
      } catch (err) {
        ConsolidationLogger.warn(
          `[GEMINI OBSERVABILITY] AI content generation failed, switching to deterministic rule engine: ${err instanceof Error ? err.message : String(err)}`,
          {
            component: "ConsolidationService",
          }
        );
      }
    }

    const aiDurationMs = Math.round((performance.now() - aiStartTime) * 100) / 100;
    const parsed = this.tryParse<AIConsolidationInsights>(generatedText);

    if (parsed) {
      ConsolidationMetrics.recordAiCall(aiDurationMs, true, false);
      ConsolidationLogger.info(`AI Financial Insights generated successfully in ${aiDurationMs}ms`, {
        component: "ConsolidationService",
        durationMs: aiDurationMs,
      });
      return parsed;
    }

    // AI Fallback executed
    ConsolidationMetrics.recordAiCall(aiDurationMs, aiSuccess, true);

    // Deterministic Rule-Based Fallback
    const fallbackReorders = inventory.slowMovingProducts.slice(0, 3).map(p => ({
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      currentStock: p.stockQuantity,
      reorderQuantity: Math.max(10, Math.round(p.stockQuantity * 0.5)),
      percentageGap: p.stockQuantity < 10 ? 90 : 25,
    }));

    return {
      revenueGrowthTrends: `Consolidated revenue stands at $${summaryContext.totalRevenue.toLocaleString()} spread across ${summaryContext.activeBranches} branches.`,
      profitabilityAnalysis: `Gross profitability margin sits at ${
        summaryContext.totalRevenue > 0
          ? ((summaryContext.grossProfit / summaryContext.totalRevenue) * 100).toFixed(1)
          : 0
      }%. Operating expenses of $${summaryContext.opex.toLocaleString()} represent ${
        summaryContext.totalRevenue > 0
          ? ((summaryContext.opex / summaryContext.totalRevenue) * 100).toFixed(1)
          : 0
      }% of group revenue.`,
      inventoryTurnoverAnalysis: `Consolidated pharmacy inventory totals $${summaryContext.totalInventoryValue.toLocaleString()} representing ${summaryContext.totalInventoryQuantity.toLocaleString()} physical units across ${summaryContext.activeBranches} active branches.`,
      stockRiskWarnings: [
        summaryContext.deadStockCount > 0
          ? `${summaryContext.deadStockCount} inventory batches identified as expired or near expiry.`
          : `No critical batch expirations detected within the current 60-day audit horizon.`,
        summaryContext.slowMovingCount > 0
          ? `${summaryContext.slowMovingCount} product lines identified with low inventory turnover in the past 90 days.`
          : `Inventory movement rates across product catalog remain active.`,
      ],
      reorderRecommendations: fallbackReorders,
    };
  }

  /**
   * Generates Master Consolidated Summary containing all dashboards widgets and metrics
   * Read-only pure operation
   */
  static async generateMasterConsolidationSummary(
    tenantId: string = getCurrentTenantId(),
    userId = "SYSTEM",
    forceRefresh = false
  ): Promise<ConsolidationSummary> {
    const validTenantId = ConsolidationRepository.assertValidTenantId(tenantId);
    const correlationId = getCorrelationId() || uuidv4();
    const requestId = getRequestId() || uuidv4();
    const startTime = performance.now();

    ConsolidationMetrics.incrementActive();

    try {
      const cacheKey = `${CONSOLIDATION_DEFAULTS.DASHBOARD_CACHE_KEY}:${validTenantId}`;
      if (!forceRefresh) {
        const cached = await RedisConnectionManager.get(cacheKey);
        if (cached) {
          const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
          const parsed = JSON.parse(cached) as ConsolidationSummary;

          ConsolidationMetrics.recordExecution({
            reportType: "MASTER_SUMMARY",
            tenantId: validTenantId,
            durationMs,
            status: "SUCCESS",
            cacheStatus: "HIT",
          });

          ConsolidationLogger.info("Consolidated Master Summary cache hit", {
            tenantId: validTenantId,
            correlationId,
            requestId,
            durationMs,
            component: "ConsolidationService",
          });

          return parsed;
        }
      }

      const [balanceSheet, incomeStatement, inventory] = await Promise.all([
        this.generateBalanceSheet(validTenantId, userId, forceRefresh),
        this.generateIncomeStatement(validTenantId, userId, forceRefresh),
        this.generateInventoryValuation(validTenantId, forceRefresh),
      ]);

      const insights = await this.generateAIInsights(balanceSheet, incomeStatement, inventory);

      const result: ConsolidationSummary = {
        runId: uuidv4(),
        timestamp: new Date().toISOString(),
        aggregateRevenue: incomeStatement.revenue,
        aggregateNetIncome: incomeStatement.netIncome,
        aggregateAssets: balanceSheet.assets.totalAssets,
        aggregateLiabilities: balanceSheet.liabilities.totalLiabilities,
        aggregateEquity: balanceSheet.equity.totalEquity,
        aggregateInventoryValue: inventory.totalInventoryValue,
        totalEliminationsDone: balanceSheet.eliminations.length + incomeStatement.eliminations.length,
        activeBranchesCount: Object.keys(balanceSheet.branchBreakdown).length,
        insights,
      };

      await RedisConnectionManager.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        CONSOLIDATION_DEFAULTS.CACHE_TTL_SECONDS
      );

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const fingerprint = ConsolidationAuditService.generateFingerprint(result);

      // Non-blocking Audit Logging
      await ConsolidationAuditService.recordAuditEvent({
        correlationId,
        requestId,
        tenantId: validTenantId,
        userId,
        action: "GENERATE_MASTER_SUMMARY",
        reportType: "MASTER_SUMMARY",
        status: "SUCCESS",
        durationMs,
        parameters: { forceRefresh },
        resultFingerprint: fingerprint,
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      ConsolidationMetrics.recordExecution({
        reportType: "MASTER_SUMMARY",
        tenantId: validTenantId,
        durationMs,
        status: "SUCCESS",
        cacheStatus: forceRefresh ? "BYPASS" : "MISS",
      });

      return result;
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      ConsolidationMetrics.recordExecution({
        reportType: "MASTER_SUMMARY",
        tenantId: validTenantId,
        durationMs,
        status: "FAILURE",
        cacheStatus: "MISS",
      });

      ConsolidationLogger.error("Failed to generate Consolidated Master Summary", err, {
        tenantId: validTenantId,
        correlationId,
        requestId,
        durationMs,
        component: "ConsolidationService",
      });

      if (err instanceof ConsolidationError) throw err;
      throw new ConsolidationCalculationError(`Failed to generate master summary: ${err instanceof Error ? err.message : String(err)}`, {
        tenantId: validTenantId,
        correlationId,
      });
    } finally {
      ConsolidationMetrics.decrementActive();
    }
  }
}
