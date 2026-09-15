import { db } from '@/core/db';
import { normalizeToISODate, getExpiryStatus } from '@/utils/expiryUtils';

export type ReconciliationStatus = 'MATCHED' | 'WARNING' | 'DISCREPANCY';

export type DiscrepancyType = 
  | 'BOOK_VS_STOCK' 
  | 'LAYERS_VS_STOCK' 
  | 'NEGATIVE_STOCK' 
  | 'ORPHAN_DOCUMENT' 
  | 'UNLINKED_RETURN' 
  | 'EXPIRED_ACTIVE_LAYER';

export interface ReconciliationDiscrepancy {
  id: string;
  type: DiscrepancyType;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  expected: number;
  actual: number;
  difference: number;
  source: 'InvoicesLedger' | 'InventoryLayers' | 'ProductsTable' | 'StockMovements';
  reason: string;
  documentId?: string;
}

export interface ProductReconciliationAudit {
  productId: string;
  productName: string;
  categoryName: string;
  tenantId?: string;
  branchId?: string;
  
  // Document level aggregates
  purchasedQty: number;
  purchaseReturnsQty: number;
  netPurchasedQty: number;
  
  soldQty: number;
  salesReturnsQty: number;
  netSoldQty: number;
  
  adjustmentsQty: number;
  
  // Balances
  bookBalance: number; // (Purchased - PurchaseReturns) - (Sold - SalesReturns) + Adjustments
  layersSum: number;   // Sum of remaining_qty in inventory_layers
  currentStockQuantity: number; // Stored in products table
  
  // Evaluation
  status: ReconciliationStatus;
  isMatched: boolean;
  isFullyMatched: boolean;
  discrepancies: ReconciliationDiscrepancy[];
  
  // Layer details
  activeLayersCount: number;
  expiredLayersCount: number;
  
  lastAuditedAt: string;
}

export interface SystemInventoryAuditOptions {
  tenantId?: string;
  branchId?: string;
  category?: string;
  search?: string;
  discrepanciesOnly?: boolean;
  minDiscrepancy?: number;
}

export type AuditFilterCriteria = SystemInventoryAuditOptions;

export interface SystemInventoryAuditReport {
  timestamp: string;
  totalProductsAudited: number;
  totalAudited: number;
  matchedCount: number;
  warningCount: number;
  discrepancyCount: number;
  totalBookQuantity: number;
  totalPhysicalStock: number;
  totalLayersStock: number;
  totalVarianceQty: number;
  totalVarianceValue: number;
  productAudits: ProductReconciliationAudit[];
  overallStatus: ReconciliationStatus;
}

export type SystemReconciliationSummary = SystemInventoryAuditReport;

