// src/types/common.types.ts
import { SyncableEntity as BaseSyncableEntity, SyncStatus as DomainSyncStatus, PaymentStatus as DomainPaymentStatus } from "../domain";

export type SyncStatus = DomainSyncStatus;
export type PaymentStatus = DomainPaymentStatus;
export type SystemStatus = 'ACTIVE' | 'RECOVERY_MODE' | 'MAINTENANCE';

export type SyncableEntity = BaseSyncableEntity;

export type SubscriptionPlan = 'Free' | 'Basic' | 'Pro';
export type TenantStatus = 'Active' | 'Suspended' | 'Expired';

import {
  BaseAppError as AppError,
  ValidationError,
  AccountingError,
  InventoryError,
  SecurityError,
  InsufficientStockError,
  PeriodLockedError,
  DuplicateDocumentError,
  AuthorizationError,
  TransactionError,
  DatabaseError,
  NetworkError,
} from '@/core/errors';

export {
  AppError,
  ValidationError,
  AccountingError,
  InventoryError,
  SecurityError,
  InsufficientStockError,
  PeriodLockedError,
  DuplicateDocumentError,
  AuthorizationError,
  TransactionError,
  DatabaseError,
  NetworkError,
};
