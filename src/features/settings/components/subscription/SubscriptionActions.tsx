
import { SettingsCard } from '@features/settings/components/shared/SettingsUI';
import { RefreshCw } from 'lucide-react';

export const SubscriptionActions = () => (
  <SettingsCard title="إدارة الاشتراك" icon={RefreshCw}>
    <div className="flex gap-2">
        <button className="bg-green-600 text-white p-2 rounded">ترقية الباقة</button>
        <button className="bg-indigo-600 text-white p-2 rounded">تجديد الاشتراك</button>
    </div>
  </SettingsCard>
);
