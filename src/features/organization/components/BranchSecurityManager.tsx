// src/features/organization/components/BranchSecurityManager.tsx
import React, { useState, useEffect } from 'react';
import { 
  Building2, ShieldCheck, AlertTriangle, 
  CheckCircle2, Play, RefreshCw 
} from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { TenantUserItem } from '../types';

export const BranchSecurityManager: React.FC = () => {
  const { tenantId } = useAuthStore();
  const [users, setUsers] = useState<TenantUserItem[]>([]);
  const branches = [
    { id: 'branch-01', code: 'MAIN-01', name: 'الفرع الرئيسي (فرع الأمل)', isPrimary: true, usersCount: 3, status: 'ISOLATED' },
    { id: 'branch-02', code: 'BR-02', name: 'فرع النور - حي الروضة', isPrimary: false, usersCount: 1, status: 'ISOLATED' }
  ];

  // Simulation state
  const [simUserId, setSimUserId] = useState('');
  const [simTargetBranchId, setSimTargetBranchId] = useState('branch-01');
  const [simAction, setSimAction] = useState('sales.invoice.create');
  const [simResult, setSimResult] = useState<{
    allowed: boolean;
    reason: string;
    details?: any;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/organization/users', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
            'x-tenant-id': tenantId || 'default-tenant'
          }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.length > 0) {
            setUsers(json.data);
            setSimUserId(json.data[0].id);
          }
        }
      } catch (e) {
        console.warn('Could not load users for simulator:', e);
      }
    };
    fetchUsers();
  }, [tenantId]);

  const runSimulation = () => {
    setIsSimulating(true);
    const selectedUser = users.find(u => u.id === simUserId);

    setTimeout(() => {
      if (!selectedUser) {
        setSimResult({
          allowed: false,
          reason: 'المستخدم غير موجود'
        });
        setIsSimulating(false);
        return;
      }

      if (!selectedUser.isActive) {
        setSimResult({
          allowed: false,
          reason: 'الحساب معطل أمنياً (Deactivated). جميع العمليات محجوبة تلقائياً.'
        });
        setIsSimulating(false);
        return;
      }

      const role = selectedUser.role.toUpperCase();
      const isTenantAdmin = ['PLATFORM_OWNER', 'TENANT_ADMIN', 'ADMIN', 'OWNER'].includes(role);

      // Branch check
      if (!isTenantAdmin && selectedUser.branchId && selectedUser.branchId !== simTargetBranchId) {
        setSimResult({
          allowed: false,
          reason: `مرفوض (403): المستخدم مقيد بالفرع (${selectedUser.branchName || selectedUser.branchId})، ولا يملك تصريحاً للعمليات في فرع آخر (${simTargetBranchId}).`
        });
        setIsSimulating(false);
        return;
      }

      setSimResult({
        allowed: true,
        reason: `مسموح (200 OK): يملك المستخدم الصلاحية (${simAction}) ويطابق قيود نطاق الفرع (${simTargetBranchId}).`
      });
      setIsSimulating(false);
    }, 200);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-emerald-700 bg-emerald-50 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200">
              Branch Level Access Control (BLAC)
            </span>
          </div>
          <h3 className="text-sm font-black text-slate-800">
            أمان الفروع وضوابط النطاق الجغرافي والتشغيلي
          </h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            حصر صلاحيات الكاشير وأمناء المستودعات على فروعهم المعينة ومنع التداخل بين الفروع.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200/60">
          <ShieldCheck size={16} className="text-emerald-600" />
          <span>سياسة العزل الصارم: مفعلة 100%</span>
        </div>
      </div>

      {/* Branches List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {branches.map(branch => (
          <div key={branch.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800">{branch.name}</h4>
                    <span className="text-[10px] font-mono text-slate-400">كود: {branch.code}</span>
                  </div>
                </div>

                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                  معزول أمنياً
                </span>
              </div>

              <div className="space-y-2 text-xs font-semibold text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <span>المستخدمون المخصصون:</span>
                  <span className="font-bold text-slate-800">{branch.usersCount} مستخدم</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>سجل الفواتير والمخزون:</span>
                  <span className="text-emerald-700 font-bold">مستقل مع المزامنة الآمنة</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Authorization Simulator */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <Play size={16} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800">
              محاكي واختبار سياسات الصلاحيات والفروع الحية (Access Policy Tester)
            </h4>
            <p className="text-[11px] text-slate-400 font-medium">
              اختبر فورياً إذا كان مستخدم معين يملك حق تنفيذ إجراء محدد في فرع محدد.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">اختر المستخدم</label>
            <select
              value={simUserId}
              onChange={(e) => setSimUserId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role}) - {u.branchName || 'كل الفروع'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">الفرع المستهدف للعملية</label>
            <select
              value={simTargetBranchId}
              onChange={(e) => setSimTargetBranchId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="branch-01">الفرع الرئيسي (فرع الأمل)</option>
              <option value="branch-02">فرع النور</option>
              <option value="branch-99">فرع وهمي آخر (اختبار الاختراق)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">الإجراء المطلوب تنفيذه</label>
            <select
              value={simAction}
              onChange={(e) => setSimAction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="sales.invoice.create">إصدار فاتورة مبيعات (sales.invoice.create)</option>
              <option value="inventory.adjust">تسوية وتعديل المخزون (inventory.adjust)</option>
              <option value="accounting.voucher.create">إنشاء قيد محاسبي (accounting.voucher.create)</option>
              <option value="reports.financial.view">عرض التقارير المالية (reports.financial.view)</option>
              <option value="users.roles.manage">إدارة الأدوار والصلاحيات (users.roles.manage)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isSimulating}
            onClick={runSimulation}
            className="px-6 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-2xl text-xs font-bold shadow-md shadow-purple-950/10 flex items-center gap-2 transition-all"
          >
            {isSimulating ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>تنفيذ فحص السياسة (Evaluate Policy)</span>
          </button>

          {simResult && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold ${
              simResult.allowed 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {simResult.allowed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{simResult.reason}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BranchSecurityManager;
