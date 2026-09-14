// src/domain/branch.domain.ts
import { DomainEntity } from "./base.types";

/**
 * Enterprise Multi-Branch Entity
 */
export interface Branch extends DomainEntity {
  id: string;
  code?: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  location?: string;
  isMain?: boolean;
  isActive?: boolean;
  managerName?: string;
  taxNumber?: string;
  
  // Compatibility fields
  is_main?: boolean;
  is_active?: boolean;
  created_at?: string;
}

