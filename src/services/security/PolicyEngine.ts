import { UserRole, Permission } from '@/types';
import { can as canonicalCan, normalizeRole, ROLE_PERMISSIONS as CANONICAL_PERMS } from '@/utils/permissions';

export class PolicyEngine {
  static can(role: UserRole | string, permission: Permission | string): boolean {
    return canonicalCan(role, permission);
  }

  static getPermissions(role: UserRole | string): Permission[] {
    const norm = normalizeRole(role);
    return (CANONICAL_PERMS[norm] || []) as Permission[];
  }
}

