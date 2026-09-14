// src/features/organization/components/UserManagement.tsx
import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Search, Shield, Building2, 
  CheckCircle2, XCircle, Sliders, 
  X, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import { TenantUserItem, RoleItem, PermissionDefinition } from '../types';
import { useAuthStore } from '../../../store/authStore';

export const UserManagement: React.FC = () => {
  const { tenantId } = useAuthStore();
  const [users, setUsers] = useState<TenantUserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('CASHIER');
  const [newBranchId, setNewBranchId] = useState('');

  // Edit / Override drawer state
  const [selectedUser, setSelectedUser] = useState<TenantUserItem | null>(null);
  const [userOverrides, setUserOverrides] = useState<Record<string, 'ALLOW' | 'DENY'>>({});
  const [selectedUserRoles, setSelectedUserRoles] = useState<string[]>([]);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const fetchUsersAndRoles = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch users
      const usersRes = await fetch('/api/organization/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
          'x-tenant-id': tenantId || 'default-tenant'
        }
      });
      if (usersRes.ok) {
        const uData = await usersRes.json();
        if (uData.data) setUsers(uData.data);
      }

      // 2. Fetch roles
      const rolesRes = await fetch('/api/rbac/roles', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
          'x-tenant-id': tenantId || 'default-tenant'
        }
      });
      if (rolesRes.ok) {
        const rData = await rolesRes.json();
        if (rData.data) setRoles(rData.data);
      }

      // 3. Fetch all permissions
      const permsRes = await fetch('/api/rbac/permissions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
          'x-tenant-id': tenantId || 'default-tenant'
        }
      });
      if (permsRes.ok) {
        const pData = await permsRes.json();
        if (pData.data?.permissions) setPermissions(pData.data.permissions);
      }
    } catch (err) {
      console.warn('[UserMgmt] Fetch error, using memory fallback:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndRoles();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    try {
      const res = await fetch('/api/organization/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
          'x-tenant-id': tenantId || 'default-tenant'
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          role: newRole,
          branchId: newBranchId || null,
          roleIds: [newRole]
        })
      });

      if (res.ok) {
        setFeedback({ type: 'success', message: 'تم إنشاء المستخدم بنجاح وتعيين الصلاحيات الأولية.' });
        setIsCreateModalOpen(false);
        setNewUsername('');
        fetchUsersAndRoles();
      } else {
        const errJson = await res.json();
        setFeedback({ type: 'error', message: errJson.error || 'فشل إنشاء المستخدم' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'تعذر الاتصال بالخادم' });
    }
  };

  const handleToggleActive = async (user: TenantUserItem) => {
    try {
      const res = await fetch(`/api/organization/users/${user.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
          'x-tenant-id': tenantId || 'default-tenant'
        },
        body: JSON.stringify({ isActive: !user.isActive })
      });

      if (res.ok) {
        setUsers(users.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u));
        setFeedback({ 
          type: 'success', 
          message: !user.isActive ? `تم تفعيل حساب ${user.username}` : `تم تعطيل حساب ${user.username} وإلغاء جلساته النشطة`
        });
      }
    } catch {
      setFeedback({ type: 'error', message: 'فشل تغيير حالة تفعيل المستخدم' });
    }
  };

  const openUserDrawer = async (user: TenantUserItem) => {
    setSelectedUser(user);
    setSelectedUserRoles(user.assignedRoles || [user.role]);
    setUserOverrides({});

    try {
      // Fetch user overrides
      const res = await fetch(`/api/rbac/users/${user.id}/effective-permissions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
          'x-tenant-id': tenantId || 'default-tenant'
        }
      });
      if (res.ok) {
        // Effective permissions loaded
      }
    } catch (e) {
      console.warn('Could not load effective perms:', e);
    }
  };

  const handleSaveUserOverrides = async () => {
    if (!selectedUser) return;
    setIsSavingUser(true);
    try {
      // Update roles
      await fetch(`/api/organization/users/${selectedUser.id}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
          'x-tenant-id': tenantId || 'default-tenant'
        },
        body: JSON.stringify({ roleIds: selectedUserRoles })
      });

      // Save each override
      for (const [permKey, effect] of Object.entries(userOverrides)) {
        await fetch(`/api/rbac/users/${selectedUser.id}/overrides`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || 'local-admin-token'}`,
            'x-tenant-id': tenantId || 'default-tenant'
          },
          body: JSON.stringify({ permissionKey: permKey, effect })
        });
      }

      setFeedback({ type: 'success', message: 'تم حفظ استثناءات وأدوار المستخدم بنجاح.' });
      setSelectedUser(null);
      fetchUsersAndRoles();
    } catch {
      setFeedback({ type: 'error', message: 'فشل حفظ التعديلات على المستخدم' });
    } finally {
      setIsSavingUser(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.branchName && u.branchName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو الدور أو الفرع..."
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsersAndRoles}
            disabled={isLoading}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl border border-slate-200 transition-colors"
            title="تحديث"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-[#1E4D4D] hover:bg-[#153838] text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-950/15 flex items-center justify-center gap-2 transition-all"
          >
            <UserPlus size={16} />
            <span>إضافة مستخدم جديد</span>
          </button>
        </div>
      </div>

      {/* Users Table / Card list */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs font-bold">لا يوجد مستخدمون مطابقون لبحثك</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div 
                key={user.id}
                className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-sm ${
                    user.isActive ? 'bg-gradient-to-br from-[#1E4D4D] to-[#2A6E6E]' : 'bg-slate-300'
                  }`}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-800">{user.username}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        user.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-red-50 text-red-700 border border-red-200/60'
                      }`}>
                        {user.isActive ? 'نشط' : 'معطل'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400 font-medium">
                      <span className="flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md font-bold text-[10px]">
                        <Shield size={11} />
                        <span>{user.role}</span>
                      </span>

                      {user.branchName && (
                        <span className="flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[10px] font-bold">
                          <Building2 size={11} />
                          <span>{user.branchName}</span>
                        </span>
                      )}

                      {user.overridesCount && user.overridesCount > 0 ? (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          {user.overridesCount} استثناءات خاصة
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => openUserDrawer(user)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Sliders size={13} />
                    <span>تخصيص الصلاحيات</span>
                  </button>

                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors ${
                      user.isActive 
                        ? 'bg-red-50 hover:bg-red-100 text-red-700' 
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {user.isActive ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                    <span>{user.isActive ? 'تعطيل' : 'تفعيل'}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-800">إضافة مستخدم جديد للنظام</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم (Username)</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. pharmacist_nour"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الدور الوظيفي الأساسي</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="CASHIER">كاشير ونقطة بيع (CASHIER)</option>
                  <option value="PHARMACIST">صيدلي مسؤول (PHARMACIST)</option>
                  <option value="INVENTORY_MANAGER">أمين مستودع (INVENTORY_MANAGER)</option>
                  <option value="ACCOUNTANT">محاسب مالي (ACCOUNTANT)</option>
                  <option value="ADMIN">مدير فرع (ADMIN)</option>
                  <option value="TENANT_ADMIN">مدير النظام والمؤسسة (TENANT_ADMIN)</option>
                  <option value="AUDITOR">مدقق حسابات ومراجع (AUDITOR)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الفرع المخصص</label>
                <select
                  value={newBranchId}
                  onChange={(e) => setNewBranchId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">جميع الفروع (أو إدارة مركزية)</option>
                  <option value="branch-01">الفرع الرئيسي (فرع الأمل)</option>
                  <option value="branch-02">فرع النور</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1E4D4D] hover:bg-[#153838] text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-950/10 transition-colors"
                >
                  حفظ المستخدم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. User Permissions Customization Drawer / Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-800">
                  تخصيص صلاحيات المستخدم: {selectedUser.username}
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">
                  يمكنك فرض استثناءات خاصة (السماح بالاستثناء ALLOW أو الحجب الصارم DENY)
                </p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar">
              {/* Role multi-selector */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                <h4 className="text-xs font-black text-slate-700 mb-2">الأدوار الممنوحة (Roles)</h4>
                <div className="flex flex-wrap gap-2">
                  {roles.map(r => {
                    const isChecked = selectedUserRoles.includes(r.name) || selectedUserRoles.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setSelectedUserRoles(selectedUserRoles.filter(x => x !== r.name && x !== r.id));
                          } else {
                            setSelectedUserRoles([...selectedUserRoles, r.name]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isChecked 
                            ? 'bg-[#1E4D4D] text-white shadow-sm' 
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isChecked ? <Check size={13} /> : null}
                        <span>{r.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permission overrides list */}
              <div>
                <h4 className="text-xs font-black text-slate-700 mb-2">
                  استثناءات الصلاحيات الفردية (Granular Overrides)
                </h4>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {permissions.slice(0, 20).map((perm) => {
                    const currentOverride = userOverrides[perm.key];
                    return (
                      <div 
                        key={perm.key}
                        className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50 rounded-xl border border-slate-100 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-700 block">{perm.description}</span>
                          <span className="font-mono text-[10px] text-slate-400">{perm.key}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setUserOverrides(prev => {
                                const next = { ...prev };
                                if (next[perm.key] === 'ALLOW') delete next[perm.key];
                                else next[perm.key] = 'ALLOW';
                                return next;
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                              currentOverride === 'ALLOW' 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700'
                            }`}
                          >
                            سماح (ALLOW)
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setUserOverrides(prev => {
                                const next = { ...prev };
                                if (next[perm.key] === 'DENY') delete next[perm.key];
                                else next[perm.key] = 'DENY';
                                return next;
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                              currentOverride === 'DENY' 
                                ? 'bg-red-600 text-white' 
                                : 'bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700'
                            }`}
                          >
                            حجب (DENY)
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Drawer footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingUser}
                onClick={handleSaveUserOverrides}
                className="px-6 py-2 bg-[#1E4D4D] hover:bg-[#153838] text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-950/10 flex items-center gap-2 transition-colors"
              >
                {isSavingUser ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>حفظ التغييرات الفورية</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
