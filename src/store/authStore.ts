// src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';

export interface TenantAuthContext {
  tenantId?: string | null;
  branchId?: string | null;
  roles?: string[];
  permissions?: string[];
  subscriptionPlan?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  tenantId: string | null;
  branchId: string | null;
  roles: string[];
  permissions: string[];
  subscriptionPlan: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setTenantContext: (context: TenantAuthContext) => void;
  login: (user: User, token: string, context?: TenantAuthContext) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  canAccessBranch: (targetBranchId?: string | null) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenantId: null,
      branchId: null,
      roles: [],
      permissions: [],
      subscriptionPlan: null,
      isAuthenticated: false,
      
      setUser: (user) => set((state) => ({
        user,
        tenantId: user?.tenantId || state.tenantId,
        branchId: user?.branchId || state.branchId,
        roles: (user as any)?.roles || (user?.role ? [user.role] : state.roles),
        permissions: user?.permissions || state.permissions,
        subscriptionPlan: user?.subscriptionPlan || state.subscriptionPlan
      })),

      setTenantContext: (ctx) => set((state) => ({
        tenantId: ctx.tenantId !== undefined ? ctx.tenantId : state.tenantId,
        branchId: ctx.branchId !== undefined ? ctx.branchId : state.branchId,
        roles: ctx.roles !== undefined ? ctx.roles : state.roles,
        permissions: ctx.permissions !== undefined ? ctx.permissions : state.permissions,
        subscriptionPlan: ctx.subscriptionPlan !== undefined ? ctx.subscriptionPlan : state.subscriptionPlan
      })),

      login: (user, token, context) => set({
        user,
        token,
        tenantId: context?.tenantId || user?.tenantId || 'default-tenant',
        branchId: context?.branchId || user?.branchId || null,
        roles: context?.roles || (user as any)?.roles || (user?.role ? [user.role] : ['CASHIER']),
        permissions: context?.permissions || user?.permissions || [],
        subscriptionPlan: context?.subscriptionPlan || user?.subscriptionPlan || 'ENTERPRISE',
        isAuthenticated: true
      }),

      logout: () => set({
        user: null,
        token: null,
        tenantId: null,
        branchId: null,
        roles: [],
        permissions: [],
        subscriptionPlan: null,
        isAuthenticated: false
      }),

      hasPermission: (perm: string) => {
        const state = get();
        const role = (state.user?.role || '').toLowerCase();
        // Super admin bypass
        if (role === 'admin' || role === 'owner' || role === 'platform_owner' || role === 'tenant_admin' || role === 'local-admin') {
          return true;
        }
        if (state.permissions.includes('*') || state.permissions.includes(perm)) {
          return true;
        }
        return false;
      },

      hasAnyPermission: (perms: string[]) => {
        const state = get();
        const role = (state.user?.role || '').toLowerCase();
        if (role === 'admin' || role === 'owner' || role === 'platform_owner' || role === 'tenant_admin' || role === 'local-admin') {
          return true;
        }
        if (state.permissions.includes('*')) return true;
        return perms.some(p => state.permissions.includes(p));
      },

      canAccessBranch: (targetBranchId?: string | null) => {
        const state = get();
        if (!targetBranchId) return true;
        const role = (state.user?.role || '').toLowerCase();
        if (['admin', 'owner', 'platform_owner', 'tenant_admin', 'local-admin'].includes(role)) {
          return true;
        }
        if (!state.branchId) return true;
        return state.branchId === targetBranchId;
      }
    }),
    { name: 'pharma-auth-storage' }
  )
);
