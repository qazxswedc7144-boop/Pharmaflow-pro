// src/domain/system.domain.ts
import { DomainEntity } from "./base.types";
import { UserRole, UserStatus } from "./enums.types";

/**
 * Enterprise User Entity
 */
export interface User extends DomainEntity {
  id: string;
  username?: string;
  email?: string;
  fullName?: string;
  role?: UserRole | 'Admin' | 'Accountant' | 'Clerk' | 'Administrator' | 'Pharmacist' | 'Cashier' | string;
  status?: UserStatus | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | string;
  tenantId?: string;
  branchId?: string;
  permissions?: string[];
  subscriptionPlan?: string;
  lastLogin?: string;
  passwordHash?: string;
  salt?: string;
  isActive?: boolean;

  // Compatibility fields
  user_id?: string;
  User_Email?: string;
  User_Name?: string;
  Role?: UserRole | string;
  Is_Active?: boolean;
  tenant_id?: string;
  branch_id?: string;
  created_at?: string;
}

export type Permission = 
  | 'CREATE_INVOICE' 
  | 'EDIT_INVOICE' 
  | 'DELETE_INVOICE'
  | 'CREATE_VOUCHER'
  | 'EDIT_VOUCHER'
  | 'DELETE_VOUCHER'
  | 'VIEW_REPORTS'
  | 'FINANCIAL_ACCESS'
  | 'MANAGE_SYSTEM'
  | 'FULL_ACCESS'
  | 'POS_ACCESS'
  | 'PURCHASE_ACCESS'
  | 'INVENTORY_VIEW'
  | 'MANAGE_PARTNERS'
  | 'AUDIT_VIEW'
  | 'ARCHIVE_VIEW'
  | 'BRANCH_VIEW'
  | 'BRANCH_CREATE'
  | 'BRANCH_EDIT'
  | 'BRANCH_TRANSFER'
  | 'BRANCH_REPORT'
  | string;

/**
 * Security Role Definition
 */
export interface Role extends DomainEntity {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  isSystemRole?: boolean;
}

/**
 * Audit Log Entry
 */
export interface AuditLog extends DomainEntity {
  id: string;
  timestamp: string;
  userId?: string;
  username?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  branchId?: string;
}

/**
 * System Settings Configuration Entity
 */
export interface SystemSettings extends DomainEntity {
  id: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  taxNumber?: string;
  currency: string;
  currencySymbol: string;
  fiscalYearStart?: string;
  allowNegativeStock?: boolean;
  enableMultiBranch?: boolean;
  theme?: string;
}
