// src/features/purchases/components/smartImport/SmartImportBulkActions.tsx
import React from 'react';
import { 
  CheckSquare, 
  Square, 
  Sparkles, 
  PlusCircle, 
  Trash2
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
    <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-100/80 border border-slate-200 rounded-xl font-cairo text-[11px] font-black">
      {/* Select All Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSelectAll}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-all active:scale-95"
        >
          {allSelected && totalDisplayedCount > 0 ? (
            <CheckSquare size={14} className="text-[#1E4D4D]" />
          ) : (
            <Square size={14} className="text-slate-400" />
          )}
          <span>{allSelected ? 'إلغاء التحديد' : 'تحديد الكل'}</span>
        </button>

        {selectedCount > 0 && (
          <span className="text-[10px] text-slate-500 font-bold">
            (تم تحديد {selectedCount} صنف)
          </span>
        )}
      </div>

      {/* Bulk Action Buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={onBulkApproveMatched}
          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-1 shadow-2xs active:scale-95"
          title="اعتماد كل الأصناف التي تم التعرف عليها تلقائياً"
        >
          <Sparkles size={12} />
          <span>اعتماد المطابقات التلقائية</span>
        </button>

        {selectedCount > 0 && (
          <>
            <button
              type="button"
              onClick={onBulkCreateNew}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all flex items-center gap-1 shadow-2xs active:scale-95"
              title="تعيين الأصناف المحددة لإنشائها كأصناف جديدة في قاعدة البيانات"
            >
              <PlusCircle size={12} />
              <span>إنشاء المحدد كجديد</span>
            </button>

            <button
              type="button"
              onClick={onBulkSkipSelected}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all flex items-center gap-1 shadow-2xs active:scale-95"
              title="استبعاد الأصناف المحددة من الفاتورة"
            >
              <Trash2 size={12} />
              <span>استبعاد المحدد</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
