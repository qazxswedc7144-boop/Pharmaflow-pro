// src/features/purchases/components/smartImport/SmartImportProcessingCenter.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BatchProcessingSession, 
  SupplierDecision, 
  ProductDecision, 
  ProductResolutionAction, 
  CanonicalResolutionResult 
} from '../../services/smartImport/batchProcessing/types';
import { BatchProcessingOrchestrator } from '../../services/smartImport/batchProcessing/batchProcessingOrchestrator';
import { ImportAnalysisResult, ExtractedImportRow } from '../../services/smartImport/types';
import { Product, Supplier } from '@/types';
import { SmartImportSupplierResolution } from './SmartImportSupplierResolution';
import { SmartImportBatchSummary, ProductFilterTab } from './SmartImportBatchSummary';
import { SmartImportBulkActions } from './SmartImportBulkActions';
import { SmartImportProductResolution } from './SmartImportProductResolution';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
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
  analysisResult: ImportAnalysisResult | null;
  isLoading: boolean;
  progressStage?: string;
  progressPercent?: number;
  progressMessage?: string;
  onApply: (approvedRows: ExtractedImportRow[], supplierName?: string, invoiceNumber?: string, date?: string, canonicalResult?: CanonicalResolutionResult) => void;
  onApplyAndSaveImmediately?: (approvedRows: ExtractedImportRow[], supplierName?: string, invoiceNumber?: string, date?: string, canonicalResult?: CanonicalResolutionResult) => void;
  availableProducts?: Product[];
  availableSuppliers?: Supplier[];
}

