// src/utils/permissions.ts
import { Permission } from '@/types';

/**
 * SaaS Role-Based Access Control (RBAC) definitions
 * Maps roles to the permissions they hold.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  platform_owner: ['*'],
  owner: ['*'],
  tenant_admin: ['*'],
  admin: [
    'MANAGE_SYSTEM', 'VIEW_REPORTS', 'CREATE_VOUCHER', 'FINANCIAL_ACCESS', 
    'MANAGE_PARTNERS', 'CREATE_INVOICE', 'EDIT_INVOICE', 'EDIT_VOUCHER', 
    'ARCHIVE_VIEW', 'BRANCH_VIEW', 'BRANCH_CREATE', 'BRANCH_EDIT', 
    'BRANCH_TRANSFER', 'BRANCH_REPORT', 'PURCHASE_ACCESS', 'POS_ACCESS',
    'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.update', 'sales.invoice.delete', 'sales.invoice.approve', 'sales.invoice.export', 'sales.pos.access',
    'purchases.invoice.view', 'purchases.invoice.create', 'purchases.invoice.update', 'purchases.invoice.export',
    'inventory.product.view', 'inventory.product.create', 'inventory.product.update', 'inventory.product.delete', 'inventory.adjust', 'inventory.batch.view', 'inventory.audit.view', 'inventory.transfer.create', 'inventory.transfer.approve',
    'accounting.journal.view', 'accounting.journal.create', 'accounting.account.view', 'accounting.voucher.create', 'accounting.voucher.view',
    'reports.view', 'reports.export', 'reports.financial.view', 'reports.branch.view',
    'settings.view', 'settings.update', 'settings.security.view', 'settings.audit.view',
    'users.view', 'users.create', 'users.update', 'branches.view'
  ],
  accountant: [
    'VIEW_REPORTS', 'CREATE_VOUCHER', 'FINANCIAL_ACCESS', 'ARCHIVE_VIEW', 
    'BRANCH_VIEW', 'BRANCH_REPORT', 'PURCHASE_ACCESS',
    'accounting.journal.view', 'accounting.journal.create', 'accounting.journal.post', 'accounting.account.view', 'accounting.voucher.create', 'accounting.voucher.view', 'accounting.reconcile',
    'reports.view', 'reports.export', 'reports.financial.view', 'reports.financial.export', 'reports.aging.view', 'reports.branch.view',
    'sales.invoice.view', 'sales.invoice.export', 'purchases.invoice.view', 'purchases.invoice.export'
  ],
  inventory_manager: [
    'MANAGE_SYSTEM', 'VIEW_REPORTS', 'INVENTORY_VIEW', 
    'BRANCH_VIEW', 'BRANCH_TRANSFER', 'BRANCH_REPORT', 'PURCHASE_ACCESS',
    'inventory.product.view', 'inventory.product.create', 'inventory.product.update', 'inventory.product.delete', 'inventory.adjust', 'inventory.batch.view', 'inventory.batch.manage', 'inventory.audit.view', 'inventory.audit.perform', 'inventory.transfer.create', 'inventory.transfer.approve',
    'purchases.invoice.view', 'purchases.invoice.create', 'purchases.invoice.update',
    'reports.view', 'reports.export'
  ],
  pharmacist: [
    'MANAGE_SYSTEM', 'VIEW_REPORTS', 'CREATE_VOUCHER', 'FINANCIAL_ACCESS', 
    'MANAGE_PARTNERS', 'CREATE_INVOICE', 'EDIT_INVOICE', 'EDIT_VOUCHER', 
    'ARCHIVE_VIEW', 'BRANCH_VIEW', 'BRANCH_CREATE', 'BRANCH_EDIT', 
    'BRANCH_TRANSFER', 'BRANCH_REPORT', 'PURCHASE_ACCESS', 'POS_ACCESS',
    'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.update', 'sales.invoice.export', 'sales.refund', 'sales.pos.access',
    'purchases.invoice.view', 'purchases.invoice.create',
    'inventory.product.view', 'inventory.batch.view', 'inventory.transfer.create',
    'reports.view'
  ],
  cashier: [
    'CREATE_INVOICE', 'POS_ACCESS', 'INVENTORY_VIEW', 
    'BRANCH_VIEW', 'BRANCH_TRANSFER', 'PURCHASE_ACCESS',
    'sales.pos.access', 'sales.invoice.create', 'sales.invoice.view', 'inventory.product.view'
  ],
  clerk: [
    'CREATE_INVOICE', 'POS_ACCESS', 'INVENTORY_VIEW', 
    'BRANCH_VIEW', 'BRANCH_TRANSFER', 'PURCHASE_ACCESS',
    'sales.pos.access', 'sales.invoice.create', 'sales.invoice.view', 'inventory.product.view'
  ],
  auditor: [
    'VIEW_REPORTS', 'FINANCIAL_ACCESS', 'ARCHIVE_VIEW', 'BRANCH_VIEW', 'BRANCH_REPORT',
    'sales.invoice.view', 'sales.invoice.export', 'purchases.invoice.view', 'purchases.invoice.export',
    'inventory.product.view', 'inventory.batch.view', 'inventory.audit.view',
    'accounting.journal.view', 'accounting.account.view', 'accounting.voucher.view',
    'reports.view', 'reports.export', 'reports.financial.view', 'reports.financial.export', 'reports.branch.view', 'reports.aging.view',
    'settings.audit.view', 'settings.security.view'
  ],
  user: [
    'VIEW_REPORTS', 'BRANCH_VIEW'
  ]
};

/**
 * Universal Permission Helper
 * Examines if the given role has the requested permission
 */
export function can(role: string | null | undefined, permission: Permission | string, customPermissions?: string[]): boolean {
  if (!role || role.trim() === "") return false;
  
  const normalizedRole = role.toLowerCase().trim();
  if (['admin', 'owner', 'platform_owner', 'tenant_admin', 'local-admin'].includes(normalizedRole)) {
    return true;
  }
  
  // Check user custom permissions override if present
  if (customPermissions && Array.isArray(customPermissions)) {
    if (customPermissions.includes('*') || customPermissions.includes(permission)) {
      return true;
    }
  }

  const permissions = ROLE_PERMISSIONS[normalizedRole];
  if (!permissions) return false;
  
  if (permissions.includes('*')) return true;
  return permissions.includes(permission);
}

export function canAny(role: string | null | undefined, permissions: (Permission | string)[], customPermissions?: string[]): boolean {
  return permissions.some(p => can(role, p, customPermissions));
}
