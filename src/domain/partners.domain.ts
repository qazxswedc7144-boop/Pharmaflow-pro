// src/domain/partners.domain.ts
import { DomainEntity } from "./base.types";


/**
 * Customer Domain Entity
 */
export interface Customer extends DomainEntity {
  id: string;
  code?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  balance?: number;
  creditLimit?: number;
  taxNumber?: string;
  isActive?: boolean;
  type?: 'CUSTOMER' | string;
  branchId?: string;

  // Compatibility fields
  Supplier_ID?: string;
  Supplier_Name?: string;
  Customer_ID?: string;
  Customer_Name?: string;
  Partner_ID?: string;
  Phone?: string;
  Address?: string;
  Is_Active?: boolean;
}

/**
 * Supplier Domain Entity
 */
export interface Supplier extends DomainEntity {
  id: string;
  code?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  balance?: number;
  openingBalance?: number;
  taxNumber?: string;
  isActive?: boolean;
  type?: 'SUPPLIER' | string;
  purchaseHistory?: Record<string, unknown>[];
  branchId?: string;

  // Compatibility fields
  Supplier_ID?: string;
  Supplier_Name?: string;
  Customer_ID?: string;
  Customer_Name?: string;
  Partner_ID?: string;
  Phone?: string;
  Address?: string;
  Is_Active?: boolean;
}

export type Partner = Customer | Supplier;
