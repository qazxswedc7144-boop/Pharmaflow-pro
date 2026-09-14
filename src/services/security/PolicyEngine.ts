import { UserRole, Permission } from '@/types';

export class PolicyEngine {
  private static ROLE_PERMISSIONS: Partial<Record<UserRole, Permission[]>> & Record<string, Permission[]> = {
    'Admin': ['FULL_ACCESS', 'MANAGE_SYSTEM', 'FINANCIAL_ACCESS'],
    'Administrator': ['FULL_ACCESS', 'MANAGE_SYSTEM', 'FINANCIAL_ACCESS'],
    'Accountant': ['CREATE_VOUCHER', 'EDIT_VOUCHER', 'VIEW_REPORTS', 'FINANCIAL_ACCESS'],
    'Clerk': ['CREATE_INVOICE', 'POS_ACCESS', 'INVENTORY_VIEW'],
    'Pharmacist': ['CREATE_INVOICE', 'POS_ACCESS', 'INVENTORY_VIEW'],
    'Cashier': ['CREATE_INVOICE', 'POS_ACCESS']
  };

  static can(role: UserRole, permission: Permission): boolean {
    const perms = this.ROLE_PERMISSIONS[role] || [];
    if (perms.includes('FULL_ACCESS')) return true;
    return perms.includes(permission);
  }

  static getPermissions(role: UserRole): Permission[] {
    return this.ROLE_PERMISSIONS[role] || [];
  }
}
