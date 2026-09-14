
import { SettingsCard, SettingInput } from '@features/settings/components/shared/SettingsUI';
import { ShieldCheck } from 'lucide-react';

export const LicenseManagement = ({ licenseKey }: { licenseKey: string }) => (
  <SettingsCard title="إدارة الرخصة" icon={ShieldCheck}>
    <SettingInput label="مفتاح التفعيل" value={licenseKey} disabled />
    <div className="flex gap-2">
      <button className="bg-indigo-600 text-white p-2 rounded">إعادة التحقق</button>
      <button className="bg-red-600 text-white p-2 rounded">تعطيل الجهاز</button>
    </div>
  </SettingsCard>
);
