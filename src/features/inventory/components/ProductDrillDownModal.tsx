import React, { useState, useEffect } from 'react';
import { 
  X, Box, TrendingUp, ArrowDownLeft, ArrowUpRight, 
  Layers, ArrowRightLeft, Building2, User,
  CheckCircle2, AlertTriangle, AlertCircle, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProductTraceabilityService, ProductTraceabilitySummary } from '../services/ProductTraceabilityService';
import { Badge } from '@/components/shared/SharedUI';

interface ProductDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string | null;
  currency: string;
  onNavigateToInvoice?: (invoiceNumber: string, type: 'SALE' | 'PURCHASE') => void;
}

export const ProductDrillDownModal: React.FC<ProductDrillDownModalProps> = ({
  isOpen,
  onClose,
  productId,
  currency,
  onNavigateToInvoice
}) => {
  const [data, setData] = useState<ProductTraceabilitySummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'suppliers' | 'customers' | 'movements' | 'batches'>('summary');

  useEffect(() => {
    if (isOpen && productId) {
      setIsLoading(true);
      ProductTraceabilityService.getProductTraceability(productId)
        .then(summary => {
          setData(summary);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('[ProductDrillDownModal] Error fetching traceability data:', err);
          setIsLoading(false);
        });
    } else {
      setData(null);
    }
  }, [isOpen, productId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-[32px] w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-cairo border border-slate-100"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-[#1E4D4D] to-[#163838] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <Box size={24} className="text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">{data?.productName || 'تحليل الصنف والتتبع'}</h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {data?.categoryName || 'عام'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                كود الصنف: <span className="font-mono text-emerald-200">{productId}</span>
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/70 p-2 shrink-0 border-b border-slate-200/60 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              activeTab === 'summary' ? 'bg-white text-[#1E4D4D] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers size={15} /> بطاقة الصنف والمطابقة
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              activeTab === 'suppliers' ? 'bg-white text-[#1E4D4D] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 size={15} /> الموردون والتوريدات ({data?.suppliers.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              activeTab === 'customers' ? 'bg-white text-[#1E4D4D] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <User size={15} /> العملاء والمبيعات ({data?.customers.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              activeTab === 'movements' ? 'bg-white text-[#1E4D4D] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ArrowRightLeft size={15} /> سجل الحركات الكامل ({data?.movements.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('batches')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              activeTab === 'batches' ? 'bg-white text-[#1E4D4D] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers size={15} /> الدفعات والصلاحية ({data?.batches.length || 0})
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-[#1E4D4D] rounded-full animate-spin"></div>
              <span className="text-xs font-bold">جاري تحميل بيانات التتبع الذكي للصنف...</span>
            </div>
          ) : !data ? (
            <div className="p-12 text-center text-slate-400 text-sm font-bold">
              لا توجد بيانات متاحة لهذا الصنف
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'summary' && (
                <motion.div 
                  key="summary"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-6"
                >
                  {/* KPI Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black text-slate-400 uppercase">إجمالي المشتريات</span>
                        <div className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                          <ArrowDownLeft size={16} />
                        </div>
                      </div>
                      <p className="text-xl font-black text-[#1E4D4D]">{data.totalPurchasedQty.toLocaleString()}</p>
                      {data.totalReturnedPurchaseQty > 0 && (
                        <p className="text-[10px] text-amber-600 font-bold mt-1">مرتجع: -{data.totalReturnedPurchaseQty}</p>
                      )}
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black text-slate-400 uppercase">إجمالي المبيعات</span>
                        <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                          <ArrowUpRight size={16} />
                        </div>
                      </div>
                      <p className="text-xl font-black text-blue-700">{data.totalSoldQty.toLocaleString()}</p>
                      {data.totalReturnedSaleQty > 0 && (
                        <p className="text-[10px] text-emerald-600 font-bold mt-1">مرتجع عملاء: +{data.totalReturnedSaleQty}</p>
                      )}
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black text-slate-400 uppercase">الرصيد الفعلي</span>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${data.remainingStock <= data.minLevel ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-[#1E4D4D]'}`}>
                          <Box size={16} />
                        </div>
                      </div>
                      <p className={`text-xl font-black ${data.remainingStock <= data.minLevel ? 'text-red-600' : 'text-[#1E4D4D]'}`}>
                        {data.remainingStock.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">الحد الأدنى: {data.minLevel}</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black text-slate-400 uppercase">آخر تكلفة شراء</span>
                        <div className="w-7 h-7 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                          <TrendingUp size={16} />
                        </div>
                      </div>
                      <p className="text-xl font-black text-purple-700">{data.lastPurchaseCost.toLocaleString()} {currency}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">المتوسط: {data.averagePurchaseCost.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Stock Equation Verification Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-slate-600 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-[#1E4D4D]" />
                        معادلة تطابق الرصيد المحاسبي المعتمد (Source of Truth Reconciliation)
                      </h4>
                      {data.reconciliation && (
                        <div className="flex items-center gap-2">
                          {data.reconciliation.status === 'MATCHED' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={13} className="text-emerald-600" />
                              رصيد مطابق (MATCHED)
                            </span>
                          )}
                          {data.reconciliation.status === 'WARNING' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle size={13} className="text-amber-600" />
                              تنبيه تدقيق (WARNING)
                            </span>
                          )}
                          {data.reconciliation.status === 'DISCREPANCY' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle size={13} className="text-rose-600" />
                              فارق مكتشف (DISCREPANCY)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
                      <div className="text-center">
                        <span className="text-slate-400 block text-[10px]">صافي المشتريات</span>
                        <span className="text-emerald-700 font-black">+{data.totalPurchasedQty - data.totalReturnedPurchaseQty}</span>
                      </div>
                      <span className="text-slate-300 font-black text-base">-</span>
                      <div className="text-center">
                        <span className="text-slate-400 block text-[10px]">صافي المبيعات</span>
                        <span className="text-blue-700 font-black">-{data.totalSoldQty - data.totalReturnedSaleQty}</span>
                      </div>
                      <span className="text-slate-300 font-black text-base">+</span>
                      <div className="text-center">
                        <span className="text-slate-400 block text-[10px]">التسويات</span>
                        <span className={`font-black ${data.reconciliation?.adjustmentsQty >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>
                          {data.reconciliation ? (data.reconciliation.adjustmentsQty >= 0 ? `+${data.reconciliation.adjustmentsQty}` : data.reconciliation.adjustmentsQty) : 0}
                        </span>
                      </div>
                      <span className="text-slate-300 font-black text-base">=</span>
                      <div className="text-center bg-white px-4 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-slate-400 block text-[10px]">الرصيد الدفتري</span>
                        <span className="text-[#1E4D4D] font-black">
                          {data.reconciliation?.bookBalance ?? ((data.totalPurchasedQty - data.totalReturnedPurchaseQty) - (data.totalSoldQty - data.totalReturnedSaleQty))}
                        </span>
                      </div>
                      <div className="text-center bg-blue-50/70 px-4 py-1.5 rounded-lg border border-blue-200 shadow-2xs">
                        <span className="text-blue-700 block text-[10px]">مجموع الطبقات</span>
                        <span className="text-blue-900 font-black">{data.reconciliation?.layersSum ?? 0}</span>
                      </div>
                      <div className="text-center bg-emerald-50 px-4 py-1.5 rounded-lg border border-emerald-200 shadow-2xs">
                        <span className="text-emerald-700 block text-[10px]">رصيد بطاقة الصنف</span>
                        <span className="text-emerald-800 font-black">{data.remainingStock}</span>
                      </div>
                    </div>

                    {/* Discrepancies Diagnostic List (if any) */}
                    {data.reconciliation && data.reconciliation.discrepancies.length > 0 && (
                      <div className="mt-3 p-3.5 bg-rose-50/60 border border-rose-200/80 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-rose-800 text-xs font-black">
                          <AlertCircle size={14} className="text-rose-600" />
                          <span>سجل الفروقات المكتشفة (للتدقيق والتحقق فقط):</span>
                        </div>
                        <ul className="space-y-1.5 text-[11px] text-rose-700 font-medium">
                          {data.reconciliation.discrepancies.map((d) => (
                            <li key={d.id} className="flex items-start gap-2 bg-white/70 p-2 rounded-lg border border-rose-100">
                              <span className="font-mono font-bold text-rose-900 shrink-0">[{d.source}]</span>
                              <span className="flex-1">{d.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'suppliers' && (
                <motion.div 
                  key="suppliers"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-[#1E4D4D]">قائمة الموردين الذين تم الشراء منهم</h4>
                    <span className="text-[11px] font-bold text-slate-400">انقر على رقم الفاتورة للانتقال المباشر</span>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 text-[11px] font-black text-slate-400 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3.5">التاريخ</th>
                          <th className="px-4 py-3.5">المورد</th>
                          <th className="px-4 py-3.5">رقم الفاتورة</th>
                          <th className="px-4 py-3.5 text-center">الكمية</th>
                          <th className="px-4 py-3.5 text-center">السعر</th>
                          <th className="px-4 py-3.5 text-center">الإجمالي</th>
                          <th className="px-4 py-3.5">الدفعة / الصلاحية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-600">
                        {data.suppliers.map((s, idx) => (
                          <tr key={`sup-${s.invoiceId}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 text-slate-400">{s.date ? new Date(s.date).toLocaleDateString() : '---'}</td>
                            <td className="px-4 py-3 font-black text-[#1E4D4D]">{s.supplierName}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => onNavigateToInvoice?.(s.invoiceId, 'PURCHASE')}
                                className="font-mono text-emerald-600 hover:text-emerald-800 underline flex items-center gap-1 font-black cursor-pointer"
                                title="الانتقال إلى فاتورة المشتريات الأصلية"
                              >
                                {s.invoiceId}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center font-black text-emerald-700">{s.qty}</td>
                            <td className="px-4 py-3 text-center">{s.price.toLocaleString()} {currency}</td>
                            <td className="px-4 py-3 text-center font-black">{s.total.toLocaleString()} {currency}</td>
                            <td className="px-4 py-3 text-[11px] text-slate-400">
                              {s.batchNumber || '---'} {s.expiryDate ? `(${s.expiryDate})` : ''}
                            </td>
                          </tr>
                        ))}
                        {data.suppliers.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-12 text-center text-slate-300 italic">
                              لا توجد سجلات توريد مسجلة لهذا الصنف
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {activeTab === 'customers' && (
                <motion.div 
                  key="customers"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-[#1E4D4D]">قائمة العملاء الذين تم البيع لهم</h4>
                    <span className="text-[11px] font-bold text-slate-400">انقر على رقم الفاتورة للانتقال المباشر</span>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 text-[11px] font-black text-slate-400 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3.5">التاريخ</th>
                          <th className="px-4 py-3.5">العميل</th>
                          <th className="px-4 py-3.5">رقم الفاتورة</th>
                          <th className="px-4 py-3.5 text-center">الكمية</th>
                          <th className="px-4 py-3.5 text-center">السعر</th>
                          <th className="px-4 py-3.5 text-center">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-600">
                        {data.customers.map((c, idx) => (
                          <tr key={`cust-${c.invoiceId}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 text-slate-400">{c.date ? new Date(c.date).toLocaleDateString() : '---'}</td>
                            <td className="px-4 py-3 font-black text-[#1E4D4D]">{c.customerName}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => onNavigateToInvoice?.(c.invoiceId, 'SALE')}
                                className="font-mono text-blue-600 hover:text-blue-800 underline flex items-center gap-1 font-black cursor-pointer"
                                title="الانتقال إلى فاتورة المبيعات الأصلية"
                              >
                                {c.invoiceId}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center font-black text-blue-700">{c.qty}</td>
                            <td className="px-4 py-3 text-center">{c.price.toLocaleString()} {currency}</td>
                            <td className="px-4 py-3 text-center font-black">{c.total.toLocaleString()} {currency}</td>
                          </tr>
                        ))}
                        {data.customers.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-slate-300 italic">
                              لا توجد سجلات مبيعات مسجلة لهذا الصنف
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {activeTab === 'movements' && (
                <motion.div 
                  key="movements"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-[#1E4D4D]">سجل حركات المخزون المتسلسل (Stock Ledger Audit)</h4>
                    <span className="text-[11px] font-bold text-slate-400">مرتب بالأحدث</span>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-right">
                      <thead className="bg-slate-50 text-[11px] font-black text-slate-400 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3.5">التاريخ</th>
                          <th className="px-4 py-3.5">نوع الحركة</th>
                          <th className="px-4 py-3.5">المستند / الطرف</th>
                          <th className="px-4 py-3.5 text-center">التغيير</th>
                          <th className="px-4 py-3.5 text-center">الرصيد بعدها</th>
                          <th className="px-4 py-3.5">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-600">
                        {data.movements.map((m) => {
                          const isPositive = m.quantityChange > 0;
                          const isPur = m.type === 'PURCHASE' || m.type === 'SALE_RETURN';
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 text-slate-400">{m.date ? new Date(m.date).toLocaleDateString() : '---'}</td>
                              <td className="px-4 py-3">
                                <Badge 
                                  variant={isPur ? 'success' : m.type === 'SALE' ? 'warning' : 'info'}
                                  className="!rounded-full px-2.5 py-0.5 text-[9px] font-black"
                                >
                                  {m.type === 'PURCHASE' ? 'توريد شراء' : 
                                   m.type === 'SALE' ? 'مبيعات' : 
                                   m.type === 'PURCHASE_RETURN' ? 'مرتجع مشتريات' : 
                                   m.type === 'SALE_RETURN' ? 'مرتجع مبيعات' : 'تسوية'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                {m.documentId ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const invType = (m.type === 'PURCHASE' || m.type === 'PURCHASE_RETURN') ? 'PURCHASE' : 'SALE';
                                      onNavigateToInvoice?.(m.documentId, invType);
                                    }}
                                    className="font-mono text-emerald-600 hover:text-emerald-800 underline font-black block"
                                  >
                                    {m.documentId}
                                  </button>
                                ) : null}
                                <span className="text-[10px] text-slate-400 font-normal">{m.partyName}</span>
                              </td>
                              <td className={`px-4 py-3 text-center font-black ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isPositive ? `+${m.quantityChange}` : m.quantityChange}
                              </td>
                              <td className="px-4 py-3 text-center font-black text-slate-700">
                                {m.balanceAfter !== undefined ? m.balanceAfter : '---'}
                              </td>
                              <td className="px-4 py-3 text-[11px] text-slate-400 truncate max-w-[150px]">
                                {m.notes || '---'}
                              </td>
                            </tr>
                          );
                        })}
                        {data.movements.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-slate-300 italic">
                              لا توجد حركات مخزنية مسجلة
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {activeTab === 'batches' && (
                <motion.div 
                  key="batches"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-[#1E4D4D]">الدفعات النشطة وتواريخ الصلاحية</h4>
                    <span className="text-[11px] font-bold text-slate-400">تتبع الصلاحية والاستنزاف المعتمد</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.batches.map((b, idx) => (
                      <div key={`batch-${idx}`} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#1E4D4D]">{b.batchNumber}</span>
                            <Badge variant="info" className="text-[9px] px-2 py-0.5">نشطة</Badge>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            الصلاحية: <span className="font-bold text-slate-600">{b.expiryDate || 'غير محدد'}</span>
                          </p>
                        </div>
                        <div className="text-left">
                          <span className="text-lg font-black text-emerald-700">{b.remainingQty}</span>
                          <span className="text-[10px] text-slate-400 block">الكمية المتبقية</span>
                        </div>
                      </div>
                    ))}
                    {data.batches.length === 0 && (
                      <div className="col-span-2 p-12 text-center text-slate-300 italic bg-white rounded-2xl border border-slate-100">
                        لا توجد دفعات نشطة محددة
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ProductDrillDownModal;
