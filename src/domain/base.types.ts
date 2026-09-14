// src/domain/base.types.ts
/**
 * Shared Base Types & Infrastructure Entity Contracts
 * Standardizes ID strategies, timestamping, auditing, tenant isolation, and sync metadata.
 */

export interface BaseEntity {
  /** Canonical unique identifier (UUID v4 or standard string ID) */
  id: string;
}

export interface TimestampedEntity extends BaseEntity {
  /** ISO 8601 UTC creation date string or Date object */
  createdAt?: string | Date;
  /** ISO 8601 UTC last modification date string or Date object */
  updatedAt?: string | Date;
}

export interface AuditableEntity extends TimestampedEntity {
  /** User ID or Username of creator */
  createdBy?: string;
  /** User ID or Username of last modifier */
  updatedBy?: string;
  /** Multi-tenant identifier for enterprise multi-tenancy isolation */
  tenantId?: string;
}

export interface SoftDeleteEntity extends AuditableEntity {
  /** Logical deletion flag */
  isDeleted?: boolean;
  /** ISO 8601 UTC deletion timestamp */
  deletedAt?: string | Date;
  /** User ID or Username who deleted the record */
  deletedBy?: string;
}

export interface VersionedEntity extends SoftDeleteEntity {
  /** Optimistic concurrency version lock counter */
  version?: number;
}

export interface SyncableEntity extends VersionedEntity {
  /** Offline / Local DB synchronization status */
  syncStatus?: 'NEW' | 'UPDATED' | 'SYNCED' | 'CONFLICT' | 'PENDING';
  /** Sync engine version tracking */
  syncVersion?: number;
  /** ISO 8601 UTC timestamp of last cloud sync */
  lastSync?: string | Date;
  /** Boolean indicating if entity state matches remote cloud state */
  isSynced?: boolean;

  // Compatibility fields for legacy databases and snake_case or PascalCase conventions
  lastModified?: string;
  created_at?: string;
  updated_at?: string;
  Created_By?: string;
  Created_At?: string;
  tenant_id?: string;
}

export type DomainEntity = SyncableEntity;
