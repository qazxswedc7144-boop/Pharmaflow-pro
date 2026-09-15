// src/features/purchases/components/smartImport/SmartImportProcessingCenter.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Mobile-First Enterprise Review Center — Compact UI adjustments for mobile
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  BatchProcessingSession,
  SupplierDecision,
  SupplierResolutionAction,
  ProductDecision,
  ProductResolutionAction,
  CanonicalResolutionResult
} from '../../services/smartImport/batchProcessing/types';
import { BatchProcessingOrchestrator } from '../../services/smartImport/batchProcessing/batchProcessingOrchestrator';
import { ImportAnalysisResult, ExtractedImportRow } from '../../services/smartImport/types';
import { Product, Supplier } from '@/types';
import { SmartImportBatchSummary, ProductFilterTab } from './SmartImportBatchSummary';
import { SmartImportBulkActions } from './SmartImportBulkActions';
import { SmartImportProductResolution } from './SmartImportProductResolution';
import { SmartImportSupplierResolution } from './SmartImportSupplierResolution';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Camera,
  Edit3
} from 'lucide-react';
import { Modal } from '@/components/shared/SharedUI';
import { useUIStore } from '@/store/useUIStore';

interface SmartImportProcessingCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  analysisResult: ImportAnalysisResult | null;
  isLoading: boolean;
  progressStage?: string;
  progressPercent?: number;
  progressMessage?: string;
  onApply: (
    approvedRows: ExtractedImportRow[],
    supplierName?: string,
    invoiceNumber?: string,
    date?: string,
    canonicalResult?: CanonicalResolutionResult
  ) => void;
  onApplyAndSaveImmediately?: (
    approvedRows: ExtractedImportRow[],
    supplierName?: string,
    invoiceNumber?: string,
    date?: string,
    canonicalResult?: CanonicalResolutionResult
  ) => void;
  availableProducts?: Product[];
  availableSuppliers?: Supplier[];
}

interface CanonicalInvoiceItem {
  name?: string;
  product_id?: number | string;
  productId?: number | string;
  qty?: number | string;
  price?: number | string;
  sum?: number | string;
  barcode?: string;
  productCode?: string;
  expiryDate?: string;
  batchNumber?: string;
  discountPercent?: number;
  bonusQty?: number;
  notes?: string;
}

