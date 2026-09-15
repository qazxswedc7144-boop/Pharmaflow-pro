import { db } from '@/core/db';
import { normalizeToISODate } from '@/utils/expiryUtils';
import { InventoryReconciliationService, ProductReconciliationAudit } from './InventoryReconciliationService';

export interface SupplierPurchaseRecord {
  invoiceId: string;
  supplierId: string;
  supplierName: string;
  date: string;
  qty: number;
  price: number;
  total: number;
  status: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface CustomerSaleRecord {
  invoiceId: string;
  customerId: string;
  customerName: string;
  date: string;
  qty: number;
  price: number;
  total: number;
  status: string;
}

export interface ProductMovementRecord {
  id: string;
  date: string;
  type: 'PURCHASE' | 'SALE' | 'PURCHASE_RETURN' | 'SALE_RETURN' | 'ADJUSTMENT' | 'TRANSFER';
  documentId: string;
  partyName: string;
  quantityChange: number;
  unitPrice?: number;
  balanceAfter?: number;
  notes?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface ProductTraceabilitySummary {
  productId: string;
  productName: string;
  categoryName: string;
  totalPurchasedQty: number;
  totalSoldQty: number;
  totalReturnedPurchaseQty: number;
  totalReturnedSaleQty: number;
  remainingStock: number;
  minLevel: number;
  lastPurchaseCost: number;
  averagePurchaseCost: number;
  lastSellingPrice: number;
  suppliers: SupplierPurchaseRecord[];
  customers: CustomerSaleRecord[];
  movements: ProductMovementRecord[];
  batches: Array<{
    batchNumber: string;
    expiryDate: string;
    remainingQty: number;
    costPrice?: number;
  }>;
  reconciliation: ProductReconciliationAudit;
}

export class ProductTraceabilityService {
  /**
   * Builds an authoritative, multi-source trace for a single product.
   * Leverages unified invoices, invoiceItems, stock movements, and inventory layers.
   */
  static async getProductTraceability(productId: string): Promise<ProductTraceabilitySummary> {
    if (!productId) {
      throw new Error("Product ID is required for traceability lookup");
    }

    // 1. Fetch Product master data
    const product = await db.products.get(productId);
    const productName = product?.name || product?.Name || 'صنف';
    const categoryName = product?.categoryName || (product as any)?.category || 'عام';
    const minLevel = product?.MinLevel ?? (product as any)?.minStockLevel ?? 5;
    const currentStock = product?.stock ?? product?.StockQuantity ?? 0;

    // 2. Fetch all purchases and sales involving this product from unified invoices & legacy tables
    const [allInvoices, legacySales, legacyPurchases, suppliers, customers, inventoryTransactions, inventoryLayers] = await Promise.all([
      db.invoices.toArray().catch(() => []),
      db.sales.toArray().catch(() => []),
      db.purchases.toArray().catch(() => []),
      db.suppliers.toArray().catch(() => []),
      db.customers.toArray().catch(() => []),
      db.inventoryTransactions.where('productId').equals(productId).toArray().catch(() => []),
      db.inventory_layers.where('product_id').equals(productId).toArray().catch(() => [])
    ]);

    const supplierMap = new Map<string, string>();
    suppliers.forEach((s: any) => {
      const sId = s.Supplier_ID || s.id;
      const sName = s.Supplier_Name || s.name || s.supplierName;
      if (sId && sName) supplierMap.set(String(sId), sName);
    });

    const customerMap = new Map<string, string>();
    customers.forEach((c: any) => {
      const cId = c.Customer_ID || c.id;
      const cName = c.Customer_Name || c.name || c.Supplier_Name;
      if (cId && cName) customerMap.set(String(cId), cName);
    });

    // Dedup invoices by ID
    const invoiceMap = new Map<string, any>();
    allInvoices.forEach((inv: any) => {
      if (inv && inv.id) invoiceMap.set(inv.id, inv);
    });
    legacyPurchases.forEach((p: any) => {
      const id = p.id || p.invoiceId || p.purchase_id;
      if (id && !invoiceMap.has(id)) {
        invoiceMap.set(id, { ...p, type: 'PURCHASE' });
      }
    });
    legacySales.forEach((s: any) => {
      const id = s.id || s.SaleID || s.invoice_number;
      if (id && !invoiceMap.has(id)) {
        invoiceMap.set(id, { ...s, type: 'SALE' });
      }
    });

    const supplierRecords: SupplierPurchaseRecord[] = [];
    const customerRecords: CustomerSaleRecord[] = [];
    const movements: ProductMovementRecord[] = [];

    let totalPurchased = 0;
    let totalSold = 0;
    let totalReturnedPurchase = 0;
    let totalReturnedSale = 0;
    let lastPurchaseCost = product?.LastPurchasePrice || product?.CostPrice || 0;
    let totalPurchaseCostSum = 0;
    let totalPurchaseCostQty = 0;
    let lastSellingPrice = product?.UnitPrice || product?.price || 0;
    let latestPurchaseDate = '';
    let latestSaleDate = '';

    // Iterate through all invoices to extract item-level movements
    for (const inv of invoiceMap.values()) {
      const items = inv.items || [];
      if (!Array.isArray(items)) continue;

      const isPurchase = inv.type === 'PURCHASE' || inv.entityType === 'PURCHASE';
      const isSale = inv.type === 'SALE' || inv.entityType === 'SALE';
      const isReturn = Boolean(inv.isReturn) || inv.invoiceType === 'مرتجع';
      const status = inv.documentStatus || inv.invoiceStatus || inv.InvoiceStatus || 'POSTED';
      const invDate = inv.date || inv.Date || inv.createdAt || '';
      const docId = inv.invoice_number || inv.invoiceNumber || inv.invoiceId || inv.SaleID || inv.id || '';

      // Skip voided / cancelled documents
      if (status === 'VOID' || status === 'CANCELLED') continue;

      for (const it of items) {
        const itProdId = it.product_id || it.productId || it.ProductID;
        const itName = it.name || it.productName || (it as any).Name || '';
        
        // Match either exact ID or exact normalized name if ID is missing
        const isMatched = itProdId === productId || 
          (!itProdId && itName && itName.trim().toLowerCase() === productName.trim().toLowerCase());

        if (!isMatched) continue;

        const qty = Number(it.qty ?? it.quantity ?? 0);
        const price = Number(it.price ?? it.unitPrice ?? it.costPrice ?? 0);
        const rawExpiry = it.expiryDate || it.ExpiryDate || (it as any).expirationDate || '';
        const expiry = normalizeToISODate(rawExpiry);
        const batchNum = it.batchNumber || it.batch_number || '';

        if (isPurchase) {
          const suppId = String(inv.partnerId || inv.supplierId || inv.Supplier_ID || 'مورد نقدي');
          const suppName = supplierMap.get(suppId) || inv.partnerName || inv.supplierName || 'مورد نقدي';

          if (isReturn) {
            totalReturnedPurchase += qty;
            movements.push({
              id: `MOV-PR-${inv.id}-${it.id || Math.random()}`,
              date: invDate,
              type: 'PURCHASE_RETURN',
              documentId: docId,
              partyName: suppName,
              quantityChange: -qty,
              unitPrice: price,
              notes: inv.notes || 'مرتجع مشتريات للمورد',
              batchNumber: batchNum,
              expiryDate: expiry
            });
          } else {
            totalPurchased += qty;
            totalPurchaseCostSum += (price * qty);
            totalPurchaseCostQty += qty;

            if (!latestPurchaseDate || new Date(invDate).getTime() >= new Date(latestPurchaseDate).getTime()) {
              latestPurchaseDate = invDate;
              if (price > 0) lastPurchaseCost = price;
            }

            supplierRecords.push({
              invoiceId: docId,
              supplierId: suppId,
              supplierName: suppName,
              date: invDate,
              qty,
              price,
              total: qty * price,
              status,
              batchNumber: batchNum,
              expiryDate: expiry
            });

            movements.push({
              id: `MOV-PUR-${inv.id}-${it.id || Math.random()}`,
              date: invDate,
              type: 'PURCHASE',
              documentId: docId,
              partyName: suppName,
              quantityChange: qty,
              unitPrice: price,
              notes: inv.notes || 'فاتورة توريد مشتريات',
              batchNumber: batchNum,
              expiryDate: expiry
            });
          }
        } else if (isSale) {
          const custId = String(inv.partnerId || inv.customerId || inv.Customer_ID || 'عميل نقدي');
          const custName = customerMap.get(custId) || inv.partnerName || inv.customerName || 'عميل نقدي';

          if (isReturn) {
            totalReturnedSale += qty;
            movements.push({
              id: `MOV-SR-${inv.id}-${it.id || Math.random()}`,
              date: invDate,
              type: 'SALE_RETURN',
              documentId: docId,
              partyName: custName,
              quantityChange: qty,
              unitPrice: price,
              notes: inv.notes || 'مرتجع مبيعات من العميل',
              batchNumber: batchNum,
              expiryDate: expiry
            });
          } else {
            totalSold += qty;

            if (!latestSaleDate || new Date(invDate).getTime() >= new Date(latestSaleDate).getTime()) {
              latestSaleDate = invDate;
              if (price > 0) lastSellingPrice = price;
            }

            customerRecords.push({
              invoiceId: docId,
              customerId: custId,
              customerName: custName,
              date: invDate,
              qty,
              price,
              total: qty * price,
              status
            });

            movements.push({
              id: `MOV-SALE-${inv.id}-${it.id || Math.random()}`,
              date: invDate,
              type: 'SALE',
              documentId: docId,
              partyName: custName,
              quantityChange: -qty,
              unitPrice: price,
              notes: inv.notes || 'فاتورة بيع كاشير',
              batchNumber: batchNum,
              expiryDate: expiry
            });
          }
        }
      }
    }

    // Add adjustments / manual inventory transactions if any exist in inventoryTransactions
    for (const tx of inventoryTransactions) {
      if (tx.TransactionType === 'ADJUSTMENT' || tx.type === 'ADJUSTMENT' || tx.type === 'TRANSFER') {
        const txDate = tx.TransactionDate || tx.date || tx.createdAt || '';
        const qtyChange = Number(tx.QuantityChange ?? tx.quantity ?? 0);
        movements.push({
          id: tx.TransactionID || tx.id || `TX-${Date.now()}`,
          date: txDate,
          type: (tx.TransactionType || tx.type || 'ADJUSTMENT') as any,
          documentId: tx.SourceDocumentID || tx.sourceDocId || tx.id || 'ADJ-MANUAL',
          partyName: 'المستودع الرئيسي',
          quantityChange: qtyChange,
          unitPrice: 0,
          notes: tx.Notes || tx.notes || 'تسوية مخزنية يدوية'
        });
      }
    }

    // Sort movements chronologically (newest first for UI inspection)
    movements.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    // Compute running balances backwards or forward
    let runningBalance = currentStock;
    for (let i = 0; i < movements.length; i++) {
      const mov = movements[i];
      if (mov) {
        mov.balanceAfter = runningBalance;
        // The balance before this movement was:
        runningBalance = runningBalance - mov.quantityChange;
      }
    }

    // Sort supplier & customer records by date desc
    supplierRecords.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    customerRecords.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    // Batches from inventory_layers & product
    const activeBatches: Array<{ batchNumber: string; expiryDate: string; remainingQty: number; costPrice?: number }> = [];
    inventoryLayers.forEach((l: any) => {
      const rem = Number(l.remaining_qty ?? l.remainingQty ?? 0);
      if (rem > 0) {
        activeBatches.push({
          batchNumber: l.batch_number || l.batchNumber || 'دفعة رئيسية',
          expiryDate: normalizeToISODate(l.expiry_date || l.expiryDate || ''),
          remainingQty: rem,
          costPrice: Number(l.unit_cost ?? l.unitCost ?? 0)
        });
      }
    });

    if (activeBatches.length === 0 && product?.ExpiryDate) {
      activeBatches.push({
        batchNumber: 'دفعة أساسية',
        expiryDate: normalizeToISODate(product.ExpiryDate),
        remainingQty: currentStock,
        costPrice: lastPurchaseCost
      });
    }

    const averagePurchaseCost = totalPurchaseCostQty > 0 ? (totalPurchaseCostSum / totalPurchaseCostQty) : lastPurchaseCost;

    // Run authoritative read-only reconciliation audit
    const reconciliation = await InventoryReconciliationService.auditProduct(productId);

    return {
      productId,
      productName,
      categoryName,
      totalPurchasedQty: totalPurchased,
      totalSoldQty: totalSold,
      totalReturnedPurchaseQty: totalReturnedPurchase,
      totalReturnedSaleQty: totalReturnedSale,
      remainingStock: currentStock,
      minLevel,
      lastPurchaseCost,
      averagePurchaseCost,
      lastSellingPrice,
      suppliers: supplierRecords,
      customers: customerRecords,
      movements,
      batches: activeBatches,
      reconciliation
    };
  }
}
