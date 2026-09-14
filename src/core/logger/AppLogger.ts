import { BaseAppError } from '../errors/BaseAppError';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export class AppLogger {
  private static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  public static debug(message: string, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    if (this.isProduction()) return; // Disable debug in production
    console.debug(`[DEBUG] [${module}] [${new Date().toISOString()}] ${message}`, metadata || '');
  }

  public static info(message: string, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    console.info(`[INFO] [${module}] [${new Date().toISOString()}] ${message}`, metadata || '');
  }

  public static warn(message: string, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    console.warn(`[WARN] [${module}] [${new Date().toISOString()}] ${message}`, metadata || '');
  }

  public static error(errorOrMsg: string | BaseAppError | Error, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    if (errorOrMsg instanceof BaseAppError) {
      console.error(
        `[ERROR] [${errorOrMsg.module}] [${errorOrMsg.code}] [${errorOrMsg.timestamp}] ${errorOrMsg.message}`,
        {
          arabicMessage: errorOrMsg.arabicMessage,
          severity: errorOrMsg.severity,
          metadata: { ...errorOrMsg.metadata, ...metadata },
          stack: errorOrMsg.stack,
        }
      );
    } else if (errorOrMsg instanceof Error) {
      console.error(`[ERROR] [${module}] [${new Date().toISOString()}] ${errorOrMsg.message}`, {
        stack: errorOrMsg.stack,
        metadata,
      });
    } else {
      console.error(`[ERROR] [${module}] [${new Date().toISOString()}] ${errorOrMsg}`, metadata || '');
    }
  }

  public static critical(errorOrMsg: string | BaseAppError | Error, metadata?: Record<string, unknown>, module = 'SYSTEM'): void {
    if (errorOrMsg instanceof BaseAppError) {
      console.error(
        `[CRITICAL 🚨] [${errorOrMsg.module}] [${errorOrMsg.code}] [${errorOrMsg.timestamp}] ${errorOrMsg.message}`,
        {
          arabicMessage: errorOrMsg.arabicMessage,
          severity: 'CRITICAL',
          metadata: { ...errorOrMsg.metadata, ...metadata },
          stack: errorOrMsg.stack,
        }
      );
    } else if (errorOrMsg instanceof Error) {
      console.error(`[CRITICAL 🚨] [${module}] [${new Date().toISOString()}] ${errorOrMsg.message}`, {
        stack: errorOrMsg.stack,
        metadata,
      });
    } else {
      console.error(`[CRITICAL 🚨] [${module}] [${new Date().toISOString()}] ${errorOrMsg}`, metadata || '');
    }
  }
}
