// src/features/purchases/components/smartImport/SmartImportBatchSummary.tsx
import React from 'react';
import { BatchProcessingSummary } from '../../services/smartImport/batchProcessing/types';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Ban, 
  Layers, 
  Search 
} from 'lucide-react';

export type ProductFilterTab = 'ALL' | 'UNRESOLVED' | 'MATCHED' | 'NEW' | 'SKIPPED';

interface SmartImportBatchSummaryProps {
  summary: BatchProcessingSummary;
  activeTab: ProductFilterTab;
  onTabChange: (tab: ProductFilterTab) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const SmartImportBatchSummary: React.FC<SmartImportBatchSummaryProps> = ({
  summary,
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange
}) => {
  return (
    <div className="space-y-2 font-cairo">
      {/* Metrics Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
        <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] font-black">
          <button
            type="button"
            onClick={() => onTabChange('ALL')}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeTab === 'ALL'
                ? 'bg-[#1E4D4D] text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers size={12} />
            <span>الكل ({summary.totalRows})</span>
          </button>

          {summary.unresolvedCount > 0 && (
            <button
              type="button"
              onClick={() => onTabChange('UNRESOLVED')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                activeTab === 'UNRESOLVED'
                  ? 'bg-amber-600 text-white shadow-sm animate-pulse'
                  : 'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle size={12} />
              <span>تحتاج قرار ({summary.unresolvedCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onTabChange('MATCHED')}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
              activeTab === 'MATCHED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 size={12} />
            <span>مطابقة ({summary.autoMatchedCount + summary.manualLinkedCount})</span>
          </button>

          {summary.createNewCount > 0 && (
            <button
              type="button"
              onClick={() => onTabChange('NEW')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                activeTab === 'NEW'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100'
              }`}
            >
              <Plus size={12} />
              <span>أصناف جديدة ({summary.createNewCount})</span>
            </button>
          )}

          {summary.skippedCount > 0 && (
            <button
              type="button"
              onClick={() => onTabChange('SKIPPED')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                activeTab === 'SKIPPED'
                  ? 'bg-slate-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Ban size={12} />
              <span>مستبعدة ({summary.skippedCount})</span>
            </button>
          )}
        </div>

        {/* Total Amount Pill */}
        <div className="px-3 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl font-mono text-xs font-black">
          الإجمالي: {summary.totalAmount.toLocaleString()} ر.س
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="بحث في الأصناف المستوردة، الأكواد، أو الباركود..."
          className="w-full h-8 pr-9 pl-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#1E4D4D] focus:border-[#1E4D4D] outline-none transition-all"
        />
      </div>
    </div>
  );
};