export class InventoryReconciliationService {
  /**
   * Performs a strict, read-only audit of a single product's inventory integrity.
   * Compares authoritative invoice ledger documents, physical product stock, and FIFO layers.
   * STRICTLY READ-ONLY: Never alters database records.
   */
  static async auditProduct(
    productId: string, 
    options?: { tenantId?: string; branchId?: string }
  ): Promise<ProductReconciliationAudit> {
    if (!productId) {
      throw new Error('Product ID is required for reconciliation audit');
    }

    // 1. Fetch Product Master Data
    const product = await db.products.get(productId);
    const productName = product?.name || product?.Name || 'صنف غير معروف';
    const categoryName = product?.categoryName || (product as any)?.category || 'عام';
    const currentStock = Number(product?.stock ?? product?.StockQuantity ?? 0);

    // 2. Fetch Multi-source records in parallel
    const [allInvoices, legacySales, legacyPurchases, inventoryLayers, inventoryTransactions] = await Promise.all([
      db.invoices.toArray().catch(() => []),
      db.sales.toArray().catch(() => []),
      db.purchases.toArray().catch(() => []),
      db.inventory_layers.toArray().catch(() => []),
      db.inventoryTransactions.toArray().catch(() => [])
    ]);

    // 3. Map & Dedup Invoices
    const invoiceMap = new Map<string, any>();
    allInvoices.forEach((inv: any) => {
      if (inv && inv.id) {
        if (options?.tenantId && inv.tenantId && inv.tenantId !== options.tenantId) return;
        if (options?.branchId && inv.branchId && inv.branchId !== options.branchId) return;
        invoiceMap.set(inv.id, inv);
      }
    });

    legacyPurchases.forEach((p: any) => {
      const id = p.id || p.invoiceId || p.purchase_id;
      if (id && !invoiceMap.has(id)) {
        if (options?.tenantId && p.tenantId && p.tenantId !== options.tenantId) return;
        if (options?.branchId && p.branchId && p.branchId !== options.branchId) return;
        invoiceMap.set(id, { ...p, type: 'PURCHASE' });
      }
    });

    legacySales.forEach((s: any) => {
      const id = s.id || s.SaleID || s.invoice_number;
      if (id && !invoiceMap.has(id)) {
        if (options?.tenantId && s.tenantId && s.tenantId !== options.tenantId) return;
        if (options?.branchId && s.branchId && s.branchId !== options.branchId) return;
        invoiceMap.set(id, { ...s, type: 'SALE' });
      }
    });

    let purchasedQty = 0;
    let purchaseReturnsQty = 0;
    let soldQty = 0;
    let salesReturnsQty = 0;
    const discrepancies: ReconciliationDiscrepancy[] = [];

    // 4. Calculate Ledger Quantities from Invoices
    for (const inv of invoiceMap.values()) {
      const status = inv.documentStatus || inv.invoiceStatus || inv.InvoiceStatus || inv.status || 'POSTED';
      
      // Strict rule: Exclude VOID, CANCELLED, and unposted DRAFT documents from inventory book calculation
      if (status === 'VOID' || status === 'CANCELLED' || status === 'DRAFT') {
        continue;
      }

      const items = inv.items || [];
      if (!Array.isArray(items)) continue;

      const isPurchase = inv.type === 'PURCHASE' || inv.entityType === 'PURCHASE';
      const isSale = inv.type === 'SALE' || inv.entityType === 'SALE';
      const isReturn = Boolean(inv.isReturn) || inv.invoiceType === 'مرتجع' || inv.type === 'PURCHASE_RETURN' || inv.type === 'SALE_RETURN';

      for (const it of items) {
        const itProdId = it.product_id || it.productId || it.ProductID;
        const itName = it.name || it.productName || (it as any).Name || '';

        const isMatched = itProdId === productId || 
          (!itProdId && itName && itName.trim().toLowerCase() === productName.trim().toLowerCase());

        if (!isMatched) continue;

        const qty = Math.abs(Number(it.qty ?? it.quantity ?? 0));

        if (isPurchase) {
          if (isReturn) {
            purchaseReturnsQty += qty;
          } else {
            purchasedQty += qty;
          }
        } else if (isSale) {
          if (isReturn) {
            salesReturnsQty += qty;
          } else {
            soldQty += qty;
          }
        }
      }
    }

    // 5. Calculate Adjustments from inventoryTransactions
    let adjustmentsQty = 0;
    const productTransactions = inventoryTransactions.filter((tx: any) => {
      const txProdId = tx.productId || tx.product_id || tx.itemId || tx.item_id;
      if (options?.tenantId && tx.tenantId && tx.tenantId !== options.tenantId) return false;
      if (options?.branchId && tx.branchId && tx.branchId !== options.branchId) return false;
      return txProdId === productId;
    });

    for (const tx of productTransactions) {
      const type = tx.TransactionType || tx.type || '';
      if (type === 'ADJUSTMENT' || type === 'TRANSFER' || type === 'INVENTORY_COUNT' || type === 'DAMAGE') {
        const change = Number(tx.QuantityChange ?? tx.quantityChange ?? tx.change_quantity ?? tx.changeQty ?? tx.change ?? tx.quantity ?? 0);
        adjustmentsQty += change;
      }
    }

    // Net Calculations
    const netPurchasedQty = purchasedQty - purchaseReturnsQty;
    const netSoldQty = soldQty - salesReturnsQty;
    const bookBalance = netPurchasedQty - netSoldQty + adjustmentsQty;

    // 6. Calculate Layers from inventory_layers
    const productLayers = inventoryLayers.filter((l: any) => {
      const lProdId = l.product_id || l.productId || l.item_id;
      if (options?.tenantId && l.tenant_id && l.tenant_id !== options.tenantId) return false;
      return lProdId === productId;
    });

    let layersSum = 0;
    let activeLayersCount = 0;
    let expiredLayersCount = 0;

    for (const layer of productLayers) {
      const remaining = Number(layer.remaining_qty ?? layer.remainingQty ?? layer.quantity_remaining ?? 0);
      if (remaining > 0) {
        layersSum += remaining;
        activeLayersCount++;

        const expiry = layer.expiry_date || layer.expiryDate;
        if (expiry && getExpiryStatus(expiry).isExpired) {
          expiredLayersCount++;
          discrepancies.push({
            id: `DISC-EXP-${layer.id || Math.random()}`,
            type: 'EXPIRED_ACTIVE_LAYER',
            severity: 'WARNING',
            expected: 0,
            actual: remaining,
            difference: remaining,
            source: 'InventoryLayers',
            reason: `طبقة مخزنية نشطة تحتوي على رصيد (${remaining}) ولكن تاريخ صلاحيتها منتهي (${normalizeToISODate(expiry)})`
          });
        }
      }
    }

    // 7. Discrepancy Diagnostics & Evaluations
    // Check Negative Stock
    if (currentStock < 0) {
      discrepancies.push({
        id: `DISC-NEG-${productId}`,
        type: 'NEGATIVE_STOCK',
        severity: 'CRITICAL',
        expected: 0,
        actual: currentStock,
        difference: currentStock,
        source: 'ProductsTable',
        reason: `رصيد الصنف بالسالب (${currentStock}) في بطاقة الصنف`
      });
    }

    // Check Book vs Master Stock
    const bookDiff = bookBalance - currentStock;
    if (Math.abs(bookDiff) > 0.0001) {
      discrepancies.push({
        id: `DISC-BOOK-${productId}`,
        type: 'BOOK_VS_STOCK',
        severity: 'CRITICAL',
        expected: bookBalance,
        actual: currentStock,
        difference: bookDiff,
        source: 'InvoicesLedger',
        reason: `اختلاف بين الرصيد الدفتري المحسوب من الفواتير (${bookBalance}) والرصيد الفعلي المسجل (${currentStock}) بفارق (${bookDiff})`
      });
    }

    // Check Layers vs Master Stock
    if (productLayers.length > 0) {
      const layerDiff = layersSum - currentStock;
      if (Math.abs(layerDiff) > 0.0001) {
        discrepancies.push({
          id: `DISC-LAYER-${productId}`,
          type: 'LAYERS_VS_STOCK',
          severity: Math.abs(layerDiff) > 0 ? 'CRITICAL' : 'WARNING',
          expected: currentStock,
          actual: layersSum,
          difference: layerDiff,
          source: 'InventoryLayers',
          reason: `مجموع طبقات الدفعات النشطة (${layersSum}) لا يطابق الرصيد الفعلي المسجل (${currentStock}) بفارق (${layerDiff})`
        });
      }
    }

    // Determine Status
    let status: ReconciliationStatus = 'MATCHED';
    const hasCritical = discrepancies.some(d => d.severity === 'CRITICAL');
    const hasWarning = discrepancies.some(d => d.severity === 'WARNING');

    if (hasCritical) {
      status = 'DISCREPANCY';
    } else if (hasWarning || (productLayers.length === 0 && currentStock > 0)) {
      status = 'WARNING';
    } else {
      status = 'MATCHED';
    }

    return {
      productId,
      productName,
      categoryName,
      tenantId: options?.tenantId,
      branchId: options?.branchId,
      purchasedQty,
      purchaseReturnsQty,
      netPurchasedQty,
      soldQty,
      salesReturnsQty,
      netSoldQty,
      adjustmentsQty,
      bookBalance,
      layersSum,
      currentStockQuantity: currentStock,
      status,
      isMatched: status === 'MATCHED',
      isFullyMatched: status === 'MATCHED',
      discrepancies,
      activeLayersCount,
      expiredLayersCount,
      lastAuditedAt: new Date().toISOString()
    };
  }

