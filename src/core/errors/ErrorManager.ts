import { db } from '@/core/db';
import { BaseAppError } from './BaseAppError';
import { ErrorCode, DEFAULT_ARABIC_MESSAGES } from './errorCodes';
import { AppLogger } from '../logger/AppLogger';
import { useUIStore } from '@/store/useUIStore';
import { authService } from '@features/auth/services/authService';

export interface HandleErrorOptions {
  module?: string;
  userId?: string;
  action?: string;
  showToast?: boolean;
  metadata?: Record<string, unknown>;
}

export class ErrorManager {
  /**
   * Normalize any caught value (Error, string, object) into a standardized BaseAppError
   */
  public static normalizeError(
    error: unknown,
    fallbackModule = 'SYSTEM',
    defaultArabicMsg?: string
  ): BaseAppError {
    if (error instanceof BaseAppError) {
      return error;
    }

    if (error instanceof Error) {
      const msg = error.message || '';

      // Auto-detect error patterns
      if (msg.includes('مخزون') || msg.includes('الكمية غير كافية') || msg.includes('stock')) {
        return new BaseAppError({
          code: ErrorCode.ERR_INSUFFICIENT_STOCK,
          message: error.message,
          arabicMessage: defaultArabicMsg || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_INSUFFICIENT_STOCK],
          severity: 'HIGH',
          module: 'INVENTORY',
          originalError: error,
        });
      }

      if (msg.includes('مغلقة') || msg.includes('الفترة المحاسبية') || msg.includes('period')) {
        return new BaseAppError({
          code: ErrorCode.ERR_PERIOD_LOCKED,
          message: error.message,
          arabicMessage: defaultArabicMsg || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_PERIOD_LOCKED],
          severity: 'HIGH',
          module: 'ACCOUNTING',
          originalError: error,
        });
      }

      if (msg.includes('متوازن') || msg.includes('غير متساو') || msg.includes('unbalanced')) {
        return new BaseAppError({
          code: ErrorCode.ERR_ACCOUNTING_UNBALANCED,
          message: error.message,
          arabicMessage: defaultArabicMsg || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_ACCOUNTING_UNBALANCED],
          severity: 'HIGH',
          module: 'ACCOUNTING',
          originalError: error,
        });
      }

      if (msg.includes('مكرر') || msg.includes('duplicate') || msg.includes('UniqueConstraint')) {
        return new BaseAppError({
          code: ErrorCode.ERR_DUPLICATE_DOCUMENT,
          message: error.message,
          arabicMessage: defaultArabicMsg || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_DUPLICATE_DOCUMENT],
          severity: 'MEDIUM',
          module: fallbackModule,
          originalError: error,
        });
      }

      if (msg.includes('صلاحية') || msg.includes('permission') || msg.includes('denied')) {
        return new BaseAppError({
          code: ErrorCode.ERR_PERMISSION_DENIED,
          message: error.message,
          arabicMessage: defaultArabicMsg || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_PERMISSION_DENIED],
          severity: 'HIGH',
          module: 'AUTH',
          originalError: error,
        });
      }

      if (msg.includes('شبكة') || msg.includes('Network') || msg.includes('fetch')) {
        return new BaseAppError({
          code: ErrorCode.ERR_NETWORK,
          message: error.message,
          arabicMessage: defaultArabicMsg || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_NETWORK],
          severity: 'MEDIUM',
          module: 'NETWORK',
          originalError: error,
        });
      }

      return new BaseAppError({
        code: ErrorCode.ERR_UNKNOWN,
        message: error.message,
        arabicMessage: defaultArabicMsg || error.message || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_UNKNOWN],
        severity: 'MEDIUM',
        module: fallbackModule,
        originalError: error,
      });
    }

    if (typeof error === 'string') {
      return new BaseAppError({
        code: ErrorCode.ERR_UNKNOWN,
        message: error,
        arabicMessage: defaultArabicMsg || error || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_UNKNOWN],
        severity: 'MEDIUM',
        module: fallbackModule,
      });
    }

    return new BaseAppError({
      code: ErrorCode.ERR_UNKNOWN,
      message: 'An unexpected error occurred',
      arabicMessage: defaultArabicMsg || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_UNKNOWN],
      severity: 'HIGH',
      module: fallbackModule,
      originalError: error,
    });
  }

  /**
   * Main entry point to process, log, record audit, and notify user about an error
   */
  public static handleError(error: unknown, options: HandleErrorOptions | string = {}): BaseAppError {
    const opts: HandleErrorOptions = typeof options === 'string' ? { module: options } : options;
    const fallbackModule = opts.module || 'SYSTEM';

    const normalized = this.normalizeError(error, fallbackModule);
    if (opts.metadata) {
      Object.assign(normalized.metadata, opts.metadata);
    }

    // 1. Log to developer console / logger
    if (normalized.severity === 'CRITICAL') {
      AppLogger.critical(normalized);
    } else {
      AppLogger.error(normalized);
    }

    // 2. Audit Log persistence
    const currentUser = opts.userId || authService.getCurrentUser()?.User_Email || (authService.getCurrentUser() as any)?.Username || 'SYSTEM';
    const action = opts.action || 'ERROR_OCCURRED';
    const auditDetails = `[Code: ${normalized.code}] [Module: ${normalized.module}] [Message: ${normalized.message}] [ArabicMsg: ${normalized.arabicMessage}]`;

    // Async background logging to avoid blocking execution
    setTimeout(async () => {
      try {
        await db.addAuditLog(currentUser, action, normalized.module, auditDetails);
      } catch (e) {
        AppLogger.warn('Failed to save audit log for error', { logError: e });
      }

      try {
        const errorEntry = {
          id: `ERR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          Error_ID: normalized.code,
          Module_Name: normalized.module,
          Error_Message: `${normalized.message} | ${normalized.arabicMessage}`,
          Record_ID: (normalized.metadata?.recordId as string) || 'N/A',
          User_Email: currentUser,
          Timestamp: normalized.timestamp,
        };
        await db.System_Error_Log.add(errorEntry);
      } catch (e) {
        // Silent catch for secondary error log table
      }
    }, 0);

    // 3. User Toast Notification if required or default true for UI operations
    if (opts.showToast !== false) {
      try {
        const toastType = normalized.severity === 'CRITICAL' || normalized.severity === 'HIGH' ? 'error' : 'warning';
        useUIStore.getState().addToast(normalized.arabicMessage, toastType);
      } catch (e) {
        // UI store not initialized or running in non-React worker context
      }
    }

    return normalized;
  }

  /**
   * Helper retry function with exponential backoff
   */
  public static async retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        throw this.normalizeError(error);
      }
      await new Promise(r => setTimeout(r, delay));
      return this.retry(fn, retries - 1, delay * 2);
    }
  }

  /**
   * Logging automation-specific non-blocking errors
   */
  public static logAutomationError(module: string, message: string, recordId = 'N/A') {
    const normalized = new BaseAppError({
      code: ErrorCode.ERR_TRANSACTION_FAILED,
      message: `Automation Failure: ${message}`,
      arabicMessage: `تنبيه أتمتة النظام: ${message}`,
      severity: 'MEDIUM',
      module,
      metadata: { recordId },
    });

    this.handleError(normalized, {
      module,
      action: 'AUTOMATION_ERROR',
      showToast: true,
    });
  }
}
