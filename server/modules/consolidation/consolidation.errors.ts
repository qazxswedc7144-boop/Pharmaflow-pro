// server/modules/consolidation/consolidation.errors.ts
// Enterprise Financial Consolidation Error Taxonomy

export interface StandardErrorPayload {
  error: string;
  code: string;
  message: string;
  statusCode: number;
  correlationId?: string;
  tenantId?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export class ConsolidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly tenantId?: string;
  public readonly correlationId?: string;
  public readonly details?: Record<string, any>;
  public readonly timestamp: string;

  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      tenantId?: string;
      correlationId?: string;
      details?: Record<string, any>;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || "CONSOLIDATION_ERROR";
    this.statusCode = options.statusCode || 500;
    this.tenantId = options.tenantId;
    this.correlationId = options.correlationId;
    this.details = options.details;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): StandardErrorPayload {
    return {
      error: this.code,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      correlationId: this.correlationId,
      tenantId: this.tenantId,
      timestamp: this.timestamp,
      details: this.details,
    };
  }
}

/**
 * Thrown when a request lacks a valid tenantId or attempts cross-tenant boundary breach.
 */
export class TenantIsolationError extends ConsolidationError {
  constructor(message: string, options: { tenantId?: string; correlationId?: string; details?: Record<string, any> } = {}) {
    super(message, {
      code: "TENANT_ISOLATION_VIOLATION",
      statusCode: 403,
      ...options,
    });
  }
}

/**
 * Emitted when fundamental financial invariants fail (e.g. Assets !== Liabilities + Equity).
 */
export class FinancialIntegrityError extends ConsolidationError {
  constructor(message: string, options: { tenantId?: string; correlationId?: string; details?: Record<string, any> } = {}) {
    super(message, {
      code: "FINANCIAL_INTEGRITY_VIOLATION",
      statusCode: 422,
      ...options,
    });
  }
}

/**
 * Thrown when a calculation fails due to unrecoverable domain arithmetic errors.
 */
export class ConsolidationCalculationError extends ConsolidationError {
  constructor(message: string, options: { tenantId?: string; correlationId?: string; details?: Record<string, any> } = {}) {
    super(message, {
      code: "CONSOLIDATION_CALCULATION_ERROR",
      statusCode: 500,
      ...options,
    });
  }
}

/**
 * Thrown when the underlying database is unreachable or queries time out.
 */
export class DatabaseUnavailableError extends ConsolidationError {
  constructor(message: string, options: { tenantId?: string; correlationId?: string; details?: Record<string, any> } = {}) {
    super(message, {
      code: "DATABASE_UNAVAILABLE",
      statusCode: 503,
      ...options,
    });
  }
}

/**
 * Thrown when cache interactions fail fatally (non-fatal errors are logged as warnings).
 */
export class ConsolidationCacheError extends ConsolidationError {
  constructor(message: string, options: { tenantId?: string; correlationId?: string; details?: Record<string, any> } = {}) {
    super(message, {
      code: "CONSOLIDATION_CACHE_ERROR",
      statusCode: 500,
      ...options,
    });
  }
}

/**
 * Formats any caught error into a standardized enterprise error payload for API responses.
 */
export function formatErrorResponse(err: unknown, fallbackCorrelationId?: string): StandardErrorPayload {
  if (err instanceof ConsolidationError) {
    const payload = err.toJSON();
    if (!payload.correlationId && fallbackCorrelationId) {
      payload.correlationId = fallbackCorrelationId;
    }
    return payload;
  }

  const message = err instanceof Error ? err.message : "An unexpected consolidation error occurred.";
  return {
    error: "CONSOLIDATION_FAILED",
    code: "CONSOLIDATION_FAILED",
    message,
    statusCode: 500,
    correlationId: fallbackCorrelationId,
    timestamp: new Date().toISOString(),
  };
}
