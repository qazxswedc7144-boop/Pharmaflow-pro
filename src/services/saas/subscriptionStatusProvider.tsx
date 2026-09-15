// src/services/saas/subscriptionStatusProvider.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { 
  SubscriptionEntitlementService, 
  SubscriptionEntitlement 
} from './subscriptionEntitlementService';
import { getCurrentUserSession } from '@/core/db';

interface SubscriptionContextType {
  entitlement: SubscriptionEntitlement | null;
  loading: boolean;
  refresh: () => Promise<void>;
  isFeatureAllowed: (feature: 'VIEW_DATA' | 'VIEW_REPORTS' | 'EXPORT_DATA' | 'MANAGE_ACCOUNT' | 'VIEW_INVOICES' | 'CREATE_TRANSACTION' | 'SETTINGS_VIEW') => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  entitlement: null,
  loading: true,
  refresh: async () => {},
  isFeatureAllowed: () => true
});

export const SubscriptionStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = getCurrentUserSession();
      const ent = await SubscriptionEntitlementService.getAuthoritativeEntitlement(session?.tenantId);
      setEntitlement(ent);
    } catch (e) {
      console.warn('[SubscriptionContext] Error loading entitlement:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const handleUpdate = () => {
      refresh();
    };

    window.addEventListener('saas-usage-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('saas-usage-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [refresh]);

  const isFeatureAllowed = useCallback((feature: 'VIEW_DATA' | 'VIEW_REPORTS' | 'EXPORT_DATA' | 'MANAGE_ACCOUNT' | 'VIEW_INVOICES' | 'CREATE_TRANSACTION' | 'SETTINGS_VIEW') => {
    if (!entitlement) return true;
    const readOnlyFeatures = ['VIEW_DATA', 'VIEW_REPORTS', 'EXPORT_DATA', 'MANAGE_ACCOUNT', 'VIEW_INVOICES', 'SETTINGS_VIEW'];
    if (readOnlyFeatures.includes(feature)) return true;
    return !entitlement.isBlocked;
  }, [entitlement]);

  const value = useMemo(() => ({
    entitlement,
    loading,
    refresh,
    isFeatureAllowed
  }), [entitlement, loading, refresh, isFeatureAllowed]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  return useContext(SubscriptionContext);
};
