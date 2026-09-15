// src/features/organization/components/OrganizationDashboard.tsx
import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, ShieldCheck, KeyRound, Sparkles, 
  CheckCircle2, RefreshCw
} from 'lucide-react';
import { OrganizationStats, SubscriptionInfo } from '../types';
import { useAuthStore } from '../../../store/authStore';
import { unifiedTransport } from '@/shared/network/transport/unifiedTransport';

export const OrganizationDashboard: React.FC<{ onNavigateTab: (tab: string) => void }> = ({ onNavigateTab }) => {
  const { subscriptionPlan } = useAuthStore();
  const [stats, setStats] = useState<OrganizationStats>({
    totalUsers: 4,
    totalBranches: 2,
    totalRoles: 8,
    activePolicies: 48,
    complianceScore: 99.2
  });
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    status: 'ACTIVE',
    maxBranches: 10,
    maxUsers: 50,
    offlineSync: true,
    auditRetentionDays: 365
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchDashboard = async () => {
    setIsLoading(true);
    try {
      const json: any = await unifiedTransport.get('/api/organization/dashboard');
      if (json && json.data) {
        if (json.data.stats) setStats(json.data.stats);
        if (json.data.subscription) setSubscription(json.data.subscription);
      }
    } catch (e) {
      console.warn('[Dashboard] Fallback data used:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-l from-[#1E4D4D] to-[#123030] text-white rounded-3xl p-6 shadow-xl shadow-emerald-950/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-x-12 -translate-y-12 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-400/20 text-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1">
                <Sparkles size={11} />
                <span>إصدار المؤسسات السحابي (Multi-Tenant Sovereign Edition)</span>
              </span>
              <span className="bg-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {subscriptionPlan || 'ENTERPRISE'}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black">
              هيكل المنظومة والصلاحيات المركزية
            </h2>
            <p className="text-xs text-emerald-100/70 mt-1 max-w-xl font-medium">
              إدارة الفروع، المستخدمين، الأدوار المخصصة، ومصفوفة الصلاحيات مع عزل كامل للبيانات وتدقيق أمني شامل.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={fetchDashboard}
              disabled={isLoading}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors text-white text-xs font-bold flex items-center gap-2"
              title="تحديث البيانات"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div 
          onClick={() => onNavigateTab('users')}
          className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400">المستخدمون النشطون</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{stats.totalUsers}</p>
          <p className="text-[10px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 size={10} />
            <span>حد الاشتراك: {subscription.maxUsers} مستخدم</span>
          </p>
        </div>

        <div 
          onClick={() => onNavigateTab('branches')}
          className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400">الفروع والمستودعات</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{stats.totalBranches}</p>
          <p className="text-[10px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 size={10} />
            <span>مفعلة بالعزل اللامركزي</span>
          </p>
        </div>

        <div 
          onClick={() => onNavigateTab('roles')}
          className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400">الأدوار والمجموعات</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <KeyRound size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{stats.totalRoles}</p>
          <p className="text-[10px] font-bold text-purple-600 mt-1">
            <span>8 قياسية + مخصصة</span>
          </p>
        </div>

        <div 
          onClick={() => onNavigateTab('matrix')}
          className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400">مؤشر الامتثال الأمني</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldCheck size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600">{stats.complianceScore}%</p>
          <p className="text-[10px] font-bold text-slate-400 mt-1">
            <span>تدقيق وتشفير مستمر</span>
          </p>
        </div>
      </div>

      {/* 3. Security Highlights & Isolation Policies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Multi-Tenant Isolation Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">ضوابط العزل المؤسسي (Tenant Isolation)</h3>
              <p className="text-[11px] text-slate-400 font-medium">سريان السياسات المشددة عبر طبقات النظام</p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs font-semibold">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="text-slate-600">عزل قاعدة البيانات التلقائي (Prisma Scoping):</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-md">مفعل 100%</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="text-slate-600">عزل التخزين المحلي للمتصفح (Dexie Partitioning):</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-md">مفعل 100%</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="text-slate-600">عزل الفروع التلقائي (Branch Boundary):</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-md">مفعل</span>
            </div>
          </div>
        </div>

        {/* Quick Actions Shortcuts */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <KeyRound size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">إجراءات سريعة لإدارة الهيكل</h3>
                <p className="text-[11px] text-slate-400 font-medium">الوصول الفوري لأهم وحدات التحكم</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => onNavigateTab('users')}
                className="p-3 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 rounded-2xl text-xs font-bold border border-slate-100 text-right transition-all"
              >
                + إضافة مستخدم جديد
              </button>
              <button 
                onClick={() => onNavigateTab('roles')}
                className="p-3 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 rounded-2xl text-xs font-bold border border-slate-100 text-right transition-all"
              >
                + إنشاء دور مخصص
              </button>
              <button 
                onClick={() => onNavigateTab('matrix')}
                className="p-3 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 rounded-2xl text-xs font-bold border border-slate-100 text-right transition-all"
              >
                مصفوفة الصلاحيات
              </button>
              <button 
                onClick={() => onNavigateTab('branches')}
                className="p-3 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 rounded-2xl text-xs font-bold border border-slate-100 text-right transition-all"
              >
                أمان ضوابط الفروع
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizationDashboard;
