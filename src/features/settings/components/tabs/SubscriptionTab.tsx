
import { useState, useEffect } from 'react';
import { SettingsCard } from '../shared/SettingsUI';
import { subscriptionService } from '../../../subscription/services/SubscriptionService';
import { SubscriptionStatus, OrganizationInfo, ResourceConsumption } from '../../../subscription/subscription.types';
import { CreditCard, Server } from 'lucide-react';
import { LicenseManagement } from '../subscription/LicenseManagement';
import { OrganizationDetails } from '../subscription/OrganizationDetails';
import { ServiceStatus } from '../subscription/ServiceStatus';
import { UserManagement } from '../subscription/UserManagement';
import { BillingSection } from '../subscription/BillingSection';
import { SubscriptionActions } from '../subscription/SubscriptionActions';

export default function SubscriptionTab() {
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [orgInfo, setOrgInfo] = useState<OrganizationInfo | null>(null);
  const [consumption, setConsumption] = useState<ResourceConsumption | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setSubStatus(await subscriptionService.getSubscriptionStatus());
      setOrgInfo(await subscriptionService.getOrganizationInfo());
      setConsumption(await subscriptionService.getResourceConsumption());
    };
    loadData();
  }, []);

  if (!subStatus || !orgInfo || !consumption) return <div>جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <LicenseManagement licenseKey={subStatus.licenseKey} />
      
      <SettingsCard title="معلومات الاشتراك" icon={CreditCard}>
        <div className="grid grid-cols-2 gap-4">
          <p><strong>الباقة:</strong> {subStatus.planName}</p>
          <p><strong>الحالة:</strong> {subStatus.status}</p>
          <p><strong>الأيام المتبقية:</strong> {subStatus.daysRemaining}</p>
          <p><strong>تاريخ الانتهاء:</strong> {subStatus.endDate.toLocaleDateString()}</p>
        </div>
      </SettingsCard>

      <OrganizationDetails info={orgInfo} />
      
      <ServiceStatus />
      
      <UserManagement activeUsers={subStatus.activeUsers} maxUsers={subStatus.maxUsers} />
      
      <BillingSection />
      
      <SubscriptionActions />
      
      <SettingsCard title="استهلاك الموارد" icon={Server}>
        <div className="grid grid-cols-3 gap-4">
            <div>قاعدة البيانات: {(consumption.databaseSize / 1024 / 1024).toFixed(2)} MB</div>
            <div>النسخ الاحتياطي: {(consumption.backupSize / 1024 / 1024).toFixed(2)} MB</div>
            <div>الملفات: {(consumption.fileSize / 1024 / 1024).toFixed(2)} MB</div>
        </div>
      </SettingsCard>
    </div>
  );
}
