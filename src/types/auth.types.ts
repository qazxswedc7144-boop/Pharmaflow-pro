// src/types/auth.types.ts
import { User as DomainUser, UserRole as DomainUserRole, Permission as DomainPermission } from "../domain";
import { SyncableEntity } from "./common.types";

export type UserRole = DomainUserRole;
export type User = DomainUser;

export interface UserRoleEntry extends SyncableEntity {
  User_Email: string;
  Role_Type: UserRole;
}

export type Permission = DomainPermission;

export interface TokenPair {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt?: number | null;
}

export interface TenantAuthContext {
  tenantId?: string | null;
  branchId?: string | null;
  roles?: string[];
  permissions?: string[];
  subscriptionPlan?: string | null;
}

export interface AuthSession {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  tenantId: string | null;
  branchId: string | null;
  deviceId?: string | null;
  roles: string[];
  permissions: string[];
  subscriptionPlan: string | null;
  isAuthenticated: boolean;
  isOfflineSession?: boolean;
}

export interface AuthHeaders {
  Authorization?: string;
  'x-tenant-id'?: string;
  'x-branch-id'?: string;
  [key: string]: string | undefined;
}

