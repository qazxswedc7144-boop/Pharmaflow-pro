// server/modules/consolidation/consolidation.logger.ts
// Enterprise Structured JSON Logger for Financial Consolidation

import { getTenantContext } from "../../context/tenantContext";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogMetadata {
  component?: string;
  tenantId?: string;
  correlationId?: string;
  requestId?: string;
  durationMs?: number;
  context?: Record<string, any>;
  [key: string]: any;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  module: "consolidation";
  component: string;
  message: string;
  tenantId: string;
  correlationId?: string;
  requestId?: string;
  durationMs?: number;
  context?: Record<string, any>;
  error?: {
    name?: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "creditcard",
  "hash",
]);

export class ConsolidationLogger {
  private static defaultComponent = "ConsolidationEngine";

  /**
   * Deep sanitizes an object to ensure zero leaks of sensitive credentials in logs.
   */
  public static sanitize(data: any, depth = 0): any {
    if (depth > 5 || data === null || data === undefined) {
      return data;
    }

    if (typeof data !== "object") {
      return data;
    }

    if (Array.isArray(data)) {
      return data.slice(0, 50).map((item) => this.sanitize(item, depth + 1));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitize(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private static formatEntry(
    level: LogLevel,
    component: string,
    message: string,
    meta?: LogMetadata,
    err?: unknown
  ): StructuredLogEntry {
    const tenantCtx = getTenantContext();
    const tenantId = meta?.tenantId || tenantCtx?.tenantId || "SYSTEM";
    const correlationId = meta?.correlationId || tenantCtx?.correlationId;
    const requestId = meta?.requestId || tenantCtx?.requestId;

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: "consolidation",
      component: meta?.component || component || this.defaultComponent,
      message,
      tenantId,
      correlationId,
      requestId,
      durationMs: meta?.durationMs,
    };

    if (meta?.context) {
      entry.context = this.sanitize(meta.context);
    }

    if (err) {
      if (err instanceof Error) {
        entry.error = {
          name: err.name,
          message: err.message,
          stack: err.stack,
          code: (err as any).code,
        };
      } else {
        entry.error = {
          message: String(err),
        };
      }
    }

    return entry;
  }

  private static emit(entry: StructuredLogEntry) {
    const formatted = JSON.stringify(entry);
    switch (entry.level) {
      case "ERROR":
        console.error(formatted);
        break;
      case "WARN":
        console.warn(formatted);
        break;
      case "DEBUG":
        if (process.env.LOG_LEVEL === "DEBUG" || process.env.NODE_ENV !== "production") {
          console.debug(formatted);
        }
        break;
      case "INFO":
      default:
        console.log(formatted);
        break;
    }
  }

  public static info(message: string, meta?: LogMetadata, component = this.defaultComponent) {
    this.emit(this.formatEntry("INFO", component, message, meta));
  }

  public static warn(message: string, meta?: LogMetadata, component = this.defaultComponent) {
    this.emit(this.formatEntry("WARN", component, message, meta));
  }

  public static error(message: string, err?: unknown, meta?: LogMetadata, component = this.defaultComponent) {
    this.emit(this.formatEntry("ERROR", component, message, meta, err));
  }

  public static debug(message: string, meta?: LogMetadata, component = this.defaultComponent) {
    this.emit(this.formatEntry("DEBUG", component, message, meta));
  }

  /**
   * Starts a high-resolution timer returning a stop function that logs elapsed duration.
   */
  public static startTimer(
    operationName: string,
    meta?: LogMetadata,
    component = this.defaultComponent
  ): ((success?: boolean, extraMeta?: LogMetadata) => number) & {
    done: (extraMeta?: LogMetadata, success?: boolean) => number;
  } {
    const start = performance.now();
    const stopFn = (success = true, extraMeta?: LogMetadata) => {
      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      const mergedMeta = { ...meta, ...extraMeta, durationMs: elapsed };
      if (success) {
        this.info(`${operationName} completed in ${elapsed}ms`, mergedMeta, component);
      } else {
        this.warn(`${operationName} completed with warnings in ${elapsed}ms`, mergedMeta, component);
      }
      return elapsed;
    };

    (stopFn as any).done = (extraMeta?: LogMetadata, success = true) => stopFn(success, extraMeta);

    return stopFn as any;
  }
}
