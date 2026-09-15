// src/features/inventory/components/InventoryCorrectionCaseModal.tsx
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 3.3: Controlled Inventory Correction & Human Resolution Modal
 * 
 * Complies with strict architectural mandates:
 * - Human-in-the-loop decision making (No auto-fix).
 * - Full RBAC enforcement (Employee view-only, Manager proposes, Admin/Owner approves & executes).
 * - Multi-tenant and multi-branch isolation.
 * - Atomic transaction execution with post-reconciliation verification.
 * - Comprehensive immutable audit trail.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, CheckCircle, AlertTriangle, ShieldCheck, 
  FileText, Clock, RefreshCw, 
  XCircle, Play, AlertCircle, Sparkles
} from 'lucide-react';
import { 
  InventoryCorrectionCase, 
  CorrectionActionType, 
  CorrectionCaseStatus, 
  UserSecurityContext 
} from '../types/correction.types';
import { InventoryCorrectionWorkflow } from '../workflows/InventoryCorrectionWorkflow';
import { NotificationService } from '@/context/NotificationContext';
import { useAuthStore } from '@/store/authStore';

interface InventoryCorrectionCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'en' | 'ar';
  onCasesUpdated?: () => void;
}

export const InventoryCorrectionCaseModal: React.FC<InventoryCorrectionCaseModalProps> = ({
  isOpen,
  onClose,
  lang,
  onCasesUpdated
}) => {
  const isAr = lang === 'ar';
  const { user, tenantId } = useAuthStore();

  const [cases, setCases] = useState<InventoryCorrectionCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<InventoryCorrectionCase | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Proposal Form State
  const [actionType, setActionType] = useState<CorrectionActionType>('PHYSICAL_COUNT_ADJUSTMENT');
  const [proposedQty, setProposedQty] = useState<number | string>('');
  const [targetWarehouse, setTargetWarehouse] = useState('WH-MAIN');
  const [proposalReason, setProposalReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  // User Context
  const userContext: UserSecurityContext = useMemo(() => ({
    userId: user?.id || 'USR-LOCAL',
    userName: (user as any)?.name || user?.username || (isAr ? 'مستخدم النظام' : 'System User'),
    userEmail: user?.email || '',
    role: (user?.role?.toUpperCase() as any) || 'ADMIN',
    tenantId: tenantId || user?.tenantId || 'DEFAULT_TENANT',
    branchId: user?.branchId || 'MAIN_BRANCH'
  }), [user, tenantId, isAr]);

  const loadCases = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeTenant = userContext.tenantId;
      const allCases = await InventoryCorrectionWorkflow.listCases({ tenantId: activeTenant });
      setCases(allCases);
      if (selectedCase) {
        const updated = allCases.find(c => c.id === selectedCase.id) || null;
        setSelectedCase(updated);
      }
    } catch (err) {
      console.error('Failed loading correction cases:', err);
      NotificationService.error(isAr ? 'فشل تحميل قضايا تصحيح المخزون' : 'Failed to load correction cases');
    } finally {
      setIsLoading(false);
    }
  }, [userContext.tenantId, selectedCase, isAr]);

  useEffect(() => {
    if (isOpen) {
      loadCases();
    }
  }, [isOpen, loadCases]);

  // Sync proposal form when selected case changes
  useEffect(() => {
    if (selectedCase) {
      if (selectedCase.proposedAction) {
        setActionType(selectedCase.proposedAction.actionType);
        setProposedQty(selectedCase.proposedAction.proposedQty ?? '');
        setTargetWarehouse(selectedCase.proposedAction.targetWarehouseId || 'WH-MAIN');
        setProposalReason(selectedCase.proposedAction.reason || '');
      } else {
        // Defaults based on discrepancy type
        if (selectedCase.discrepancyType === 'EXPIRED_ACTIVE_LAYER') {
          setActionType('QUARANTINE_EXPIRED_BATCH');
          setProposedQty(0);
        } else if (selectedCase.discrepancyType === 'LAYERS_VS_STOCK') {
          setActionType('ALIGN_LAYERS_ADJUSTMENT');
          setProposedQty(selectedCase.details.actualQty);
        } else if (selectedCase.discrepancyType === 'NEGATIVE_STOCK') {
          setActionType('RESOLVE_NEGATIVE_STOCK');
          setProposedQty(0);
        } else {
          setActionType('PHYSICAL_COUNT_ADJUSTMENT');
          setProposedQty(selectedCase.details.expectedQty);
        }
        setProposalReason('');
      }
      setApprovalNotes('');
      setRejectionReason('');
      setReviewNotes('');
    }
  }, [selectedCase]);

  // Handlers
  const handleStartReview = async () => {
    if (!selectedCase) return;
    setIsProcessing(true);
    try {
      const updated = await InventoryCorrectionWorkflow.startCaseReview(
        selectedCase.id,
        userContext,
        reviewNotes
      );
      setSelectedCase(updated);
      await loadCases();
      onCasesUpdated?.();
      NotificationService.success(isAr ? 'تم بدء المراجعة وتسجيل المعاينة' : 'Case review started');
    } catch (err: any) {
      NotificationService.error(err.message || 'Error starting review');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitProposal = async () => {
    if (!selectedCase) return;
    if (!proposalReason.trim()) {
      NotificationService.warning(isAr ? 'يرجى كتابة سبب وخطة التسوية' : 'Please provide a proposal reason');
      return;
    }

    setIsProcessing(true);
    try {
      const updated = await InventoryCorrectionWorkflow.submitCorrectionProposal(
        selectedCase.id,
        {
          actionType,
          proposedQty: proposedQty !== '' ? Number(proposedQty) : 0,
          targetWarehouseId: targetWarehouse,
          reason: proposalReason
        },
        userContext
      );
      setSelectedCase(updated);
      await loadCases();
      onCasesUpdated?.();
      NotificationService.success(isAr ? 'تم تقديم مقترح التسوية بنجاح وبانتظار الاعتماد' : 'Proposal submitted for approval');
    } catch (err: any) {
      NotificationService.error(err.message || 'Failed to submit proposal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedCase) return;
    setIsProcessing(true);
    try {
      const updated = await InventoryCorrectionWorkflow.approveCorrection(
        selectedCase.id,
        userContext,
        approvalNotes || (isAr ? 'تمت الموافقة والاعتماد' : 'Approved by authorized user')
      );
      setSelectedCase(updated);
      await loadCases();
      onCasesUpdated?.();
      NotificationService.success(isAr ? 'تم اعتماد مقترح التسوية بنجاح' : 'Case approved successfully');
    } catch (err: any) {
      NotificationService.error(err.message || 'Failed to approve case');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCase) return;
    if (!rejectionReason.trim()) {
      NotificationService.warning(isAr ? 'يرجى توضيح سبب الرفض' : 'Rejection reason is required');
      return;
    }
    setIsProcessing(true);
    try {
      const updated = await InventoryCorrectionWorkflow.rejectCorrection(
        selectedCase.id,
        userContext,
        rejectionReason
      );
      setSelectedCase(updated);
      await loadCases();
      onCasesUpdated?.();
      NotificationService.info(isAr ? 'تم رفض المقترح وإعادة القضية' : 'Case proposal rejected');
    } catch (err: any) {
      NotificationService.error(err.message || 'Failed to reject case');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedCase) return;
    setIsProcessing(true);
    try {
      const updated = await InventoryCorrectionWorkflow.executeCorrection(
        selectedCase.id,
        userContext
      );
      setSelectedCase(updated);
      await loadCases();
      onCasesUpdated?.();
      NotificationService.success(
        isAr 
          ? `تم تنفيذ التسوية بنجاح داخل معاملة ذرية وتمت مطابقة الرصيد 100%!` 
          : `Correction atomically executed and 100% reconciled!`
      );
    } catch (err: any) {
      NotificationService.error(err.message || 'Execution error');
      await loadCases();
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtered List
  const filteredCases = useMemo(() => {
    if (statusFilter === 'ALL') return cases;
    if (statusFilter === 'OPEN') return cases.filter(c => c.status === 'OPEN' || c.status === 'UNDER_REVIEW');
    return cases.filter(c => c.status === statusFilter);
  }, [cases, statusFilter]);

  const getStatusBadge = (status: CorrectionCaseStatus) => {
    switch (status) {
      case 'OPEN':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-[10px] font-black">{isAr ? 'قيد الفتح' : 'OPEN'}</span>;
      case 'UNDER_REVIEW':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full text-[10px] font-black">{isAr ? 'قيد المعاينة' : 'REVIEW'}</span>;
      case 'PROPOSED':
        return <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full text-[10px] font-black">{isAr ? 'تم تقديم مقترح' : 'PROPOSED'}</span>;
      case 'APPROVED':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-black">{isAr ? 'معتمد للتنفيذ' : 'APPROVED'}</span>;
      case 'EXECUTED':
      case 'RECONCILED':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-black">{isAr ? 'تمت التسوية بنجاح ✨' : 'RECONCILED ✨'}</span>;
      case 'REJECTED':
        return <span className="bg-slate-100 text-slate-600 border border-slate-300 px-2.5 py-0.5 rounded-full text-[10px] font-black">{isAr ? 'مرفوض' : 'REJECTED'}</span>;
      case 'ROLLBACK_FAILED':
        return <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full text-[10px] font-black">{isAr ? 'فشل وتراجع آمن' : 'ROLLBACK_FAILED'}</span>;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#F0F7F7] w-full max-w-6xl max-h-[90vh] rounded-[36px] shadow-2xl flex flex-col overflow-hidden border-2 border-white"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="bg-white px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#1E4D4D]/10 text-[#1E4D4D] flex items-center justify-center">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#1E4D4D]">
                {isAr ? 'إدارة قضايا تسوية المخزون المحكومة بشرياً (Phase 3.3)' : 'Controlled Inventory Correction & Human Resolution'}
              </h2>
              <p className="text-xs text-slate-400 font-bold">
                {isAr ? 'تسوية الفروقات عبر قرارات واضحة، قيود مزدوجة، وحماية ضد التعديل الصامت' : 'Role-based resolution state machine with atomic rollback and post-reconciliation verification'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadCases}
              disabled={isLoading}
              className="p-2.5 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
              title={isAr ? 'تحديث القائمة' : 'Refresh List'}
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left / Sidebar Column: Cases List */}
          <div className="w-full md:w-80 lg:w-96 bg-white border-l border-slate-100 flex flex-col">
            {/* Filter Tabs */}
            <div className="p-4 border-b border-slate-50 flex gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { key: 'ALL', label: isAr ? 'الكل' : 'All' },
                { key: 'OPEN', label: isAr ? 'المفتوحة' : 'Open' },
                { key: 'PROPOSED', label: isAr ? 'المقترحة' : 'Proposed' },
                { key: 'APPROVED', label: isAr ? 'المعتمدة' : 'Approved' },
                { key: 'RECONCILED', label: isAr ? 'المسواة' : 'Reconciled' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setStatusFilter(t.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                    statusFilter === t.key 
                      ? 'bg-[#1E4D4D] text-white shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Cases Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredCases.map(c => {
                const isSelected = selectedCase?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCase(c)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1E4D4D]/5 border-[#1E4D4D] shadow-sm'
                        : 'bg-white border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[10px] font-black text-slate-400">{c.caseNumber}</span>
                      {getStatusBadge(c.status)}
                    </div>
                    <h4 className="text-xs font-black text-slate-800 line-clamp-1">{c.productName}</h4>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>{c.discrepancyType}</span>
                      <span className={`font-mono ${c.details.variance !== 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {c.details.variance > 0 ? `+${c.details.variance}` : c.details.variance}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredCases.length === 0 && (
                <div className="py-16 text-center text-slate-400 font-bold text-xs">
                  {isAr ? 'لا توجد قضايا تطابق الفلتر' : 'No cases matching filter'}
                </div>
              )}
            </div>
          </div>

          {/* Right / Content Area: Selected Case Details & Action Workflow */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            {selectedCase ? (
              <>
                {/* Case Header Card */}
                <div className="bg-white p-6 rounded-[28px] border-2 border-white shadow-sm space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-mono font-black text-slate-600">
                          {selectedCase.caseNumber}
                        </span>
                        {getStatusBadge(selectedCase.status)}
                      </div>
                      <h3 className="text-lg font-black text-[#1E4D4D] mt-2">{selectedCase.productName}</h3>
                      <p className="text-xs text-slate-400 font-mono">ID: {selectedCase.productId}</p>
                    </div>

                    {/* Discrepancy Metric Chip */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-6 shrink-0">
                      <div>
                        <p className="text-[10px] text-slate-400 font-black uppercase">{isAr ? 'الرصيد الفعلي المسجل' : 'Current Stock'}</p>
                        <p className="text-base font-black text-slate-800">{selectedCase.details.actualQty}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-200" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-black uppercase">{isAr ? 'المطابقة الدفترية' : 'Expected Balance'}</p>
                        <p className="text-base font-black text-slate-800">{selectedCase.details.expectedQty}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-200" />
                      <div>
                        <p className="text-[10px] text-red-500 font-black uppercase">{isAr ? 'الفارق' : 'Variance'}</p>
                        <p className="text-base font-black text-red-600">
                          {selectedCase.details.variance > 0 ? `+${selectedCase.details.variance}` : selectedCase.details.variance}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-2xl text-xs text-amber-900 font-bold flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-black mb-0.5">{isAr ? 'تشخيص النظام والانحراف المرصود:' : 'System Discrepancy Reason:'}</p>
                      <p>{selectedCase.details.diagnosticMessage}</p>
                    </div>
                  </div>
                </div>

                {/* Human Resolution Workflow Card */}
                <div className="bg-white p-6 rounded-[28px] border-2 border-white shadow-sm space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                    <div className="flex items-center gap-3">
                      <Sparkles className="text-[#1E4D4D]" size={20} />
                      <h4 className="text-base font-black text-[#1E4D4D]">
                        {isAr ? 'مركز اتخاذ القرار والتسوية البشرية (Human Action Center)' : 'Human Action Center'}
                      </h4>
                    </div>
                    <span className="text-xs font-bold text-slate-400">
                      {isAr ? `المستخدم الحالي: ${userContext.userName} (${userContext.role})` : `Actor: ${userContext.userName} (${userContext.role})`}
                    </span>
                  </div>

                  {/* Stage 1: Review & Propose */}
                  {(selectedCase.status === 'OPEN' || selectedCase.status === 'UNDER_REVIEW') && (
                    <div className="space-y-4">
                      {selectedCase.status === 'OPEN' && (
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div>
                            <p className="text-xs font-black text-slate-700">{isAr ? 'هل تود استلام القضية وبدء المراجعة؟' : 'Start formal review for this case?'}</p>
                            <p className="text-[11px] text-slate-400 font-bold">{isAr ? 'يقوم بنقل الحالة إلى قيد المعاينة وربط اسم المراجع' : 'Moves status to UNDER_REVIEW'}</p>
                          </div>
                          <button
                            onClick={handleStartReview}
                            disabled={isProcessing}
                            className="px-5 py-2.5 bg-[#1E4D4D] text-white rounded-xl text-xs font-black shadow-sm hover:bg-[#2A6666] transition-all disabled:opacity-50"
                          >
                            {isAr ? 'بدء المعاينة 📝' : 'Start Review 📝'}
                          </button>
                        </div>
                      )}

                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-700 block">
                          {isAr ? '1. اختر نوع الإجراء المقترح للتسوية:' : '1. Proposed Correction Action:'}
                        </label>
                        <select
                          value={actionType}
                          onChange={(e) => setActionType(e.target.value as CorrectionActionType)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-800 focus:outline-none"
                        >
                          <option value="PHYSICAL_COUNT_ADJUSTMENT">{isAr ? 'تسوية جرد فعلي (تعديل رصيد المخزن مع قيد محاسبي)' : 'Physical Count Adjustment'}</option>
                          <option value="ALIGN_LAYERS_ADJUSTMENT">{isAr ? 'مواءمة طبقات الوارد أولاً يصرف أولاً (FIFO Sync)' : 'Align FIFO Layers'}</option>
                          <option value="QUARANTINE_EXPIRED_BATCH">{isAr ? 'عزل وإعدام دفعة منتهية الصلاحية (Quarantine Batch)' : 'Quarantine Expired Batch'}</option>
                          <option value="RESOLVE_NEGATIVE_STOCK">{isAr ? 'تصحيح رصيد سالب مع قيود الفروقات' : 'Resolve Negative Stock'}</option>
                          <option value="RECONCILE_UNLINKED_RETURN">{isAr ? 'ربط مرتجع غير مقترن بفاتورة أصل' : 'Reconcile Unlinked Return'}</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-700 block">
                            {isAr ? '2. الرصيد / الكمية المستهدفة بعد التسوية:' : '2. Target Quantity:'}
                          </label>
                          <input
                            type="number"
                            value={proposedQty}
                            onChange={(e) => setProposedQty(e.target.value)}
                            placeholder="0"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-800 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-700 block">
                            {isAr ? '3. المستودع المستهدف:' : '3. Target Warehouse:'}
                          </label>
                          <input
                            type="text"
                            value={targetWarehouse}
                            onChange={(e) => setTargetWarehouse(e.target.value)}
                            placeholder="WH-MAIN"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-800 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-700 block">
                          {isAr ? '4. سبب وخطة التسوية المعتمدة (إلزامي):' : '4. Formal Reason & Justification (Mandatory):'}
                        </label>
                        <textarea
                          value={proposalReason}
                          onChange={(e) => setProposalReason(e.target.value)}
                          placeholder={isAr ? 'اكتب بالتفصيل سبب وجود الفارق ومبرر خطة التسوية...' : 'Provide comprehensive reason for correction...'}
                          rows={3}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold text-slate-800 focus:outline-none"
                        />
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleSubmitProposal}
                          disabled={isProcessing || !proposalReason.trim()}
                          className="px-8 py-3.5 bg-[#1E4D4D] text-white rounded-2xl text-xs font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          <FileText size={16} />
                          <span>{isAr ? 'تقديم مقترح التسوية للاعتماد 📤' : 'Submit Proposal for Approval 📤'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Stage 2: Proposal Review, Approval & Rejection */}
                  {selectedCase.status === 'PROPOSED' && (
                    <div className="space-y-6">
                      <div className="p-5 bg-purple-50/60 border border-purple-100 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-purple-900">{isAr ? 'المقترح المقدم:' : 'Submitted Proposal:'}</span>
                          <span className="text-[11px] font-mono text-purple-700">{selectedCase.proposedAction?.proposedBy}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-700">{selectedCase.proposedAction?.reason}</p>
                        <div className="flex items-center gap-6 pt-2 text-xs font-black text-purple-900 border-t border-purple-100">
                          <span>{isAr ? 'الإجراء:' : 'Action:'} {selectedCase.proposedAction?.actionType}</span>
                          <span>{isAr ? 'الكمية المستهدفة:' : 'Target Qty:'} {selectedCase.proposedAction?.proposedQty}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3 p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                          <label className="text-xs font-black text-emerald-800 block">
                            {isAr ? 'اعتماد المقترح (مطلوب صلاحية مدير / مالك):' : 'Approve Proposal (Requires Owner/Admin):'}
                          </label>
                          <input
                            type="text"
                            value={approvalNotes}
                            onChange={(e) => setApprovalNotes(e.target.value)}
                            placeholder={isAr ? 'ملاحظات الاعتماد (اختياري)...' : 'Approval notes...'}
                            className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                          />
                          <button
                            onClick={handleApprove}
                            disabled={isProcessing}
                            className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                          >
                            <CheckCircle size={16} />
                            <span>{isAr ? 'موافقة واعتماد التسوية ✅' : 'Approve Correction ✅'}</span>
                          </button>
                        </div>

                        <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                          <label className="text-xs font-black text-slate-700 block">
                            {isAr ? 'رفض المقترح:' : 'Reject Proposal:'}
                          </label>
                          <input
                            type="text"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder={isAr ? 'سبب الرفض (إلزامي)...' : 'Rejection reason (Mandatory)...'}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                          />
                          <button
                            onClick={handleReject}
                            disabled={isProcessing || !rejectionReason.trim()}
                            className="w-full py-3 bg-slate-700 text-white rounded-xl text-xs font-black shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <XCircle size={16} />
                            <span>{isAr ? 'رفض المقترح ❌' : 'Reject Proposal ❌'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stage 3: Execution of Approved Case */}
                  {selectedCase.status === 'APPROVED' && (
                    <div className="space-y-4 p-6 bg-emerald-50/70 border-2 border-emerald-200 rounded-3xl">
                      <div className="flex items-center gap-3">
                        <CheckCircle size={24} className="text-emerald-600" />
                        <div>
                          <h5 className="text-sm font-black text-emerald-900">
                            {isAr ? 'القضية معتمدة وجاهزة للتنفيذ الذري الآمن' : 'Case Approved & Ready for Atomic Execution'}
                          </h5>
                          <p className="text-xs text-emerald-700 font-bold">
                            {isAr 
                              ? 'سيتم توليد القيد المحاسبي، حركة المخزن الرسمية، وتحديث الرصيد داخل معاملة ذرية تضمن عدم ترك أي بيانات معلقة.' 
                              : 'Will execute double-entry journal entry, stock movement and perform post-audit verification.'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleExecute}
                          disabled={isProcessing}
                          className="px-10 py-4 bg-emerald-600 text-white rounded-2xl text-sm font-black shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                        >
                          <Play size={18} />
                          <span>{isProcessing ? (isAr ? 'جاري التنفيذ والمطابقة...' : 'Executing...') : (isAr ? 'تنفيذ التسوية المحكومة الآن 🚀' : 'Execute Controlled Correction 🚀')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Stage 4: Reconciled Outcome Details */}
                  {(selectedCase.status === 'RECONCILED' || selectedCase.status === 'EXECUTED') && selectedCase.execution && (
                    <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl space-y-4">
                      <div className="flex items-center gap-3">
                        <Sparkles className="text-emerald-600" size={24} />
                        <div>
                          <h5 className="text-sm font-black text-emerald-900">
                            {isAr ? 'تمت التسوية والمطابقة بنسبة 100% بنجاح ✨' : '100% Reconciled and Verified ✨'}
                          </h5>
                          <p className="text-xs text-emerald-700 font-bold">
                            {isAr ? 'تم التحقق من مطابقة الرصيد الدفتري والفعلي والطبقات بعد التنفيذ' : 'Post-execution audit confirmed zero discrepancies.'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                        {selectedCase.execution.journalEntryId && (
                          <div className="p-3 bg-white rounded-xl border border-emerald-100">
                            <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'رقم القيد المحاسبي:' : 'Journal Entry ID:'}</span>
                            <span className="font-black text-slate-800">{selectedCase.execution.journalEntryId}</span>
                          </div>
                        )}
                        {selectedCase.execution.stockMovementId && (
                          <div className="p-3 bg-white rounded-xl border border-emerald-100">
                            <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'رقم حركة المخزن:' : 'Stock Movement ID:'}</span>
                            <span className="font-black text-slate-800">{selectedCase.execution.stockMovementId}</span>
                          </div>
                        )}
                        {selectedCase.execution.inventoryTransactionId && (
                          <div className="p-3 bg-white rounded-xl border border-emerald-100">
                            <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'رقم المعاملة الجردية:' : 'Transaction ID:'}</span>
                            <span className="font-black text-slate-800">{selectedCase.execution.inventoryTransactionId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stage 5: Rollback Failed Message */}
                  {selectedCase.status === 'ROLLBACK_FAILED' && (
                    <div className="p-6 bg-red-50 border border-red-200 rounded-3xl space-y-2">
                      <div className="flex items-center gap-3 text-red-700 font-black">
                        <AlertCircle size={22} />
                        <h5>{isAr ? 'فشلت عملية التحقق وتم التراجع الذري الآمن' : 'Reconciliation Verification Failed - Atomic Rollback Triggered'}</h5>
                      </div>
                      <p className="text-xs text-red-600 font-bold">
                        {isAr 
                          ? 'أظهر فحص المطابقة بعد التنفيذ استمرار وجود فارق، مما أدى لإلغاء المعاملة بالكامل لمنع تلويث المخزون.' 
                          : 'Post-execution audit detected remaining variance. All changes were rolled back to prevent dirty data.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Audit Trail Timeline */}
                <div className="bg-white p-6 rounded-[28px] border-2 border-white shadow-sm space-y-4">
                  <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                    <Clock className="text-[#1E4D4D]" size={20} />
                    <h4 className="text-base font-black text-[#1E4D4D]">
                      {isAr ? 'سجل التدقيق والمتابعة الصارم (Immutable Audit Trail)' : 'Immutable Audit Trail'}
                    </h4>
                  </div>

                  <div className="space-y-3">
                    {selectedCase.auditTrail.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-4 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#1E4D4D] mt-1.5 shrink-0" />
                        <div className="flex-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-black text-slate-800">{log.action}</span>
                            <span className="font-mono text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-slate-600 font-bold">{log.notes || (isAr ? 'إجراء موثق في النظام' : 'Action recorded')}</p>
                          <div className="mt-2 text-[10px] text-slate-400 font-bold flex items-center gap-4">
                            <span>{isAr ? 'المنفذ:' : 'Actor:'} {log.userName} ({log.userRole})</span>
                            {log.previousStatus && log.newStatus && (
                              <span>{log.previousStatus} ➔ {log.newStatus}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4 text-slate-400">
                <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-3xl">
                  📑
                </div>
                <h4 className="text-base font-black text-slate-600">
                  {isAr ? 'اختر قضية من القائمة للمعاينة والتسوية' : 'Select a correction case from the list'}
                </h4>
                <p className="text-xs max-w-sm font-bold">
                  {isAr 
                    ? 'يمكنك فحص تفاصيل الفارق الدفتري، تقديم مقترحات المواءمة، والاعتماد والتنفيذ الآمن.' 
                    : 'Review detected discrepancies, submit proposal, approve, and execute atomic corrections.'}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
