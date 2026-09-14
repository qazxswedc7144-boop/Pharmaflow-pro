// server/context/tenantContext.ts
import { AsyncLocalStorage } from "async_hooks";

export interface TenantContext {
  tenantId: string;
  tenantName?: string;
  branchId?: string | null;
  userId?: string | null;
  username?: string | null;
  role?: string | null;
  subscriptionPlan?: string | null;
  isActive?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Returns the active tenant context for the current asynchronous execution chain.
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Returns the current tenantId or a fallback for offline/development mode.
 */
export function getCurrentTenantId(fallback = "default-tenant"): string {
  const store = tenantStorage.getStore();
  return store?.tenantId || fallback;
}

/**
 * Helper to run a callback inside a specific tenant context.
 */
export function runWithTenantContext<T>(context: TenantContext, callback: () => T): T {
  return tenantStorage.run(context, callback);
}
