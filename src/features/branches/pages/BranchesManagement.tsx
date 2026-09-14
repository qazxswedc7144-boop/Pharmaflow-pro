import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  RotateCw,
  MapPin,
  Phone,
  UserCheck,
  TrendingUp,
  PackageCheck,
  ArrowLeftRight,
  BarChart3,
  Edit3,
  Wifi,
  AlertCircle
} from 'lucide-react';

interface BranchItem {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  manager: string;
  status: 'online' | 'offline' | 'syncing';
  salesToday: string;
  stockValue: string;
  lowStockCount: number;
  isMain?: boolean;
}

export const BranchesManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [branches] = useState<BranchItem[]>([
    {
      id: '1',
      code: 'BRH-MAIN',
      name: 'فرع صيدلية بلسم الرئيسي - الرياض',
      address: 'طريق الملك عبدالعزيز، الرياض',
      phone: '+966 11 405 1234',
      manager: 'د. أحمد السالم',
      status: 'online',
      salesToday: '14,250 ر.س',
      stockValue: '380,000 ر.س',
      lowStockCount: 3,
      isMain: true
    },
    {
      id: '2',
      code: 'BRH-NORTH',
      name: 'فرع شمال الرياض - الياسمين',
      address: 'شارع انس بن مالك، الياسمين، الرياض',
      phone: '+966 11 204 5678',
      manager: 'د. سارة العتيبي',
      status: 'online',
      salesToday: '8,900 ر.س',
      stockValue: '210,000 ر.س',
      lowStockCount: 7
    },
    {
      id: '3',
      code: 'BRH-WEST',
      name: 'فرع غرب الرياض - البديعة',
      address: 'طريق المدينة المنورة، البديعة، الرياض',
      phone: '+966 11 433 9876',
      manager: 'د. خالد الغامدي',
      status: 'syncing',
      salesToday: '6,120 ر.س',
      stockValue: '175,000 ر.س',
      lowStockCount: 12
    }
  ]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const filteredBranches = branches.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-[1px] py-2 sm:px-4 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto space-y-3">
        
        {/* BANNER HEADER */}
        <div className="bg-[#064e46] text-white rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
          
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                <Building2 size={24} className="text-emerald-300" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black tracking-tight">إدارة شبكة الفروع والمخازن</h1>
                <p className="text-xs font-medium text-emerald-100/80 mt-0.5">
                  إدارة شاملة للمخازن والتحويلات البينية مع عزل كامل للصلاحيات
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10">
            <button
              type="button"
              className="flex-1 h-10 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] text-[#064e46] font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <Plus size={18} />
              <span>إضافة فرع جديد</span>
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all border border-white/10"
              title="تحديث البيانات"
            >
              <RotateCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="space-y-1.5">
          <div className="relative">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، الرمز، أو العنوان..."
              className="w-full h-11 bg-white border border-slate-200 rounded-xl pr-10 pl-4 text-xs font-bold text-slate-700 outline-none focus:border-[#064e46] focus:ring-1 focus:ring-[#064e46] shadow-sm transition-all placeholder:text-slate-400"
            />
            <Search size={18} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
          </div>
          <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500">
            <span>الفروع النشطة: {filteredBranches.length} من أصل {branches.length}</span>
            <span className="text-[#064e46]">مربوطة بالمركز المالي</span>
          </div>
        </div>

        {/* BRANCH CARDS LIST */}
        <div className="space-y-3">
          {filteredBranches.map((branch) => (
            <div
              key={branch.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:border-[#064e46]/40 transition-all"
            >
              <div className="p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[#064e46] text-[10px] font-mono font-black">
                      {branch.code}
                    </span>
                    {branch.isMain && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                        الفرع الرئيسي
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${branch.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                      <Wifi size={10} className={branch.status === 'online' ? 'text-emerald-600' : 'text-amber-600'} />
                      {branch.status === 'online' ? 'مزامنة نشطة' : 'تحديث معلق'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black text-slate-800 leading-snug">{branch.name}</h3>
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
                      <MapPin size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{branch.address}</span>
                    </div>
                    <div className="flex items-center gap-4 text-slate-500 text-[11px] font-medium">
                      <span className="flex items-center gap-1.5">
                        <Phone size={13} className="text-slate-400 shrink-0" />
                        <span dir="ltr" className="font-mono text-xs">{branch.phone}</span>
                      </span>
                      <span className="flex items-center gap-1 text-slate-600 font-bold">
                        <UserCheck size={13} className="text-[#064e46] shrink-0" />
                        <span>{branch.manager}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 px-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                      <TrendingUp size={10} className="text-emerald-600" />
                      مبيعات اليوم:
                    </span>
                    <span className="text-xs font-black text-slate-800 block truncate">{branch.salesToday}</span>
                  </div>
                  <div className="space-y-0.5 border-r border-slate-200 pr-2">
                    <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                      <PackageCheck size={10} className="text-blue-600" />
                      قيمة المخزون:
                    </span>
                    <span className="text-xs font-black text-slate-800 block truncate">{branch.stockValue}</span>
                  </div>
                  <div className="space-y-0.5 border-r border-slate-200 pr-2">
                    <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                      <AlertCircle size={10} className="text-amber-600" />
                      النواقص:
                    </span>
                    <span className="text-xs font-black text-amber-700 block">{branch.lowStockCount} صنف</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    className="flex-1 h-8 bg-slate-100 hover:bg-emerald-50 hover:text-[#064e46] active:scale-[0.98] text-slate-700 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all border border-slate-200/80"
                  >
                    <ArrowLeftRight size={13} />
                    <span>تحويل مخزني</span>
                  </button>
                  <button
                    type="button"
                    className="flex-1 h-8 bg-slate-100 hover:bg-emerald-50 hover:text-[#064e46] active:scale-[0.98] text-slate-700 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all border border-slate-200/80"
                  >
                    <BarChart3 size={13} />
                    <span>تحليلات الفرع</span>
                  </button>
                  <button
                    type="button"
                    className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition-all border border-slate-200/80"
                    title="تعديل بيانات الفرع"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>

              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default BranchesManagement;
