// server/modules/consolidation/calculators/inventory-valuation.calculator.ts
// Deterministic Physical and Batch Inventory Valuation (FIFO Costing, Zero Random Multipliers)

import { FinancialMath } from "../financial-math";
import { ConsolidatedInventoryValuation } from "../consolidation.types";

export interface BatchItem {
  id: string;
  productId: string;
  branchId: string;
  batchNumber: string;
  initialQuantity: number;
  remainingQuantity: number;
  costPrice?: any;
  salePrice?: any;
  expiryDate?: Date | string | null;
  createdAt: Date | string;
}

export interface ProductItem {
  id: string;
  sku?: string | null;
  name: string;
  cost?: any;
  price?: any;
  stockQuantity?: number;
}

export interface InventoryLevelItem {
  productId: string;
  branchId: string;
  stockQuantity: number;
}

export class InventoryValuationCalculator {
  public static calculate(
    inventoryLevels: InventoryLevelItem[],
    products: ProductItem[],
    batches: BatchItem[],
    branches: Array<{ id: string; name: string }>,
    recentSaleInvoices: any[] = []
  ): ConsolidatedInventoryValuation {
    const branchMap = new Map(branches.map(b => [b.id, b]));
    const productMap = new Map(products.map(p => [p.id, p]));

    // Build FIFO Batch Queues per (productId, branchId)
    // Sorted by createdAt ascending (FIFO)
    const fifoBatchMap = new Map<string, BatchItem[]>();
    for (const b of batches) {
      const remaining = FinancialMath.safeNum(b.remainingQuantity);
      if (remaining <= 0) continue;

      const key = `${b.productId}:${b.branchId}`;
      if (!fifoBatchMap.has(key)) {
        fifoBatchMap.set(key, []);
      }
      fifoBatchMap.get(key)!.push(b);
    }

    // Sort batches FIFO by createdAt
    for (const batchList of fifoBatchMap.values()) {
      batchList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    const branchBreakdown: ConsolidatedInventoryValuation["branchBreakdown"] = {};
    for (const b of branches) {
      branchBreakdown[b.id] = {
        branchName: b.name,
        quantity: 0,
        value: 0,
        percentageOfTotal: 0,
      };
    }

    let totalQuantity = 0;
    let totalValue = 0;

    // Evaluate inventory value strictly using FIFO batch cost, or product baseline cost
    for (const level of inventoryLevels) {
      const qty = Math.max(0, FinancialMath.safeNum(level.stockQuantity));
      if (qty <= 0) continue;

      const p = productMap.get(level.productId);
      const baselineCost = p ? Math.max(0, FinancialMath.safeNum(p.cost)) : 0;

      // Match against FIFO batches
      const key = `${level.productId}:${level.branchId}`;
      const availableBatches = fifoBatchMap.get(key) || [];

      let allocatedQty = 0;
      let lineValue = 0;

      for (const batch of availableBatches) {
        if (allocatedQty >= qty) break;
        const bRemaining = Math.max(0, FinancialMath.safeNum(batch.remainingQuantity));
        const needed = qty - allocatedQty;
        const take = Math.min(needed, bRemaining);

        const bCost = batch.costPrice !== null && batch.costPrice !== undefined
          ? Math.max(0, FinancialMath.safeNum(batch.costPrice))
          : baselineCost;

        lineValue = FinancialMath.add(lineValue, FinancialMath.mul(take, bCost));
        allocatedQty += take;
      }

      // If physical stock exceeds batch quantities, value remainder at product catalog cost (strictly 0 if missing)
      if (allocatedQty < qty) {
        const unbatchedQty = qty - allocatedQty;
        lineValue = FinancialMath.add(lineValue, FinancialMath.mul(unbatchedQty, baselineCost));
      }

      totalQuantity += qty;
      totalValue = FinancialMath.add(totalValue, lineValue);

      const bId = level.branchId;
      if (!branchBreakdown[bId]) {
        branchBreakdown[bId] = {
          branchName: branchMap.get(bId)?.name || "External Branch",
          quantity: 0,
          value: 0,
          percentageOfTotal: 0,
        };
      }

      branchBreakdown[bId].quantity += qty;
      branchBreakdown[bId].value = FinancialMath.add(branchBreakdown[bId].value, lineValue);
    }

    // Calculate percentage shares per branch
    for (const bId of Object.keys(branchBreakdown)) {
      const br = branchBreakdown[bId];
      if (br && totalValue > 0) {
        br.percentageOfTotal = FinancialMath.round(
          FinancialMath.mul(FinancialMath.div(br.value, totalValue), 100),
          2
        );
      }
    }

    // Analyze Product Velocity (Sales in past 90 days from actual sales items)
    const productSalesMap = new Map<string, { qty: number; revenue: number; lastSaleDate: Date | null }>();
    for (const inv of recentSaleInvoices) {
      const invDate = inv.date ? new Date(inv.date) : null;
      for (const item of inv.items || []) {
        const pId = item.productId;
        const current = productSalesMap.get(pId) || { qty: 0, revenue: 0, lastSaleDate: null };
        const itemQty = FinancialMath.safeNum(item.qty || item.quantity);
        const itemRev = FinancialMath.safeNum(item.total || FinancialMath.mul(itemQty, item.unitPrice || 0));

        current.qty += itemQty;
        current.revenue = FinancialMath.add(current.revenue, itemRev);
        if (invDate && (!current.lastSaleDate || invDate > current.lastSaleDate)) {
          current.lastSaleDate = invDate;
        }
        productSalesMap.set(pId, current);
      }
    }

    const fastMovingProducts: ConsolidatedInventoryValuation["fastMovingProducts"] = [];
    const slowMovingProducts: ConsolidatedInventoryValuation["slowMovingProducts"] = [];
    const now = new Date();

    for (const p of products) {
      const stock = Math.max(0, FinancialMath.safeNum(p.stockQuantity));
      const cost = Math.max(0, FinancialMath.safeNum(p.cost));
      const value = FinancialMath.mul(stock, cost);
      const sales = productSalesMap.get(p.id);

      if (sales && sales.qty > 0) {
        const turnoverRate = stock > 0
          ? FinancialMath.round(FinancialMath.div(sales.qty, stock), 2)
          : sales.qty;

        fastMovingProducts.push({
          id: p.id,
          sku: p.sku || "N/A",
          name: p.name,
          salesVolume: sales.qty,
          revenueGenerated: sales.revenue,
          stockQuantity: stock,
          turnoverRate,
        });
      } else if (stock > 0) {
        const daysSinceLastSale = sales?.lastSaleDate
          ? Math.max(0, Math.floor((now.getTime() - sales.lastSaleDate.getTime()) / (1000 * 60 * 60 * 24)))
          : 90;

        slowMovingProducts.push({
          id: p.id,
          sku: p.sku || "N/A",
          name: p.name,
          stockQuantity: stock,
          cost,
          totalValue: value,
          daysSinceLastSale,
        });
      }
    }

    // Dead Stock Analysis (Batches expired or within 30 days of expiry)
    const deadStock: ConsolidatedInventoryValuation["deadStock"] = [];
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    for (const b of batches) {
      const remaining = FinancialMath.safeNum(b.remainingQuantity);
      if (remaining <= 0) continue;

      const p = productMap.get(b.productId);
      const pCost = p ? FinancialMath.safeNum(p.cost) : 0;
      const bCost = b.costPrice !== null && b.costPrice !== undefined
        ? FinancialMath.safeNum(b.costPrice)
        : pCost;

      const totalVal = FinancialMath.mul(remaining, bCost);
      const expDate = b.expiryDate ? new Date(b.expiryDate) : null;
      const expIso = expDate ? expDate.toISOString() : null;

      if (expDate && expDate < now) {
        deadStock.push({
          id: b.id,
          sku: p?.sku || b.batchNumber,
          name: p?.name || `Batch ${b.batchNumber}`,
          stockQuantity: remaining,
          cost: bCost,
          totalValue: totalVal,
          expiryDate: expIso,
          status: "EXPIRED",
        });
      } else if (expDate && expDate <= thirtyDaysAhead) {
        deadStock.push({
          id: b.id,
          sku: p?.sku || b.batchNumber,
          name: p?.name || `Batch ${b.batchNumber}`,
          stockQuantity: remaining,
          cost: bCost,
          totalValue: totalVal,
          expiryDate: expIso,
          status: "EXPIRING_SOON",
        });
      }
    }

    // If no expired batches, check slow moving with zero sales
    if (deadStock.length === 0) {
      for (const s of slowMovingProducts) {
        deadStock.push({
          id: s.id,
          sku: s.sku,
          name: s.name,
          stockQuantity: s.stockQuantity,
          cost: s.cost,
          totalValue: s.totalValue,
          expiryDate: null,
          status: "NO_SALES",
        });
      }
    }

    fastMovingProducts.sort((a, b) => b.salesVolume - a.salesVolume);
    slowMovingProducts.sort((a, b) => b.totalValue - a.totalValue);
    deadStock.sort((a, b) => b.totalValue - a.totalValue);

    const averageItemCost = products.length > 0
      ? FinancialMath.round(
          FinancialMath.div(
            products.reduce((acc, p) => acc + FinancialMath.safeNum(p.cost), 0),
            products.length
          ),
          2
        )
      : 0;

    return {
      timestamp: new Date().toISOString(),
      totalInventoryQuantity: totalQuantity,
      totalInventoryValue: totalValue,
      averageItemCost,
      uniqueSKUsCount: products.length,
      branchBreakdown,
      slowMovingProducts: slowMovingProducts.slice(0, 10),
      fastMovingProducts: fastMovingProducts.slice(0, 10),
      deadStock: deadStock.slice(0, 10),
    };
  }
}
