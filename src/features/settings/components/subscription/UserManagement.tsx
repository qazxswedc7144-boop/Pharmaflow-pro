
import { SettingsCard } from '@features/settings/components/shared/SettingsUI';
import { Users } from 'lucide-react';

export const UserManagement = ({ activeUsers, maxUsers }: { activeUsers: number, maxUsers: number }) => (
  <SettingsCard title="إدارة المستخدمين" icon={Users}>
    <p>المستخدمون النشطون: {activeUsers} من {maxUsers}</p>
    <div className="w-full bg-slate-100 h-2 rounded-full mt-2">
        <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${(activeUsers / maxUsers) * 100}%` }}></div>
    </div>
  </SettingsCard>
);
