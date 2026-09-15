// src/features/organization/components/RoleManagement.tsx
import React, { useState, useEffect } from 'react';
import { 
  KeyRound, Plus, Copy, Trash2, Edit3, 
  Check, X, CheckCircle2, AlertCircle, RefreshCw 
} from 'lucide-react';
import { RoleItem, PermissionDefinition } from '../types';
import { unifiedTransport } from '@/shared/network/transport/unifiedTransport';

export const RoleManagement: React.FC = () => {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Role Form Modal (Create or Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRolesAndPermissions = async () => {
    setIsLoading(true);
    try {
      const [rData, pData] = await Promise.all([
        unifiedTransport.get<any>('/api/rbac/roles'),
        unifiedTransport.get<any>('/api/rbac/permissions')
      ]);

      if (rData && rData.data) setRoles(rData.data);
      if (pData && pData.data?.permissions) setPermissions(pData.data.permissions);
    } catch (err) {
      console.warn('[RoleMgmt] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesAndPermissions();
  }, []);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setSelectedPermissions([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (role: RoleItem) => {
    if (role.isSystemRole) {
      setFeedback({ type: 'error', message: 'أدوار النظام القياسية محمية ولا يمكن تعديلها.' });
      return;
    }
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || '');
    setSelectedPermissions(role.permissions || []);
    setIsModalOpen(true);
  };

  const handleDuplicate = async (role: RoleItem) => {
    const newName = `${role.name} (نسخة)`;
    try {
      await unifiedTransport.post(`/api/rbac/roles/${role.id}/duplicate`, { name: newName });
      setFeedback({ type: 'success', message: `تم استنساخ الدور بنجاح: ${newName}` });
      fetchRolesAndPermissions();
    } catch {
      setFeedback({ type: 'error', message: 'فشل استنساخ الدور' });
    }
  };

  const handleDelete = async (role: RoleItem) => {
    if (role.isSystemRole) {
      setFeedback({ type: 'error', message: 'لا يمكن حذف أدوار النظام الأساسية.' });
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف الدور (${role.name}) نهائياً؟`)) return;

    try {
      await unifiedTransport.delete(`/api/rbac/roles/${role.id}`);
      setFeedback({ type: 'success', message: 'تم حذف الدور بنجاح.' });
      fetchRolesAndPermissions();
    } catch {
      setFeedback({ type: 'error', message: 'فشل حذف الدور' });
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingRole) {
        // Update
        await unifiedTransport.put(`/api/rbac/roles/${editingRole.id}`, {
          name: roleName.trim(),
          description: roleDescription.trim(),
          permissions: selectedPermissions
        });
        setFeedback({ type: 'success', message: 'تم تحديث الدور بنجاح.' });
        setIsModalOpen(false);
        fetchRolesAndPermissions();
      } else {
        // Create
        await unifiedTransport.post('/api/rbac/roles', {
          name: roleName.trim(),
          description: roleDescription.trim(),
          permissions: selectedPermissions
        });
        setFeedback({ type: 'success', message: 'تم إنشاء الدور المخصص بنجاح.' });
        setIsModalOpen(false);
        fetchRolesAndPermissions();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'فشل عملية حفظ الدور' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePermission = (key: string) => {
    if (selectedPermissions.includes(key)) {
      setSelectedPermissions(selectedPermissions.filter(k => k !== key));
    } else {
      setSelectedPermissions([...selectedPermissions, key]);
    }
  };

  // Group permissions by module
  const modulesGrouped: Record<string, PermissionDefinition[]> = {};
  for (const perm of permissions) {
    if (!modulesGrouped[perm.module]) {
      modulesGrouped[perm.module] = [];
    }
    modulesGrouped[perm.module]!.push(perm);
  }

  return (
    <div className="space-y-4">
      {/* Alert message */}
      {feedback && (
        <div className={`p-4 rounded-2xl flex items-center justify-between text-xs font-bold ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Top action bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h3 className="text-sm font-black text-slate-800">إدارة الأدوار والمجموعات (Roles & Permissions)</h3>
          <p className="text-[11px] text-slate-400 font-medium">إنشاء أدوار مخصصة وتحديد صلاحيات كل دور بدقة متناهية</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchRolesAndPermissions}
            disabled={isLoading}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl border border-slate-200 transition-colors"
            title="تحديث"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2.5 bg-[#1E4D4D] hover:bg-[#153838] text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-950/15 flex items-center gap-2 transition-all"
          >
            <Plus size={16} />
            <span>إنشاء دور مخصص</span>
          </button>
        </div>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((role) => (
          <div
            key={role.id}
            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:border-emerald-200 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${role.isSystemRole ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'}`}>
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800">{role.name}</h4>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md inline-block mt-0.5 ${
                      role.isSystemRole ? 'bg-emerald-100/70 text-emerald-800' : 'bg-purple-100/70 text-purple-800'
                    }`}>
                      {role.isSystemRole ? 'دور نظامي محمي' : 'دور مخصص للمؤسسة'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDuplicate(role)}
                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                    title="استنساخ الدور"
                  >
                    <Copy size={14} />
                  </button>

                  {!role.isSystemRole && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(role)}
                        className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(role)}
                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 font-medium mb-3">
                {role.description || 'لا يوجد وصف مسجل لهذا الدور.'}
              </p>

              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-2">
                  <span>الصلاحيات الممنوحة:</span>
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px]">
                    {role.permissions.includes('*') ? 'صلاحيات كاملة مطلقة (*)' : `${role.permissions.length} صلاحية`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto custom-scrollbar pr-1">
                  {role.permissions.slice(0, 8).map((p) => (
                    <span key={p} className="text-[9px] font-mono font-bold bg-white text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                      {p}
                    </span>
                  ))}
                  {role.permissions.length > 8 && (
                    <span className="text-[9px] font-bold text-slate-400 self-center">
                      +{role.permissions.length - 8} أخرى...
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Role Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-800">
                {editingRole ? `تعديل الدور: ${editingRole.name}` : 'إنشاء دور مخصص جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">اسم الدور المخصص</label>
                    <input
                      type="text"
                      required
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder="e.g. مشرف مبيعات فرع"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الوصف</label>
                    <input
                      type="text"
                      value={roleDescription}
                      onChange={(e) => setRoleDescription(e.target.value)}
                      placeholder="وصف مهام الدور..."
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black text-slate-700 mb-2">تحديد الصلاحيات الممنوحة</h4>
                  <div className="space-y-3">
                    {Object.entries(modulesGrouped).map(([modName, perms]) => (
                      <div key={modName} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                            وحدة {modName} ({perms.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const keys = perms.map(p => p.key);
                              const allSelected = keys.every(k => selectedPermissions.includes(k));
                              if (allSelected) {
                                setSelectedPermissions(selectedPermissions.filter(k => !keys.includes(k)));
                              } else {
                                const newSet = new Set([...selectedPermissions, ...keys]);
                                setSelectedPermissions(Array.from(newSet));
                              }
                            }}
                            className="text-[10px] font-bold text-emerald-700 hover:underline"
                          >
                            تحديد/إلغاء الكل
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {perms.map(p => {
                            const isChecked = selectedPermissions.includes(p.key);
                            return (
                              <div
                                key={p.key}
                                onClick={() => togglePermission(p.key)}
                                className={`p-2 rounded-xl text-xs cursor-pointer border transition-all flex items-center gap-2 ${
                                  isChecked 
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded-md flex items-center justify-center border text-[10px] ${
                                  isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
                                }`}>
                                  {isChecked && <Check size={11} />}
                                </div>
                                <div className="truncate">
                                  <span className="block text-[11px] font-bold">{p.description}</span>
                                  <span className="block text-[9px] font-mono text-slate-400">{p.key}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-[#1E4D4D] hover:bg-[#153838] text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-950/10 flex items-center gap-2 transition-colors"
                >
                  {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{editingRole ? 'حفظ التعديلات' : 'إنشاء الدور'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
