
import { SettingsCard, SettingInput } from '@features/settings/components/shared/SettingsUI';
import { Building2 } from 'lucide-react';
import { OrganizationInfo } from '../../../subscription/subscription.types';

export const OrganizationDetails = ({ info }: { info: OrganizationInfo }) => (
  <SettingsCard title="معلومات المؤسسة" icon={Building2}>
    <div className="grid grid-cols-2 gap-4">
      <SettingInput label="اسم الصيدلية" value={info.name} disabled />
      <SettingInput label="المالك" value={info.owner} disabled />
      <SettingInput label="السجل التجاري" value={info.commercialRegistration} disabled />
      <SettingInput label="الرقم الضريبي" value={info.taxNumber} disabled />
    </div>
  </SettingsCard>
);
