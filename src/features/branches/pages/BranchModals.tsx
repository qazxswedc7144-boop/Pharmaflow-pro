// src/features/branches/pages/BranchModals.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Building2,
  MapPin,
  Phone,
  UserCheck,
  Clock,
  Percent,
  SlidersHorizontal,
  ArrowLeftRight,
  Search,
  Plus,
  Trash2,
  Send,
  Package,
  AlertTriangle,
  CheckCircle2,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Branch, BranchSettings, BranchMetrics } from '@/types';
import { BranchService } from '../services/BranchService';
import { useUI } from '@/contexts/AppContext';
import { authService } from '@features/auth/services/authService';

// =========================================================================
// 1. ADD / EDIT BRANCH MODAL
// =========================================================================

interface BranchFormModalProps {
  isOpen: boolean;
  branch: Partial<Branch> | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const BranchFormModal: React.FC<BranchFormModalProps> = ({
  isOpen,
  branch,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useUI();
  const [formData, setFormData] = useState<Partial<Branch>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (branch) {
      setFormData({
        ...branch,
        code: branch.code || '',
        name: branch.name || '',
        managerName: branch.managerName || '',
        phone: branch.phone || '',
        location: branch.location || branch.address || '',
        workingHours: branch.workingHours || '08:00 ص - 12:00 م',
        allowedDiscount: branch.allowedDiscount ?? 5,
        isMain: !!branch.isMain,
        isActive: branch.isActive !== false,
      });
    }
  }, [branch]);

