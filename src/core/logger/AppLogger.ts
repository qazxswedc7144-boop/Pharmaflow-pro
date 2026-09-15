import { BaseAppError } from '../errors/BaseAppError';
import { observabilityService } from '@/core/observability/observabilityService';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export class AppLogger {
  private static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  public static debug(message: string, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    if (this.isProduction()) return;
    observabilityService.recordInfo(`[DEBUG] ${message}`, { feature: module }, metadata).catch(() => {});
  }

  public static info(message: string, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    observabilityService.recordInfo(message, { feature: module }, metadata).catch(() => {});
  }

  public static warn(message: string, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    observabilityService.recordWarning(message, { feature: module }, metadata).catch(() => {});
  }

  public static error(errorOrMsg: string | BaseAppError | Error, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    const err = typeof errorOrMsg === 'string'
      ? new Error(errorOrMsg)
      : errorOrMsg;

    const feature = err instanceof BaseAppError ? err.module || module : module;
    observabilityService.recordError(err, { feature }, undefined, 'ERROR').catch(() => {});
    if (metadata) {
      observabilityService.recordInfo(`Error Metadata for [${feature}]`, { feature }, metadata).catch(() => {});
    }
  }

  public static critical(errorOrMsg: string | BaseAppError | Error, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    const err = typeof errorOrMsg === 'string'
      ? new Error(errorOrMsg)
      : errorOrMsg;

    const feature = err instanceof BaseAppError ? err.module || module : module;
    observabilityService.recordError(err, { feature }, undefined, 'CRITICAL').catch(() => {});
    if (metadata) {
      observabilityService.recordInfo(`Critical Error Metadata for [${feature}]`, { feature }, metadata).catch(() => {});
    }
  }
}

