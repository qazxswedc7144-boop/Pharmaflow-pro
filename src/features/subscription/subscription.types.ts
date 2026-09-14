
export interface SubscriptionStatus {
  id: string;
  planName: string;
  planType: 'free' | 'pro' | 'enterprise';
  licenseKey: string;
  status: 'active' | 'expiring' | 'expired';
  daysRemaining: number;
  startDate: Date;
  endDate: Date;
  maxBranches: number;
  activeBranches: number;
  maxUsers: number;
  activeUsers: number;
}

export interface OrganizationInfo {
  name: string;
  owner: string;
  taxNumber: string;
  commercialRegistration: string;
  country: string;
  city: string;
  currency: string;
  timezone: string;
  language: string;
}

export interface ResourceConsumption {
  databaseSize: number; // bytes
  backupSize: number;
  fileSize: number;
  invoiceCount: number;
  productCount: number;
  customerCount: number;
  supplierCount: number;
}
