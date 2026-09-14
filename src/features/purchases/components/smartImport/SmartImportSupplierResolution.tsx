// src/features/purchases/components/smartImport/SmartImportSupplierResolution.tsx
import React, { useState } from 'react';
import { 
  SupplierDecision, 
  SupplierResolutionAction, 
  SupplierResolutionStatus 
} from '../../services/smartImport/batchProcessing/types';
import { Supplier } from '@/types';
import { 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  UserPlus, 
  Search, 
  ChevronDown, 
  Sparkles,
  Ban
} from 'lucide-react';

interface SmartImportSupplierResolutionProps {
  supplierDecision: SupplierDecision;
  availableSuppliers: Supplier[];
  onChange: (update: Partial<SupplierDecision>) => void;
}

export const SmartImportSupplierResolution: React.FC<SmartImportSupplierResolutionProps> = ({
  supplierDecision,
  availableSuppliers,
  onChange
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(
    supplierDecision.action === SupplierResolutionAction.CREATE_NEW
  );

  const filteredSuppliers = React.useMemo(() => {
    if (!searchTerm) return availableSuppliers.slice(0, 8);
    const q = searchTerm.toLowerCase();
    return availableSuppliers.filter(s => 
      (s.Supplier_Name || '').toLowerCase().includes(q) ||
      (s.Supplier_ID || '').toLowerCase().includes(q) ||
      (s.Phone || '').includes(q)
    ).slice(0, 10);
  }, [availableSuppliers, searchTerm]);

  const getStatusBadge = () => {
    switch (supplierDecision.status) {
      case SupplierResolutionStatus.EXACT_MATCH:
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center gap-1">
            <CheckCircle2 size={12} />
            تطابق تام (100%)
          </span>
        );
      case SupplierResolutionStatus.HIGH_CONFIDENCE_MATCH:
        return (
          <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-black flex items-center gap-1">
            <Sparkles size={12} />
            تطابق عالي ({Math.round(supplierDecision.confidence * 100)}%)
          </span>
        );
      case SupplierResolutionStatus.POSSIBLE_MATCH:
      case SupplierResolutionStatus.AMBIGUOUS:
        return (
          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black flex items-center gap-1">
            <AlertCircle size={12} />
            يتطلب اختيار المورد
          </span>
        );
      case SupplierResolutionStatus.NEW_SUPPLIER:
      default:
        return (
          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-black flex items-center gap-1">
            <UserPlus size={12} />
            مورد غير مسجل
          </span>
        );
    }
  };

  const handleSelectExisting = (supplier: Supplier) => {
    onChange({
      matchedSupplierId: supplier.id || supplier.Supplier_ID,
      matchedSupplierName: supplier.Supplier_Name,
      action: SupplierResolutionAction.LINK_EXISTING,
      isSkipped: false,
      reason: `تم الاختيار اليدوي للمورد: ${supplier.Supplier_Name}`
    });
    setIsSearching(false);
    setShowNewSupplierForm(false);
  };

  const handleCreateNewClick = () => {
    setShowNewSupplierForm(true);
    setIsSearching(false);
    onChange({
      action: SupplierResolutionAction.CREATE_NEW,
      isSkipped: false,
      newSupplierData: {
        name: supplierDecision.importedSupplierName || '',
        phone: '',
        taxNumber: '',
        address: ''
      }
    });
  };

  const handleSkipSupplier = () => {
    setShowNewSupplierForm(false);
    setIsSearching(false);
    onChange({
      action: SupplierResolutionAction.SKIP,
      isSkipped: true,
      matchedSupplierId: undefined,
      matchedSupplierName: undefined,
      reason: 'تم تخطي تعيين المورد'
    });
  };

  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-3 font-cairo">
      {/* Header Info */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#1E4D4D]/10 text-[#1E4D4D] flex items-center justify-center">
            <Building2 size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-[#1E4D4D]">مورد الفاتورة:</span>
              <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200 font-mono">
                {supplierDecision.importedSupplierName || 'غير محدد بالملف'}
              </span>
              {getStatusBadge()}
            </div>
            {supplierDecision.reason && (
              <p className="text-[10px] text-slate-500 font-medium">{supplierDecision.reason}</p>
            )}
          </div>
        </div>

        {/* Action Toggle Buttons */}
        <div className="flex items-center gap-1.5 text-[10px] font-black">
          <button
            type="button"
            onClick={() => {
              setIsSearching(!isSearching);
              setShowNewSupplierForm(false);
            }}
            className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
              (supplierDecision.action === SupplierResolutionAction.AUTO_MATCH || supplierDecision.action === SupplierResolutionAction.LINK_EXISTING) && !showNewSupplierForm
                ? 'bg-[#1E4D4D] text-white border-[#1E4D4D]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Search size={12} />
            <span>{supplierDecision.matchedSupplierName ? `مرتبط بـ: ${supplierDecision.matchedSupplierName}` : 'ربط بمورد موجود'}</span>
            <ChevronDown size={10} />
          </button>

          <button
            type="button"
            onClick={handleCreateNewClick}
            className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
              supplierDecision.action === SupplierResolutionAction.CREATE_NEW
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
            }`}
          >
            <UserPlus size={12} />
            <span>إضافة كمورد جديد</span>
          </button>

          <button
            type="button"
            onClick={handleSkipSupplier}
            className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
              supplierDecision.isSkipped || supplierDecision.action === SupplierResolutionAction.SKIP
                ? 'bg-slate-300 text-slate-800 border-slate-400'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Ban size={12} />
            <span>تخطي المورد</span>
          </button>
        </div>
      </div>

      {/* Suggested & Search Supplier Dropdown */}
      {isSearching && (
        <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-sm">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، الكود، أو رقم الهاتف..."
              className="w-full h-8 pr-8 pl-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-[#1E4D4D] focus:bg-white outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1">
            {filteredSuppliers.map((s) => (
              <button
                key={s.id || s.Supplier_ID}
                type="button"
                onClick={() => handleSelectExisting(s)}
                className="w-full text-right p-2 rounded-lg hover:bg-emerald-50 transition-all flex items-center justify-between text-xs border border-transparent hover:border-emerald-200"
              >
                <div className="flex items-center gap-2">
                  <span className="font-black text-[#1E4D4D]">{s.Supplier_Name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({s.Supplier_ID || s.id})</span>
                </div>
                {s.Phone && <span className="text-[10px] text-slate-500 font-mono">{s.Phone}</span>}
              </button>
            ))}
            {filteredSuppliers.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-2">لا توجد نتائج مطابقة</p>
            )}
          </div>
        </div>
      )}

      {/* New Supplier Form */}
      {showNewSupplierForm && (
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3 space-y-2">
          <span className="text-xs font-black text-blue-900 block">
            بيانات المورد الجديد (سيتم إنشاؤه تلقائياً في قاعدة البيانات عند التطبيق):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">اسم المورد *</label>
              <input
                type="text"
                value={supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || ''}
                onChange={(e) => onChange({
                  newSupplierData: {
                    ...(supplierDecision.newSupplierData || { name: '' }),
                    name: e.target.value
                  }
                })}
                className="w-full h-8 px-2 bg-white border border-blue-300 rounded-lg text-xs font-black text-[#1E4D4D] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">رقم الهاتف</label>
              <input
                type="text"
                value={supplierDecision.newSupplierData?.phone || ''}
                onChange={(e) => onChange({
                  newSupplierData: {
                    ...(supplierDecision.newSupplierData || { name: '' }),
                    phone: e.target.value
                  }
                })}
                className="w-full h-8 px-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-[#1E4D4D] outline-none"
                placeholder="اختياري"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">الرقم الضريبي</label>
              <input
                type="text"
                value={supplierDecision.newSupplierData?.taxNumber || ''}
                onChange={(e) => onChange({
                  newSupplierData: {
                    ...(supplierDecision.newSupplierData || { name: '' }),
                    taxNumber: e.target.value
                  }
                })}
                className="w-full h-8 px-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-[#1E4D4D] outline-none"
                placeholder="اختياري"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