  /**
   * Audits all products in the database and produces a system-wide reconciliation report.
   * STRICTLY READ-ONLY.
   */
  static async auditAllProducts(options?: SystemInventoryAuditOptions): Promise<SystemInventoryAuditReport> {
    const allProducts = await db.products.toArray().catch(() => []);
    
    // Optional filtering
    let products = allProducts;
    if (options?.category) {
      products = products.filter(p => p.Category === options.category || (p as any).category === options.category);
    }
    if (options?.search) {
      const q = options.search.trim().toLowerCase();
      products = products.filter(p => (p.Name && p.Name.toLowerCase().includes(q)) || (p.id && p.id.toLowerCase().includes(q)));
    }

    const productAudits: ProductReconciliationAudit[] = [];

    let matchedCount = 0;
    let warningCount = 0;
    let discrepancyCount = 0;
    let totalBookQuantity = 0;
    let totalPhysicalStock = 0;
    let totalLayersStock = 0;
    let totalVarianceQty = 0;
    let totalVarianceValue = 0;

    for (const prod of products) {
      if (!prod.id) continue;
      const audit = await this.auditProduct(prod.id, options);

      // Check discrepanciesOnly filter
      if (options?.discrepanciesOnly && audit.status === 'MATCHED') {
        continue;
      }

      // Check minDiscrepancy filter
      const maxDiff = Math.max(
        Math.abs(audit.bookBalance - audit.currentStockQuantity),
        Math.abs(audit.layersSum - audit.currentStockQuantity)
      );
      if (options?.minDiscrepancy && maxDiff < options.minDiscrepancy) {
        continue;
      }

      productAudits.push(audit);

      totalBookQuantity += audit.bookBalance;
      totalPhysicalStock += audit.currentStockQuantity;
      totalLayersStock += audit.layersSum;

      const diff = Math.abs(audit.bookBalance - audit.currentStockQuantity);
      if (diff > 0.0001) {
        totalVarianceQty += diff;
        const costPrice = Number(prod.CostPrice ?? prod.Price ?? 0);
        totalVarianceValue += diff * costPrice;
      }

      if (audit.status === 'MATCHED') matchedCount++;
      else if (audit.status === 'WARNING') warningCount++;
      else discrepancyCount++;
    }

    let overallStatus: ReconciliationStatus = 'MATCHED';
    if (discrepancyCount > 0) overallStatus = 'DISCREPANCY';
    else if (warningCount > 0) overallStatus = 'WARNING';

    return {
      timestamp: new Date().toISOString(),
      totalProductsAudited: productAudits.length,
      totalAudited: productAudits.length,
      matchedCount,
      warningCount,
      discrepancyCount,
      totalBookQuantity,
      totalPhysicalStock,
      totalLayersStock,
      totalVarianceQty,
      totalVarianceValue,
      productAudits,
      overallStatus
    };
  }
}
