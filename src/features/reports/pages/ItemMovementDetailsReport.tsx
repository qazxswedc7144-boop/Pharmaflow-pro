
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/core/db';
import { useInventory } from '@/contexts/AppContext';
import ReportPageLayout from '../components/ReportPageLayout';
import { Badge } from '@/components/shared/SharedUI';
import { ArrowLeftRight, ArrowUpRight, ArrowDownLeft, RotateCcw, BarChart3 } from 'lucide-react';
import { ExportService } from '@/services/data/exportService';
import { Sale, Purchase, UnifiedInvoice } from '@/types';
import { FixedSizeList as List } from 'react-window';

function mapInvoiceToSale(inv: UnifiedInvoice): Sale {
  return {
    ...inv,
    SaleID: inv.id,
    customerId: inv.partnerId,
    branchId: 'main',
    totalCost: inv.subtotal * 0.7, // COGS estimate
    InvoiceStatus: inv.documentStatus,
    paidAmount: inv.paidAmount,
    items: inv.items,
    finalTotal: inv.finalTotal,
    paymentStatus: inv.paymentStatus,
    Date: inv.date
  } as unknown as Sale;
}

function mapInvoiceToPurchase(inv: UnifiedInvoice): Purchase {
  return {
    ...inv,
    purchase_id: inv.id,
    supplierId: inv.partnerId,
    supplierName: inv.partnerName,
    invoiceStatus: inv.documentStatus,
    paidAmount: inv.paidAmount,
    totalAmount: inv.finalTotal,
    status: inv.financialStatus === 'Paid' ? 'PAID' : 'UNPAID',
    items: inv.items,
    finalTotal: inv.finalTotal
  } as unknown as Purchase;
}

