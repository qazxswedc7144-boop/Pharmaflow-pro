// packages/auth/src/rbac.ts
/**
 * Compatibility Facade for PharmaFlow PRO Enterprise RBAC Layer
 * Delegates to canonical permission and role normalization mechanisms.
 */

export type Role = 
  | 'ADMIN' 
  | 'ACCOUNTANT' 
  | 'PHARMACIST' 
  | 'CASHIER' 
  | 'AUDITOR' 
  | 'INVENTORY_MANAGER'
  | 'OWNER'
  | 'PLATFORM_OWNER'
  | 'TENANT_ADMIN'
  | 'CLERK'
  | 'USER'
  | string;

export type Permission =
  | 'invoice.create'
  | 'invoice.approve'
  | 'invoice.post'
  | 'stock.adjust'
  | 'journal.view'
  | 'audit.view'
  | 'user.manage'
  | 'branch.view'
  | 'branch.create'
  | 'branch.edit'
  | 'branch.transfer'
  | 'branch.report'
  | 'POS_ACCESS'
  | 'CREATE_INVOICE'
  | 'EDIT_INVOICE'
  | 'DELETE_INVOICE'
  | 'VIEW_REPORTS'
  | 'FINANCIAL_ACCESS'
  | 'MANAGE_SYSTEM'
  | 'sales.invoice.view'
  | 'sales.invoice.create'
  | 'sales.invoice.update'
  | 'sales.invoice.delete'
  | 'sales.invoice.approve'
  | 'sales.invoice.export'
  | 'sales.pos.access'
  | 'purchases.invoice.view'
  | 'purchases.invoice.create'
  | 'inventory.product.view'
  | 'inventory.stock.adjust'
  | 'accounting.journal.view'
  | 'accounting.journal.post'
  | 'settings.audit.view'
  | 'settings.system.manage'
  | 'users.manage'
  | 'branches.view'
  | string;

export const LEGACY_PERMISSION_ALIASES: Record<string, string> = {
  'invoice.create': 'sales.invoice.create',
  'invoice.approve': 'sales.invoice.approve',
  'invoice.post': 'accounting.journal.post',
  'stock.adjust': 'inventory.stock.adjust',
  'journal.view': 'accounting.journal.view',
  'audit.view': 'settings.audit.view',
  'user.manage': 'users.manage',
  'branch.view': 'branches.view',
  'branch.create': 'branches.create',
  'branch.edit': 'branches.update',
  'branch.transfer': 'branches.transfer',
  'branch.report': 'branches.report',
  'POS_ACCESS': 'sales.pos.access',
  'CREATE_INVOICE': 'sales.invoice.create',
  'EDIT_INVOICE': 'sales.invoice.update',
  'DELETE_INVOICE': 'sales.invoice.delete',
  'VIEW_REPORTS': 'reports.view',
  'FINANCIAL_ACCESS': 'accounting.journal.view',
  'MANAGE_SYSTEM': 'settings.system.manage'
};

export function normalizeRole(role: string | null | undefined): string {
  if (!role || typeof role !== 'string') return 'user';
  const trimmed = role.trim().toLowerCase();
  if (['admin', 'administrator', 'local-admin'].includes(trimmed)) return 'admin';
  if (['owner', 'platform_owner', 'tenant_admin'].includes(trimmed)) return trimmed;
  if (['accountant', 'inventory_manager', 'pharmacist', 'cashier', 'clerk', 'auditor'].includes(trimmed)) return trimmed;
  return trimmed || 'user';
}

