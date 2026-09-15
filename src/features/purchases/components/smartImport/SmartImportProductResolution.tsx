// src/features/purchases/components/smartImport/SmartImportProductResolution.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Mobile-First Enterprise Human Resolution UX — Product Decision Center & Pharmaceutical Safety Shield
 */

import React, { useState, useMemo } from 'react';
import { 
  ProductDecision, 
  ProductResolutionAction, 
  ProductCandidate 
} from '../../services/smartImport/batchProcessing/types';
import { Product } from '@/types';
import { 
  CheckSquare, 
  Square, 
  CheckCircle2, 
  AlertCircle, 
  PlusCircle, 
  Ban, 
  Search, 
  ShieldAlert,
  Pill,
  Edit3,
  Check,
  Layers
} from 'lucide-react';
import { isValidExpiryDate } from '@/utils/expiryUtils';
import { CorrectionFeedbackRepository } from '../../services/smartImport/feedback/correctionFeedbackRepository';
import { authService } from '@features/auth/services/authService';

interface SmartImportProductResolutionProps {
  productDecisions: ProductDecision[];
  selectedRowIds: Set<number>;
  availableProducts: Product[];
  onToggleSelectRow: (rowId: number) => void;
  onUpdateDecision: (rowId: number, update: Partial<ProductDecision>) => void;
}