const ItemMovementDetailsReport: React.FC<{ onNavigate?: (view: any) => void }> = ({ onNavigate }) => {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState({ from: "", to: "", productId: "" });
  const { products } = useInventory();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rawSales, rawPurchases] = await Promise.all([
          db.getSales(),
          db.getPurchases()
        ]);
        const sales = rawSales.map(mapInvoiceToSale);
        const purchases = rawPurchases.map(mapInvoiceToPurchase);

        const allMovements: any[] = [];

        // Map Sales
        sales.filter(s => s.InvoiceStatus === 'POSTED').forEach(sale => {
          sale.items.forEach(item => {
            const pId = item.product_id || item.id;
            const prod = products.find(p => p.id === pId);
            allMovements.push({
              productId: pId,
              date: sale.date || (sale as any).timestamp,
              type: (sale as any).isReturn ? 'مرتجع مبيعات' : 'بيع',
              typeName: (sale as any).isReturn ? 'RETURN_SALE' : 'SALE',
              itemName: item.name || prod?.Name || 'صنف غير معروف',
              qty: (sale as any).isReturn ? (item.qty || 0) : -(item.qty || 0),
              ref: sale.SaleID,
              unit: item.unit || prod?.DefaultUnit || 'قطعة'
            });
          });
        });

        // Map Purchases
        purchases.filter(p => p.invoiceStatus === 'POSTED').forEach(purchase => {
          purchase.items.forEach(item => {
            const pId = item.product_id || item.id;
            const prod = products.find(p => p.id === pId);
            const isReturn = (purchase as any).isReturn || (purchase as any).invoiceType === 'مرتجع';
            allMovements.push({
              productId: pId,
              date: purchase.date || (purchase as any).timestamp,
              type: isReturn ? 'مرتجع مشتريات' : 'شراء',
              typeName: isReturn ? 'RETURN_PURCHASE' : 'PURCHASE',
              itemName: item.name || prod?.Name || 'صنف غير معروف',
              qty: isReturn ? -(item.qty || 0) : (item.qty || 0),
              ref: purchase.invoiceId,
              unit: item.unit || prod?.DefaultUnit || 'قطعة'
            });
          });
        });

        // Sort by date to calculate running balance
        allMovements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate running balance per item
        const balances: Record<string, number> = {};
        const finalMovements = allMovements.map(m => {
          if (!balances[m.itemName]) balances[m.itemName] = 0;
          balances[m.itemName] += m.qty;
          return { ...m, balance: balances[m.itemName] };
        });

        setMovements(finalMovements.reverse());
      } catch (error) {
        console.error("Failed to fetch item movements:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [products]);

  const filteredData = useMemo(() => {
    return movements.filter(m => {
      const matchesSearch = m.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            m.ref.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFrom = !dateFilter.from || m.date >= dateFilter.from;
      const matchesTo = !dateFilter.to || m.date <= dateFilter.to;
      const matchesProduct = !dateFilter.productId || m.productId === dateFilter.productId;
      return matchesSearch && matchesFrom && matchesTo && matchesProduct;
    });
  }, [movements, searchTerm, dateFilter]);

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'SALE': return <ArrowUpRight size={14} className="text-red-500" />;
      case 'PURCHASE': return <ArrowDownLeft size={14} className="text-emerald-500" />;
      case 'RETURN_SALE': return <RotateCcw size={14} className="text-blue-500" />;
      case 'RETURN_PURCHASE': return <RotateCcw size={14} className="text-orange-500" />;
      default: return <ArrowLeftRight size={14} />;
    }
  };

  const getTypeBadge = (m: any) => {
    const variant = m.typeName === 'PURCHASE' ? 'success' : 
                    m.typeName === 'SALE' ? 'danger' : 
                    m.typeName === 'RETURN_SALE' ? 'info' : 'warning';
    return <Badge variant={variant as any}>{m.type}</Badge>;
  };

  const totals = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      if (curr.qty > 0) acc.in += curr.qty;
      else acc.out += Math.abs(curr.qty);
      return acc;
    }, { in: 0, out: 0 });
  }, [filteredData]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-[#1E4D4D] border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <ReportPageLayout
      title="حركة الأصناف التفصيلية"
      onBack={() => onNavigate?.('reports')}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      onFilterChange={(from, to, productId) => setDateFilter({ from, to, productId: productId || "" })}
      filterOptions={products.map(p => ({ label: p.Name || p.name || "", value: p.id || "" }))}
      filterLabel="تصفية حسب الصنف"
      summaryCards={[
        { label: "إجمالي الداخل", value: totals.in, icon: <ArrowDownLeft size={16} />, color: "bg-emerald-50 text-emerald-600" },
        { label: "إجمالي الخارج", value: totals.out, icon: <ArrowUpRight size={16} />, color: "bg-red-50 text-red-600" },
        { label: "صافي الحركة", value: totals.in - totals.out, icon: <ArrowLeftRight size={16} />, color: "bg-blue-50 text-blue-600" },
        { label: "عدد الحركات", value: filteredData.length, icon: <BarChart3 size={16} />, color: "bg-purple-50 text-purple-600" }
      ]}
      onExportExcel={() => ExportService.exportToCSV(filteredData, "ItemMovements")}
      onExportPDF={() => ExportService.exportToPDFFile(
        "حركة الأصناف التفصيلية",
        ["التاريخ", "الحركة", "الصنف", "الكمية", "الرصيد", "المرجع"],
        filteredData.map(d => [d.date, d.type, d.itemName, d.qty, d.balance, d.ref]),
        "ItemMovements"
      )}
      onPrint={() => window.print()}
    >
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="bg-[#F8FAFA] text-slate-400 font-black text-[10px] uppercase tracking-widest border-b border-slate-100 flex px-6 py-4">
          <div className="w-2/12 text-right">التاريخ</div>
          <div className="w-2/12 text-right">نوع الحركة</div>
          <div className="w-3/12 text-right">الصنف</div>
          <div className="w-2/12 text-center">الكمية</div>
          <div className="w-2/12 text-center">الرصيد بعد الحركة</div>
          <div className="w-1/12 text-right">المرجع</div>
        </div>

        {filteredData.length === 0 ? (
          <div className="px-6 py-20 text-center text-slate-300 font-black italic">
            لا توجد نتائج تطابق البحث أو الفلترة المختارة
          </div>
        ) : (
          <List
            height={Math.min(500, Math.max(200, filteredData.length * 60))}
            itemCount={filteredData.length}
            itemSize={60}
            width="100%"
            className="custom-scrollbar divide-y divide-slate-50"
          >
            {({ index, style }) => {
              const m = filteredData[index];
              if (!m) return null;

              return (
                <div
                  style={style}
                  key={index}
                  className="flex items-center text-right text-xs px-6 py-3 hover:bg-slate-50/80 transition-colors border-b border-slate-50"
                >
                  <div className="w-2/12 font-bold text-slate-500">
                    {new Date(m.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="w-2/12">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(m.typeName)}
                      {getTypeBadge(m)}
                    </div>
                  </div>
                  <div className="w-3/12 font-bold text-slate-700 truncate">
                    {m.itemName}
                  </div>
                  <div className={`w-2/12 text-center font-black ${m.qty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty} {m.unit}
                  </div>
                  <div className="w-2/12 text-center font-black text-[#1E4D4D]">
                    {m.balance} {m.unit}
                  </div>
                  <div className="w-1/12 text-slate-400 font-mono text-[10px] truncate">
                    {m.ref}
                  </div>
                </div>
              );
            }}
          </List>
        )}
      </div>
    </ReportPageLayout>
  );
};

export default ItemMovementDetailsReport;