export function resolveCanonicalPermission(permission: string): string {
  if (!permission) return '';
  return LEGACY_PERMISSION_ALIASES[permission] || permission;
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['*'],
  admin: ['*'],
  OWNER: ['*'],
  owner: ['*'],
  PLATFORM_OWNER: ['*'],
  platform_owner: ['*'],
  TENANT_ADMIN: ['*'],
  tenant_admin: ['*'],
  ACCOUNTANT: [
    'invoice.create', 'invoice.approve', 'invoice.post', 'journal.view', 'branch.view', 'branch.report',
    'sales.invoice.view', 'sales.invoice.export', 'purchases.invoice.view', 'purchases.invoice.export',
    'accounting.journal.view', 'accounting.journal.create', 'accounting.journal.post', 'accounting.account.view',
    'accounting.voucher.create', 'accounting.voucher.view', 'accounting.voucher.update', 'accounting.reconcile',
    'reports.view', 'reports.export', 'reports.financial.view', 'reports.financial.export', 'reports.aging.view', 'reports.branch.view',
    'branches.view', 'branches.report'
  ],
  accountant: [
    'invoice.create', 'invoice.approve', 'invoice.post', 'journal.view', 'branch.view', 'branch.report',
    'sales.invoice.view', 'sales.invoice.export', 'purchases.invoice.view', 'purchases.invoice.export',
    'accounting.journal.view', 'accounting.journal.create', 'accounting.journal.post', 'accounting.account.view',
    'accounting.voucher.create', 'accounting.voucher.view', 'accounting.voucher.update', 'accounting.reconcile',
    'reports.view', 'reports.export', 'reports.financial.view', 'reports.financial.export', 'reports.aging.view', 'reports.branch.view',
    'branches.view', 'branches.report'
  ],
  PHARMACIST: [
    'invoice.create', 'stock.adjust', 'branch.view', 'branch.transfer', 'branch.report',
    'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.update', 'sales.invoice.export', 'sales.refund', 'sales.pos.access',
    'purchases.invoice.view', 'purchases.invoice.create',
    'inventory.product.view', 'inventory.batch.view', 'inventory.transfer.create',
    'reports.view', 'branches.view', 'branches.transfer', 'branches.report', 'partners.manage'
  ],
  pharmacist: [
    'invoice.create', 'stock.adjust', 'branch.view', 'branch.transfer', 'branch.report',
    'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.update', 'sales.invoice.export', 'sales.refund', 'sales.pos.access',
    'purchases.invoice.view', 'purchases.invoice.create',
    'inventory.product.view', 'inventory.batch.view', 'inventory.transfer.create',
    'reports.view', 'branches.view', 'branches.transfer', 'branches.report', 'partners.manage'
  ],
  CASHIER: [
    'invoice.create', 'branch.view',
    'sales.pos.access', 'sales.invoice.create', 'sales.invoice.view',
    'inventory.product.view', 'branches.view'
  ],
  cashier: [
    'invoice.create', 'branch.view',
    'sales.pos.access', 'sales.invoice.create', 'sales.invoice.view',
    'inventory.product.view', 'branches.view'
  ],
  AUDITOR: [
    'journal.view', 'audit.view', 'branch.view', 'branch.report',
    'sales.invoice.view', 'sales.invoice.export', 'purchases.invoice.view', 'purchases.invoice.export',
    'inventory.product.view', 'inventory.batch.view', 'inventory.audit.view',
    'accounting.journal.view', 'accounting.account.view', 'accounting.voucher.view',
    'reports.view', 'reports.export', 'reports.financial.view', 'reports.financial.export', 'reports.branch.view', 'reports.aging.view',
    'settings.audit.view', 'settings.security.view'
  ],
  auditor: [
    'journal.view', 'audit.view', 'branch.view', 'branch.report',
    'sales.invoice.view', 'sales.invoice.export', 'purchases.invoice.view', 'purchases.invoice.export',
    'inventory.product.view', 'inventory.batch.view', 'inventory.audit.view',
    'accounting.journal.view', 'accounting.account.view', 'accounting.voucher.view',
    'reports.view', 'reports.export', 'reports.financial.view', 'reports.financial.export', 'reports.branch.view', 'reports.aging.view',
    'settings.audit.view', 'settings.security.view'
  ],
  INVENTORY_MANAGER: [
    'stock.adjust', 'branch.view', 'branch.transfer',
    'inventory.product.view', 'inventory.product.create', 'inventory.product.update', 'inventory.product.delete', 'inventory.stock.adjust', 'inventory.batch.view', 'inventory.batch.manage', 'inventory.audit.view', 'inventory.audit.perform', 'inventory.transfer.create', 'inventory.transfer.approve',
    'purchases.invoice.view', 'purchases.invoice.create', 'purchases.invoice.update',
    'reports.view', 'reports.export', 'branches.view', 'branches.transfer', 'branches.report'
  ],
  inventory_manager: [
    'stock.adjust', 'branch.view', 'branch.transfer',
    'inventory.product.view', 'inventory.product.create', 'inventory.product.update', 'inventory.product.delete', 'inventory.stock.adjust', 'inventory.batch.view', 'inventory.batch.manage', 'inventory.audit.view', 'inventory.audit.perform', 'inventory.transfer.create', 'inventory.transfer.approve',
    'purchases.invoice.view', 'purchases.invoice.create', 'purchases.invoice.update',
    'reports.view', 'reports.export', 'branches.view', 'branches.transfer', 'branches.report'
  ],
};

/**
 * Checks if a specific role contains a given permission (with canonical alias & normalization).
 */
export function hasPermission(role: string | Role, permission: Permission): boolean {
  if (!role) return false;
  const normalized = normalizeRole(role);
  if (['admin', 'owner', 'platform_owner', 'tenant_admin'].includes(normalized)) {
    return true;
  }
  const canonical = resolveCanonicalPermission(permission);
  const list = ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS[String(role).toUpperCase()] || [];
  if (list.includes('*')) return true;
  return list.includes(permission) || list.includes(canonical);
}

/**
 * Alias for hasPermission.
 */
export function can(role: string | Role, permission: Permission): boolean {
  return hasPermission(role, permission);
}

/**
 * Validates a list of permissions against a role (ALL must match).
 */
export function hasAllPermissions(role: string | Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * Validates if ANY permission matches the role.
 */
export function hasAnyPermission(role: string | Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

