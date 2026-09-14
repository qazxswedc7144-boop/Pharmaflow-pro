import React, { useState } from 'react';
import { ArrowLeftRight, BarChart3, Edit3, Plus, X, Send, Save, Check } from 'lucide-react';

const SAMPLE_MEDICINES = [
  'بنادول إكسترا (Panadol Extra)',
  'بنادول نايت (Panadol Night)',
  'بنادول أدفانس (Panadol Advance)',
  'بروفين 400 ملجم (Brufen 400mg)',
  'بروفين 600 ملجم (Brufen 600mg)',
  'أوجمنتين 1 جرام (Augmentin 1g)',
  'أمبرازول 20 ملجم (Omeprazole 20mg)',
  'فيتامين سي 1000 (Vitamin C 1000)',
  'كونجستال (Congestal)',
  'سيبتازول (Septazole)'
];

export const BranchModals = ({ activeModal, setActiveModal, selectedBranch, branches }: any) => {
  const [itemSearch, setItemSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  if (!activeModal) return null;

  const filteredMedicines = SAMPLE_MEDICINES.filter(med =>
    med.toLowerCase().includes(itemSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="bg-[#064e46] text-white px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-black flex items-center gap-2">
            {activeModal === 'transfer' && <ArrowLeftRight size={16} className="text-emerald-300" />}
            {activeModal === 'analytics' && <BarChart3 size={16} className="text-emerald-300" />}
            {activeModal === 'edit' && <Edit3 size={16} className="text-emerald-300" />}
            {activeModal === 'add' && <Plus size={16} className="text-emerald-300" />}
            
            {activeModal === 'transfer' && `تحويل مخزني - ${selectedBranch?.code}`}
            {activeModal === 'analytics' && `مؤشرات الأداء - ${selectedBranch?.code}`}
            {activeModal === 'edit' && `تعديل بيانات - ${selectedBranch?.code}`}
            {activeModal === 'add' && `إضافة فرع جديد`}
          </h3>
          <button
            type="button"
            onClick={() => { setActiveModal(null); setItemSearch(''); setShowSuggestions(false); }}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto text-xs">
          
          {/* 1. TRANSFER MODAL WITH AUTOCOMPLETE */}
          {activeModal === 'transfer' && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">الفرع المستهدف للتحويل:</label>
                <select className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-slate-700 outline-none focus:border-[#064e46]">
                  {branches.filter((b: any) => b.id !== selectedBranch?.id).map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Autocomplete Item Input */}
              <div className="relative">
                <label className="block text-slate-700 font-bold mb-1">اسم الصنف (التنبؤ التلقائي):</label>
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="اكتب حرفاً للبحث (مثل: بنادول)..."
                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold outline-none focus:border-[#064e46] focus:ring-1 focus:ring-[#064e46]"
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && itemSearch.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-[62px] bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                    {filteredMedicines.length > 0 ? (
                      filteredMedicines.map((med, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setItemSearch(med);
                            setShowSuggestions(false);
                          }}
                          className="w-full text-right px-3 py-2 hover:bg-emerald-50 text-slate-700 font-bold flex items-center justify-between text-xs transition-colors"
                        >
                          <span>{med}</span>
                          <Check size={12} className="text-emerald-600 opacity-0 hover:opacity-100" />
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-slate-400 font-bold text-center">لا يوجد صنف مطابق</div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">الكمية المطلوبة:</label>
                  <input type="number" defaultValue={10} className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">درجة الأولوية:</label>
                  <select className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-slate-700 outline-none">
                    <option>عادي</option>
                    <option>عاجل (نواقص مخزن)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  alert(`تم إرسال طلب تحويل (${itemSearch || 'الصنف المحدد'}) بنجاح`);
                  setActiveModal(null);
                  setItemSearch('');
                }}
                className="w-full h-10 bg-[#064e46] hover:bg-[#043832] text-white font-black rounded-xl flex items-center justify-center gap-2 mt-2 shadow-sm"
              >
                <Send size={15} />
                <span>إرسال أمر التحويل</span>
              </button>
            </div>
          )}

          {/* 2. DETAILED EDIT MODAL */}
          {(activeModal === 'edit' || activeModal === 'add') && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">رمز الفرع:</label>
                  <input type="text" defaultValue={activeModal === 'edit' ? selectedBranch?.code : 'BRH-NEW'} className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-mono font-bold text-slate-700 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-600 font-bold mb-1">اسم الفرع / الصيدلية:</label>
                  <input type="text" defaultValue={activeModal === 'edit' ? selectedBranch?.name : ''} placeholder="اسم الفرع..." className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-bold outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">الصيدلي المسؤول:</label>
                  <input type="text" defaultValue={activeModal === 'edit' ? selectedBranch?.manager : ''} placeholder="د. الاسم..." className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">رقم الهاتف:</label>
                  <input type="text" defaultValue={activeModal === 'edit' ? selectedBranch?.phone : ''} placeholder="+966..." className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-mono font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">العنوان بالتفصيل:</label>
                <input type="text" defaultValue={activeModal === 'edit' ? selectedBranch?.address : ''} placeholder="المدينة، الشارع..." className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">ساعات العمل:</label>
                  <input type="text" defaultValue="24 ساعة / يومياً" className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">الحد الأقصى للخصم %:</label>
                  <input type="number" defaultValue={10} className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">حالة اتصال المزامنة:</label>
                <select defaultValue={selectedBranch?.status || 'online'} className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2.5 font-bold text-slate-700 outline-none">
                  <option value="online">مزامنة نشطة (Online)</option>
                  <option value="syncing">تحديث معلق (Syncing)</option>
                  <option value="offline">غير متصل (Offline)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => { alert('تم حفظ تفاصيل الفرع بنجاح'); setActiveModal(null); }}
                className="w-full h-10 bg-[#064e46] hover:bg-[#043832] text-white font-black rounded-xl flex items-center justify-center gap-2 mt-3 shadow-sm"
              >
                <Save size={15} />
                <span>حفظ التعديلات والتغييرات</span>
              </button>
            </div>
          )}

          {/* 3. ANALYTICS MODAL */}
          {activeModal === 'analytics' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-bold">معدل دوران المخزون:</span>
                  <span className="font-black text-emerald-700">4.2 مرة / شهر</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-bold">متوسط الفاتورة اليومية:</span>
                  <span className="font-black text-slate-800">85 ر.س</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">نسبة تغطية الأصناف:</span>
                  <span className="font-black text-blue-700">96.4%</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-full h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                إغلاق النافذة
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
