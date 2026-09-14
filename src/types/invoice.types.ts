// src/types/invoice.types.ts
import { 
  InvoiceStatus as DomainInvoiceStatus, 
  SalesInvoiceItem as DomainSalesInvoiceItem, 
  SalesInvoice as DomainSalesInvoice, 
  PurchaseInvoice as DomainPurchaseInvoice
} from "../domain";

export type InvoiceStatus = DomainInvoiceStatus;
export type InvoiceItem = DomainSalesInvoiceItem;

export type UnifiedInvoice = DomainSalesInvoice;
export type Sale = DomainSalesInvoice;
export type Purchase = DomainPurchaseInvoice;
