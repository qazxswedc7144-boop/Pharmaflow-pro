// src/domain/adapters.ts
/**
 * Compatibility Adapters & Domain Normalizers
 * Safely converts raw/legacy untyped database models into canonical domain entities.
 */

import { Product } from "./inventory.domain";
import { SalesInvoice, SalesInvoiceItem } from "./sales.domain";
import { Customer, Supplier } from "./partners.domain";
import { InvoiceStatus, PaymentStatus, PaymentMethod } from "./enums.types";

export class DomainAdapters {
  /**
   * Normalizes raw Product DB records into Canonical Product Model
   */
  static toProduct(raw: any): Product {
    if (!raw) throw new Error("Cannot adapt null or undefined product record");
    
    const id = raw.id || raw.productId || raw.Product_ID || String(Math.random());
    const name = raw.name || raw.Name || raw.product_name || "بدون اسم";
    const sellingPrice = Number(raw.sellingPrice ?? raw.price ?? raw.Price ?? raw.UnitPrice ?? 0);
    const costPrice = Number(raw.costPrice ?? raw.cost ?? raw.CostPrice ?? raw.LastPurchasePrice ?? raw.avgCost ?? 0);
    const stockQuantity = Number(raw.stockQuantity ?? raw.stock ?? raw.StockQuantity ?? raw.stock_qty ?? raw.Stock_Quantity ?? 0);

    return {
      id,
      name,
      sku: raw.sku || raw.SKU || "",
      barcode: raw.barcode || raw.Barcode || "",
      categoryId: raw.categoryId || raw.category_id || "",
      categoryName: raw.categoryName || raw.category_name || "",
      supplierId: raw.supplierId || raw.supplier_id || "",
      supplierName: raw.supplierName || raw.supplier_name || "",
      defaultUnit: raw.defaultUnit || raw.DefaultUnit || raw.unit || "قطعة",
      costPrice,
      sellingPrice,
      stockQuantity,
      minStockLevel: Number(raw.minStockLevel ?? raw.MinLevel ?? raw.minStock ?? 5),
      isTaxable: Boolean(raw.isTaxable ?? raw.is_taxable ?? true),
      taxRate: Number(raw.taxRate ?? raw.TaxDefault ?? raw.Tax_Default ?? 0),
      isActive: raw.isActive !== false && raw.Is_Active !== false && raw.is_active !== false,
      branchId: raw.branchId || raw.branch_id || "default",
      avgCost: costPrice,
      totalValue: stockQuantity * costPrice,
      createdAt: raw.createdAt || raw.created_at || raw.Created_At || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
      version: Number(raw.version ?? 1),

      // Retain compatibility keys
      DefaultUnit: raw.defaultUnit || raw.DefaultUnit || raw.unit || "قطعة",
      price: sellingPrice,
      Price: sellingPrice,
      UnitPrice: sellingPrice,
      CostPrice: costPrice,
      stock: stockQuantity,
      MinLevel: Number(raw.minStockLevel ?? raw.MinLevel ?? raw.minStock ?? 5),
      ProfitMargin: sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0,
      Is_Active: raw.isActive !== false && raw.Is_Active !== false,
      Name: name,
      StockQuantity: stockQuantity,
      stock_qty: stockQuantity,
      Stock_Quantity: stockQuantity,
    };
  }

