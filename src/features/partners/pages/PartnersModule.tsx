
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@/core/db';
import { useUI, useAccounting } from '@/contexts/AppContext';
import { Card, Button, Modal, Input } from '@/components/shared/SharedUI';
import { 
  Users, Search, MoreVertical, Phone, 
  MapPin, CreditCard, UserPlus, ArrowRight,
  TrendingUp, TrendingDown, UserCircle, Truck, Building2, BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PartnersModuleProps {
  onNavigate?: (view: any, params?: any) => void;
  subType?: string;
  initialTab?: string;
}

const mapSubTypeToTab = (type?: string): 'CUSTOMERS' | 'SUPPLIERS' | 'PARTNERS' | 'ALL' => {
  if (!type) return 'CUSTOMERS';
  const norm = type.toLowerCase();
  if (norm === 'supplier' || norm === 'suppliers') return 'SUPPLIERS';
  if (norm === 'customer' || norm === 'customers') return 'CUSTOMERS';
  if (norm === 'partner' || norm === 'partners') return 'PARTNERS';
  if (norm === 'all' || norm === 'directory' || norm === 'contacts') return 'ALL';
  return 'CUSTOMERS';
};

const PartnersModule: React.FC<PartnersModuleProps> = ({ onNavigate, subType, initialTab }) => {
  const { customers, suppliers, refreshAccounting } = useAccounting();
  const { currency, addToast } = useUI();
  
  const [activeTab, setActiveTab] = useState<'CUSTOMERS' | 'SUPPLIERS' | 'PARTNERS' | 'ALL'>(
    mapSubTypeToTab(subType || initialTab)
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any>(null);

  useEffect(() => {
    if (subType || initialTab) {
      setActiveTab(mapSubTypeToTab(subType || initialTab));
    }
  }, [subType, initialTab]);

  const partners = useMemo(() => {
    if (activeTab === 'SUPPLIERS') {
      return suppliers.map((s: any) => ({ ...s, partnerCategory: 'SUPPLIER', categoryLabel: 'مورد' }));
    }
    if (activeTab === 'CUSTOMERS') {
      return customers.map((c: any) => ({ ...c, partnerCategory: 'CUSTOMER', categoryLabel: 'عميل' }));
    }
    if (activeTab === 'PARTNERS') {
      const customerPartners = customers
        .filter((c: any) => c.isPartner || c.type === 'partner' || c.Category === 'PARTNER' || (c.Customer_Name || '').includes('شريك'))
        .map((c: any) => ({ ...c, partnerCategory: 'PARTNER', categoryLabel: 'شريك عميل' }));

      const supplierPartners = suppliers
        .filter((s: any) => s.isPartner || s.type === 'partner' || s.Category === 'PARTNER' || (s.Supplier_Name || '').includes('شريك'))
        .map((s: any) => ({ ...s, partnerCategory: 'PARTNER', categoryLabel: 'شريك مورد' }));

      const combined = [...customerPartners, ...supplierPartners];
      if (combined.length > 0) return combined;

      return [
        ...customers.slice(0, 5).map((c: any) => ({ ...c, partnerCategory: 'PARTNER', categoryLabel: 'شريك / جهة مرتبطة' })),
        ...suppliers.slice(0, 5).map((s: any) => ({ ...s, partnerCategory: 'PARTNER', categoryLabel: 'شريك / جهة مرتبطة' }))
      ];
    }
    return [
      ...suppliers.map((s: any) => ({ ...s, partnerCategory: 'SUPPLIER', categoryLabel: 'مورد' })),
      ...customers.map((c: any) => ({ ...c, partnerCategory: 'CUSTOMER', categoryLabel: 'عميل' }))
    ];
  }, [activeTab, customers, suppliers]);

  const filteredPartners = useMemo(() => {
    if (!searchTerm.trim()) return partners;
    const term = searchTerm.toLowerCase();
    return partners.filter((p: any) => 
      (p.Customer_Name || p.Supplier_Name || '').toLowerCase().includes(term) ||
      (p.Phone || '').includes(term) ||
      (p.Address || '').toLowerCase().includes(term)
    );
  }, [partners, searchTerm]);

  const handleSave = async () => {
    try {
      const isSupplierMode = activeTab === 'SUPPLIERS' || (editingPartner?.category === 'SUPPLIER');
      if (isSupplierMode) {
        const data = {
          id: editingPartner.id || db.generateId('SUPP'),
          Supplier_ID: editingPartner.id || db.generateId('SUPP'),
          Supplier_Name: editingPartner.name,
          Phone: editingPartner.phone || '',
          Address: editingPartner.address || '',
          Tax_Number: editingPartner.taxNumber || '',
          Email: editingPartner.email || '',
          Balance: editingPartner.balance || 0,
          updatedAt: new Date().toISOString()
        };
        await db.saveSupplier(data);
      } else {
        const data = {
          id: editingPartner.id || db.generateId('CUST'),
          Customer_ID: editingPartner.id || db.generateId('CUST'),
          Customer_Name: editingPartner.name,
          Phone: editingPartner.phone || '',
          Address: editingPartner.address || '',
          Tax_Number: editingPartner.taxNumber || '',
          Email: editingPartner.email || '',
          Balance: editingPartner.balance || 0,
          isPartner: activeTab === 'PARTNERS' || editingPartner.isPartner || false,
          updatedAt: new Date().toISOString()
        };
        await db.saveCustomer(data);
      }
      addToast("تم حفظ البيانات بنجاح ✅", "success");
      
      refreshAccounting();
      setIsModalOpen(false);
      setEditingPartner(null);
    } catch (err: any) {
      addToast(err.message || "حدث خطأ أثناء الحفظ", "error");
    }
  };

  const getPartnerLabel = () => {
    switch (activeTab) {
      case 'SUPPLIERS': return 'مورد';
      case 'CUSTOMERS': return 'عميل';
      case 'PARTNERS': return 'شريك';
      case 'ALL': return 'جهة اتصال';
    }
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'SUPPLIERS': return 'إدارة الموردين';
      case 'CUSTOMERS': return 'إدارة العملاء';
      case 'PARTNERS': return 'الشركاء والجهات المرتبطة';
      case 'ALL': return 'دليل جميع جهات الاتصال';
    }
  };

  const getHeaderDescription = () => {
    switch (activeTab) {
      case 'SUPPLIERS': return 'إدارة قائمة الموردين والشركات الموردة للأدوية والخدمات';
      case 'CUSTOMERS': return 'إدارة بيانات العملاء والحسابات المدينة والرصيد';
      case 'PARTNERS': return 'إدارة الشركاء والمستثمرين والجهات الطبيّة المرتبطة';
      case 'ALL': return 'الدليل الشامل الموحد لجميع جهات الاتصال والشركاء';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#F8FAFA] min-h-full font-cairo" dir="rtl">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#1E4D4D] text-white rounded-[20px] flex items-center justify-center shadow-xl">
            {activeTab === 'SUPPLIERS' ? <Truck size={28} /> : activeTab === 'PARTNERS' ? <Building2 size={28} /> : activeTab === 'ALL' ? <BookOpen size={28} /> : <Users size={28} />}
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#1E4D4D] tracking-tight">{getHeaderTitle()}</h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">{getHeaderDescription()}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 flex-wrap gap-1">
            <button 
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${activeTab === 'SUPPLIERS' ? 'bg-[#1E4D4D] text-white shadow-md' : 'text-slate-400 hover:text-[#1E4D4D]'}`}
            >
              الموردون
            </button>
            <button 
              onClick={() => setActiveTab('CUSTOMERS')}
              className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${activeTab === 'CUSTOMERS' ? 'bg-[#1E4D4D] text-white shadow-md' : 'text-slate-400 hover:text-[#1E4D4D]'}`}
            >
              العملاء
            </button>
            <button 
              onClick={() => setActiveTab('PARTNERS')}
              className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${activeTab === 'PARTNERS' ? 'bg-[#1E4D4D] text-white shadow-md' : 'text-slate-400 hover:text-[#1E4D4D]'}`}
            >
              الشركاء / الجهات المرتبطة
            </button>
            <button 
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${activeTab === 'ALL' ? 'bg-[#1E4D4D] text-white shadow-md' : 'text-slate-400 hover:text-[#1E4D4D]'}`}
            >
              دليل جهات الاتصال
            </button>
          </div>
          <button 
            onClick={() => onNavigate?.('dashboard')}
            className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-[#1E4D4D] transition-all shadow-sm shrink-0"
            title="العودة للوحة التحكم"
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#1E4D4D] transition-colors" size={20} />
          <input 
            type="text" 
            placeholder={`البحث في قائمة ${getPartnerLabel()}ين...`}
            className="w-full h-14 bg-white border border-slate-100 rounded-2xl pr-14 pl-6 text-[11px] font-black outline-none focus:border-[#1E4D4D] shadow-sm transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <button 
          onClick={() => { setEditingPartner({}); setIsModalOpen(true); }}
          className="h-14 px-8 bg-[#1E4D4D] text-white rounded-2xl flex items-center justify-center gap-3 text-[11px] font-black shadow-lg shadow-emerald-900/20 hover:scale-105 active:scale-95 transition-all"
        >
          <UserPlus size={18} />
          <span>إضافة {getPartnerLabel()} جديد</span>
        </button>
      </div>

      {/* Grid of Partners */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredPartners.map((p: any, idx: number) => {
            const id = p.Customer_ID || p.Supplier_ID || p.id;
            const name = p.Customer_Name || p.Supplier_Name || p.name;
            const balance = p.balance || p.Balance || 0;
            const categoryLabel = p.categoryLabel || getPartnerLabel();
            
            return (
              <motion.div
                key={id + '-' + idx}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card 
                  className="group relative overflow-hidden !rounded-[32px] border-slate-100/60 hover:border-[#1E4D4D]/20 transition-all hover:shadow-xl hover:-translate-y-1"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                    <UserCircle size={80} />
                  </div>
                  
                  <div className="flex flex-col gap-6 relative z-10">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 text-[#1E4D4D] rounded-2xl flex items-center justify-center font-black text-lg shadow-inner group-hover:bg-[#1E4D4D] group-hover:text-white transition-all">
                          {name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-[13px] font-black text-[#1E4D4D] group-hover:text-emerald-800 transition-colors">{name}</h3>
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {categoryLabel}
                            </span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{id}</p>
                        </div>
                      </div>
                      <button onClick={() => { setEditingPartner({ id, name, phone: p.Phone, address: p.Address, taxNumber: p.Tax_Number, email: p.Email, balance, category: p.partnerCategory }); setIsModalOpen(true); }} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-[#1E4D4D] hover:bg-slate-50 rounded-lg transition-all">
                        <MoreVertical size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                       <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Phone size={10}/> الهاتف</p>
                          <p className="text-[11px] font-black text-[#1E4D4D]">{p.Phone || '---'}</p>
                       </div>
                       <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><CreditCard size={10}/> الرصيد</p>
                          <p className={`text-[11px] font-black ${balance > 0 ? 'text-red-500' : balance < 0 ? 'text-emerald-500' : 'text-[#1E4D4D]'}`}>
                            {Math.abs(balance).toLocaleString()} <span className="text-[11px] opacity-40 font-normal">{currency}</span>
                            {balance > 0 && <TrendingUp size={10} className="inline ml-1"/>}
                            {balance < 0 && <TrendingDown size={10} className="inline ml-1"/>}
                          </p>
                       </div>
                    </div>

                    <div className="flex items-center gap-2 group-hover:translate-x-[-4px] transition-transform">
                      <MapPin size={12} className="text-slate-300 shrink-0" />
                      <p className="text-[11px] font-bold text-slate-400 truncate">{p.Address || 'لا يوجد عنوان مسجل'}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-50 mt-auto">
                       <Button variant="neutral" size="sm" className="flex-1 !rounded-xl !text-[11px] !py-3" onClick={() => onNavigate?.('aging-report')}>كشف حساب</Button>
                       <Button variant="secondary" size="sm" className="flex-1 !rounded-xl !text-[11px] !py-3" onClick={() => onNavigate?.(p.partnerCategory === 'SUPPLIER' || activeTab === 'SUPPLIERS' ? 'purchases' : 'sales')}>فاتورة جديدة</Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Modal - New/Edit Partner */}
      <AnimatePresence>
        {isModalOpen && (
          <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingPartner(null); }} title={`${editingPartner?.id ? 'تعديل' : 'إضافة'} بيانات ${getPartnerLabel()}`} noPadding>
            <div className="p-8 space-y-6">
               <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-2">اسم {getPartnerLabel()}</label>
                    <Input 
                      value={editingPartner?.name || ''} 
                      onChange={e => setEditingPartner({...editingPartner, name: e.target.value})} 
                      placeholder="الاسم بالكامل..." 
                      className="!h-14 !text-base focus:!border-[#1E4D4D]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-2">رقم الهاتف</label>
                      <Input 
                        value={editingPartner?.phone || ''} 
                        onChange={e => setEditingPartner({...editingPartner, phone: e.target.value})} 
                        placeholder="05xxxxxxxx" 
                        className="!h-14"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-2">الرقم الضريبي</label>
                      <Input 
                        value={editingPartner?.taxNumber || ''} 
                        onChange={e => setEditingPartner({...editingPartner, taxNumber: e.target.value})} 
                        placeholder="VAT Registration..." 
                        className="!h-14"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-2">البريد الإلكتروني</label>
                    <Input 
                      value={editingPartner?.email || ''} 
                      onChange={e => setEditingPartner({...editingPartner, email: e.target.value})} 
                      placeholder="email@example.com" 
                      className="!h-14"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-2">العنوان</label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-black text-[#1E4D4D] outline-none h-24 focus:bg-white focus:border-[#1E4D4D] transition-all"
                      value={editingPartner?.address || ''} 
                      onChange={e => setEditingPartner({...editingPartner, address: e.target.value})} 
                      placeholder="العنوان الكامل للشريك..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-2">الرصيد الافتتاحي</label>
                    <Input 
                      type="number" 
                      value={editingPartner?.balance || 0} 
                      onChange={e => setEditingPartner({...editingPartner, balance: parseFloat(e.target.value) || 0})} 
                      className="!h-14 !text-blue-600 font-black"
                    />
                  </div>
               </div>

               <div className="flex gap-4 pt-4">
                  <Button variant="neutral" className="flex-1 !h-14 !rounded-2xl" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
                  <Button variant="primary" className="flex-1 !h-14 !rounded-2xl shadow-xl shadow-emerald-900/20" onClick={handleSave}>حفظ البيانات ✅</Button>
               </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PartnersModule;
