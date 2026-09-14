import { BaseAppError, BaseAppErrorParams } from './BaseAppError';
import { ErrorCode, ErrorSeverity } from './errorCodes';

function normalizeParams(
  input: string | Partial<BaseAppErrorParams>,
  defaultCode: ErrorCode,
  defaultSeverity: ErrorSeverity,
  defaultModule: string
): BaseAppErrorParams {
  if (typeof input === 'string') {
    return {
      message: input,
      code: defaultCode,
      severity: defaultSeverity,
      module: defaultModule,
    };
  }
  return {
    ...input,
    message: input.message || 'Error occurred',
    code: input.code || defaultCode,
    severity: input.severity || defaultSeverity,
    module: input.module || defaultModule,
  };
}

export class ValidationError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_VALIDATION_FAILED, 'LOW', 'VALIDATION'));
  }
}

export class InsufficientStockError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_INSUFFICIENT_STOCK, 'HIGH', 'INVENTORY'));
  }
}

export class AccountingError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_ACCOUNTING_UNBALANCED, 'HIGH', 'ACCOUNTING'));
  }
}

export class InventoryError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_INSUFFICIENT_STOCK, 'MEDIUM', 'INVENTORY'));
  }
}

export class PeriodLockedError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_PERIOD_LOCKED, 'HIGH', 'ACCOUNTING'));
  }
}

export class DuplicateDocumentError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_DUPLICATE_DOCUMENT, 'MEDIUM', 'SYSTEM'));
  }
}

export class AuthorizationError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_PERMISSION_DENIED, 'HIGH', 'AUTH'));
  }
}

export class TransactionError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_TRANSACTION_FAILED, 'CRITICAL', 'TRANSACTION'));
  }
}

export class DatabaseError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_DATABASE, 'CRITICAL', 'DATABASE'));
  }
}

export class NetworkError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_NETWORK, 'MEDIUM', 'NETWORK'));
  }
}

export class SecurityError extends BaseAppError {
  constructor(input: string | Partial<BaseAppErrorParams>) {
    super(normalizeParams(input, ErrorCode.ERR_PERMISSION_DENIED, 'HIGH', 'SECURITY'));
  }
}
