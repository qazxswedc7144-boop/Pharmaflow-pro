// src/features/organization/components/PermissionMatrix.tsx
import React, { useState, useEffect } from 'react';
import { Check, X, RefreshCw } from 'lucide-react';
import { PermissionDefinition, RoleItem } from '../types';
import { resolveCanonicalPermission } from '@/utils/permissions';
import { unifiedTransport } from '@/shared/network/transport/unifiedTransport';

export const PermissionMatrix: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [activeModuleFilter, setActiveModuleFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);

  const fetchMatrixData = async () => {
    setIsLoading(true);
    try {
      const [pJson, rJson] = await Promise.all([
        unifiedTransport.get<any>('/api/rbac/permissions'),
        unifiedTransport.get<any>('/api/rbac/roles')
      ]);

      if (pJson && pJson.data?.permissions) {
        setPermissions(pJson.data.permissions);
      }
      if (rJson && rJson.data) {
        setRoles(rJson.data);
      }
    } catch (e) {
      console.warn('[Matrix] error fetching data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrixData();
  }, []);

  const modules = Array.from(new Set(permissions.map(p => p.module)));

  const filteredPermissions = activeModuleFilter === 'ALL'
    ? permissions
    : permissions.filter(p => p.module === activeModuleFilter);

  const hasPermission = (role: RoleItem, permKey: string): boolean => {
    if (role.permissions.includes('*')) return true;
    const canonical = resolveCanonicalPermission(permKey);
    return role.permissions.includes(permKey) || role.permissions.includes(canonical) || role.permissions.some(p => resolveCanonicalPermission(p) === canonical);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-800">مصفوفة الصلاحيات المتقدمة (Enterprise Permission Matrix)</h3>
          <p className="text-[11px] text-slate-400 font-medium">جدول مرجعي يوضح تقاطع الصلاحيات الدقيقة مع كافة أدوار المنظومة</p>
        </div>

        <button
          onClick={fetchMatrixData}
          disabled={isLoading}
          className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl border border-slate-200 transition-colors self-end sm:self-auto"
          title="تحديث"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Module filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
        <button
          onClick={() => setActiveModuleFilter('ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeModuleFilter === 'ALL'
              ? 'bg-[#1E4D4D] text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          جميع الوحدات ({permissions.length})
        </button>
        {modules.map(mod => (
          <button
            key={mod}
            onClick={() => setActiveModuleFilter(mod)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap uppercase transition-all ${
              activeModuleFilter === mod
                ? 'bg-[#1E4D4D] text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {mod}
          </button>
        ))}
      </div>

      {/* The Matrix Table Container */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-right border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black text-slate-600">
                <th className="p-3.5 sticky right-0 bg-slate-50 z-10 w-72">
                  الصلاحية والوحدة
                </th>
                {roles.map(role => (
                  <th key={role.id} className="p-3 text-center min-w-[90px]">
                    <div className="flex flex-col items-center">
                      <span className="font-bold">{role.name}</span>
                      <span className={`text-[8px] px-1.5 py-0.2 rounded font-mono ${
                        role.isSystemRole ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {role.isSystemRole ? 'نظامي' : 'مخصص'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPermissions.map(perm => (
                <tr key={perm.key} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 sticky right-0 bg-white group-hover:bg-slate-50 z-10 border-l border-slate-100">
                    <div className="font-bold text-slate-800 text-xs">{perm.description}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] font-mono text-slate-400">{perm.key}</span>
                      <span className="text-[8px] bg-slate-100 text-slate-600 font-bold px-1.5 rounded uppercase">
                        {perm.module}
                      </span>
                    </div>
                  </td>

                  {roles.map(role => {
                    const allowed = hasPermission(role, perm.key);
                    return (
                      <td key={role.id} className="p-3 text-center">
                        <div className="flex items-center justify-center">
                          {allowed ? (
                            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200" title="ممنوح">
                              <Check size={13} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center" title="محجوب">
                              <X size={13} />
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matrix Legend */}
      <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold text-slate-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <Check size={11} strokeWidth={3} />
            </div>
            <span>صلاحية ممنوحة ومفعلة للدور</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center">
              <X size={11} />
            </div>
            <span>صلاحية غير متوفرة (محجوبة تلقائياً)</span>
          </div>
        </div>

        <div className="text-slate-400 font-medium">
          يتم تطبيق الصلاحيات بشكل فوري على مستوى الواجهة والـ API.
        </div>
      </div>
    </div>
  );
};

export default PermissionMatrix;