  /**
   * Normalizes raw Sales Invoice DB records into Canonical SalesInvoice Model
   */
  static toSalesInvoice(raw: any): SalesInvoice {
    if (!raw) throw new Error("Cannot adapt null or undefined sales record");

    const id = raw.id || raw.SaleID || raw.invoiceId || String(Math.random());
    const invoiceNumber = raw.invoiceNumber || raw.SaleID || id;
    const date = raw.date || raw.created_at || raw.Created_At || new Date().toISOString();
    const customerId = raw.customerId || raw.customer_id || raw.partnerId || "GUEST";
    const customerName = raw.customerName || raw.partnerName || "عميل نقدي";

    const items: SalesInvoiceItem[] = Array.isArray(raw.items)
      ? raw.items.map((it: any, index: number) => ({
          id: it.id || `${id}_item_${index}`,
          invoiceId: id,
          productId: it.productId || it.product_id || "",
          productName: it.productName || it.name || "صنف",
          batchId: it.batchId || it.batch_id,
          rowOrder: Number(it.rowOrder ?? it.row_order ?? index + 1),
          quantity: Number(it.quantity ?? it.qty ?? 1),
          unitPrice: Number(it.unitPrice ?? it.price ?? 0),
          subtotal: Number(it.subtotal ?? it.sum ?? (Number(it.qty || 1) * Number(it.price || 0))),
          discountValue: Number(it.discountValue ?? it.discount_val ?? 0),
          taxValue: Number(it.taxValue ?? it.tax_val ?? 0),
          unit: it.unit || "قطعة",
          expiryDate: it.expiryDate,
          notes: it.notes,
          parent_id: id,
          product_id: it.productId || it.product_id || "",
          row_order: Number(it.rowOrder ?? it.row_order ?? index + 1),
          name: it.productName || it.name || "صنف",
          qty: Number(it.quantity ?? it.qty ?? 1),
          price: Number(it.unitPrice ?? it.price ?? 0),
          sum: Number(it.subtotal ?? it.sum ?? 0),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        }))
      : [];

    const grandTotal = Number(raw.grandTotal ?? raw.finalTotal ?? raw.totalAmount ?? 0);
    const paidAmount = Number(raw.paidAmount ?? 0);

    return {
      id,
      invoiceNumber,
      date,
      customerId,
      customerName,
      subtotal: Number(raw.subtotal ?? grandTotal),
      taxTotal: Number(raw.taxTotal ?? raw.tax ?? 0),
      discountTotal: Number(raw.discountTotal ?? 0),
      grandTotal,
      paidAmount,
      remainingAmount: Math.max(0, grandTotal - paidAmount),
      paymentMethod: raw.paymentMethod || raw.paymentStatus || PaymentMethod.CASH,
      financialStatus: raw.financialStatus || (paidAmount >= grandTotal ? PaymentStatus.PAID : paidAmount > 0 ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.UNPAID),
      invoiceStatus: raw.invoiceStatus || raw.documentStatus || raw.InvoiceStatus || InvoiceStatus.POSTED,
      items,
      isReturn: Boolean(raw.isReturn),
      notes: raw.notes || "",
      branchId: raw.branchId || "default",
      transactionUuid: raw.transactionUuid || id,
      createdAt: date,
      updatedAt: date,
      version: Number(raw.version ?? 1),

      // Compatibility fields
      SaleID: invoiceNumber,
      partnerId: customerId,
      partnerName: customerName,
      type: 'SALE',
      tax: Number(raw.taxTotal ?? raw.tax ?? 0),
      finalTotal: grandTotal,
      paymentStatus: raw.paymentStatus || 'Cash',
      documentStatus: raw.invoiceStatus || raw.documentStatus || InvoiceStatus.POSTED,
      InvoiceStatus: raw.invoiceStatus || raw.documentStatus || InvoiceStatus.POSTED,
    };
  }

  /**
   * Normalizes raw Customer / Supplier DB records into Customer / Supplier Domain Model
   */
  static toCustomer(raw: any): Customer {
    if (!raw) throw new Error("Cannot adapt null or undefined customer record");

    const id = raw.id || raw.Supplier_ID || raw.customerId || String(Math.random());
    const name = raw.name || raw.Supplier_Name || "عميل غير معروف";

    return {
      id,
      code: raw.code || raw.Supplier_ID || id,
      name,
      phone: raw.phone || raw.Phone || "",
      email: raw.email || "",
      address: raw.address || raw.Address || "",
      balance: Number(raw.balance ?? 0),
      creditLimit: Number(raw.creditLimit ?? 0),
      taxNumber: raw.taxNumber || raw.TaxNumber || "",
      isActive: raw.isActive !== false && raw.Is_Active !== false,
      type: 'CUSTOMER',
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
      version: 1,

      Supplier_ID: id,
      Supplier_Name: name,
      Phone: raw.phone || raw.Phone || "",
      Address: raw.address || raw.Address || "",
      Is_Active: raw.isActive !== false && raw.Is_Active !== false,
    };
  }

  static toSupplier(raw: any): Supplier {
    if (!raw) throw new Error("Cannot adapt null or undefined supplier record");

    const id = raw.id || raw.Supplier_ID || raw.supplierId || String(Math.random());
    const name = raw.name || raw.Supplier_Name || "مورد غير معروف";

    return {
      id,
      code: raw.code || raw.Supplier_ID || id,
      name,
      phone: raw.phone || raw.Phone || "",
      email: raw.email || "",
      address: raw.address || raw.Address || "",
      balance: Number(raw.balance ?? 0),
      openingBalance: Number(raw.openingBalance ?? 0),
      taxNumber: raw.taxNumber || raw.TaxNumber || "",
      isActive: raw.isActive !== false && raw.Is_Active !== false,
      type: 'SUPPLIER',
      purchaseHistory: raw.purchaseHistory || [],
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
      version: 1,

      Supplier_ID: id,
      Supplier_Name: name,
      Phone: raw.phone || raw.Phone || "",
      Address: raw.address || raw.Address || "",
      Is_Active: raw.isActive !== false && raw.Is_Active !== false,
    };
  }
}