export const SmartImportProcessingCenter: React.FC<SmartImportProcessingCenterProps> = ({
  isOpen,
  onClose,
  analysisResult,
  isLoading,
  progressPercent = 50,
  progressMessage = 'جاري تحليل ومعالجة المستند...',
  onApply,
  onApplyAndSaveImmediately,
  availableProducts = [],
  availableSuppliers = []
}) => {
  const [session, setSession] = useState<BatchProcessingSession | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<ProductFilterTab>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [validationErrorMsg, setValidationErrorMsg] = useState<string | null>(null);

  const addToast = useUIStore(state => state.addToast);

  // Initialize batch session whenever analysisResult is ready
  useEffect(() => {
    let isMounted = true;
    if (analysisResult && isOpen) {
      BatchProcessingOrchestrator.startSession({
        analysis: analysisResult,
        sourceType: analysisResult.sourceType,
        fileName: analysisResult.fileName
      }).then(newSession => {
        if (isMounted) {
          setSession(newSession);
          setSelectedRowIds(new Set());
          setValidationErrorMsg(null);
        }
      }).catch(err => {
        console.error('[SmartImportProcessingCenter] Session init error:', err);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [analysisResult, isOpen]);

  // Filtered product decisions based on active tab and search query
  const displayedProductDecisions = useMemo(() => {
    if (!session) return [];
    return session.productDecisions.filter(p => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesName = (p.importedProductName || '').toLowerCase().includes(q) || (p.matchedProductName || '').toLowerCase().includes(q);
        const matchesBarcode = (p.barcode || '').includes(q);
        const matchesCode = (p.supplierProductCode || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBarcode && !matchesCode) return false;
      }

      switch (activeFilterTab) {
        case 'UNRESOLVED':
          return p.action === ProductResolutionAction.UNRESOLVED && !p.isSkipped;
        case 'MATCHED':
          return (p.action === ProductResolutionAction.AUTO_MATCH || p.action === ProductResolutionAction.LINK_EXISTING) && !p.isSkipped;
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

  // Selection handlers
  const allDisplayedSelected = useMemo(() => {
    if (displayedProductDecisions.length === 0) return false;
    return displayedProductDecisions.every(p => selectedRowIds.has(p.sourceRowId));
  }, [displayedProductDecisions, selectedRowIds]);

  const handleToggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelectedRowIds(new Set());
    } else {
      const newSet = new Set(selectedRowIds);
      displayedProductDecisions.forEach(p => newSet.add(p.sourceRowId));
      setSelectedRowIds(newSet);
    }
  };

  const handleToggleSelectRow = (rowId: number) => {
    const newSet = new Set(selectedRowIds);
    if (newSet.has(rowId)) {
      newSet.delete(rowId);
    } else {
      newSet.add(rowId);
    }
    setSelectedRowIds(newSet);
  };

  // Supplier update handler
  const handleUpdateSupplier = (update: Partial<SupplierDecision>) => {
    if (!session) return;
    const updated = BatchProcessingOrchestrator.updateSupplier(session, update);
    setSession(updated);
    setValidationErrorMsg(null);
  };

  // Product update handler
  const handleUpdateProduct = (sourceRowId: number, update: Partial<ProductDecision>) => {
    if (!session) return;
    const updated = BatchProcessingOrchestrator.updateProduct(session, sourceRowId, update);
    setSession(updated);
    setValidationErrorMsg(null);
  };

  // Bulk actions handlers
  const handleBulkApproveMatched = () => {
    if (!session) return;
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'APPROVE_ALL_MATCHED');
    setSession(updated);
    addToast('تم اعتماد المطابقات التلقائية بنجاح', 'success');
  };

  const handleBulkCreateNew = () => {
    if (!session || selectedRowIds.size === 0) return;
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'CREATE_SELECTED', Array.from(selectedRowIds));
    setSession(updated);
    setSelectedRowIds(new Set());
    addToast(`تم تعيين ${selectedRowIds.size} صنف لإنشائها كأصناف جديدة`, 'info');
  };

  const handleBulkSkipSelected = () => {
    if (!session || selectedRowIds.size === 0) return;
    const updated = BatchProcessingOrchestrator.applyBulkAction(session, 'SKIP_SELECTED', Array.from(selectedRowIds));
    setSession(updated);
    setSelectedRowIds(new Set());
    addToast(`تم استبعاد ${selectedRowIds.size} صنف من الفاتورة`, 'info');
  };

  // Execution Apply handlers
  const handleExecuteApply = async (saveImmediately: boolean = false) => {
    if (!session) return;
    setIsApplying(true);
    setValidationErrorMsg(null);

    try {
      // 1. Validate Session
      const validation = await BatchProcessingOrchestrator.validateSession(session);
      if (!validation.canApply) {
        const firstError = validation.errors[0]?.message || 'يرجى استكمال القرارات لجميع الأصناف والمورد قبل التطبيق';
        setValidationErrorMsg(firstError);
        addToast(`⚠️ تعذر التطبيق: ${firstError}`, 'error');
        setIsApplying(false);
        return;
      }

      // 2. Atomic Batch Apply
      const canonicalResult = await BatchProcessingOrchestrator.applyBatchSession(session);

      // Convert canonical invoice items to legacy row structure for backwards compatibility
      const approvedRows: ExtractedImportRow[] = canonicalResult.invoiceItems.map((item, idx) => ({
        rowNumber: idx + 1,
        rawCells: {},
        productName: item.name || '',
        matchedProductId: item.product_id || (item as any).productId,
        matchedProductName: item.name,
        quantity: item.qty,
        unitPrice: item.price,
        total: item.sum,
        expectedTotal: item.sum,
        barcode: (item as any).barcode,
        expiryDate: item.expiryDate,
        discountPercent: (item as any).discountPercent,
        bonusQty: (item as any).bonusQty,
        notes: item.notes,
        status: 'VALID',
        confidenceScore: 1.0,
        validationIssues: []
      }));

      const finalSupplierName = canonicalResult.appliedSupplierName || session.summary.detectedSupplier;
      const finalInvoiceNumber = canonicalResult.appliedInvoiceNumber || session.summary.detectedInvoiceNumber;
      const finalDate = canonicalResult.appliedDate || session.summary.detectedDate;

      if (saveImmediately && onApplyAndSaveImmediately) {
        onApplyAndSaveImmediately(approvedRows, finalSupplierName, finalInvoiceNumber, finalDate, canonicalResult);
      } else {
        onApply(approvedRows, finalSupplierName, finalInvoiceNumber, finalDate, canonicalResult);
      }

      onClose();
    } catch (err: any) {
      console.error('[SmartImportProcessingCenter] Apply error:', err);
      setValidationErrorMsg(err.message || 'حدث خطأ أثناء تطبيق دفعة الاستيراد');
      addToast(`❌ خطأ في تطبيق الاستيراد: ${err.message || 'حدث خطأ غير متوقع'}`, 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancel = async () => {
    if (session) {
      await BatchProcessingOrchestrator.cancelSession(session.sessionId);
    }
    onClose();
  };

  const getSourceIcon = (type?: string) => {
    switch (type) {
      case 'EXCEL': return <FileSpreadsheet className="text-emerald-600" size={16} />;
      case 'CSV': return <FileText className="text-blue-600" size={16} />;
      case 'PDF': return <FileText className="text-red-600" size={16} />;
      case 'CAMERA': return <Camera className="text-amber-600" size={16} />;
      default: return <ImageIcon className="text-purple-600" size={16} />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title=""
      maxWidth="max-w-[840px] w-[95vw]"
      noPadding={true}
      centerOnMobile={true}
      showCloseButton={false}
    >
      <div dir="rtl" className="flex flex-col max-h-[90vh] bg-white rounded-3xl overflow-hidden font-cairo select-none">
        
        {/* HEADER BAR */}
        <div className="bg-[#1E4D4D] text-white px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-wide">مركز المعالجة الدفعية للاستيراد الذكي</h2>
                {analysisResult && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 text-[10px] font-bold border border-emerald-400/30 flex items-center gap-1">
                    {getSourceIcon(analysisResult.sourceType)}
                    {analysisResult.sourceType}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-emerald-100/80 font-medium truncate max-w-[280px] sm:max-w-md">
                {analysisResult?.fileName || 'معالجة دفعية شاملة للمورد والأصناف وتوليد قيود المخزون'}
              </p>
            </div>
          </div>

          <button 
            onClick={handleCancel}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-95"
            title="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center space-y-4 my-auto">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100 animate-ping opacity-30" />
              <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin flex items-center justify-center">
                <Sparkles className="text-emerald-600 animate-pulse" size={24} />
              </div>
            </div>
            
            <div className="text-center space-y-1.5 max-w-sm">
              <h3 className="text-sm font-black text-[#1E4D4D]">{progressMessage}</h3>
              <p className="text-[11px] font-bold text-slate-400">
                جاري مطابقة المورد والأصناف وتجهيز القرارات الدفعية...
              </p>
            </div>

            <div className="w-full max-w-xs bg-slate-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(15, progressPercent))}%` }}
              />
            </div>
          </div>
        )}

        {/* MAIN BATCH PROCESSING WORKSPACE */}
        {!isLoading && session && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            
            {/* Scrollable Container for Top Panels */}
            <div className="p-3 space-y-2.5 overflow-y-auto shrink-0 max-h-[38vh] border-b border-slate-100 bg-slate-50/50">
              {/* Supplier Resolution Panel */}
              <SmartImportSupplierResolution
                supplierDecision={session.supplierDecision}
                availableSuppliers={availableSuppliers}
                onChange={handleUpdateSupplier}
              />

              {/* Batch Summary & Filter Tabs */}
              <SmartImportBatchSummary
                summary={session.summary}
                activeTab={activeFilterTab}
                onTabChange={setActiveFilterTab}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
              />

              {/* Bulk Actions Toolbar */}
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

            {/* Validation Error Alert if any */}
            {validationErrorMsg && (
              <div className="mx-3 mt-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>{validationErrorMsg}</span>
              </div>
            )}

            {/* Products Resolution Table/Cards List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              <SmartImportProductResolution
                productDecisions={displayedProductDecisions}
                selectedRowIds={selectedRowIds}
                availableProducts={availableProducts}
                onToggleSelectRow={handleToggleSelectRow}
                onUpdateDecision={handleUpdateProduct}
              />
            </div>

            {/* FOOTER ACTIONS */}
            <div className="p-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row gap-2 shrink-0">
              <button 
                type="button"
                disabled={isApplying}
                onClick={() => handleExecuteApply(false)}
                className="flex-[2] h-11 bg-[#1E4D4D] hover:bg-[#163a3a] text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {isApplying ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Edit3 size={16} />
                )}
                <span>
                  تطبيق وتعبئة الفاتورة للمراجعة ({session.summary.totalRows - session.summary.skippedCount} صنف)
                </span>
              </button>

              {onApplyAndSaveImmediately && (
                <button 
                  type="button"
                  disabled={isApplying}
                  onClick={() => handleExecuteApply(true)}
                  className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50"
                >
                  {isApplying ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>حفظ فوري وترحيل 💾</span>
                </button>
              )}

              <button 
                type="button"
                onClick={handleCancel}
                disabled={isApplying}
                className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs active:scale-95 transition-all disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>

          </div>
        )}

      </div>
    </Modal>
  );
};
