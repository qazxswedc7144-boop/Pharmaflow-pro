import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  X, 
  Users, 
  Building2, 
  PlusCircle, 
  LogOut, 
  BarChart2, 
  Landmark, 
  Sliders 
} from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();

  // قائمة المجموعات والعناصر بعد المبسّطة بدون تكرار
  const menuGroups = [
    {
      title: 'قسم إدارة العملاء والشركاء',
      items: [
        { label: 'العملاء والموردون والشركاء', path: '/partners', icon: Users },
      ],
    },
    {
      title: 'قسم إدارة الفروع والإمداد',
      items: [
        { label: 'إدارة الفروع والصيدليات', path: '/branches', icon: Building2 },
      ],
    },
    {
      title: 'قسم التكامل المالي الموحد',
      items: [
        { label: 'المركز المالي الموحد', path: '/consolidation', icon: Landmark },
        { label: 'التسويات', path: '/reconciliation', icon: Sliders },
      ],
    },
    {
      title: 'قسم تحليلات الفروع الذكية',
      items: [
        { label: 'تقارير وتحليلات الفروع', path: '/branch-reports', icon: BarChart2 },
      ],
    },
    {
      title: 'قسم التحويل الدوائي بين الفروع',
      items: [
        { label: 'التحويلات بين الفروع', path: '/branch-transfers', icon: PlusCircle },
      ],
    },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex dir-rtl">
      {/* خلفية معتمة عند الفتح */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* الدرج الجانبي */}
      <div className="relative w-80 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col z-10 overflow-y-auto">
        
        {/* الهيدر والشعار */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-bold text-slate-800 text-lg leading-none">PharmaFlow</h2>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold tracking-wider">
                SMART LOGISTICS • STREAMLINED WORKFLOWS
              </p>
            </div>
          </div>
        </div>

        {/* قائمة الأقسام */}
        <div className="flex-1 py-4 px-3 space-y-6">
          {menuGroups.map((group, groupIdx) => (
            <div key={groupIdx}>
              <h3 className="px-3 text-xs font-bold text-slate-400 mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item, itemIdx) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={itemIdx}
                      onClick={() => {
                        navigate(item.path);
                        onClose();
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* الفوتر وسجل الدخول */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <span className="text-sm font-bold text-slate-700">{user?.username || 'admin'}</span>
          <button 
            title="تسجيل الخروج" 
            onClick={() => {
              onClose();
              if (signOut) signOut();
            }}
            className="p-2 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
