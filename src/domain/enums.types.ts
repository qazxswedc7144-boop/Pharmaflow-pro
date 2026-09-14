// src/domain/enums.types.ts

export type InvoiceStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'LOCKED' | 'CANCELLED' | 'DRAFT_EDIT' | 'VOID';
export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  POSTED: 'POSTED',
  LOCKED: 'LOCKED',
  CANCELLED: 'CANCELLED',
  DRAFT_EDIT: 'DRAFT_EDIT',
  VOID: 'VOID',
} as const;

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export const PaymentStatus = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
} as const;

export type PaymentMethod = 'Cash' | 'Credit' | 'Bank Transfer' | 'Check' | 'CASH' | 'CREDIT';
export const PaymentMethod = {
  CASH: 'Cash',
  CREDIT: 'Credit',
  BANK_TRANSFER: 'Bank Transfer',
  CHECK: 'Check',
} as const;

export type InvoiceType = 'SALE' | 'PURCHASE' | 'SALE_RETURN' | 'PURCHASE_RETURN';
export const InvoiceType = {
  SALE: 'SALE',
  PURCHASE: 'PURCHASE',
  SALE_RETURN: 'SALE_RETURN',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
} as const;

export type StockMovementType = 'SALE' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'INITIAL' | 'TRANSFER' | 'MANUAL';
export const StockMovementType = {
  SALE: 'SALE',
  PURCHASE: 'PURCHASE',
  RETURN: 'RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  INITIAL: 'INITIAL',
  TRANSFER: 'TRANSFER',
  MANUAL: 'MANUAL',
} as const;

export type InventoryAdjustmentReason = 'DAMAGE' | 'EXPIRY' | 'THEFT' | 'COUNT_DISCREPANCY' | 'INITIAL_BALANCE' | 'CORRECTION';
export const InventoryAdjustmentReason = {
  DAMAGE: 'DAMAGE',
  EXPIRY: 'EXPIRY',
  THEFT: 'THEFT',
  COUNT_DISCREPANCY: 'COUNT_DISCREPANCY',
  INITIAL_BALANCE: 'INITIAL_BALANCE',
  CORRECTION: 'CORRECTION',
} as const;

export type VoucherType = 'RECEIPT' | 'PAYMENT' | 'JOURNAL';
export const VoucherType = {
  RECEIPT: 'RECEIPT',
  PAYMENT: 'PAYMENT',
  JOURNAL: 'JOURNAL',
} as const;

export type JournalType = 'SALES' | 'PURCHASES' | 'CASH' | 'BANK' | 'GENERAL' | 'CLOSING';
export const JournalType = {
  SALES: 'SALES',
  PURCHASES: 'PURCHASES',
  CASH: 'CASH',
  BANK: 'BANK',
  GENERAL: 'GENERAL',
  CLOSING: 'CLOSING',
} as const;

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export const AccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
} as const;

export type BalanceType = 'DEBIT' | 'CREDIT';
export const BalanceType = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type UserRole = 'Admin' | 'Accountant' | 'Clerk' | 'Administrator' | 'Pharmacist' | 'Cashier';
export const UserRole = {
  ADMIN: 'Admin',
  ACCOUNTANT: 'Accountant',
  CLERK: 'Clerk',
  ADMINISTRATOR: 'Administrator',
  PHARMACIST: 'Pharmacist',
  CASHIER: 'Cashier',
} as const;

export type SyncStatus = 'NEW' | 'UPDATED' | 'SYNCED' | 'CONFLICT' | 'PENDING';
export const SyncStatus = {
  NEW: 'NEW',
  UPDATED: 'UPDATED',
  SYNCED: 'SYNCED',
  CONFLICT: 'CONFLICT',
  PENDING: 'PENDING',
} as const;

export type BranchTransferStatus = 'DRAFT' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
export const BranchTransferStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;

export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
export const PartnerType = {
  CUSTOMER: 'CUSTOMER',
  SUPPLIER: 'SUPPLIER',
  BOTH: 'BOTH',
} as const;

export type CurrencyCode = 'YER' | 'USD' | 'SAR';
export const CurrencyCode = {
  YER: 'YER',
  USD: 'USD',
  SAR: 'SAR',
} as const;
