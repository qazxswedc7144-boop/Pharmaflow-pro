// src/features/purchases/components/smartImport/SmartImportSupplierResolution.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Mobile-First Enterprise Human Resolution UX — Invoice Data & Supplier Resolution Center
 */

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
  Sparkles,
  Ban,
  Calendar,
  Hash
} from 'lucide-react';

interface SmartImportSupplierResolutionProps {
  supplierDecision: SupplierDecision;
  availableSuppliers: Supplier[];
  onChange: (update: Partial<SupplierDecision>) => void;
  detectedInvoiceNumber?: string;
  detectedDate?: string;
  onUpdateInvoiceNumber?: (invNum: string) => void;
  onUpdateInvoiceDate?: (date: string) => void;
}

export const SmartImportSupplierResolution: React.FC<SmartImportSupplierResolutionProps> = ({
  supplierDecision,
  availableSuppliers,
  onChange,
  detectedInvoiceNumber,
  detectedDate,
  onUpdateInvoiceNumber,
  onUpdateInvoiceDate
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
          <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center gap-1">
            <CheckCircle2 size={12} />
            تطابق تام (100%)
          </span>
        );
      case SupplierResolutionStatus.HIGH_CONFIDENCE_MATCH:
        return (
          <span className="px-2 py-0.5 rounded-lg bg-teal-100 text-teal-800 text-[10px] font-black flex items-center gap-1">
            <Sparkles size={12} />
            مطابقة موثوقة ({Math.round(supplierDecision.confidence * 100)}%)
          </span>
        );
      case SupplierResolutionStatus.POSSIBLE_MATCH:
        return (
          <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-[10px] font-black flex items-center gap-1">
            <AlertCircle size={12} />
            يحتاج مراجعة (مطابقة تقريبية {Math.round(supplierDecision.confidence * 100)}%)
          </span>
        );
      case SupplierResolutionStatus.AMBIGUOUS:
        return (
          <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-[10px] font-black flex items-center gap-1">
            <AlertCircle size={12} />
            يحتاج مراجعة (تشابه مع عدة موردين)
          </span>
        );
      case SupplierResolutionStatus.UNRESOLVED:
        return (
          <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-900 text-[10px] font-black flex items-center gap-1">
            <AlertCircle size={12} />
            يحتاج مراجعة (غير مكتشف)
          </span>
        );
      case SupplierResolutionStatus.NEW_SUPPLIER:
        return (
          <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 text-[10px] font-black flex items-center gap-1">
            <UserPlus size={12} />
            مورد جديد غير مسجل
          </span>
        );
      default:
        if (supplierDecision.confidence < 0.70) {
          return (
            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-[10px] font-black flex items-center gap-1">
              <AlertCircle size={12} />
              يحتاج مراجعة
            </span>
          );
        }
        return (
          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black flex items-center gap-1">
            غير محدد
          </span>
        );
    }
  };

  const isUncertain = 
    supplierDecision.status === SupplierResolutionStatus.AMBIGUOUS ||
    supplierDecision.status === SupplierResolutionStatus.POSSIBLE_MATCH ||
    supplierDecision.status === SupplierResolutionStatus.UNRESOLVED ||
    supplierDecision.action === SupplierResolutionAction.UNRESOLVED ||
    (supplierDecision.confidence < 0.70 && !supplierDecision.matchedSupplierId && supplierDecision.action !== SupplierResolutionAction.CREATE_NEW && !supplierDecision.isSkipped);

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
        name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
        phone: supplierDecision.newSupplierData?.phone || '',
        taxNumber: supplierDecision.newSupplierData?.taxNumber || '',
        address: supplierDecision.newSupplierData?.address || ''
      },
      reason: 'تم تحديد إنشاء مورد جديد في قاعدة البيانات'
    });
  };

  const handleSkipSupplier = () => {
    onChange({
      action: SupplierResolutionAction.SKIP,
      isSkipped: true,
      reason: 'تم تخطي تعيين المورد'
    });
    setIsSearching(false);
    setShowNewSupplierForm(false);
  };

  const isInvoiceNumDetected = Boolean(detectedInvoiceNumber && detectedInvoiceNumber.trim() && !detectedInvoiceNumber.startsWith('ERR-') && !detectedInvoiceNumber.startsWith('INV-IMP-'));

  return (
    <div 
      id="smart-import-supplier-card"
      className="p-3 sm:p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs font-cairo space-y-2.5"
    >
      {/* SECTION TITLE & INVOICE META BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2 border-b border-slate-100">
        {/* Invoice Number */}
        <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/70">
          <Hash size={14} className="text-slate-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-500 shrink-0">رقم الفاتورة:</span>
          {isInvoiceNumDetected ? (
            <span className="text-xs font-mono font-black text-slate-900 truncate">
              {detectedInvoiceNumber}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-black shrink-0 flex items-center gap-1">
                <AlertCircle size={10} />
                غير مكتشف
              </span>
              {onUpdateInvoiceNumber && (
                <input
                  type="text"
                  placeholder="أدخل رقم الفاتورة يدويًا..."
                  className="bg-white border border-amber-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800 focus:outline-none flex-1 min-w-0"
                  onChange={(e) => onUpdateInvoiceNumber(e.target.value)}
                />
              )}
            </div>
          )}
        </div>

        {/* Invoice Date */}
        <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/70">
          <Calendar size={14} className="text-slate-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-500 shrink-0">تاريخ الفاتورة:</span>
          {detectedDate ? (
            <span className="text-xs font-mono font-black text-slate-900 truncate">
              {detectedDate}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold shrink-0">
                تلقائي (اليوم)
              </span>
              {onUpdateInvoiceDate && (
                <input
                  type="date"
                  className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800 focus:outline-none flex-1 min-w-0"
                  onChange={(e) => onUpdateInvoiceDate(e.target.value)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* SUPPLIER ROW */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 bg-[#1E4D4D]/10 text-[#1E4D4D] rounded-xl shrink-0">
            <Building2 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs font-black text-slate-800">
                المورد المستورد:{' '}
                <span className="text-[#1E4D4D] font-mono">
                  {supplierDecision.importedSupplierName || 'غير مكتشف'}
                </span>
              </h4>
              {getStatusBadge()}
            </div>
            {supplierDecision.matchedSupplierName && (
              <p className="text-[10px] text-emerald-700 font-bold mt-0.5 truncate">
                المورد المطابق: <strong className="underline">{supplierDecision.matchedSupplierName}</strong>
              </p>
            )}
            {supplierDecision.reason && (
              <p className={`text-[10px] font-medium mt-0.5 truncate ${
                isUncertain ? 'text-amber-800 font-bold' : 'text-slate-500'
              }`}>
                <span className="font-bold">السبب:</span> {supplierDecision.reason}
              </p>
            )}
          </div>
        </div>

        {/* Quick Decision Actions */}
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          <button
            id="btn-search-supplier"
            type="button"
            onClick={() => {
              setIsSearching(!isSearching);
              setShowNewSupplierForm(false);
            }}
            className="min-h-[34px] px-2.5 py-1 text-[11px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 transition-all whitespace-nowrap flex-shrink-0"
          >
            <Search size={12} />
            <span>{isSearching ? 'إغلاق' : '🔎 بحث وربط'}</span>
          </button>

          <button
            id="btn-create-supplier"
            type="button"
            onClick={handleCreateNewClick}
            className={`min-h-[34px] px-2.5 py-1 text-[11px] font-black rounded-lg flex items-center gap-1 transition-all whitespace-nowrap flex-shrink-0 ${
              supplierDecision.action === SupplierResolutionAction.CREATE_NEW
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
            }`}
          >
            <UserPlus size={12} />
            <span>➕ مورد جديد</span>
          </button>

          <button
            id="btn-skip-supplier"
            type="button"
            onClick={handleSkipSupplier}
            className={`min-h-[34px] px-2.5 py-1 text-[11px] font-black rounded-lg flex items-center gap-1 transition-all whitespace-nowrap flex-shrink-0 ${
              supplierDecision.isSkipped
                ? 'bg-slate-700 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <Ban size={12} />
            <span>🚫 تخطي</span>
          </button>
        </div>
      </div>

      {/* UNCERTAIN SUPPLIER WARNING BANNER */}
      {isUncertain && (
        <div className="p-2.5 bg-amber-50 border border-amber-200/90 rounded-xl text-xs font-bold text-amber-900 flex items-start gap-2">
          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <div className="font-black text-amber-950">تنبيه: المورد غير مؤكد ويتطلب مراجعة وتأكيد يدوي</div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              {supplierDecision.reason || 'لم يتم التأكد من هوية المورد تلقائيًا. يرجى تأكيد المورد من الاقتراحات أدناه، أو البحث في الدليل وربطه يدويًا لمنع تسجيل الفاتورة على مورد خاطئ.'}
            </p>
          </div>
        </div>
      )}

      {/* Suggested Supplier Match Cards (if any) */}
      {!isSearching && !showNewSupplierForm && supplierDecision.suggestedSuppliers?.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <span className="text-[10px] font-black text-slate-500 block">الموردون المقترحون بناءً على الاسم أو السجل:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {supplierDecision.suggestedSuppliers.map((s) => {
              const isMatched = supplierDecision.matchedSupplierId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    const full = availableSuppliers.find(sup => sup.id === s.id || sup.Supplier_ID === s.id);
                    if (full) handleSelectExisting(full);
                  }}
                  className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                    isMatched
                      ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500/20'
                      : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-800 truncate">{s.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      {s.taxNumber && <span>س.ت: {s.taxNumber}</span>}
                      {s.phone && <span>هاتف: {s.phone}</span>}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="text-[10px] font-mono font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      {Math.round(s.score * 100)}%
                    </span>
                    {isMatched && <CheckCircle2 size={14} className="text-emerald-600 mt-1" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Registered Supplier Dropdown / Panel */}
      {isSearching && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="relative">
            <Search size={14} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
            <input
              id="input-search-supplier-term"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، كود المورد، أو رقم الهاتف..."
              className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D]"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredSuppliers.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate-400 font-bold">لا يوجد مورد مسجل بهذا الاسم</p>
            ) : (
              filteredSuppliers.map((s) => (
                <div
                  key={s.id || s.Supplier_ID}
                  onClick={() => handleSelectExisting(s)}
                  className="p-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-lg cursor-pointer transition-all flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-black text-slate-800">{s.Supplier_Name}</span>
                    <span className="text-[10px] text-slate-400 mr-2">({s.Supplier_ID || s.id})</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {s.Phone && <span>{s.Phone}</span>}
                    <button
                      type="button"
                      className="px-2 py-0.5 bg-[#1E4D4D] text-white rounded text-[10px] font-black"
                    >
                      ربط
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Create New Supplier Draft Form */}
      {showNewSupplierForm && (
        <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
          <span className="text-[11px] font-black text-blue-900 block">بيانات المورد الجديد المزمع إنشاؤه:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">اسم المورد *</label>
              <input
                id="input-new-supplier-name"
                type="text"
                value={supplierDecision.newSupplierData?.name || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="اسم المورد"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">رقم الهاتف</label>
              <input
                id="input-new-supplier-phone"
                type="text"
                value={supplierDecision.newSupplierData?.phone || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
                      phone: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">الرقم الضريبي / السجل</label>
              <input
                id="input-new-supplier-tax"
                type="text"
                value={supplierDecision.newSupplierData?.taxNumber || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
                      taxNumber: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="123-456-789"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">العنوان</label>
              <input
                id="input-new-supplier-address"
                type="text"
                value={supplierDecision.newSupplierData?.address || ''}
                onChange={(e) => {
                  onChange({
                    newSupplierData: {
                      ...supplierDecision.newSupplierData,
                      name: supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '',
                      address: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                placeholder="القاهرة، مصر"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
