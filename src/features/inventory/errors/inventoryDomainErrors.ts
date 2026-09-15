// src/features/inventory/errors/inventoryDomainErrors.ts
/**
 * PharmaFlow PRO ERP — Inventory Domain Errors
 * Phase 5 — Step 1: Foundation
 */

import { BaseAppError } from '@/core/errors/BaseAppError';
import { ErrorCode } from '@/core/errors/errorCodes';
import { InsufficientStockError } from '@/core/errors/customErrors';

export { InsufficientStockError };

export class ProductNotFoundError extends BaseAppError {
  constructor(productId: string, metadata?: Record<string, unknown>) {
    super({
      code: ErrorCode.ERR_VALIDATION_FAILED,
      message: `Product with ID '${productId}' was not found in inventory catalog.`,
      arabicMessage: `الصنف المطلوب غير موجود في الكتالوج (المعرف: ${productId}).`,
      severity: 'HIGH',
      module: 'INVENTORY',
      metadata: { productId, ...metadata }
    });
  }
}

export class ProductInactiveError extends BaseAppError {
  constructor(productId: string, productName?: string, metadata?: Record<string, unknown>) {
    super({
      code: ErrorCode.ERR_VALIDATION_FAILED,
      message: `Product '${productName || productId}' is inactive and cannot undergo inventory mutations.`,
      arabicMessage: `الصنف '${productName || productId}' موقوف/غير نشط ولا يمكن إجراء حركات مخزنية عليه.`,
      severity: 'HIGH',
      module: 'INVENTORY',
      metadata: { productId, productName, ...metadata }
    });
  }
}

export class InvalidWarehouseError extends BaseAppError {
  constructor(warehouseId: string, metadata?: Record<string, unknown>) {
    super({
      code: ErrorCode.ERR_VALIDATION_FAILED,
      message: `Warehouse with ID '${warehouseId}' is invalid or does not exist.`,
      arabicMessage: `المستودع المحدد (${warehouseId}) غير صالح أو غير موجود.`,
      severity: 'HIGH',
      module: 'INVENTORY',
      metadata: { warehouseId, ...metadata }
    });
  }
}

export class DuplicateMutationError extends BaseAppError {
  constructor(idempotencyKey: string, existingTxId?: string, metadata?: Record<string, unknown>) {
    super({
      code: ErrorCode.ERR_DUPLICATE_DOCUMENT,
      message: `Inventory mutation with idempotency key '${idempotencyKey}' has already been processed (TxID: ${existingTxId || 'N/A'}).`,
      arabicMessage: `تمت معالجة هذه الحركة المخزنية مسبقاً (مفتاح التكرار: ${idempotencyKey}).`,
      severity: 'MEDIUM',
      module: 'INVENTORY',
      metadata: { idempotencyKey, existingTxId, ...metadata }
    });
  }
}

export class PeriodLockedInventoryError extends BaseAppError {
  constructor(dateStr: string, operation?: string, metadata?: Record<string, unknown>) {
    super({
      code: ErrorCode.ERR_PERIOD_LOCKED,
      message: `Cannot mutate inventory: accounting period is locked for date ${dateStr}.`,
      arabicMessage: `لا يمكن إجراء حركة مخزنية: الفترة المحاسبية لتاريخ (${dateStr}) مغلقة.`,
      severity: 'HIGH',
      module: 'INVENTORY',
      metadata: { dateStr, operation, ...metadata }
    });
  }
}