export const SmartImportProcessingCenter: React.FC<SmartImportProcessingCenterProps> = ({
  isOpen,
  onClose,
  onCancel,
  analysisResult,
  isLoading,
  progressPercent = 50,
  progressMessage: _progressMessage = 'جاري تحليل ومعالجة المستند...',
  onApply,
  onApplyAndSaveImmediately,
  availableProducts = [],
  availableSuppliers = []
}) => {
  const [session, setSession] = useState<BatchProcessingSession | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<ProductFilterTab>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [validationErrorMsg, setValidationErrorMsg] = useState<string | null>(null);

  const [customInvoiceNumber, setCustomInvoiceNumber] = useState<string>('');
  const [customInvoiceDate, setCustomInvoiceDate] = useState<string>('');

  const addToast = useUIStore(state => state.addToast);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (!analysisResult || !isOpen) return;
      try {
        const newSession = await BatchProcessingOrchestrator.startSession({
          analysis: analysisResult,
          sourceType: analysisResult.sourceType,
          fileName: analysisResult.fileName
        });
        if (!isMounted) return;
        setSession(newSession);
        setSelectedRowIds(new Set());
        setValidationErrorMsg(null);
        setCustomInvoiceNumber(newSession.summary.detectedInvoiceNumber || '');
        setCustomInvoiceDate(newSession.summary.detectedDate || '');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SmartImportProcessingCenter] Session init error:', err);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [analysisResult, isOpen]);

  const displayedProductDecisions = useMemo(() => {
    if (!session) return [];
    const q = searchTerm.trim().toLowerCase();
    return session.productDecisions.filter(p => {
      if (q) {
        const matchesName =
          (p.importedProductName || '').toLowerCase().includes(q) ||
          (p.matchedProductName || '').toLowerCase().includes(q);
        const matchesBarcode = (p.barcode || '').toLowerCase().includes(q);
        const matchesCode = (p.supplierProductCode || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBarcode && !matchesCode) return false;
      }

      switch (activeFilterTab) {
        case 'CONFLICTS':
          return Boolean(p.dosageSafety?.isConflict) && !p.isSkipped;
        case 'NEEDS_REVIEW':
          return p.action === ProductResolutionAction.UNRESOLVED && !p.isSkipped;
        case 'MATCHED':
          return (
            (p.action === ProductResolutionAction.AUTO_MATCH || p.action === ProductResolutionAction.LINK_EXISTING) &&
            !p.isSkipped
          );
        case 'NEW':
          return p.action === ProductResolutionAction.CREATE_NEW && !p.isSkipped;
        case 'SKIPPED':
          return p.action === ProductResolutionAction.SKIP || p.isSkipped;
        case 'ALL':
        default:
          return true;
      }
    });
  }, [session, activeFilterTab, searchTerm]);

  const allDisplayedSelected = useMemo(() => {
    if (displayedProductDecisions.length === 0) return false;
    return displayedProductDecisions.every(p => selectedRowIds.has(p.sourceRowId));
  }, [displayedProductDecisions, selectedRowIds]);

  const handleToggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelectedRowIds(new Set());
    } else {
      const newSet = new Set<number>(selectedRowIds);
      displayedProductDecisions.forEach(p => newSet.add(p.sourceRowId));
      setSelectedRowIds(newSet);
    }
  };

  const handleToggleSelectRow = (rowId: number) => {
    const newSet = new Set<number>(selectedRowIds);
    if (newSet.has(rowId)) newSet.delete(rowId);
    else newSet.add(rowId);
    setSelectedRowIds(newSet);
  };

  const handleUpdateSupplier = (update: Partial<SupplierDecision>) => {
    if (!session) return;
    const updatedSession = BatchProcessingOrchestrator.updateSupplier(session, update);
    setSession(updatedSession);
    setValidationErrorMsg(null);
  };
  void _progressMessage;

  const handleUpdateProduct = (sourceRowId: number, update: Partial<ProductDecision>) => {
    if (!session) return;
    const updatedSession = BatchProcessingOrchestrator.updateProduct(session, sourceRowId, update);
    setSession(updatedSession);
    setValidationErrorMsg(null);
  };

  const handleBulkApproveMatched = () => {
    if (!session) return;
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'APPROVE_ALL_MATCHED');
    setSession(updated);
    addToast('تم اعتماد المطابقات التلقائية الآمنة بنجاح', 'success');
  };

  const handleBulkCreateNew = () => {
    if (!session || selectedRowIds.size === 0) return;
    const count = selectedRowIds.size;
    const ids = Array.from(selectedRowIds);
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'CREATE_SELECTED', ids);
    setSession(updated);
    setSelectedRowIds(new Set());
    addToast(`تم تعيين ${count} صنف لإنشائها كأصناف جديدة`, 'info');
  };

  const handleBulkSkipSelected = () => {
    if (!session || selectedRowIds.size === 0) return;
    const count = selectedRowIds.size;
    const ids = Array.from(selectedRowIds);
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'SKIP_SELECTED', ids);
    setSession(updated);
    setSelectedRowIds(new Set());
    addToast(`تم استبعاد ${count} صنف من الفاتورة`, 'info');
  };

  const handleExecuteApply = async (saveImmediately: boolean = false) => {
    if (!session) return;
    setIsApplying(true);
    setValidationErrorMsg(null);

    try {
      const validation = await BatchProcessingOrchestrator.validateSession(session);
      if (!validation.canApply) {
        const firstError = validation.errors?.[0]?.message ?? 'يرجى استكمال القرارات لجميع الأصناف والمورد قبل التطبيق';
        setValidationErrorMsg(firstError);
        addToast(`⚠️ تعذر التطبيق: ${firstError}`, 'error');
        setIsApplying(false);
        return;
      }

      const canonicalResult: CanonicalResolutionResult = await BatchProcessingOrchestrator.applyBatchSession(session);

      const invoiceItems: CanonicalInvoiceItem[] = Array.isArray(canonicalResult.invoiceItems)
        ? (canonicalResult.invoiceItems as CanonicalInvoiceItem[])
        : [];

      const approvedRows: ExtractedImportRow[] = invoiceItems.map((item, idx) => {
        const matchedId = item.product_id ?? item.productId ?? undefined;
        const qty = typeof item.qty === 'number' ? item.qty : Number(item.qty) || 0;
        const price = typeof item.price === 'number' ? item.price : Number(item.price) || 0;
        const sum = typeof item.sum === 'number' ? item.sum : Number(item.sum) || price * qty;

        const row: ExtractedImportRow = {
          rowNumber: idx + 1,
          rawCells: {},
          productName: item.name ?? '',
          matchedProductId: matchedId as any,
          matchedProductName: item.name ?? '',
          quantity: qty,
          unitPrice: price,
          total: sum,
          expectedTotal: sum,
          barcode: item.barcode,
          productCode: item.productCode,
          expiryDate: item.expiryDate,
          batchNumber: item.batchNumber,
          discountPercent: item.discountPercent,
          bonusQty: item.bonusQty,
          notes: item.notes,
          status: 'VALID',
          matchScore: 1.0,
          validationIssues: []
        };

        return row;
      });

      const finalSupplierName =
        session.supplierDecision?.action === SupplierResolutionAction.LINK_EXISTING
          ? (session.supplierDecision.matchedSupplierName || canonicalResult.appliedSupplierName)
          : session.supplierDecision?.action === SupplierResolutionAction.CREATE_NEW
          ? (session.supplierDecision.newSupplierData?.name || session.supplierDecision.importedSupplierName || canonicalResult.appliedSupplierName)
          : session.supplierDecision?.action === SupplierResolutionAction.SKIP
          ? ''
          : (canonicalResult.appliedSupplierName ?? session.summary.detectedSupplier ?? session.supplierDecision?.matchedSupplierName ?? session.supplierDecision?.importedSupplierName);
      const finalInvoiceNumber = customInvoiceNumber || canonicalResult.appliedInvoiceNumber || session.summary.detectedInvoiceNumber;
      const finalDate = customInvoiceDate || canonicalResult.appliedDate || session.summary.detectedDate;

      if (saveImmediately && typeof onApplyAndSaveImmediately === 'function') {
        onApplyAndSaveImmediately(approvedRows, finalSupplierName, finalInvoiceNumber, finalDate, canonicalResult);
      } else {
        onApply(approvedRows, finalSupplierName, finalInvoiceNumber, finalDate, canonicalResult);
      }

      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[SmartImportProcessingCenter] Apply error:', err);
      setValidationErrorMsg(message || 'حدث خطأ أثناء تطبيق دفعة الاستيراد');
      addToast(`❌ خطأ في تطبيق الاستيراد: ${message || 'حدث خطأ غير متوقع'}`, 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancel = async () => {
    try {
      if (session) await BatchProcessingOrchestrator.cancelSession(session.sessionId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SmartImportProcessingCenter] Cancel session error:', err);
    } finally {
      onCancel?.();
      onClose();
    }
  };

  const getSourceIcon = (type?: string) => {
    switch (type) {
      case 'EXCEL': return <FileSpreadsheet className="text-emerald-600" size={14} />;
      case 'CSV': return <FileText className="text-blue-600" size={14} />;
      case 'PDF': return <FileText className="text-red-600" size={14} />;
      case 'CAMERA': return <Camera className="text-amber-600" size={14} />;
      default: return <ImageIcon className="text-purple-600" size={14} />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title=""
      maxWidth={isLoading ? "max-w-md w-full sm:w-[90vw]" : "max-w-[880px] w-full sm:w-[95vw]"}
      noPadding={true}
      positionClass={isLoading ? "items-center" : "items-end sm:items-center"}
      centerOnMobile={true}
      showCloseButton={false}
    >
      <div 
        dir="rtl" 
        className={`flex flex-col bg-white rounded-2xl sm:rounded-3xl overflow-hidden font-cairo select-none ${
          isLoading
            ? 'min-h-[300px] h-auto max-h-[48vh] my-auto'
            : 'h-[96dvh] sm:h-[90vh] max-h-[96dvh]'
        }`}
      >

        {/* Compact header: title + source chip (smaller, single-row) */}
        <div className="bg-[#1E4D4D] text-white px-3 py-2 flex items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-emerald-300 shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-wide truncate">مركز مراجعة الاستيراد</h2>
                {analysisResult && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-200 text-[11px] font-bold rounded flex items-center gap-1">
                    {getSourceIcon(analysisResult.sourceType)}
                    <span className="truncate">{analysisResult.sourceType}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-100/80 font-medium truncate max-w-[260px]">
                راجع البيانات واتخذ القرار قبل إضافة الأصناف إلى الفاتورة
              </p>
            </div>
          </div>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-4 my-auto">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100 animate-ping opacity-30" />
              <div className="w-14 h-14 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin flex items-center justify-center">
                <Sparkles className="text-emerald-600 animate-pulse" size={20} />
              </div>
            </div>

            <div className="text-center space-y-1.5 max-w-sm px-2">
              <h3 className="text-xs sm:text-sm font-black text-[#1E4D4D] leading-relaxed">
                جاري تشغيل محرك OCR المحلي للتعرف على محتويات المستند...
              </h3>
              <p className="text-[11px] sm:text-xs font-bold text-slate-500 leading-normal">
                جاري فحص سلامة المستند، مطابقة الأصناف والمورد....
              </p>
            </div>

            <div className="w-full max-w-xs bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(15, progressPercent))}%` }}
              />
            </div>

            <button
              id="btn-abort-smart-import"
              type="button"
              onClick={handleCancel}
              className="mt-1 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              إلغاء المعالجة
            </button>
          </div>
        )}

        {/* Invoice metadata & Supplier Resolution Center */}
        {!isLoading && session && (
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <SmartImportSupplierResolution
              supplierDecision={session.supplierDecision}
              availableSuppliers={availableSuppliers}
              onChange={handleUpdateSupplier}
              detectedInvoiceNumber={customInvoiceNumber || session.summary.detectedInvoiceNumber}
              detectedDate={customInvoiceDate || session.summary.detectedDate}
              onUpdateInvoiceNumber={setCustomInvoiceNumber}
              onUpdateInvoiceDate={setCustomInvoiceDate}
            />
          </div>
        )}

        {/* Top panels: summary + bulk actions (limited height) */}
        {!isLoading && session && (
          <div className="p-3 space-y-2 border-b border-slate-100 bg-slate-50/50">
            <div className="max-h-[90px] overflow-y-auto">
              <SmartImportBatchSummary
                summary={session.summary}
                supplierStatus={session.supplierDecision.status}
                activeTab={activeFilterTab}
                onTabChange={setActiveFilterTab}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                confidenceScore={analysisResult?.summary?.confidenceScore}
                confidenceLevel={analysisResult?.summary?.confidenceLevel}
                providerName={analysisResult?.metadata?.providerName}
                isCached={analysisResult?.metadata?.isCached}
                isFallbackActive={analysisResult?.metadata?.isFallbackUsed}
                healedRowsCount={analysisResult?.summary?.healedRowsCount}
              />
            </div>

            <div>
              <SmartImportBulkActions
                selectedCount={selectedRowIds.size}
                totalDisplayedCount={displayedProductDecisions.length}
                allSelected={allDisplayedSelected}
                onToggleSelectAll={handleToggleSelectAll}
                onBulkApproveMatched={handleBulkApproveMatched}
                onBulkCreateNew={handleBulkCreateNew}
                onBulkSkipSelected={handleBulkSkipSelected}
              />
            </div>
          </div>
        )}

        {/* Validation error */}
        {validationErrorMsg && (
          <div className="mx-3 mt-3 p-2 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-600 shrink-0" />
            <span>{validationErrorMsg}</span>
          </div>
        )}

        {/* Product list: the only scrollable region (flex-1) */}
        {!isLoading && session && (
          <div className="flex-1 overflow-y-auto p-3">
            <SmartImportProductResolution
              productDecisions={displayedProductDecisions}
              selectedRowIds={selectedRowIds}
              availableProducts={availableProducts}
              onToggleSelectRow={handleToggleSelectRow}
              onUpdateDecision={handleUpdateProduct}
            />
          </div>
        )}

        {/* Compact footer actions */}
        {!isLoading && session && (
          <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
            <button
              id="btn-apply-import-invoice"
              type="button"
              disabled={isApplying}
              onClick={() => handleExecuteApply(false)}
              className="flex-1 min-h-[42px] h-11 bg-[#1E4D4D] hover:bg-[#163a3a] text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all"
            >
              {isApplying ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Edit3 size={16} />
              )}
              <span className="truncate">اعتماد وتعبئة ({session.summary.totalRows - session.summary.skippedCount})</span>
            </button>

            {onApplyAndSaveImmediately && (
              <button
                id="btn-apply-and-save-immediately"
                type="button"
                disabled={isApplying}
                onClick={() => handleExecuteApply(true)}
                className="min-w-[120px] h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all"
              >
                {isApplying ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>حفظ فوري</span>
              </button>
            )}

            <button
              id="btn-cancel-processing-center"
              type="button"
              onClick={handleCancel}
              disabled={isApplying}
              className="min-w-[90px] h-11 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs active:scale-95 transition-all disabled:opacity-50"
            >
              إلغاء
            </button>
          </div>
        )}

      </div>
    </Modal>
  );
};
