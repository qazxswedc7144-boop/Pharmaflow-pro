
import { SettingsCard } from '@features/settings/components/shared/SettingsUI';
import { Activity } from 'lucide-react';

export const ServiceStatus = () => (
  <SettingsCard title="حالة الخدمات" icon={Activity}>
    <div className="flex gap-4">
        <span>Firebase: <span className="text-emerald-500">● Online</span></span>
        <span>Sync Engine: <span className="text-emerald-500">● Online</span></span>
    </div>
  </SettingsCard>
);
