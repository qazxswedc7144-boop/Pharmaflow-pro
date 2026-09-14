// src/types/inventory.types.ts
import { 
  Product as DomainProduct, 
  ProductBatch as DomainProductBatch, 
  StockMovement as DomainStockMovement, 
  Warehouse as DomainWarehouse, 
  WarehouseStock as DomainWarehouseStock,
  StockMovementType
} from "../domain";
import { SyncableEntity } from "./common.types";

export type InventoryTransactionType = StockMovementType | 'SALE' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'INITIAL' | 'TRANSFER';

export type Product = DomainProduct;

export interface InventoryTransaction extends SyncableEntity {
  TransactionID: string;
  productId: string;
  warehouseId: string;
  SourceDocumentType: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'TRANSFER' | 'RETURN' | 'INITIAL' | 'MANUAL';
  SourceDocumentID: string;
  QuantityChange: number; 
  before_qty: number;
  after_qty: number;
  TransactionType: InventoryTransactionType;
  TransactionDate: string;
  UserID: string;
  branchId?: string;
  notes?: string;
}

export interface StockReservation extends SyncableEntity {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  sourceDocId: string;
  expiresAt: string;
}

export type StockMovement = DomainStockMovement;

export interface InventoryLayer extends SyncableEntity {
  id: string;
  item_id: string;
  quantity_remaining: number;
  unit_cost: number;
  created_at: string;
  reference_id: string; 
}

export interface FIFOConsumptionLog extends SyncableEntity {
  id: string;
  sale_id: string;
  item_id: string;
  layer_id: string;
  quantity_consumed: number;
  unit_cost: number;
  consumed_at: string;
}

export interface FIFOCostLayer extends SyncableEntity {
  id: string;
  productId: string;
  quantityRemaining: number;
  unitCost: number;
  purchaseDate: string;
  referenceId: string;
  isClosed: boolean;
}

export type MedicineBatch = DomainProductBatch;
export type Warehouse = DomainWarehouse;
export type WarehouseStock = DomainWarehouseStock;
