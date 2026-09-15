// src/features/purchases/components/smartImport/SmartImportBatchSummary.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Mobile-First Resolution Metrics Bar & Dynamic Category Filter Tabs
 */

import React from 'react';
import { BatchProcessingSummary } from '../../services/smartImport/batchProcessing/types';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Ban, 
  Layers, 
  Search, 
  ShieldAlert, 
  Sparkles 
} from 'lucide-react';

export type ProductFilterTab = 
  | 'ALL' 
  | 'NEEDS_REVIEW' 
  | 'CONFLICTS' 
  | 'MATCHED' 
  | 'NEW' 
  | 'SKIPPED';

export interface SmartImportBatchSummaryProps {
  summary: BatchProcessingSummary;
  supplierStatus?: string;
  activeTab: ProductFilterTab;
  onTabChange: (tab: ProductFilterTab) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  confidenceScore?: number;
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  providerName?: string;
  isCached?: boolean;
  isFallbackActive?: boolean;
  healedRowsCount?: number;
}

export const SmartImportBatchSummary: React.FC<SmartImportBatchSummaryProps> = ({
  summary,
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  confidenceScore,
  confidenceLevel,
  healedRowsCount = 0
}) => {
  const criticalCount = summary.criticalConflictsCount || 0;
  const matchedTotal = (summary.autoMatchedCount || 0) + (summary.manualLinkedCount || 0);

  const getConfidenceBadge = () => {
    if (confidenceScore === undefined) return null;
    const pct = Math.round(confidenceScore * 100);
    if (confidenceLevel === 'BLOCKED' || criticalCount > 0) {
      return (
        <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 text-[10px] font-black border border-rose-300 flex items-center gap-1">
          <ShieldAlert size={12} className="text-rose-600 shrink-0" />
          <span>محظور للأمان ({pct}%)</span>
        </span>
      );
    }
    if (confidenceScore >= 0.90) {
      return (
        <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300 flex items-center gap-1">
          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
          <span>دقة عالية ({pct}%)</span>
        </span>
      );
    }
    if (confidenceScore >= 0.70) {
      return (
        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300 flex items-center gap-1">
          <AlertTriangle size={12} className="text-amber-600 shrink-0" />
          <span>دقة متوسطة ({pct}%)</span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 text-[10px] font-black border border-rose-300 flex items-center gap-1">
        <AlertTriangle size={12} className="text-rose-600 shrink-0" />
        <span>دقة منخفضة ({pct}%)</span>
      </span>
    );
  };

  return (
    <div className="space-y-2.5 font-cairo" id="smart-import-batch-summary">
      {/* Compact Summary Grid (Mobile-First 2x2 or 4-columns) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Total Metric */}
        <div 
          onClick={() => onTabChange('ALL')}
          className={`p-2 sm:p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
            activeTab === 'ALL'
              ? 'bg-[#1E4D4D] text-white border-[#1E4D4D] shadow-xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold opacity-80">الإجمالي</div>
          <div className="text-base sm:text-lg font-black font-mono leading-tight">{summary.totalRows}</div>
        </div>

        {/* Matched Metric */}
        <div 
          onClick={() => onTabChange('MATCHED')}
          className={`p-2 sm:p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
            activeTab === 'MATCHED'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-emerald-50/60 border-emerald-200 text-emerald-900 hover:bg-emerald-100/60'
          }`}
        >
          <div className="text-[10px] font-bold opacity-90">✓ مرتبط</div>
          <div className="text-base sm:text-lg font-black font-mono leading-tight text-emerald-800">{matchedTotal}</div>
        </div>

        {/* Needs Decision Metric */}
        <div 
          onClick={() => onTabChange('NEEDS_REVIEW')}
          className={`p-2 sm:p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
            activeTab === 'NEEDS_REVIEW' || activeTab === 'CONFLICTS'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-amber-50/60 border-amber-200 text-amber-900 hover:bg-amber-100/60'
          }`}
        >
          <div className="text-[10px] font-bold opacity-90">⚠ يحتاج قرار</div>
          <div className="text-base sm:text-lg font-black font-mono leading-tight text-amber-800">{summary.unresolvedCount}</div>
        </div>

        {/* Skipped Metric */}
        <div 
          onClick={() => onTabChange('SKIPPED')}
          className={`p-2 sm:p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
            activeTab === 'SKIPPED'
              ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
              : 'bg-slate-100/80 border-slate-200 text-slate-700 hover:bg-slate-200/80'
          }`}
        >
          <div className="text-[10px] font-bold opacity-80">🚫 متخطى</div>
          <div className="text-base sm:text-lg font-black font-mono leading-tight text-slate-700">{summary.skippedCount}</div>
        </div>
      </div>

      {/* Filter Tabs & Badges Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200/80 rounded-xl">
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px] font-black w-full sm:w-auto scrollbar-none">
          {/* ALL Tab */}
          <button
            id="tab-all"
            type="button"
            onClick={() => onTabChange('ALL')}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
              activeTab === 'ALL'
                ? 'bg-[#1E4D4D] text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layers size={12} />
            <span>الكل ({summary.totalRows})</span>
          </button>

          {/* CRITICAL CONFLICTS Tab */}
          {criticalCount > 0 && (
            <button
              id="tab-conflicts"
              type="button"
              onClick={() => onTabChange('CONFLICTS')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
                activeTab === 'CONFLICTS'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100'
              }`}
            >
              <ShieldAlert size={12} className="text-rose-500" />
              <span>تعارض أمان ({criticalCount})</span>
            </button>
          )}

          {/* NEEDS REVIEW Tab */}
          {summary.unresolvedCount > 0 && (
            <button
              id="tab-needs-review"
              type="button"
              onClick={() => onTabChange('NEEDS_REVIEW')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
                activeTab === 'NEEDS_REVIEW'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle size={12} className="text-amber-600" />
              <span>يحتاج قرار ({summary.unresolvedCount})</span>
            </button>
          )}

          {/* MATCHED Tab */}
          <button
            id="tab-matched"
            type="button"
            onClick={() => onTabChange('MATCHED')}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
              activeTab === 'MATCHED'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 size={12} className="text-emerald-600" />
            <span>مرتبط ({matchedTotal})</span>
          </button>

          {/* NEW PRODUCTS Tab */}
          {summary.createNewCount > 0 && (
            <button
              id="tab-new"
              type="button"
              onClick={() => onTabChange('NEW')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
                activeTab === 'NEW'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100'
              }`}
            >
              <Plus size={12} className="text-blue-600" />
              <span>جديد ({summary.createNewCount})</span>
            </button>
          )}

          {/* SKIPPED Tab */}
          {summary.skippedCount > 0 && (
            <button
              id="tab-skipped"
              type="button"
              onClick={() => onTabChange('SKIPPED')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
                activeTab === 'SKIPPED'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Ban size={12} />
              <span>متخطى ({summary.skippedCount})</span>
            </button>
          )}
        </div>

        {/* Confidence & Badges */}
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
          {getConfidenceBadge()}
          {healedRowsCount > 0 && (
            <span className="text-[10px] bg-sky-50 text-sky-800 px-2 py-0.5 rounded-lg border border-sky-200 font-bold flex items-center gap-1">
              <Sparkles size={11} className="text-sky-600" />
              <span>{healedRowsCount} سطر مستعفى</span>
            </span>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
          <Search size={14} />
        </div>
        <input
          id="search-imported-products"
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="بحث سريع في الأصناف المستوردة بالاسم، الباركود، أو السعر..."
          className="w-full pl-3 pr-9 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4D4D]/20 focus:border-[#1E4D4D] transition-all"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
          >
            مسح
          </button>
        )}
      </div>
    </div>
  );
};
