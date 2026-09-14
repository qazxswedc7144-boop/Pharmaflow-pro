// src/features/organization/types.ts

export interface TenantUserItem {
  id: string;
  username: string;
  role: string;
  assignedRoles?: string[];
  branchId?: string | null;
  branchName?: string;
  isActive: boolean;
  lastLoginAt?: string | Date | null;
  createdAt?: string | Date;
  overridesCount?: number;
}

export interface RoleItem {
  id: string;
  name: string;
  description?: string | null;
  isSystemRole: boolean;
  permissions: string[];
  tenantId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface PermissionDefinition {
  key: string;
  module: string;
  action: string;
  description: string;
}

export interface OrganizationStats {
  totalUsers: number;
  totalBranches: number;
  totalRoles: number;
  activePolicies: number;
  complianceScore: number;
}

export interface SubscriptionInfo {
  status: string;
  maxBranches: number;
  maxUsers: number;
  offlineSync: boolean;
  auditRetentionDays: number;
}
