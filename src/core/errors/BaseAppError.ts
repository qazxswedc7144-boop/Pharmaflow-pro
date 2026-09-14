import { ErrorCode, ErrorSeverity, DEFAULT_ARABIC_MESSAGES } from './errorCodes';

export interface BaseAppErrorParams {
  code?: ErrorCode;
  message: string;
  arabicMessage?: string;
  severity?: ErrorSeverity;
  module?: string;
  metadata?: Record<string, unknown>;
  originalError?: unknown;
}

export class BaseAppError extends Error {
  public readonly code: ErrorCode;
  public readonly arabicMessage: string;
  public readonly severity: ErrorSeverity;
  public readonly module: string;
  public readonly timestamp: string;
  public readonly metadata: Record<string, unknown>;
  public readonly originalError?: unknown;

  constructor(params: BaseAppErrorParams) {
    super(params.message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.code = params.code || ErrorCode.ERR_UNKNOWN;
    this.arabicMessage = params.arabicMessage || DEFAULT_ARABIC_MESSAGES[this.code] || DEFAULT_ARABIC_MESSAGES[ErrorCode.ERR_UNKNOWN];
    this.severity = params.severity || 'MEDIUM';
    this.module = params.module || 'SYSTEM';
    this.timestamp = new Date().toISOString();
    this.metadata = params.metadata || {};
    this.originalError = params.originalError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      arabicMessage: this.arabicMessage,
      severity: this.severity,
      module: this.module,
      timestamp: this.timestamp,
      metadata: this.metadata,
      ...(isProd ? {} : { stack: this.stack }),
    };
  }
}
