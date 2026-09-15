// src/features/branches/pages/BranchTransfers.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeftRight,
  Clock3,
  CheckCircle2,
  Truck,
  Building2,
  AlertTriangle,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Send,
  XCircle,
  Eye,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BranchService } from '../services/BranchService';
import { Branch, TransferStatus } from '@/types';
import { useUI } from '@/contexts/AppContext';
import { authService } from '@features/auth/services/authService';
import { BackButton } from '@/components/shared/BackButton';

interface TransferItemDraft {
  productId: string;
  name: string;
  barcode?: string;
  quantity: number;
  availableStock: number;
  batchNumber?: string;
  expiryDate?: string;
}

export const BranchTransfers: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { addToast } = useUI();
  const [activeTab, setActiveTab] = useState<'NEW' | 'HISTORY'>('NEW');

  // Branch data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sourceBranch, setSourceBranch] = useState<string>('');
  const [destinationBranch, setDestinationBranch] = useState<string>('');
  
  // Products & Inventory for selected source branch
  const [branchInventory, setBranchInventory] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Draft items for new transfer
  const [items, setItems] = useState<TransferItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // Transfers history
  const [transfers, setTransfers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTransferDetails, setSelectedTransferDetails] = useState<{ transfer: any; items: any[] } | null>(null);

  // 1. Initial Data Fetch
  const loadInitialData = async () => {
    setIsLoadingData(true);
    try {
      const branchList = await BranchService.getBranches();
      setBranches(branchList);
      if (branchList && branchList.length >= 2 && branchList[0] && branchList[1]) {
        setSourceBranch(branchList[0].id);
        setDestinationBranch(branchList[1].id);
      } else if (branchList && branchList.length === 1 && branchList[0]) {
        setSourceBranch(branchList[0].id);
      }
      await loadTransfersList();
    } catch {
      addToast('فشل تحميل بيانات الفروع', 'error');
    } finally {
      setIsLoadingData(false);
    }
  };

  // 2. Load inventory when source branch changes
  const loadSourceBranchInventory = async (branchId: string) => {
    if (!branchId) return;
    try {
      const inv = await BranchService.getBranchInventory(branchId);
      setBranchInventory(inv);
    } catch {
      addToast('فشل تحميل مخزون فرع المصدر', 'error');
    }
  };

  // 3. Load transfers history
  const loadTransfersList = async () => {
    try {
      const transferList = await BranchService.getTransfers();
      setTransfers(transferList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch {
      addToast('فشل تحميل سجل التحويلات', 'error');
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (sourceBranch) {
      loadSourceBranchInventory(sourceBranch);
      // Reset selected item if source changes
      setSelectedProductId('');
      setItems([]);
    }
  }, [sourceBranch]);

  // Selected product details
  const currentProduct = useMemo(() => {
    return branchInventory.find(item => item.productId === selectedProductId);
  }, [selectedProductId, branchInventory]);

  // Filtered inventory options for search dropdown
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return branchInventory;
    return branchInventory.filter(p => 
      (p.productName || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  }, [productSearch, branchInventory]);

  // Add Item to draft
  const handleAddItem = () => {
    if (!currentProduct) {
      addToast('يرجى اختيار المستحضر الدوائي أولاً', 'warning');
      return;
    }
    if (quantity <= 0) {
      addToast('الرجاء تحديد كمية صالحة أكبر من الصفر', 'warning');
      return;
    }

    const available = currentProduct.stockQuantity || 0;
    const existingIndex = items.findIndex(i => i.productId === currentProduct.productId);
    const existingItem = existingIndex >= 0 ? items[existingIndex] : undefined;
    const alreadySelectedQty = existingItem ? existingItem.quantity : 0;
    const totalQty = alreadySelectedQty + quantity;

    if (totalQty > available) {
      addToast(`الكمية المطلوبة (${totalQty}) تتجاوز الرصيد المتوفر بالفرع (${available})`, 'error');
      return;
    }

    if (existingIndex >= 0 && existingItem) {
      const updated = [...items];
      updated[existingIndex] = {
        ...existingItem,
        quantity: totalQty
      };
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          productId: currentProduct.productId,
          name: currentProduct.productName,
          barcode: currentProduct.barcode,
          quantity,
          availableStock: available,
          batchNumber: batchNumber.trim() || 'BATCH-AUTO',
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);
    }

    setSelectedProductId('');
    setProductSearch('');
    setQuantity(1);
    setBatchNumber('');
    addToast('تمت إضافة الصنف إلى مسودة النقل', 'info');
  };

  const handleRemoveItem = (productId: string) => {
    setItems(items.filter(i => i.productId !== productId));
  };

  // Swap Branches
  const handleSwapBranches = () => {
    const prevSrc = sourceBranch;
    const prevDst = destinationBranch;
    setSourceBranch(prevDst);
    setDestinationBranch(prevSrc);
  };

  // Submit Transfer Workflow
  const handleCreateTransfer = async () => {
    if (!sourceBranch || !destinationBranch) {
      addToast('يرجى تحديد فرع المصدر وفرع الوجهة', 'warning');
      return;
    }
    if (sourceBranch === destinationBranch) {
      addToast('لا يمكن إجراء تحويل بين نفس الفرع', 'warning');
      return;
    }
    if (items.length === 0) {
      addToast('يرجى إضافة صنف واحد على الأقل للتحويل', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = authService.getCurrentUser();
      const username = user?.User_Name || user?.User_Email || 'مستخدم النظام';

      const transferItems = items.map(item => ({
        productId: item.productId,
        qty: item.quantity,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate
      }));

      await BranchService.createTransfer(
        sourceBranch,
        destinationBranch,
        transferItems,
        reason || 'تحويل وموازنة مخزون دوائي',
        username
      );

      addToast('تم إنشاء طلب التحويل المخزني بنجاح', 'success');
      setItems([]);
      setReason('');
      await loadTransfersList();
      await loadSourceBranchInventory(sourceBranch);
      setActiveTab('HISTORY');
    } catch (err: any) {
      addToast(err.message || 'فشل إنشاء طلب التحويل', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status transitions
  const handleUpdateStatus = async (transferId: string, newStatus: TransferStatus) => {
    try {
      const user = authService.getCurrentUser();
      const username = user?.User_Name || user?.User_Email || 'المسؤول';
      await BranchService.updateTransferStatus(transferId, newStatus, username);
      addToast(`تم تحديث حالة التحويل إلى [${getStatusLabel(newStatus)}] بنجاح`, 'success');
      await loadTransfersList();
      if (sourceBranch) {
        await loadSourceBranchInventory(sourceBranch);
      }
      if (selectedTransferDetails?.transfer?.id === transferId) {
        handleViewDetails(transferId);
      }
    } catch (err: any) {
      addToast(err.message || 'فشل تحديث حالة التحويل', 'error');
    }
  };

  // View Details
  const handleViewDetails = async (transferId: string) => {
    try {
      const details = await BranchService.getTransferDetails(transferId);
      setSelectedTransferDetails(details);
    } catch {
      addToast('فشل استرجاع تفاصيل التحويل', 'error');
    }
  };

  // Helpers
  const getStatusLabel = (status: TransferStatus) => {
    switch (status) {
      case 'DRAFT': return 'مسودة';
      case 'APPROVED': return 'معتمد ومؤكد';
      case 'IN_TRANSIT': return 'قيد الشحن / بالطريق';
      case 'RECEIVED': return 'تم الاستلام والتسوية';
      case 'CANCELLED': return 'ملغي';
      default: return status;
    }
  };

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1"><Clock3 size={12} /> مسودة</span>;
      case 'APPROVED':
        return <span className="bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1"><CheckCircle2 size={12} /> معتمد</span>;
      case 'IN_TRANSIT':
        return <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1"><Truck size={12} /> قيد الشحن</span>;
      case 'RECEIVED':
        return <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1"><CheckCircle2 size={12} /> تم الاستلام</span>;
      case 'CANCELLED':
        return <span className="bg-rose-100 text-rose-800 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1"><XCircle size={12} /> ملغي</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-full text-xs">{status}</span>;
    }
  };

  const filteredTransfers = useMemo(() => {
    if (statusFilter === 'ALL') return transfers;
    return transfers.filter(t => t.status === statusFilter);
  }, [transfers, statusFilter]);

  const pendingTransfersCount = useMemo(() => {
    return transfers.filter(t => t.status === 'DRAFT' || t.status === 'APPROVED' || t.status === 'IN_TRANSIT').length;
  }, [transfers]);

  return (
    <div dir="rtl" className="w-full space-y-6 pb-12 font-sans">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-br from-[#0c312d] via-[#0f3834] to-[#08221f] rounded-[28px] p-5 sm:p-6 text-white shadow-xl relative overflow-hidden w-full">
        <div className="absolute left-0 top-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-0 bottom-0 w-48 h-48 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex justify-between items-start gap-4 mb-6 relative z-10">
          <div className="flex items-start gap-3 flex-1">
            {onNavigate && (
              <BackButton onClick={() => onNavigate('dashboard')} variant="emerald" />
            )}
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                المناقلات والتحويلات المخزنية البينية
              </h1>
              <p className="text-xs md:text-sm text-emerald-200/90 font-medium mt-1.5 leading-relaxed">
                تحويل المخزون الدوائي وموازنة الإمدادات بين الفروع والمستودعات مع تدقيق كامل لطبقات المخزون
              </p>
            </div>
          </div>
          <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-300 shrink-0 shadow-inner">
            <ArrowLeftRight size={26} />
          </div>
        </div>

        {/* Action / Tabs Row */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button
            onClick={() => setActiveTab('NEW')}
            className={`font-bold text-xs md:text-sm px-6 py-3.5 rounded-2xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'NEW'
                ? 'bg-[#00c88c] text-white shadow-lg shadow-emerald-500/20 scale-[1.02]'
                : 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-100 border border-emerald-700/50'
            }`}
          >
            <Plus size={18} />
            <span>إنشاء مناقلة جديدة</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`font-bold text-xs md:text-sm px-6 py-3.5 rounded-2xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'bg-[#00c88c] text-white shadow-lg shadow-emerald-500/20 scale-[1.02]'
                : 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-100 border border-emerald-700/50'
            }`}
          >
            <FileText size={18} />
            <span>سجل التحويلات والعمليات</span>
            {pendingTransfersCount > 0 && (
              <span className="bg-amber-400 text-slate-900 text-xs px-2 py-0.5 rounded-full font-black">
                {pendingTransfersCount}
              </span>
            )}
          </button>

          <button
            onClick={loadInitialData}
            title="تحديث البيانات"
            className="w-12 h-12 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/50 rounded-2xl flex items-center justify-center text-white transition-all cursor-pointer mr-auto"
          >
            <RefreshCw size={18} className={isLoadingData ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. Content Sections */}
      {activeTab === 'NEW' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Form Setup */}
          <div className="lg:col-span-2 space-y-6">
            {/* Branch Selection Card */}
            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Building2 size={18} className="text-emerald-600" />
                <span>تحديد مسار التحويل</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">فرع المصدر (من)</label>
                  <select
                    value={sourceBranch}
                    onChange={(e) => setSourceBranch(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-center pt-5">
                  <button
                    type="button"
                    onClick={handleSwapBranches}
                    title="تبديل اتجاه التحويل"
                    className="p-3 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-600 text-slate-600 rounded-2xl transition-all cursor-pointer"
                  >
                    <ArrowLeftRight size={18} />
                  </button>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">فرع الوجهة (إلى)</label>
                  <select
                    value={destinationBranch}
                    onChange={(e) => setDestinationBranch(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id} disabled={b.id === sourceBranch}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {sourceBranch === destinationBranch && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle size={16} />
                  <span>تنبيه: فرع المصدر وفرع الوجهة متطابقان، يرجى اختيار فرعين مختلفين.</span>
                </div>
              )}
            </div>

            {/* Product Addition Section */}
            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Search size={18} className="text-emerald-600" />
                <span>إضافة أصناف المناقلة</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-6">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">اختيار المستحضر الدوائي</label>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="بحث بالاسم أو الباركود..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                    >
                      <option value="">-- اختر الدواء المطلوب تحويله --</option>
                      {filteredProducts.map(prod => (
                        <option key={prod.productId} value={prod.productId}>
                          {prod.productName} (الرصيد: {prod.stockQuantity})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">الكمية المحولة</label>
                  <input
                    type="number"
                    min={1}
                    max={currentProduct ? currentProduct.stockQuantity : 9999}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                  />
                  {currentProduct && (
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      المتوفر: {currentProduct.stockQuantity} عبوة
                    </span>
                  )}
                </div>

                <div className="md:col-span-3 flex items-end">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!selectedProductId || sourceBranch === destinationBranch}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Plus size={16} />
                    <span>إدراج بالمناقلة</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Selected Items Table */}
            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center justify-between">
                <span>الأصناف المدرجة في مسودة التحويل ({items.length})</span>
                <span className="text-xs text-slate-400 font-medium">
                  إجمالي الوحدات: {items.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </h2>

              {items.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <ArrowLeftRight className="mx-auto text-slate-300 mb-2" size={32} />
                  <p className="text-xs font-bold text-slate-500">لم تتم إضافة أي أصناف إلى المناقلة بعد</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                        <th className="p-3">اسم المستحضر</th>
                        <th className="p-3 text-center">الرصيد المتاح</th>
                        <th className="p-3 text-center">الكمية المحولة</th>
                        <th className="p-3 text-center">رقم التشغيلة</th>
                        <th className="p-3 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {items.map(item => (
                        <tr key={item.productId} className="hover:bg-slate-50/50">
                          <td className="p-3 font-bold text-slate-800">{item.name}</td>
                          <td className="p-3 text-center">{item.availableStock}</td>
                          <td className="p-3 text-center font-bold text-emerald-700">{item.quantity}</td>
                          <td className="p-3 text-center text-slate-500">{item.batchNumber || '-'}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.productId)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="حذف الصنف"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Summary & Confirmation */}
          <div className="space-y-6">
            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800">بيانات وملاحظات المناقلة</h2>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">سبب / ملاحظات التحويل</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثال: موازنة مخزون صيدلية الياسمين لتغطية العجز الأسبوعي..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-600 resize-none"
                />
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>عدد الأصناف:</span>
                  <span className="font-bold text-slate-800">{items.length} صنف</span>
                </div>
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>إجمالي الكميات:</span>
                  <span className="font-bold text-emerald-700">{items.reduce((s, i) => s + i.quantity, 0)} عبوة</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateTransfer}
                disabled={isSubmitting || items.length === 0 || sourceBranch === destinationBranch}
                className="w-full bg-[#0c312d] hover:bg-[#07211e] disabled:opacity-50 text-white font-bold text-xs md:text-sm py-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Send size={18} />
                <span>{isSubmitting ? 'جاري معالجة التحويل...' : 'تأكيد وإرسال طلب التحويل'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 3. Transfers History & Status Management */
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-[24px] p-4 border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              {[
                { id: 'ALL', label: 'الكل' },
                { id: 'DRAFT', label: 'مسودات' },
                { id: 'APPROVED', label: 'معتمدة' },
                { id: 'IN_TRANSIT', label: 'قيد الشحن' },
                { id: 'RECEIVED', label: 'مستلمة' },
                { id: 'CANCELLED', label: 'ملغاة' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[#0c312d] text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-xs font-bold text-slate-400">
              إجمالي النتائج: {filteredTransfers.length}
            </span>
          </div>

          {/* Transfers Table / Cards */}
          {filteredTransfers.length === 0 ? (
            <div className="bg-white rounded-[24px] p-12 text-center border border-slate-100 shadow-sm">
              <FileText className="mx-auto text-slate-300 mb-3" size={40} />
              <p className="text-slate-500 font-bold text-sm">لا توجد طلبات تحويل مطابقة للفلتر المحدد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransfers.map(transfer => (
                <div
                  key={transfer.id}
                  className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800">طلب #{transfer.id}</span>
                      {getStatusBadge(transfer.status)}
                      <span className="text-[11px] text-slate-400">
                        {new Date(transfer.createdAt).toLocaleDateString('ar-SA')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                      <span className="text-slate-500">من:</span>
                      <span className="text-slate-800">{transfer.sourceName}</span>
                      <ArrowLeftRight size={14} className="text-slate-400" />
                      <span className="text-slate-500">إلى:</span>
                      <span className="text-slate-800">{transfer.targetName}</span>
                    </div>

                    {transfer.notes && (
                      <p className="text-[11px] text-slate-400 font-medium">{transfer.notes}</p>
                    )}
                  </div>

                  {/* Actions based on status */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <button
                      onClick={() => handleViewDetails(transfer.id)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Eye size={14} />
                      <span>التفاصيل</span>
                    </button>

                    {transfer.status === 'DRAFT' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(transfer.id, 'APPROVED')}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <CheckCircle2 size={14} />
                          <span>اعتماد</span>
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(transfer.id, 'CANCELLED')}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </>
                    )}

                    {transfer.status === 'APPROVED' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(transfer.id, 'IN_TRANSIT')}
                          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Truck size={14} />
                          <span>شحن الأصناف</span>
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(transfer.id, 'CANCELLED')}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </>
                    )}

                    {transfer.status === 'IN_TRANSIT' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(transfer.id, 'RECEIVED')}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <CheckCircle2 size={14} />
                          <span>استلام وتسوية</span>
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(transfer.id, 'CANCELLED')}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          إلغاء وإرجاع
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      <AnimatePresence>
        {selectedTransferDetails && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedTransferDetails(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[28px] p-6 max-w-lg w-full relative z-10 shadow-2xl border border-slate-50 space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-800">
                  تفاصيل المناقلة #{selectedTransferDetails.transfer.id}
                </h2>
                {getStatusBadge(selectedTransferDetails.transfer.status)}
              </div>

              <div className="space-y-2 text-xs text-slate-600 font-medium bg-slate-50 p-4 rounded-2xl">
                <div className="flex justify-between">
                  <span>من:</span>
                  <span className="font-bold text-slate-800">{selectedTransferDetails.transfer.sourceName}</span>
                </div>
                <div className="flex justify-between">
                  <span>إلى:</span>
                  <span className="font-bold text-slate-800">{selectedTransferDetails.transfer.targetName}</span>
                </div>
                {selectedTransferDetails.transfer.notes && (
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span>ملاحظات:</span>
                    <span className="font-bold text-slate-800">{selectedTransferDetails.transfer.notes}</span>
                  </div>
                )}
              </div>

              <h3 className="text-xs font-bold text-slate-700">الأصناف المشمولة:</h3>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {selectedTransferDetails.items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">{item.productName}</span>
                      <span className="text-[10px] text-slate-400">تشغيلة: {item.batchNumber || '-'}</span>
                    </div>
                    <span className="font-bold text-emerald-700">{item.qty} عبوة</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedTransferDetails(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
