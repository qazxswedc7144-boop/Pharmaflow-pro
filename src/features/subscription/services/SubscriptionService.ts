
import { SubscriptionStatus, OrganizationInfo, ResourceConsumption } from '../subscription.types';

export class SubscriptionService {
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    // In production, this would fetch from Firebase/Dexie
    return {
      id: 'sub-123',
      planName: 'Enterprise Pro',
      planType: 'enterprise',
      licenseKey: 'PF-PRO-12345678',
      status: 'active',
      daysRemaining: 45,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      maxBranches: 10,
      activeBranches: 3,
      maxUsers: 50,
      activeUsers: 12
    };
  }

  async getOrganizationInfo(): Promise<OrganizationInfo> {
    return {
      name: 'صيدليات الشفاء',
      owner: 'د. محمد أحمد',
      taxNumber: '123456789',
      commercialRegistration: '987654321',
      country: 'مصر',
      city: 'القاهرة',
      currency: 'EGP',
      timezone: 'GMT+2',
      language: 'ar'
    };
  }

  async getResourceConsumption(): Promise<ResourceConsumption> {
    return {
      databaseSize: 1024 * 1024 * 50, // 50MB
      backupSize: 1024 * 1024 * 100, // 100MB
      fileSize: 1024 * 1024 * 200, // 200MB
      invoiceCount: 1500,
      productCount: 5000,
      customerCount: 300,
      supplierCount: 50
    };
  }
}

export const subscriptionService = new SubscriptionService();
