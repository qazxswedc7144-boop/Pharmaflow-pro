
import { SettingsCard } from '@features/settings/components/shared/SettingsUI';
import { CreditCard } from 'lucide-react';

export const BillingSection = () => (
  <SettingsCard title="الفوترة" icon={CreditCard}>
    <p>الاشتراك الحالي: Enterprise Pro</p>
    <p>موعد التجديد: 2026-12-31</p>
    <button className="bg-indigo-600 text-white p-2 rounded mt-2">تحميل الفاتورة PDF</button>
  </SettingsCard>
);