export const SmartImportProductResolution: React.FC<SmartImportProductResolutionProps> = ({
  productDecisions,
  selectedRowIds,
  availableProducts,
  onToggleSelectRow,
  onUpdateDecision
}) => {
  const [activeSearchRowId, setActiveSearchRowId] = useState<number | null>(null);
  const [editingDraftRowId, setEditingDraftRowId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Strict priority ordering:
  // 1. ⚠ يحتاج قرار (UNRESOLVED with dosage conflict / UNRESOLVED)
  // 2. 🔎 يحتاج بحث وربط (UNRESOLVED with suggestions)
  // 3. ➕ صنف جديد (CREATE_NEW)
  // 4. ✓ مرتبط تلقائياً (AUTO_MATCH / LINK_EXISTING)
  // 5. 🚫 تم التخطي (SKIP / isSkipped)
  const sortedDecisions = useMemo(() => {
    return [...productDecisions].sort((a, b) => {
      const getPriority = (row: ProductDecision) => {
        if (row.isSkipped || row.action === ProductResolutionAction.SKIP) return 5;
        if (row.dosageSafety?.isConflict && row.action === ProductResolutionAction.UNRESOLVED) return 1;
        if (row.action === ProductResolutionAction.UNRESOLVED) return (row.suggestedProducts && row.suggestedProducts.length > 0) ? 2 : 1;
        if (row.action === ProductResolutionAction.CREATE_NEW) return 3;
        if (row.action === ProductResolutionAction.AUTO_MATCH || row.action === ProductResolutionAction.LINK_EXISTING) return 4;
        return 2;
      };
      return getPriority(a) - getPriority(b);
    });
  }, [productDecisions]);

  const filteredSearchProducts = useMemo(() => {
    if (!searchTerm) return availableProducts.slice(0, 10);
    const q = searchTerm.toLowerCase();
    return availableProducts.filter(p => 
      (p.Name || p.name || '').toLowerCase().includes(q) ||
      (p.barcode || '').includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.categoryName || '').toLowerCase().includes(q)
    ).slice(0, 15);
  }, [availableProducts, searchTerm]);

  const handleSelectCandidate = (rowId: number, candidate: ProductCandidate | Product) => {
    const isCandidate = 'score' in candidate;
    const name = isCandidate ? candidate.name : (candidate.Name || candidate.name);
    const id = candidate.id;
    const barcode = candidate.barcode;

    const row = productDecisions.find(p => p.sourceRowId === rowId);

    const user = authService.getCurrentUser();
    const tenantId = (user as any)?.tenantId || 'DEFAULT_TENANT';
    const branchId = (user as any)?.branchId || 'WH-MAIN';

    CorrectionFeedbackRepository.recordCorrection({
      tenantId,
      branchId,
      sourceType: 'IMAGE',
      field: 'productName',
      originalExtractedValue: row?.importedProductName,
      correctedValue: name,
      provider: 'HumanReview',
      confidenceBefore: row?.confidence || 0.5,
      correctionReason: 'Manual Candidate Selection'
    }).catch(() => {});

    onUpdateDecision(rowId, {
      matchedProductId: id,
      matchedProductName: name,
      barcode: barcode || undefined,
      action: ProductResolutionAction.LINK_EXISTING,
      isSkipped: false,
      resolutionStatus: 'USER_RESOLVED',
      userDecision: 'LINK_EXISTING',
      reason: `تم ربطه يدوياً بالصنف: ${name}`
    });
    setActiveSearchRowId(null);
  };

  const handleSetAction = (rowId: number, action: ProductResolutionAction) => {
    const row = productDecisions.find(p => p.sourceRowId === rowId);

    if (action === ProductResolutionAction.SKIP) {
      onUpdateDecision(rowId, {
        action: ProductResolutionAction.SKIP,
        isSkipped: true,
        resolutionStatus: 'SKIPPED',
        userDecision: 'SKIP',
        reason: 'تم استبعاد الصنف من الفاتورة بقرار المستخدم'
      });
    } else if (action === ProductResolutionAction.CREATE_NEW) {
      onUpdateDecision(rowId, {
        action: ProductResolutionAction.CREATE_NEW,
        isSkipped: false,
        resolutionStatus: 'USER_RESOLVED',
        userDecision: 'CREATE_NEW',
        newProductData: row?.newProductData || {
          name: row?.importedProductName || '',
          barcode: row?.barcode,
          unitPrice: row?.unitPrice,
          costPrice: row?.unitPrice,
          strength: row?.extractedInfo?.dosage ? `${row.extractedInfo.dosage.value}${row.extractedInfo.dosage.unit}` : undefined,
          form: row?.extractedInfo?.form
        },
        reason: 'تم تأكيد إنشاء صنف جديد في قاعدة البيانات'
      });
    } else if (action === ProductResolutionAction.AUTO_MATCH || action === ProductResolutionAction.LINK_EXISTING) {
      const topCand = row?.suggestedProducts[0];
      if (topCand) {
        handleSelectCandidate(rowId, topCand);
      } else {
        setActiveSearchRowId(rowId);
      }
    }
  };

  const formatProvenance = (source?: string) => {
    switch (source) {
      case 'AI': return 'ذكاء اصطناعي';
      case 'OCR': return 'OCR';
      case 'LOCAL_PARSER': return 'ملف إكسل / CSV';
      case 'DATABASE_MATCH': return 'قاعدة البيانات';
      case 'USER': return 'معدل يدوياً';
      default: return 'OCR';
    }
  };

  return (
    <div className="space-y-3 font-cairo" id="smart-import-product-resolution-list">
      {sortedDecisions.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-500 font-bold text-xs space-y-1">
          <Layers className="mx-auto text-slate-400 mb-1" size={24} />
          <p>لم يتم العثور على أصناف موثوقة في المستند</p>
          <p className="text-[10px] text-slate-400">راجع المستند أو أدخل البيانات يدوياً</p>
        </div>
      ) : (
        sortedDecisions.map((row) => {
          const isSelected = selectedRowIds.has(row.sourceRowId);
          const isSearchOpen = activeSearchRowId === row.sourceRowId;
          const isDraftEditing = editingDraftRowId === row.sourceRowId;
          const isExpValid = !row.expiryDate || isValidExpiryDate(row.expiryDate);
          const hasDosageConflict = row.dosageSafety?.isConflict;
          const isSkipped = row.isSkipped || row.action === ProductResolutionAction.SKIP;
          const isNew = row.action === ProductResolutionAction.CREATE_NEW;
          const isUnresolved = row.action === ProductResolutionAction.UNRESOLVED && !isSkipped;

          return (
            <div
              key={row.sourceRowId}
              id={`product-card-${row.sourceRowId}`}
              className={`p-3 sm:p-4 rounded-2xl border transition-all space-y-3 ${
                isSkipped
                  ? 'bg-slate-100/70 border-slate-200 opacity-60'
                  : hasDosageConflict && isUnresolved
                    ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/20 shadow-xs'
                    : isUnresolved
                      ? 'bg-amber-50/40 border-amber-300 shadow-xs'
                      : isNew
                        ? 'bg-blue-50/40 border-blue-200'
                        : 'bg-white border-slate-200/90 hover:border-emerald-300 shadow-2xs'
              }`}
            >
              {/* Product Header: Row ID + Title + Pharmaceutical Badges */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggleSelectRow(row.sourceRowId)}
                    className="mt-0.5 text-slate-400 hover:text-[#1E4D4D] transition-all shrink-0 p-0.5"
                    aria-label="تحديد الصنف"
                  >
                    {isSelected ? (
                      <CheckSquare size={18} className="text-[#1E4D4D]" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                        #{row.sourceRowId}
                      </span>
                      <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-snug break-words">
                        {row.importedProductName || 'صنف غير مسمى'}
                      </h4>

                      {/* Extracted Pharmaceutical Badges */}
                      {row.extractedInfo?.dosage && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-black rounded-md flex items-center gap-1 shrink-0">
                          <Pill size={11} />
                          {row.extractedInfo.dosage.value} {row.extractedInfo.dosage.unit}
                        </span>
                      )}
                      {row.extractedInfo?.form && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-black rounded-md shrink-0">
                          {row.extractedInfo.form}
                        </span>
                      )}
                      {row.extractedInfo?.packSize && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black rounded-md shrink-0">
                          عبوة {row.extractedInfo.packSize}
                        </span>
                      )}
                    </div>

                    {/* Matched Target Name & Provenance metadata */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold flex-wrap">
                      {row.matchedProductName && (
                        <span className="text-emerald-700 font-black flex items-center gap-1">
                          المرتبط به: <strong className="text-emerald-800 underline">{row.matchedProductName}</strong>
                        </span>
                      )}
                      {row.barcode && (
                        <span>باركود: <strong className="text-slate-700 font-mono">{row.barcode}</strong></span>
                      )}
                      {row.supplierProductCode && (
                        <span>كود: <strong className="text-slate-700 font-mono">{row.supplierProductCode}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Badges Row: State + Source Provenance + Confidence */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold">
                {/* State Badge */}
                {row.action === ProductResolutionAction.AUTO_MATCH && (
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-black flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    ✓ مرتبط تلقائياً
                  </span>
                )}
                {row.action === ProductResolutionAction.LINK_EXISTING && (
                  <span className="px-2.5 py-1 bg-teal-100 text-teal-800 rounded-lg font-black flex items-center gap-1">
                    <Check size={12} className="text-teal-600" />
                    ✓ مرتبط يدوياً
                  </span>
                )}
                {row.action === ProductResolutionAction.CREATE_NEW && (
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg font-black flex items-center gap-1">
                    <PlusCircle size={12} className="text-blue-600" />
                    ➕ صنف جديد
                  </span>
                )}
                {isSkipped && (
                  <span className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg font-black flex items-center gap-1">
                    <Ban size={12} />
                    🚫 تم التخطي
                  </span>
                )}
                {isUnresolved && !hasDosageConflict && (
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg font-black flex items-center gap-1">
                    <AlertCircle size={12} className="text-amber-600" />
                    ⚠ يحتاج قرار
                  </span>
                )}
                {isUnresolved && hasDosageConflict && (
                  <span className="px-2.5 py-1 bg-rose-100 text-rose-900 rounded-lg font-black flex items-center gap-1">
                    <ShieldAlert size={12} className="text-rose-600" />
                    تعارض أمان دوائي
                  </span>
                )}

                {/* Provenance Badge */}
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                  المصدر: <strong>{formatProvenance(row.sourceProvenance)}</strong>
                </span>

                {/* Confidence Badge */}
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-mono">
                  الثقة: <strong>{Math.round((row.confidence || 0.6) * 100)}%</strong>
                </span>
              </div>

              {/* Pharmaceutical Safety Conflict Alert */}
              {hasDosageConflict && isUnresolved && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-rose-900 text-xs">
                  <div className="flex items-center gap-2 font-black">
                    <ShieldAlert size={16} className="text-rose-600 shrink-0" />
                    <span>تنبيه أمان صيدلاني حرج: {row.dosageSafety?.reason}</span>
                  </div>
                  <p className="text-[11px] text-rose-800">
                    تم حظر المطابقة التلقائية لحماية المرضى من خطأ صرف تركيز أو شكل دوائي مختلف.
                  </p>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSetAction(row.sourceRowId, ProductResolutionAction.CREATE_NEW)}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-black shadow-2xs flex items-center gap-1"
                    >
                      <PlusCircle size={12} />
                      إنشاء كصنف جديد (موصى به)
                    </button>
                    {row.suggestedProducts && row.suggestedProducts.length > 0 && row.suggestedProducts[0] && (
                      <button
                        type="button"
                        onClick={() => {
                          const candidate = row.suggestedProducts[0];
                          if (candidate) {
                            handleSelectCandidate(row.sourceRowId, candidate);
                          }
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-black shadow-2xs"
                      >
                        تأكيد الربط بالمقترح
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Numeric Data Row: Quantity, Price, Expiry, Batch */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 p-2 sm:p-2.5 bg-slate-50/80 border border-slate-200/70 rounded-xl text-xs font-bold text-slate-700">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">الكمية:</span>
                  <input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1;
                      const user = authService.getCurrentUser();
                      CorrectionFeedbackRepository.recordCorrection({
                        tenantId: (user as any)?.tenantId || 'DEFAULT_TENANT',
                        branchId: (user as any)?.branchId || 'WH-MAIN',
                        sourceType: 'IMAGE',
                        field: 'quantity',
                        originalExtractedValue: row.quantity,
                        correctedValue: val,
                        provider: 'HumanReview',
                        confidenceBefore: 0.8,
                        correctionReason: 'Manual Quantity Edit'
                      }).catch(() => {});

                      onUpdateDecision(row.sourceRowId, { quantity: val, total: val * row.unitPrice });
                    }}
                    className="w-full bg-white border border-slate-200 px-2 py-1 rounded text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1E4D4D]"
                    min="1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">سعر الشراء:</span>
                  <input
                    type="number"
                    value={row.unitPrice}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const user = authService.getCurrentUser();
                      CorrectionFeedbackRepository.recordCorrection({
                        tenantId: (user as any)?.tenantId || 'DEFAULT_TENANT',
                        branchId: (user as any)?.branchId || 'WH-MAIN',
                        sourceType: 'IMAGE',
                        field: 'unitPrice',
                        originalExtractedValue: row.unitPrice,
                        correctedValue: val,
                        provider: 'HumanReview',
                        confidenceBefore: 0.8,
                        correctionReason: 'Manual Price Edit'
                      }).catch(() => {});

                      onUpdateDecision(row.sourceRowId, { unitPrice: val, total: row.quantity * val });
                    }}
                    className="w-full bg-white border border-slate-200 px-2 py-1 rounded text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1E4D4D]"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">الإجمالي:</span>
                  <span className="font-mono font-black text-slate-900 py-1 block">
                    {(row.total || (row.quantity * row.unitPrice) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">الصلاحية:</span>
                  <input
                    type="text"
                    value={row.expiryDate || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const user = authService.getCurrentUser();
                      CorrectionFeedbackRepository.recordCorrection({
                        tenantId: (user as any)?.tenantId || 'DEFAULT_TENANT',
                        branchId: (user as any)?.branchId || 'WH-MAIN',
                        sourceType: 'IMAGE',
                        field: 'expiryDate',
                        originalExtractedValue: row.expiryDate,
                        correctedValue: val,
                        provider: 'HumanReview',
                        confidenceBefore: 0.7,
                        correctionReason: 'Manual Expiry Edit'
                      }).catch(() => {});

                      onUpdateDecision(row.sourceRowId, { expiryDate: val });
                    }}
                    placeholder="YYYY-MM"
                    className={`w-full bg-white border px-2 py-1 rounded text-xs font-mono font-bold ${
                      isExpValid ? 'border-slate-200 text-slate-800' : 'border-rose-300 text-rose-800 bg-rose-50'
                    }`}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">رقم التشغيلة (Batch):</span>
                  <input
                    type="text"
                    value={row.batchNumber || ''}
                    onChange={(e) => onUpdateDecision(row.sourceRowId, { batchNumber: e.target.value })}
                    placeholder="Batch #"
                    className="w-full bg-white border border-slate-200 px-2 py-1 rounded text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1E4D4D]"
                  />
                </div>
              </div>

              {/* Action Buttons Toolbar — Mobile Ergonomic & Non-Clipping */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {/* Search & Link Button */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveSearchRowId(isSearchOpen ? null : row.sourceRowId);
                    setEditingDraftRowId(null);
                  }}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 active:scale-95 ${
                    isSearchOpen
                      ? 'bg-[#1E4D4D] text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80'
                  }`}
                >
                  <Search size={14} className="flex-shrink-0" />
                  <span>{isSearchOpen ? 'إغلاق البحث' : '🔎 بحث وربط'}</span>
                </button>

                {/* Create New Product Button */}
                <button
                  type="button"
                  onClick={() => handleSetAction(row.sourceRowId, ProductResolutionAction.CREATE_NEW)}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 active:scale-95 ${
                    isNew
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
                  }`}
                >
                  <PlusCircle size={14} className="flex-shrink-0" />
                  <span>➕ إنشاء كصنف جديد</span>
                </button>

                {/* Skip Button — Explicit Full Label, Non-Shrinking & Clear Touch Target */}
                <button
                  type="button"
                  onClick={() => handleSetAction(row.sourceRowId, isSkipped ? ProductResolutionAction.UNRESOLVED : ProductResolutionAction.SKIP)}
                  className={`min-h-[38px] min-w-[85px] px-3 py-1.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 active:scale-95 ${
                    isSkipped
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  <Ban size={14} className="flex-shrink-0" />
                  <span>{isSkipped ? 'إلغاء التخطي' : '🚫 تخطي'}</span>
                </button>
              </div>

              {/* Suggestions Cards (when Unresolved and suggestions exist) */}
              {!isSearchOpen && row.suggestedProducts?.length > 0 && isUnresolved && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-black text-slate-500 block">أصناف مقترحة في قاعدة البيانات:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {row.suggestedProducts.map((cand) => (
                      <div
                        key={cand.id}
                        onClick={() => handleSelectCandidate(row.sourceRowId, cand)}
                        className="p-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-800 truncate">{cand.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            {cand.barcode && <span>باركود: {cand.barcode}</span>}
                            {cand.costPrice !== undefined && <span>تكلفة: {cand.costPrice} ج.م</span>}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <span className="text-[10px] font-mono font-black text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                            {Math.round(cand.score * 100)}%
                          </span>
                          <button
                            type="button"
                            className="block mt-1 px-2 py-0.5 bg-[#1E4D4D] text-white rounded text-[10px] font-black"
                          >
                            ربط
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Existing Products Panel */}
              {isSearchOpen && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute inset-y-0 right-3 my-auto text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="ابحث في سجل الأصناف بالاسم، الباركود، الكود، أو التصنيف..."
                      className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D]"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredSearchProducts.length === 0 ? (
                      <p className="p-3 text-center text-xs text-slate-400 font-bold">لا يوجد صنف مسجل مطابق للبحث</p>
                    ) : (
                      filteredSearchProducts.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectCandidate(row.sourceRowId, p)}
                          className="p-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-lg cursor-pointer transition-all flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-black text-slate-800">{p.Name || p.name}</span>
                            {p.barcode && <span className="text-[10px] text-slate-400 mr-2 font-mono">({p.barcode})</span>}
                            {p.categoryName && <span className="text-[10px] text-purple-600 mr-2">[{p.categoryName}]</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            {p.UnitPrice && <span>سعر: {p.UnitPrice} ج.م</span>}
                            <button
                              type="button"
                              className="px-2.5 py-0.5 bg-[#1E4D4D] text-white rounded text-[10px] font-black"
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

              {/* Create New Product Draft Form */}
              {isNew && (
                <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-blue-900">بيانات الصنف الجديد المزمع إضافته للمخزون:</span>
                    <button
                      type="button"
                      onClick={() => setEditingDraftRowId(isDraftEditing ? null : row.sourceRowId)}
                      className="text-[10px] font-black text-blue-700 hover:underline flex items-center gap-1"
                    >
                      <Edit3 size={11} />
                      <span>{isDraftEditing ? 'إخفاء التعديل' : 'تعديل التفاصيل'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">اسم الصنف الدوائي *</label>
                      <input
                        type="text"
                        value={row.newProductData?.name || row.importedProductName}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">الباركود</label>
                      <input
                        type="text"
                        value={row.newProductData?.barcode || row.barcode || ''}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: row.newProductData?.name || row.importedProductName,
                              barcode: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800 font-mono"
                        placeholder="الباركود الدولي"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">التركيز / القوة</label>
                      <input
                        type="text"
                        value={row.newProductData?.strength || ''}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: row.newProductData?.name || row.importedProductName,
                              strength: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                        placeholder="e.g. 500mg"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">الشكل الدوائي</label>
                      <input
                        type="text"
                        value={row.newProductData?.form || ''}
                        onChange={(e) => {
                          onUpdateDecision(row.sourceRowId, {
                            newProductData: {
                              ...row.newProductData,
                              name: row.newProductData?.name || row.importedProductName,
                              form: e.target.value
                            }
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                        placeholder="e.g. Tab / شراب"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
