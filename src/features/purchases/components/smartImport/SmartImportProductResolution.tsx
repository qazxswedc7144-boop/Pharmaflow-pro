// src/features/purchases/components/smartImport/SmartImportProductResolution.tsx
import React, { useState } from 'react';
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
  Clock, 
  ChevronDown
} from 'lucide-react';
import { isValidExpiryDate } from '@/utils/expiryUtils';

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
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSearchProducts = React.useMemo(() => {
    if (!searchTerm) return availableProducts.slice(0, 10);
    const q = searchTerm.toLowerCase();
    return availableProducts.filter(p => 
      (p.Name || p.name || '').toLowerCase().includes(q) ||
      (p.barcode || '').includes(q) ||
      (p.id || '').toLowerCase().includes(q)
    ).slice(0, 15);
  }, [availableProducts, searchTerm]);

  const handleSelectCandidate = (rowId: number, candidate: ProductCandidate | Product) => {
    const isCandidate = 'score' in candidate;
    const name = isCandidate ? candidate.name : (candidate.Name || candidate.name);
    const id = candidate.id;
    const barcode = candidate.barcode;

    onUpdateDecision(rowId, {
      matchedProductId: id,
      matchedProductName: name,
      barcode: barcode || undefined,
      action: ProductResolutionAction.LINK_EXISTING,
      isSkipped: false,
      reason: `تم ربطه يدوياً بالصنف: ${name}`
    });
    setActiveSearchRowId(null);
  };

  const handleSetAction = (rowId: number, action: ProductResolutionAction) => {
    if (action === ProductResolutionAction.SKIP) {
      onUpdateDecision(rowId, {
        action: ProductResolutionAction.SKIP,
        isSkipped: true
      });
    } else if (action === ProductResolutionAction.CREATE_NEW) {
      const row = productDecisions.find(p => p.sourceRowId === rowId);
      onUpdateDecision(rowId, {
        action: ProductResolutionAction.CREATE_NEW,
        isSkipped: false,
        newProductData: row?.newProductData || {
          name: row?.importedProductName || '',
          barcode: row?.barcode,
          unitPrice: row?.unitPrice,
          costPrice: row?.unitPrice
        }
      });
    } else if (action === ProductResolutionAction.AUTO_MATCH || action === ProductResolutionAction.LINK_EXISTING) {
      const row = productDecisions.find(p => p.sourceRowId === rowId);
      const topCand = row?.suggestedProducts[0];
      if (topCand) {
        handleSelectCandidate(rowId, topCand);
      } else {
        setActiveSearchRowId(rowId);
      }
    }
  };

  return (
    <div className="space-y-2 font-cairo">
      {productDecisions.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 font-bold text-xs">
          لا توجد أصناف مطابقة للبحث أو الفلتر المحدد
        </div>
      ) : (
        productDecisions.map((row) => {
          const isSelected = selectedRowIds.has(row.sourceRowId);
          const isSearchOpen = activeSearchRowId === row.sourceRowId;
          const isExpValid = !row.expiryDate || isValidExpiryDate(row.expiryDate);

          return (
            <div
              key={row.sourceRowId}
              className={`p-3 rounded-2xl border transition-all ${
                row.isSkipped || row.action === ProductResolutionAction.SKIP
                  ? 'bg-slate-100/70 border-slate-200 opacity-60'
                  : row.action === ProductResolutionAction.UNRESOLVED
                    ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                    : row.action === ProductResolutionAction.CREATE_NEW
                      ? 'bg-blue-50/40 border-blue-200'
                      : 'bg-white border-slate-200/90 hover:border-emerald-300 shadow-2xs'
              }`}
            >
              {/* Top Row: Checkbox + Name + Status + Action Selector */}
              <div className="flex items-start justify-between gap-2 flex-wrap">
                {/* Checkbox & Product Name */}
                <div className="flex items-start gap-2.5 flex-1 min-w-[240px]">
                  <button
                    type="button"
                    onClick={() => onToggleSelectRow(row.sourceRowId)}
                    className="mt-0.5 text-slate-400 hover:text-[#1E4D4D] transition-all"
                  >
                    {isSelected ? (
                      <CheckSquare size={18} className="text-[#1E4D4D]" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{row.sourceRowId}
                      </span>
                      <span className="text-xs font-black text-[#1E4D4D]">
                        {row.importedProductName}
                      </span>

                      {/* Status Badges */}
                      {row.action === ProductResolutionAction.AUTO_MATCH && (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          مطابق: {row.matchedProductName} ({Math.round(row.confidence * 100)}%)
                        </span>
                      )}

                      {row.action === ProductResolutionAction.LINK_EXISTING && (
                        <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[9px] font-black flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          ربط يدوي: {row.matchedProductName}
                        </span>
                      )}

                      {row.action === ProductResolutionAction.CREATE_NEW && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-black flex items-center gap-1">
                          <PlusCircle size={10} />
                          صنف جديد
                        </span>
                      )}

                      {row.action === ProductResolutionAction.SKIP && (
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[9px] font-black flex items-center gap-1">
                          <Ban size={10} />
                          مستبعد
                        </span>
                      )}

                      {row.action === ProductResolutionAction.UNRESOLVED && (
                        <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 text-[9px] font-black flex items-center gap-1 animate-pulse">
                          <AlertCircle size={10} />
                          يتطلب تحديد القرار
                        </span>
                      )}
                    </div>

                    {/* Secondary meta (Barcode, Code, Batch, Reason) */}
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 font-bold">
                      {row.barcode && <span className="bg-slate-100 px-1.5 py-0.5 rounded">باركود: {row.barcode}</span>}
                      {row.supplierProductCode && <span className="bg-slate-100 px-1.5 py-0.5 rounded">كود: {row.supplierProductCode}</span>}
                      {row.batchNumber && <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">تشغيلة: {row.batchNumber}</span>}
                      {row.reason && <span className="text-slate-400 font-medium">({row.reason})</span>}
                    </div>
                  </div>
                </div>

                {/* Right: Action Selector Buttons */}
                <div className="flex items-center gap-1 text-[10px] font-black shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSearchRowId(isSearchOpen ? null : row.sourceRowId);
                      setSearchTerm('');
                    }}
                    className={`px-2 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                      (row.action === ProductResolutionAction.AUTO_MATCH || row.action === ProductResolutionAction.LINK_EXISTING)
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Search size={10} />
                    <span>{row.matchedProductName ? 'تغيير الربط' : 'ربط بصنف مسجل'}</span>
                    <ChevronDown size={10} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetAction(row.sourceRowId, ProductResolutionAction.CREATE_NEW)}
                    className={`px-2 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                      row.action === ProductResolutionAction.CREATE_NEW
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <PlusCircle size={10} />
                    <span>إنشاء جديد</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetAction(row.sourceRowId, row.action === ProductResolutionAction.SKIP ? ProductResolutionAction.UNRESOLVED : ProductResolutionAction.SKIP)}
                    className={`px-2 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                      row.action === ProductResolutionAction.SKIP
                        ? 'bg-slate-400 text-white border-slate-400'
                        : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                    }`}
                  >
                    <Ban size={10} />
                    <span>{row.action === ProductResolutionAction.SKIP ? 'إلغاء الاستبعاد' : 'استبعاد'}</span>
                  </button>
                </div>
              </div>

              {/* Product Match Candidates / Search Dropdown */}
              {isSearchOpen && (
                <div className="mt-2 p-2.5 bg-white border border-slate-200 rounded-xl space-y-2 shadow-sm">
                  {/* Top Candidates if available */}
                  {row.suggestedProducts && row.suggestedProducts.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 block">أقرب الأصناف المقترحة تلقائياً:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {row.suggestedProducts.map((cand) => (
                          <button
                            key={cand.id}
                            type="button"
                            onClick={() => handleSelectCandidate(row.sourceRowId, cand)}
                            className="p-2 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-right transition-all flex items-center justify-between text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-black text-[#1E4D4D] truncate">{cand.name}</p>
                              <p className="text-[10px] text-slate-400">{cand.categoryName || 'عام'} • رصيد: {cand.stockQuantity || 0}</p>
                            </div>
                            <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded shrink-0">
                              {Math.round(cand.score * 100)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual Search Input */}
                  <div className="space-y-1 pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 block">أو ابحث يدوياً في كافة أصناف الصيدلية:</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="ابحث بالاسم، الكود، أو الباركود..."
                      className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-[#1E4D4D] focus:bg-white outline-none"
                    />
                    <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
                      {filteredSearchProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectCandidate(row.sourceRowId, p)}
                          className="w-full text-right p-1.5 rounded-lg hover:bg-emerald-50 text-xs flex items-center justify-between border border-transparent hover:border-emerald-200"
                        >
                          <span className="font-black text-[#1E4D4D]">{p.Name || p.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.barcode || p.id}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Create New Product Details Panel */}
              {row.action === ProductResolutionAction.CREATE_NEW && (
                <div className="mt-2 p-2 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1 text-xs">
                  <span className="text-[10px] font-black text-blue-900 block">بيانات إنشاء الصنف الجديد:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block">اسم الصنف في النظام *</label>
                      <input
                        type="text"
                        value={row.newProductData?.name || row.importedProductName}
                        onChange={(e) => onUpdateDecision(row.sourceRowId, {
                          newProductData: {
                            ...(row.newProductData || { name: row.importedProductName }),
                            name: e.target.value
                          }
                        })}
                        className="w-full h-7 px-2 bg-white border border-blue-300 rounded-lg text-xs font-black text-[#1E4D4D] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block">الباركود</label>
                      <input
                        type="text"
                        value={row.newProductData?.barcode || row.barcode || ''}
                        onChange={(e) => onUpdateDecision(row.sourceRowId, {
                          newProductData: {
                            ...(row.newProductData || { name: row.importedProductName }),
                            barcode: e.target.value
                          }
                        })}
                        className="w-full h-7 px-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-[#1E4D4D] outline-none"
                        placeholder="اختياري"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block">التصنيف</label>
                      <input
                        type="text"
                        value={row.newProductData?.categoryName || 'General'}
                        onChange={(e) => onUpdateDecision(row.sourceRowId, {
                          newProductData: {
                            ...(row.newProductData || { name: row.importedProductName }),
                            categoryName: e.target.value
                          }
                        })}
                        className="w-full h-7 px-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-[#1E4D4D] outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Editable Fields: Quantity, Unit Price, Expiry Date, Total */}
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-xs font-black">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Quantity */}
                  <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold">الكمية:</span>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => onUpdateDecision(row.sourceRowId, { quantity: Number(e.target.value) })}
                      className="w-12 h-6 text-center bg-white border border-slate-200 rounded font-mono font-black text-[#1E4D4D] outline-none"
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold">السعر:</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unitPrice}
                      onChange={(e) => onUpdateDecision(row.sourceRowId, { unitPrice: Number(e.target.value) })}
                      className="w-16 h-6 text-center bg-white border border-slate-200 rounded font-mono font-black text-[#1E4D4D] outline-none"
                    />
                  </div>

                  {/* Expiry Date */}
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${
                    !isExpValid ? 'bg-red-50 border-red-300 text-red-700' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <Clock size={12} className={!isExpValid ? 'text-red-500' : 'text-slate-400'} />
                    <span className="text-[10px] text-slate-400 font-bold">الصلاحية:</span>
                    <input
                      type="text"
                      placeholder="YYYY-MM-DD"
                      value={row.expiryDate || ''}
                      onChange={(e) => onUpdateDecision(row.sourceRowId, { expiryDate: e.target.value })}
                      className="w-24 h-6 text-center bg-white border border-slate-200 rounded font-mono text-[11px] font-bold outline-none"
                    />
                  </div>

                  {/* Bonus */}
                  {row.bonusQty !== undefined && row.bonusQty > 0 && (
                    <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 text-emerald-800 text-[10px]">
                      <span>بونص:</span>
                      <span className="font-mono">{row.bonusQty}</span>
                    </div>
                  )}
                </div>

                {/* Line Total */}
                <div className="flex items-center gap-1.5 font-mono text-xs text-[#1E4D4D] bg-emerald-50/70 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-slate-400 font-sans">الإجمالي:</span>
                  <span>{(row.total || (row.quantity * row.unitPrice)).toLocaleString()}</span>
                  <span className="text-[9px] text-slate-400">ر.س</span>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