  // Handle keyboard Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !branch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.code?.trim()) {
      addToast('يرجى ملء اسم ورمز الفرع الإلزامي', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await BranchService.saveBranch(formData);
      addToast(formData.id ? 'تم تحديث بيانات الفرع بنجاح' : 'تم إنشاء الفرع الجديد بنجاح', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(err.message || 'فشل حفظ بيانات الفرع', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-[28px] p-5 sm:p-7 max-w-xl w-full relative z-10 shadow-2xl border border-slate-100 my-auto max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-center pb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-800">
                  {formData.id ? 'تعديل بيانات الفرع / المخزن' : 'إضافة فرع جديد للشبكة'}
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  إدارة البيانات الأساسية، مسؤول الصيدلية، ومحددات الخصم
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-4 overflow-y-auto px-1 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <span>رمز الفرع الفريد</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!!formData.id}
                  placeholder="مثال: BRH-NORTH"
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800 disabled:opacity-60 uppercase"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <span>اسم الفرع / الصيدلية</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فرع شمال الرياض - الياسمين"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                />
              </div>

              {/* Pharmacist / Manager */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-emerald-600" />
                  <span>الصيدلي المسؤول / المدير</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: د. أحمد المنصوري"
                  value={formData.managerName || ''}
                  onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Phone size={14} className="text-emerald-600" />
                  <span>رقم الهاتف المباشر</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="+966 11 204 5678"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800 text-right"
                />
              </div>

              {/* Working Hours */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock size={14} className="text-emerald-600" />
                  <span>ساعات وسير العمل</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: 08:00 ص - 12:00 م أو 24 ساعة"
                  value={formData.workingHours || ''}
                  onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                />
              </div>

              {/* Allowed Discount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Percent size={14} className="text-emerald-600" />
                  <span>سقف الخصم المسموح للفرع (%)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={formData.allowedDiscount ?? 5}
                  onChange={(e) => setFormData({ ...formData, allowedDiscount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <MapPin size={14} className="text-emerald-600" />
                <span>العنوان التفصيلي وموقع الفرع</span>
              </label>
              <input
                type="text"
                placeholder="المدينة، الحي، الشارع، المعلم المجاور"
                value={formData.location || formData.address || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value, address: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
              />
            </div>

            {/* Checkboxes: isMain and isActive */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!formData.isMain}
                  onChange={(e) => setFormData({ ...formData, isMain: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 rounded border-slate-300 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">تعيين كـ (الفرع الرئيسي للمؤسسة)</span>
                  <span className="text-[11px] text-slate-400 font-medium">يكون الفرع الرئيسي هو المستودع المركزي المرجعي الافتراضي.</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none pt-2 border-t border-slate-200/60">
                <input
                  type="checkbox"
                  checked={formData.isActive !== false}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 rounded border-slate-300 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">الفرع نشط ويستقبل العمليات</span>
                  <span className="text-[11px] text-slate-400 font-medium">تمكين عمليات البيع والشراء والمناقلة المخزنية للفرع.</span>
                </div>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2 shrink-0">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-[#0c312d] hover:bg-[#08221f] disabled:opacity-50 text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <CheckCircle2 size={16} />
                <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ بيانات الفرع'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// =========================================================================
// 2. CONFIGURE SETTINGS / AUTO-REORDER MODAL
// =========================================================================

interface BranchSettingsModalProps {
  isOpen: boolean;
  branch: Branch | null;
  onClose: () => void;
}

export const BranchSettingsModal: React.FC<BranchSettingsModalProps> = ({
  isOpen,
  branch,
  onClose,
}) => {
  const { addToast } = useUI();
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (branch && isOpen) {
      loadSettings(branch.id);
    }
  }, [branch, isOpen]);

  const loadSettings = async (branchId: string) => {
    setIsLoading(true);
    try {
      const data = await BranchService.getBranchSettings(branchId);
      setSettings(data);
    } catch {
      addToast('فشل تحميل إعدادات الفرع', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    try {
      await BranchService.saveBranchSettings(settings);
      addToast('تم تطبيق إعدادات التنبيه وإعادة الطلب بنجاح', 'success');
      onClose();
    } catch {
      addToast('فشل حفظ إعدادات الفرع', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !branch) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-[28px] p-5 sm:p-7 max-w-md w-full relative z-10 shadow-2xl border border-slate-100 my-auto"
        >
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-800">
                  خيارات التنبؤ والطلب التلقائي
                </h2>
                <p className="text-xs text-slate-400 font-medium">{branch.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {isLoading || !settings ? (
            <div className="py-10 text-center">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-bold">جاري قراءة إعدادات الفرع...</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4 pt-4">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.minStockLevelAlert}
                    onChange={(e) => setSettings({ ...settings, minStockLevelAlert: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 rounded border-slate-300 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">تفعيل منبهات انخفاض مستوى المخزون</span>
                    <span className="text-[11px] text-slate-400 font-medium leading-relaxed block mt-0.5">
                      يقوم النظام بإشعار المسؤول عندما يقل رصيد الدواء عن نقطة إعادة الطلب المحددة له محلياً.
                    </span>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  أيام التغطية المستهدفة لإعادة الطلب التلقائي
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  required
                  value={settings.autoReorderTargetDays}
                  onChange={(e) => setSettings({ ...settings, autoReorderTargetDays: parseInt(e.target.value, 10) || 30 })}
                  className="w-full px-4 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  عدد الأيام النموذجية التي يعتمد عليها خوارزمي إعادة الطلب لتغطية متوسط مبيعات الفرع.
                </span>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-[#0c312d] hover:bg-[#08221f] text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                >
                  <CheckCircle2 size={16} />
                  <span>{isSaving ? 'جاري الحفظ...' : 'تطبيق الإعدادات'}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// =========================================================================
// 3. INTER-BRANCH STOCK TRANSFER MODAL
// =========================================================================

interface BranchTransferModalProps {
  isOpen: boolean;
  sourceBranchId: string;
  branches: Branch[];
  onClose: () => void;
  onSuccess: () => void;
}

interface TransferItemDraft {
  productId: string;
  name: string;
  barcode?: string;
  quantity: number;
  availableStock: number;
  batchNumber?: string;
  expiryDate?: string;
}

export const BranchTransferModal: React.FC<BranchTransferModalProps> = ({
  isOpen,
  sourceBranchId,
  branches,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useUI();
  const [srcBranch, setSrcBranch] = useState(sourceBranchId);
  const [targetBranch, setTargetBranch] = useState('');
  const [reason, setReason] = useState('');
  
  // Real inventory items for source branch
  const [sourceInventory, setSourceInventory] = useState<any[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);

  // Search & Autocomplete
  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [transferQty, setTransferQty] = useState(1);
  const [batchNum, setBatchNum] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Draft items list
  const [items, setItems] = useState<TransferItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (sourceBranchId) {
      setSrcBranch(sourceBranchId);
    }
  }, [sourceBranchId]);

  useEffect(() => {
    // Select default target branch if available
    const other = branches.find(b => b.id !== srcBranch);
    if (other) {
      setTargetBranch(other.id);
    }
    if (srcBranch) {
      loadInventory(srcBranch);
      setItems([]);
      setSelectedProduct(null);
      setProductQuery('');
    }
  }, [srcBranch, branches]);

  const loadInventory = async (branchId: string) => {
    setIsLoadingInventory(true);
    try {
      const inv = await BranchService.getBranchInventory(branchId);
      setSourceInventory(inv);
    } catch {
      addToast('فشل قراءة مخزون فرع المصدر', 'error');
    } finally {
      setIsLoadingInventory(false);
    }
  };

  // Filtered products for instant offline autocomplete
  const searchResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return sourceInventory.slice(0, 15);
    return sourceInventory.filter(item => 
      (item.productName || '').toLowerCase().includes(q) ||
      (item.barcode || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [productQuery, sourceInventory]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (prod: any) => {
    setSelectedProduct(prod);
    setProductQuery(prod.productName);
    setIsDropdownOpen(false);
    setTransferQty(1);
    setBatchNum(prod.batchNumber || 'BATCH-AUTO');
  };

  const handleAddItem = () => {
    if (!selectedProduct) {
      addToast('يرجى اختيار الدواء من القائمة أولاً', 'warning');
      return;
    }
    if (transferQty <= 0) {
      addToast('الكمية المحولة يجب أن تكون أكبر من الصفر', 'warning');
      return;
    }

    const available = selectedProduct.stockQuantity || 0;
    const existingIndex = items.findIndex(i => i.productId === selectedProduct.productId);
    const existingItem = existingIndex >= 0 ? items[existingIndex] : undefined;
    const alreadySelectedQty = existingItem ? existingItem.quantity : 0;
    const totalQty = alreadySelectedQty + transferQty;

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
          productId: selectedProduct.productId,
          name: selectedProduct.productName,
          barcode: selectedProduct.barcode,
          quantity: transferQty,
          availableStock: available,
          batchNumber: batchNum.trim() || 'BATCH-AUTO',
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        }
      ]);
    }

    setSelectedProduct(null);
    setProductQuery('');
    setTransferQty(1);
    setBatchNum('');
    addToast('تمت إضافة الصنف إلى مسودة المناقلة', 'info');
  };

  const handleRemoveItem = (productId: string) => {
    setItems(items.filter(i => i.productId !== productId));
  };

  const handleSubmitTransfer = async () => {
    if (!srcBranch || !targetBranch) {
      addToast('يرجى تحديد فرع المصدر وفرع الوجهة', 'warning');
      return;
    }
    if (srcBranch === targetBranch) {
      addToast('لا يمكن إجراء تحويل بين نفس الفرع', 'warning');
      return;
    }
    if (items.length === 0) {
      addToast('يرجى إضافة صنف واحد على الأقل للمناقلة', 'warning');
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
        srcBranch,
        targetBranch,
        transferItems,
        reason || 'تحويل وموازنة مخزون دوائي',
        username
      );

      addToast('تم إنشاء طلب التحويل المخزني بنجاح عبر محرك العمليات', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(err.message || 'فشل معالجة طلب التحويل', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-[28px] p-5 sm:p-7 max-w-2xl w-full relative z-10 shadow-2xl border border-slate-100 my-auto max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-center pb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <ArrowLeftRight size={20} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-800">
                  مناقلة مخزنية بين الفروع
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  تحويل الأدوية والمستلزمات مع تحديث حقيقي للطبقات التخزينية وسجل التدقيق
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Body */}
          <div className="space-y-4 pt-4 overflow-y-auto px-1 flex-1">
            {/* Branch Selection Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">فرع المصدر (من)</label>
                <select
                  value={srcBranch}
                  onChange={(e) => setSrcBranch(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">فرع الوجهة (إلى)</label>
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                >
                  {branches.filter(b => b.id !== srcBranch).map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product Autocomplete Picker */}
            <div className="space-y-2 p-3.5 bg-emerald-50/40 rounded-2xl border border-emerald-100/70 relative">
              <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>اختيار الصنف الدوائي من مخزون المصدر</span>
                {isLoadingInventory && (
                  <span className="text-[11px] text-emerald-600 font-bold">جاري تحديث المخزون...</span>
                )}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2" ref={dropdownRef}>
                {/* Autocomplete Input */}
                <div className="sm:col-span-6 relative">
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الباركود..."
                    value={productQuery}
                    onFocus={() => setIsDropdownOpen(true)}
                    onChange={(e) => {
                      setProductQuery(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    className="w-full pl-3 pr-9 py-2.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                  />
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />

                  {/* Autocomplete Dropdown */}
                  {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                      {searchResults.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 font-bold">
                          لا توجد نتائج مطابقة في هذا الفرع
                        </div>
                      ) : (
                        searchResults.map(item => (
                          <button
                            key={item.productId}
                            type="button"
                            onClick={() => handleSelectProduct(item)}
                            className="w-full text-right p-2.5 hover:bg-emerald-50 transition-colors flex justify-between items-center text-xs cursor-pointer"
                          >
                            <div>
                              <span className="font-bold text-slate-800 block">{item.productName}</span>
                              <span className="text-[10px] text-slate-400">باركود: {item.barcode || '-'}</span>
                            </div>
                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                              متاح: {item.stockQuantity}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Qty Input */}
                <div className="sm:col-span-3">
                  <input
                    type="number"
                    min={1}
                    max={selectedProduct ? selectedProduct.stockQuantity : 9999}
                    placeholder="الكمية"
                    value={transferQty}
                    onChange={(e) => setTransferQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800 text-center"
                  />
                </div>

                {/* Add Button */}
                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!selectedProduct}
                    className="w-full h-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Plus size={16} />
                    <span>إدراج</span>
                  </button>
                </div>
              </div>

              {selectedProduct && (
                <div className="text-[11px] text-slate-600 font-bold pt-1 flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>المحدد: {selectedProduct.productName} (الرصيد المتاح: {selectedProduct.stockQuantity} عبوة)</span>
                </div>
              )}
            </div>

            {/* Selected Items Table */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>الأصناف المحولة ({items.length})</span>
                <span className="text-emerald-700">
                  إجمالي الوحدات: {items.reduce((acc, i) => acc + i.quantity, 0)}
                </span>
              </div>

              {items.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Package className="mx-auto text-slate-300 mb-1" size={26} />
                  <p className="text-xs text-slate-400 font-bold">لم يتم إدراج أصناف بالمسودة بعد</p>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-slate-100 rounded-2xl divide-y divide-slate-100">
                  {items.map(item => (
                    <div key={item.productId} className="p-2.5 bg-white flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-800 block">{item.name}</span>
                        <span className="text-[10px] text-slate-400">متاح: {item.availableStock}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-emerald-700">{item.quantity} عبوة</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.productId)}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / سبب التحويل</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: موازنة مخزون صيدلية الياسمين لتغطية العجز الأسبوعي..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800 resize-none font-medium"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2 shrink-0">
              <button
                type="button"
                onClick={handleSubmitTransfer}
                disabled={isSubmitting || items.length === 0 || srcBranch === targetBranch}
                className="flex-1 bg-[#0c312d] hover:bg-[#08221f] disabled:opacity-50 text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <Send size={16} />
                <span>{isSubmitting ? 'جاري التنفيذ...' : 'تأكيد وإرسال المناقلة'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// =========================================================================
// 4. BRANCH REAL-TIME ANALYTICS MODAL (READ ONLY)
// =========================================================================

interface BranchAnalyticsModalProps {
  isOpen: boolean;
  branch: Branch | null;
  metrics: BranchMetrics | null;
  onClose: () => void;
}

export const BranchAnalyticsModal: React.FC<BranchAnalyticsModalProps> = ({
  isOpen,
  branch,
  metrics,
  onClose,
}) => {
  const { currency } = useUI();
  const [predictions, setPredictions] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (branch && isOpen) {
      loadPredictions(branch.id);
    }
  }, [branch, isOpen]);

  const loadPredictions = async (branchId: string) => {
    setIsLoading(true);
    try {
      const p = await BranchService.generateAIInventoryPredictions(branchId);
      setPredictions(p);
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !branch) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-[28px] p-5 sm:p-7 max-w-xl w-full relative z-10 shadow-2xl border border-slate-100 my-auto max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-center pb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <Activity size={20} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-800">
                  المؤشرات التشغيلية والتحليلات
                </h2>
                <p className="text-xs text-slate-400 font-medium">{branch.name} ({branch.code})</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4 pt-4 overflow-y-auto px-1 flex-1">
            {/* 3 Metric Cards */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 block mb-1">مبيعات اليوم</span>
                <span className="text-xs sm:text-sm font-black text-emerald-700">
                  {metrics ? metrics.salesToday.toLocaleString() : '0'} {currency}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  ({metrics ? metrics.salesTodayCount : 0} فاتورة)
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 block mb-1">قيمة المخزون</span>
                <span className="text-xs sm:text-sm font-black text-slate-800">
                  {metrics ? metrics.inventoryValue.toLocaleString() : '0'} {currency}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  ({metrics ? metrics.totalProductsCount : 0} صنف)
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 block mb-1">نواقص المخزون</span>
                <span className="text-xs sm:text-sm font-black text-rose-600">
                  {metrics ? metrics.lowStockCount : 0}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">تحت حد الطلب</span>
              </div>
            </div>

            {/* AI Predictions & Low Stock Alerts */}
            {isLoading ? (
              <div className="py-6 text-center">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-bold">جاري تحليل بيانات المخزون...</p>
              </div>
            ) : predictions && predictions.lowStockPredictions?.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span>تنبيهات الأصناف الحرجة ونواقص الفرع</span>
                </h3>

                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {predictions.lowStockPredictions.map((p: any) => (
                    <div
                      key={p.productId}
                      className="p-2.5 bg-amber-50/50 border border-amber-200/60 rounded-xl flex justify-between items-center text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800 block">{p.productName}</span>
                        <span className="text-[10px] text-slate-400">
                          الرصيد: {p.stockQuantity} | حد الطلب: {p.reorderPoint}
                        </span>
                      </div>
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold">
                        {p.recommendation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center bg-emerald-50/40 rounded-2xl border border-emerald-100">
                <CheckCircle2 className="mx-auto text-emerald-600 mb-1.5" size={24} />
                <p className="text-xs text-emerald-800 font-bold">حالة المخزون ممتازة</p>
                <p className="text-[11px] text-emerald-600/90 font-medium mt-0.5">
                  كافة الأصناف المسجلة في الفرع أعلى من حد الأمان وإعادة الطلب.
                </p>
              </div>
            )}

            <div className="pt-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
