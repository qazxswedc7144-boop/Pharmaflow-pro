// server/modules/platform/platform.types.ts
// Data contracts and types for Phase 8.6 Enterprise Super Admin Control Plane

export type TenantLifecycleStatus = 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'EXPIRED' | 'DEACTIVATED';

export type SecurityEventSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type SystemHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export interface PlatformTenantSummary {
  id: string;
  name: string;
  legalName?: string;
  domain: string | null;
  status: TenantLifecycleStatus;
  isActive: boolean;
  country?: string;
  currency?: string;
  timezone?: string;
  createdAt: string;
  updatedAt: string;
  planCode: string;
  planName: string;
  subscriptionEndDate: string;
  isTrial: boolean;
  branchesCount: number;
  usersCount: number;
  devicesCount: number;
  lastSyncAt: string | null;
  storageUsageKb: number;
  transactionCount: number;
  transactionLimit: number;
}

export interface PlatformDashboardMetrics {
  tenants: {
    total: number;
    active: number;
    suspended: number;
    trial: number;
    expired: number;
    gracePeriod: number;
  };
  branches: {
    total: number;
    active: number;
    offline: number;
    unhealthy: number;
  };
  users: {
    total: number;
    active: number;
    suspended: number;
  };
  devices: {
    total: number;
    active: number;
    offline: number;
    suspended: number;
    revoked: number;
  };
  subscriptions: {
    trial: number;
    basic: number;
    business: number;
    enterprise: number;
    expiringSoon: number;
  };
  financials: {
    mrr: number | 'NOT AVAILABLE';
    arr: number | 'NOT AVAILABLE';
    activePaidSubscriptions: number;
    trialConversionRate: number | 'NOT AVAILABLE';
    expiredSubscriptions: number;
    currency: string;
    revenueTrend: Array<{ month: string; amount: number }>;
  };
  syncHealth: {
    totalPendingMutations: number;
    totalFailedMutations: number;
    totalConflicts: number;
    branchesWithIssues: number;
    overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  };
  systemHealth: {
    api: SystemHealthStatus;
    database: SystemHealthStatus;
    redis: SystemHealthStatus;
    syncEngine: SystemHealthStatus;
    reportingEngine: SystemHealthStatus;
  };
}

export interface PlatformAuditEventRecord {
  id: string;
  actorId: string;
  actorUsername: string;
  tenantId?: string | null;
  branchId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  before?: any;
  after?: any;
  timestamp: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity: SecurityEventSeverity;
  metadata?: Record<string, any>;
}

export interface PlatformLicenseInfo {
  id: string;
  tenantId: string;
  tenantName: string;
  licenseKey: string;
  planCode: string;
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED' | 'PENDING';
  maxBranches: number;
  maxUsers: number;
  maxDevices: number;
  features: string[];
  issuedAt: string;
  expiresAt: string;
  signature: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFeatureFlagRecord {
  id: string;
  key: string;
  name: string;
  description: string;
  isEnabledGlobally: boolean;
  tenantOverrides: Record<string, boolean>; // tenantId -> isEnabled
  category: 'CORE' | 'AI' | 'INTEGRATION' | 'BILLING' | 'EXPERIMENTAL';
  updatedAt: string;
  updatedBy: string;
}

export interface ClientVersionPolicy {
  currentServerVersion: string;
  minimumSupportedVersion: string;
  latestRecommendedVersion: string;
  deprecatedVersions: string[];
  updateUrl?: string;
  enforceStrictCompatibility: boolean;
}

export interface PlatformApiKeyRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  maskedKey: string;
  keyHash?: string;
  scopes: string[];
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface WebhookEventRecord {
  id: string;
  provider: string; // 'KURAIMI' | 'JEEB' | 'ONECASH' | 'STRIPE' | 'GENERIC'
  eventType: string;
  status: 'RECEIVED' | 'VERIFIED' | 'PROCESSED' | 'REJECTED' | 'FAILED';
  signatureVerified: boolean;
  payloadSummary: string;
  receivedAt: string;
  processedAt?: string | null;
  errorMessage?: string | null;
  attempts: number;
}
