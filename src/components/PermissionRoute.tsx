// src/components/PermissionRoute.tsx
import React from 'react';
import { useAuthStore } from '../store/authStore';
import { can } from '../utils/permissions';
import { AccessDenied } from './AccessDenied';

interface PermissionRouteProps {
  permission: string;
  moduleName?: string;
  children: React.ReactNode;
  onNavigateBack?: () => void;
}

export const PermissionRoute: React.FC<PermissionRouteProps> = ({
  permission,
  moduleName,
  children,
  onNavigateBack
}) => {
  const { user, permissions } = useAuthStore();

  const isAllowed = can(user?.role, permission, permissions);

  if (!isAllowed) {
    return (
      <AccessDenied 
        requiredPermission={permission} 
        moduleName={moduleName} 
        onBack={onNavigateBack} 
      />
    );
  }

  return <>{children}</>;
};

export default PermissionRoute;
