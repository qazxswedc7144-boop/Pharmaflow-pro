// server/services/rbac/types.ts

export type PermissionAction = 'view' | 'create' | 'edit' | 'update' | 'delete' | 'approve' | 'export' | 'manage' | 'adjust' | 'reconcile' | 'post' | 'read' | 'write';

export type PermissionModule = 
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'accounting'
  | 'reports'
  | 'settings'
  | 'users'
  | 'sync'
  | 'api'
  | 'branches'
  | 'organization';

export interface StandardPermission {
  id?: string;
  key: string;
  module: PermissionModule | string;
  action: string;
  description: string;
}

export interface RoleDefinition {
  id: string;
  tenantId?: string | null;
  name: string;
  description?: string | null;
  isSystemRole: boolean;
  permissions: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface UserRoleBinding {
  id?: string;
  userId: string;
  tenantId: string;
  roleId: string;
  roleName?: string;
  branchId?: string | null;
}

export type PermissionOverrideEffect = 'ALLOW' | 'DENY';

export interface UserPermissionOverrideItem {
  id?: string;
  userId: string;
  permissionKey: string;
  effect: PermissionOverrideEffect;
}

export interface UserIdentityContext {
  userId: string;
  username?: string;
  tenantId?: string | null;
  branchId?: string | null;
  role?: string | null;
  roles?: string[];
  permissions?: string[];
  subscriptionPlan?: string | null;
  isActive?: boolean;
}

export interface AuthorizationEvaluationContext {
  tenantId?: string | null;
  branchId?: string | null;
  resourceOwnerId?: string | null;
  environment?: 'production' | 'preview' | 'development';
}

export interface PermissionCacheEntry {
  permissions: Set<string>;
  roles: string[];
  branchAssignments: string[];
  cachedAt: number;
  expiresAt: number;
}
