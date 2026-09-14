import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RotateCcw, ShoppingBag, 
  Plus, Minus, Users, X, Check
} from 'lucide-react';
import { Product, Supplier, InvoiceItem } from '@/types';
import { PurchaseRepository } from '@/database/repositories/PurchaseRepository';
import { DraftService } from '@/services/system/DraftService';
import { UnifiedBusinessWorkflowOrchestrator } from '@/services/orchestration/UnifiedBusinessWorkflowOrchestrator';
import { db } from '@/core/db';
import { useUI } from '@/contexts/AppContext';

interface ReorderItemState {
  product: Product;
  selected: boolean;
  qty: number;
  unitPrice: number;
  supplierId: string;
}

interface AutoReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  lowStockProducts: Product[];
  suppliers: Supplier[];
  onSuccess: (draftId: string) => void;
  onNavigateToPurchases?: () => void;
}

export const AutoReorderModal: React.FC<AutoReorderModalProps> = ({
  isOpen,
  onClose,
  lowStockProducts,
  suppliers,
  onSuccess,
}) => {
  const { addToast, currency } = useUI();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize reorder item states with intelligent default quantities and cost prices
  const [itemsState, setItemsState] = useState<ReorderItemState[]>(() => {
    return lowStockProducts.map(product => {
      const currentStock = product.stock ?? product.StockQuantity ?? product.stock_qty ?? 0;
      const minLevel = product.MinLevel ?? product.minStockLevel ?? product.minStock ?? 5;
      const targetStock = minLevel * 2;
      const calculatedQty = Math.max(minLevel, targetStock - currentStock);

      const lastPrice = product.LastPurchasePrice || 
                        product.costPrice || 
                        product.CostPrice || 
                        product.cost || 
                        0;

      return {
        product,
        selected: true,
        qty: calculatedQty,
        unitPrice: lastPrice,
        supplierId: product.supplierId || ''
      };
    });
  });

  // Re-sync itemsState if lowStockProducts change
  React.useEffect(() => {
    setItemsState(lowStockProducts.map(product => {
      const currentStock = product.stock ?? product.StockQuantity ?? product.stock_qty ?? 0;
      const minLevel = product.MinLevel ?? product.minStockLevel ?? product.minStock ?? 5;
      const targetStock = minLevel * 2;
      const calculatedQty = Math.max(minLevel, targetStock - currentStock);

      const lastPrice = product.LastPurchasePrice || 
                        product.costPrice || 
                        product.CostPrice || 
                        product.cost || 
                        0;

      return {
        product,
        selected: true,
        qty: calculatedQty,
        unitPrice: lastPrice,
        supplierId: product.supplierId || ''
      };
    }));
  }, [lowStockProducts]);

  const selectedItems = useMemo(() => {
    return itemsState.filter(i => i.selected && i.qty > 0);
  }, [itemsState]);

  const grandTotal = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
  }, [selectedItems]);

  const allSelected = useMemo(() => {
    return itemsState.length > 0 && itemsState.every(i => i.selected);
  }, [itemsState]);

  const toggleSelectAll = () => {
    const nextState = !allSelected;
    setItemsState(prev => prev.map(item => ({ ...item, selected: nextState })));
  };

  const updateItemQty = (productId: string, delta: number) => {
    setItemsState(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = Math.max(1, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const setItemQtyDirect = (productId: string, qty: number) => {
    const validQty = isNaN(qty) || qty < 1 ? 1 : Math.floor(qty);
    setItemsState(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, qty: validQty };
      }
      return item;
    }));
  };

  const setItemPrice = (productId: string, price: number) => {
    const validPrice = isNaN(price) || price < 0 ? 0 : price;
    setItemsState(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, unitPrice: validPrice };
      }
      return item;
    }));
  };

  const toggleSelectItem = (productId: string) => {
    setItemsState(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  const handleCreateDraftOrder = async () => {
    if (selectedItems.length === 0) {
      addToast("يرجى تحديد صنف واحد على الأقل لإعادة الطلب", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const autoInvoiceNum = await PurchaseRepository.getNextInvoiceNumber();
      const draftId = `DRAFT-${db.generateId('PUR')}`;
      
      const matchedSupplier = suppliers.find(s => s.id === selectedSupplierId);
      const supplierName = matchedSupplier?.name || matchedSupplier?.Supplier_Name || 'مورد عام';

      const invoiceItems: InvoiceItem[] = selectedItems.map(item => {
        const prod = item.product;
        const sumVal = item.qty * item.unitPrice;
        return {
          id: db.generateId('ITEM'),
          parent_id: draftId,
          product_id: prod.id,
          productId: prod.id,
          name: prod.name || prod.Name || 'صنف',
          productName: prod.name || prod.Name || 'صنف',
          qty: item.qty,
          quantity: item.qty,
          price: item.unitPrice,
          unitPrice: item.unitPrice,
          sum: sumVal,
          subtotal: sumVal,
          expiryDate: prod.ExpiryDate || prod.expiryDate || '',
          category: prod.categoryName || (prod as any).category || 'عام',
          notes: `إعادة طلب تلقائي (الرصيد الحالي: ${prod.stock ?? prod.StockQuantity ?? 0})`
        };
      });

      const draftInvoiceData = {
        id: draftId,
        invoice_id: draftId,
        invoiceId: autoInvoiceNum,
        invoiceNumber: autoInvoiceNum,
        type: 'PURCHASE',
        invoiceType: 'مشتريات',
        date: new Date().toISOString().split('T')[0],
        supplierId: selectedSupplierId || '',
        supplierName: supplierName,
        partnerId: selectedSupplierId || '',
        partnerName: supplierName,
        partner_id: selectedSupplierId || '',
        items: invoiceItems,
        subtotal: grandTotal,
        totalAmount: grandTotal,
        finalTotal: grandTotal,
        grandTotal: grandTotal,
        status: 'DRAFT',
        invoiceStatus: 'DRAFT',
        payment_status: 'Unpaid',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        remainingAmount: grandTotal,
        notes: `مسودة طلب شراء تلقائية تم إنشاؤها بناءً على الحد الأدنى للرصيد لعدد (${selectedItems.length}) صنف`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save persistent invoice record via Orchestrator
      await UnifiedBusinessWorkflowOrchestrator.processPurchase(
        {
          id: draftId,
          supplierId: selectedSupplierId || '',
          items: invoiceItems,
          total: grandTotal,
          date: new Date().toISOString().split('T')[0],
          notes: draftInvoiceData.notes
        },
        {
          invoiceStatus: 'DRAFT',
          isCash: false,
          paymentStatus: 'Credit'
        }
      );

      // Also save active session draft for seamless opening in Purchases view
      await DraftService.saveDraft('pharmaflow_purchase_draft', 'Purchase Invoice', {
        header: {
          invoice_number: autoInvoiceNum,
          supplier_id: selectedSupplierId || '',
          payment_method: 'Credit',
          status: 'DRAFT',
          payment_status: 'Unpaid',
          date: new Date().toISOString().split('T')[0],
          notes: draftInvoiceData.notes,
          isReturn: false
        },
        items: invoiceItems,
        totals: {
          subtotal: grandTotal,
          grandTotal: grandTotal
        },
        partner: matchedSupplier || null
      });

      addToast("تم إنشاء مسودة طلب الشراء بنجاح 📋✨", "success");
      onSuccess(draftId);
      onClose();
    } catch (err) {
      console.error("Failed to create auto reorder draft:", err);
      addToast("فشل إنشاء مسودة طلب الشراء، يرجى المحاولة لاحقاً", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[2000] flex items-center justify-center p-3 sm:p-6 font-cairo"
        dir="rtl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="w-full max-w-4xl bg-white rounded-[36px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 sm:p-8 bg-gradient-to-r from-[#1E4D4D] to-[#163c3c] text-white shrink-0 relative">
            <button 
              onClick={onClose}
              className="absolute left-6 top-6 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-md shadow-inner">
                <RotateCcw size={28} className="text-emerald-300 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">إعادة الطلب التلقائي للمستودع</h2>
                  <span className="bg-emerald-500/30 text-emerald-200 text-xs font-black px-3 py-1 rounded-full border border-emerald-400/30">
                    محرك التزويد الذكي
                  </span>
                </div>
                <p className="text-xs text-emerald-100/80 mt-1 font-medium">
                  تم تحديد الاصناف التي وصلت أو تجاوزت الحد الأدنى للرصيد لإنشاء مسودة طلب شراء فورية للمورد
                </p>
              </div>
            </div>

            {/* Top Stat Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/10">
              <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
                <span className="text-[10px] text-emerald-200 uppercase font-black tracking-wider block">الأصناف المنخفضة</span>
                <span className="text-lg font-black text-white">{lowStockProducts.length} أصناف</span>
              </div>
              <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
                <span className="text-[10px] text-emerald-200 uppercase font-black tracking-wider block">الأصناف المحددة للطلب</span>
                <span className="text-lg font-black text-emerald-300">{selectedItems.length} أصناف</span>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl p-3 backdrop-blur-sm">
                <span className="text-[10px] text-emerald-100 uppercase font-black tracking-wider block">إجمالي القيمة التقديرية</span>
                <span className="text-lg font-black text-white">{grandTotal.toLocaleString()} {currency}</span>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {/* Supplier Selector */}
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-[24px]">
              <label className="text-xs font-black text-[#1E4D4D] flex items-center gap-2 mb-2">
                <Users size={16} className="text-emerald-600" />
                <span>اختر المورد المعتمد لمسودة الشراء:</span>
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full h-13 bg-white border border-slate-200 rounded-2xl px-4 text-xs font-bold text-slate-800 outline-none focus:border-[#1E4D4D] transition-all shadow-sm"
              >
                <option value="">-- مورد عام / غير محدد --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.Supplier_Name || s.Customer_Name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Reorder Table Header Actions */}
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs font-black text-[#1E4D4D] hover:text-emerald-700 transition-colors"
              >
                <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                  allSelected ? 'bg-[#1E4D4D] border-[#1E4D4D] text-white' : 'bg-white border-slate-300'
                }`}>
                  {allSelected && <Check size={14} strokeWidth={3} />}
                </div>
                <span>تحديد جميع الأصناف ({itemsState.length})</span>
              </button>

              <span className="text-xs text-slate-400 font-bold">
                تحديد الكمية وسعر الشراء المتوقع
              </span>
            </div>

            {/* Items List */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {itemsState.map(({ product, selected, qty, unitPrice }) => {
                const currentStock = product.stock ?? product.StockQuantity ?? 0;
                const minLevel = product.MinLevel ?? product.minStockLevel ?? 5;
                const subtotal = qty * unitPrice;

                return (
                  <div
                    key={product.id}
                    className={`p-4 rounded-[24px] border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      selected 
                        ? 'bg-white border-slate-200 shadow-sm hover:border-emerald-500/40' 
                        : 'bg-slate-50/60 border-slate-100 opacity-60'
                    }`}
                  >
                    {/* Item Info & Checkbox */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelectItem(product.id)}
                        className={`mt-1 w-6 h-6 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
                          selected ? 'bg-[#1E4D4D] border-[#1E4D4D] text-white' : 'bg-white border-slate-300'
                        }`}
                      >
                        {selected && <Check size={14} strokeWidth={3} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-black text-[#1E4D4D] truncate mb-1">
                          {product.name || product.Name}
                        </h4>
                        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                          <span className="bg-red-50 text-red-600 px-2.5 py-0.5 rounded-full font-black border border-red-100">
                            الرصيد: {currentStock} {product.DefaultUnit || 'حبة'}
                          </span>
                          <span className="bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full font-black border border-amber-100">
                            الحد الأدنى: {minLevel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quantity & Unit Price Controls */}
                    {selected && (
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                        {/* Qty Counter */}
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-slate-400 mb-1">الكمية المطلوبة</span>
                          <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-inner">
                            <button
                              type="button"
                              onClick={() => updateItemQty(product.id, -1)}
                              className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-90 transition-all"
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={qty}
                              onChange={(e) => setItemQtyDirect(product.id, parseInt(e.target.value, 10))}
                              className="w-14 h-8 text-center text-xs font-black text-[#1E4D4D] bg-transparent outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateItemQty(product.id, 1)}
                              className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-90 transition-all"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Unit Price */}
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-slate-400 mb-1">سعر التكلفة ({currency})</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={unitPrice}
                            onChange={(e) => setItemPrice(product.id, parseFloat(e.target.value))}
                            className="w-20 h-8 border border-slate-200 rounded-xl text-center text-xs font-black text-[#1E4D4D] bg-white outline-none focus:border-[#1E4D4D]"
                          />
                        </div>

                        {/* Row Subtotal */}
                        <div className="text-left min-w-[90px]">
                          <span className="text-[9px] font-black text-slate-400 block">المجموع</span>
                          <span className="text-xs font-black text-emerald-700">
                            {subtotal.toLocaleString()} {currency}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
            <div className="text-right">
              <span className="text-xs text-slate-400 font-bold block">إجمالي مسودة الطلب</span>
              <span className="text-xl font-black text-[#1E4D4D]">
                {grandTotal.toLocaleString()} {currency}
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-6 py-4 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-black hover:bg-slate-100 transition-all"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={isSubmitting || selectedItems.length === 0}
                onClick={handleCreateDraftOrder}
                className="flex-1 sm:flex-none px-8 py-4 rounded-2xl bg-[#1E4D4D] text-white text-xs font-black shadow-xl shadow-emerald-900/20 hover:bg-[#153a3a] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RotateCcw size={18} className="animate-spin" />
                    <span>جاري الإنشاء...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={18} />
                    <span>إنشاء مسودة طلب شراء ({selectedItems.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
