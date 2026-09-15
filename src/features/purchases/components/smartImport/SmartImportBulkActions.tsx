// src/features/purchases/components/smartImport/SmartImportBulkActions.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.4: Safe Bulk Actions Toolbar with Pharmaceutical Safety Shield
 */

import React from 'react';
import { 
  CheckSquare, 
  Square, 
  PlusCircle, 
  Trash2,
  ShieldCheck
} from 'lucide-react';

interface SmartImportBulkActionsProps {
  selectedCount: number;
  totalDisplayedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onBulkApproveMatched: () => void;
  onBulkCreateNew: () => void;
  onBulkSkipSelected: () => void;
}

export const SmartImportBulkActions: React.FC<SmartImportBulkActionsProps> = ({
  selectedCount,
  totalDisplayedCount,
  allSelected,
  onToggleSelectAll,
  onBulkApproveMatched,
  onBulkCreateNew,
  onBulkSkipSelected
}) => {
  return (
    <div 
      id="smart-import-bulk-actions"
      className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-100/90 border border-slate-200 rounded-xl font-cairo text-[11px] font-black"
    >
      {/* Select All Toggle */}
      <div className="flex items-center gap-2">
        <button
          id="btn-toggle-select-all"
          type="button"
          onClick={onToggleSelectAll}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-all active:scale-95 shadow-2xs"
        >
          {allSelected && totalDisplayedCount > 0 ? (
            <CheckSquare size={14} className="text-[#1E4D4D]" />
          ) : (
            <Square size={14} className="text-slate-400" />
          )}
          <span>{allSelected ? 'إلغاء التحديد' : 'تحديد الكل'}</span>
        </button>

        {selectedCount > 0 && (
          <span className="text-[11px] text-slate-600 font-bold bg-white px-2 py-1 rounded-md border border-slate-200">
            تم تحديد <strong className="text-[#1E4D4D] font-mono">{selectedCount}</strong> من {totalDisplayedCount}
          </span>
        )}
      </div>

      {/* Bulk Action Buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          id="btn-bulk-approve-matched"
          type="button"
          onClick={onBulkApproveMatched}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
          title="اعتماد كل الأصناف التي تم التعرف عليها تلقائياً دون تعارضات دوائية"
        >
          <ShieldCheck size={13} />
          <span>اعتماد المطابقات الآمنة</span>
        </button>

        {selectedCount > 0 && (
          <>
            <button
              id="btn-bulk-create-new"
              type="button"
              onClick={onBulkCreateNew}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
              title="تعيين الأصناف المحددة لإنشائها كأصناف جديدة في قاعدة البيانات"
            >
              <PlusCircle size={13} />
              <span>إنشاء المحدد كجديد ({selectedCount})</span>
            </button>

            <button
              id="btn-bulk-skip-selected"
              type="button"
              onClick={onBulkSkipSelected}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
              title="استبعاد الأصناف المحددة من الفاتورة"
            >
              <Trash2 size={13} />
              <span>استبعاد ({selectedCount})</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
