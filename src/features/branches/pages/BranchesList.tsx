import React, { useState } from 'react';
import { Building2, Plus, Search, RotateCw, MapPin, Phone, UserCheck, TrendingUp, PackageCheck, ArrowLeftRight, BarChart3, Edit3, Wifi, AlertCircle, ArrowRight } from 'lucide-react';
import { BranchModals } from './BranchModals';

export const BranchesList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<any>(null);
  const [selectedBranch, setSelectedBranch] = useState<any>(null);

  const [branches] = useState([
    { id: '1', code: 'BRH-MAIN', name: 'فرع صيدلية بلسم الرئيسي - الرياض', address: 'طريق الملك عبدالعزيز، الرياض', phone: '+966 11 405 1234', manager: 'د. أحمد السالم', status: 'online', salesToday: '14,250 ر.س', stockValue: '380,000 ر.س', lowStockCount: 3, isMain: true },
    { id: '2', code: 'BRH-NORTH', name: 'فرع شمال الرياض - الياسمين', address: 'شارع انس بن مالك، الياسمين، الرياض', phone: '+966 11 204 5678', manager: 'د. سارة العتيبي', status: 'online', salesToday: '8,900 ر.س', stockValue: '210,000 ر.س', lowStockCount: 7 },
    { id: '3', code: 'BRH-WEST', name: 'فرع غرب الرياض - البديعة', address: 'طريق المدينة المنورة، البديعة، الرياض', phone: '+966 11 433 9876', manager: 'د. خالد الغامدي', status: 'syncing', salesToday: '6,120 ر.س', stockValue: '175,000 ر.س', lowStockCount: 12 }
  ]);

  const filtered = branches.filter(b => b.name.includes(searchTerm) || b.code.includes(searchTerm));

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-[1px] py-2 sm:px-4 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="bg-[#064e46] text-white rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => window.history.back()} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/10 shrink-0">
              <ArrowRight size={20} />
            </button>
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <Building2 size={22} className="text-emerald-300" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black">إدارة شبكة الفروع والمخازن</h1>
              <p className="text-[11px] font-medium text-emerald-100/80">إدارة شاملة للمخازن والتحويلات البينية</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10">
            <button type="button" onClick={() => setActiveModal('add')} className="flex-1 h-10 bg-emerald-400 text-[#064e46] font-black text-xs rounded-xl flex items-center justify-center gap-2">
              <Plus size={18} /> <span>إضافة فرع جديد</span>
            </button>
            <button type="button" onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 800); }} className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center border border-white/10">
              <RotateCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="relative">
            <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="ابحث بالاسم، الرمز..." className="w-full h-11 bg-white border border-slate-200 rounded-xl pr-10 pl-4 text-xs font-bold outline-none" />
            <Search size={18} className="absolute right-3 top-3 text-slate-400" />
          </div>
          <div className="flex justify-between px-1 text-[11px] font-bold text-slate-500">
            <span>الفروع النشطة: {filtered.length} من أصل {branches.length}</span>
            <span className="text-[#064e46]">مربوطة بالمركز المالي</span>
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((branch) => (
            <div key={branch.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[#064e46] text-[10px] font-mono font-black">{branch.code}</span>
                  {branch.isMain && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">الفرع الرئيسي</span>}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <Wifi size={10} className={branch.status === 'online' ? 'text-emerald-600' : 'text-amber-600'} />
                  {branch.status === 'online' ? 'مزامنة نشطة' : 'تحديث معلق'}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">{branch.name}</h3>
                <div className="mt-1 space-y-1 text-slate-500 text-[11px]">
                  <div className="flex items-center gap-1.5"><MapPin size={13} /> <span>{branch.address}</span></div>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5"><Phone size={13} /><span dir="ltr" className="font-mono">{branch.phone}</span></span>
                    <span className="flex items-center gap-1 font-bold text-slate-600"><UserCheck size={13} className="text-[#064e46]" />{branch.manager}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 px-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[9px] font-bold">
                <div><span className="text-slate-400 flex items-center gap-1"><TrendingUp size={10} className="text-emerald-600" />مبيعات اليوم:</span><span className="text-xs font-black text-slate-800 block">{branch.salesToday}</span></div>
                <div className="border-r pr-2"><span className="text-slate-400 flex items-center gap-1"><PackageCheck size={10} className="text-blue-600" />قيمة المخزون:</span><span className="text-xs font-black text-slate-800 block">{branch.stockValue}</span></div>
                <div className="border-r pr-2"><span className="text-slate-400 flex items-center gap-1"><AlertCircle size={10} className="text-amber-600" />النواقص:</span><span className="text-xs font-black text-amber-700 block">{branch.lowStockCount} صنف</span></div>
              </div>
              <div className="flex gap-1.5 pt-1">
                <button type="button" onClick={() => { setSelectedBranch(branch); setActiveModal('transfer'); }} className="flex-1 h-8 bg-slate-100 hover:bg-emerald-50 text-slate-700 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 border"><ArrowLeftRight size={13} /><span>تحويل مخزني</span></button>
                <button type="button" onClick={() => { setSelectedBranch(branch); setActiveModal('analytics'); }} className="flex-1 h-8 bg-slate-100 hover:bg-emerald-50 text-slate-700 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 border"><BarChart3 size={13} /><span>تحليلات الفرع</span></button>
                <button type="button" onClick={() => { setSelectedBranch(branch); setActiveModal('edit'); }} className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center border"><Edit3 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        <BranchModals activeModal={activeModal} setActiveModal={setActiveModal} selectedBranch={selectedBranch} branches={branches} />
      </div>
    </div>
  );
};

export default BranchesList;
