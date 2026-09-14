// src/domain/inventory.domain.ts
import { DomainEntity } from "./base.types";
import { StockMovementType, InventoryAdjustmentReason } from "./enums.types";

/**
 * Product Master Domain Entity
 */
export interface Product extends DomainEntity {
  id: string;
  sku?: string;
  barcode?: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  supplierId?: string;
  supplierName?: string;
  defaultUnit?: string;
  costPrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  minStockLevel?: number;
  isTaxable?: boolean;
  taxRate?: number;
  isActive?: boolean;
  branchId?: string;
  avgCost?: number;
  totalValue?: number;
  profitMargin?: number;
  expiryDate?: string;
  usageCount?: number;

  // Compatibility fields for legacy Casing / Properties
  DefaultUnit?: string;
  LastPurchasePrice?: number;
  TaxDefault?: number;
  price?: number;
  Price?: number;
  UnitPrice?: number;
  CostPrice?: number;
  stock?: number;
  MinLevel?: number;
  ExpiryDate?: string;
  ProfitMargin?: number;
  Is_Active?: boolean;
  minStock?: number;
  lastUpdated?: number;
  Name?: string;
  StockQuantity?: number;
  stock_qty?: number;
  expiry_date?: string;
  is_taxable?: boolean;
  Tax_Default?: number;
  is_active?: boolean;
  created_at?: string;
  cost?: number;
  unit?: string;
  Stock_Quantity?: number;
}

/**
 * Product Batch Domain Entity
 */
export interface ProductBatch extends DomainEntity {
  id: string;
  batchId: string;
  productId: string;
  warehouseId?: string;
  expiryDate: string;
  quantity: number;
  unitCost?: number;
  lastUpdated?: string;

  // Compatibility fields
  BatchID?: string;
  ExpiryDate?: string;
  Quantity?: number;
}

export type MedicineBatch = ProductBatch;

/**
 * Stock Movement Domain Entity
 */
export interface StockMovement extends DomainEntity {
  id: string;
  productId?: string;
  warehouseId?: string;
  movementType?: StockMovementType;
  quantityBefore?: number;
  quantityChange?: number;
  quantityAfter?: number;
  unitCost?: number;
  totalCost?: number;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  branchId?: string;

  // Compatibility fields
  item_id?: string;
  type?: 'purchase' | 'sale' | 'return' | 'adjustment' | string;
  quantity_before?: number;
  quantity_change?: number;
  quantity_after?: number;
  unit_cost?: number;
  total_cost?: number;
  reference_id?: string;
  created_at?: string;
  TransactionID?: string;
  SourceDocumentType?: string;
  SourceDocumentID?: string;
  QuantityChange?: number;
  before_qty?: number;
  after_qty?: number;
  TransactionType?: StockMovementType | string;
  TransactionDate?: string;
  UserID?: string;
}

/**
 * Inventory Adjustment Item
 */
export interface InventoryAdjustmentItem {
  productId: string;
  batchId?: string;
  systemQuantity: number;
  actualQuantity: number;
  quantityDifference: number;
  unitCost: number;
  totalAdjustmentValue: number;
  notes?: string;
}

/**
 * Inventory Adjustment Domain Entity
 */
export interface InventoryAdjustment extends DomainEntity {
  id: string;
  adjustmentNumber: string;
  date: string;
  warehouseId?: string;
  reason: InventoryAdjustmentReason | string;
  items: InventoryAdjustmentItem[];
  totalValueChange: number;
  approvedBy?: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  notes?: string;
  branchId?: string;
}

/**
 * Warehouse Master Entity
 */
export interface Warehouse extends DomainEntity {
  id: string;
  code?: string;
  name: string;
  location?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

/**
 * Stock balance per Warehouse
 */
export interface WarehouseStock extends DomainEntity {
  id: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  lastUpdated: string;
}
