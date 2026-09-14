import React, { useEffect, useState } from 'react';
import { financialApiClient } from '@/shared/network/idempotency';
import { ConsolidatedInventoryValuation } from '../../consolidation.types';
import { Package, Truck, AlertTriangle } from 'lucide-react';

export const InventoryLogistics: React.FC = () => {
  const [data, setData] = useState<ConsolidatedInventoryValuation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    financialApiClient
      .get('/api/consolidation/inventory')
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch((err) => console.warn('Failed to load inventory valuation:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-bold animate-pulse">جاري تحميل لوجستيات وتقييم المخزون الموحد...</div>;
  }

  if (!data) {
    return <div className="p-4 text-xs text-slate-400 text-center">لا توجد بيانات لوجستيات مخزون متوفرة.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-3">
          <Package className="text-[#1E4D4D]" size={24} />
          <div>
            <p className="text-[11px] text-slate-400 font-bold">إجمالي قطع المخزون</p>
            <h4 className="text-lg font-mono font-black text-slate-800">{data.totalInventoryQuantity.toLocaleString()} قطعة</h4>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-3">
          <Truck className="text-[#1E4D4D]" size={24} />
          <div>
            <p className="text-[11px] text-slate-400 font-bold">قيمة التقييم المالي للمخزون</p>
            <h4 className="text-lg font-mono font-black text-[#1E4D4D]">${data.totalInventoryValue.toLocaleString()}</h4>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-3">
          <AlertTriangle className="text-amber-600" size={24} />
          <div>
            <p className="text-[11px] text-slate-400 font-bold">الأصناف بطيئة الحركة (Slow Moving)</p>
            <h4 className="text-lg font-mono font-black text-amber-700">{data.slowMovingProducts?.length || 0} صنف</h4>
          </div>
        </div>
      </div>

      {data.slowMovingProducts && data.slowMovingProducts.length > 0 && (
        <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
          <h4 className="text-xs font-black text-amber-900 mb-2">تنبيهات المخزون غير المتحرك للفروع</h4>
          <div className="space-y-2">
            {data.slowMovingProducts.map((prod) => (
              <div key={prod.id} className="flex justify-between items-center text-xs bg-white p-2.5 rounded-lg border border-amber-100">
                <span className="font-bold text-slate-800">{prod.name} ({prod.sku})</span>
                <span className="font-mono text-amber-800">الكمية: {prod.stockQuantity} | القيمة: ${prod.totalValue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
