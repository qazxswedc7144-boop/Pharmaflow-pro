// server/modules/sync/sync-conflict.service.ts
// Deterministic Conflict Detection Engine for Phase 8.3 Enterprise Synchronization

import { ConflictClassificationCategory, SyncConflictCategory, SyncMutation } from "./sync.types";

export interface ConflictRecord {
  id: string;
  tenantId: string;
  branchId?: string | null;
  mutationId: string;
  category: SyncConflictCategory;
  classification?: ConflictClassificationCategory;
  entity?: string;
  entityType?: string;
  entityId: string;
  deviceId?: string;
  conflictingDeviceId?: string;
  localVersion?: number;
  remoteVersion?: number;
  correlationId?: string;
  message?: string;
  conflictReason?: string;
  clientRecord?: Record<string, any>;
  serverRecord?: Record<string, any> | null;
  originalSnapshot?: Record<string, any>;
  incomingSnapshot?: Record<string, any>;
  detectedAt: string;
  status: "OPEN" | "RESOLVED" | "OVERRIDDEN" | "DISCARDED";
  resolutionStrategy?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export class SyncConflictService {
  private static conflicts: ConflictRecord[] = [];

  /**
   * Classifies an entity into one of the three architectural conflict categories
   */
  static classifyEntity(entity: string): ConflictClassificationCategory {
    const upper = (entity || "").toUpperCase();
    
    // Category C: Financial Transactions (Strict immutability)
    if (
      [
        "INVOICE",
        "SALE",
        "PAYMENT",
        "RECEIPT",
        "EXPENSE",
        "JOURNAL_ENTRY",
        "RETURN",
        "CREDIT_NOTE",
        "DEBIT_NOTE",
        "VOUCHER",
        "SETTLEMENT"
      ].includes(upper)
    ) {
      return "FINANCIAL_TRANSACTION";
    }

    // Category B: Inventory Movements & Batches (Strict quantity & FIFO integrity)
    if (
      [
        "INVENTORY_MOVEMENT",
        "STOCK_ADJUSTMENT",
        "INVENTORY_BATCH",
        "BRANCH_TRANSFER",
        "STOCK_TRANSFER",
        "TRANSFER",
        "DISPENSE"
      ].includes(upper)
    ) {
      return "INVENTORY_EVENT";
    }

    // Category A: Mutable Non-Financial Metadata (Optimistic merge / LWW allowed)
    return "METADATA_MUTABLE";
  }

  /**
   * Returns classification and default resolution strategy for an entity
   */
  static getEntityClassification(entity: string): {
    category: ConflictClassificationCategory;
    defaultStrategy: string;
  } {
    const category = this.classifyEntity(entity);
    const defaultStrategy =
      category === "METADATA_MUTABLE"
        ? "OPTIMISTIC_MERGE"
        : category === "INVENTORY_EVENT"
        ? "INVENTORY_RECONCILIATION"
        : "IMMUTABLE_QUARANTINE";
    return { category, defaultStrategy };
  }

  /**
   * Evaluates if a mutation conflicts with existing server-side state across the categories
   */
  static evaluateConflict(params: {
    mutation: SyncMutation;
    existingServerRecord: Record<string, any> | null;
    tenantId: string;
    branchId?: string | null;
    currentStock?: number;
    requiredStock?: number;
    isPeriodClosed?: boolean;
    conflictingDeviceId?: string;
  }): {
    hasConflict: boolean;
    category?: SyncConflictCategory;
    classification?: ConflictClassificationCategory;
    message?: string;
    resolutionStrategy?: "SERVER_WINS" | "CLIENT_WINS" | "MANUAL_MERGE" | "RETRY_WITH_NEW_VERSION" | "OPTIMISTIC_MERGE";
  } {
    const { mutation, existingServerRecord, currentStock, requiredStock, isPeriodClosed } = params;
    const classification = this.classifyEntity(mutation.entity);

    // 1. TENANT_CONFLICT: Record belongs to a different tenant
    if (existingServerRecord && existingServerRecord.tenantId && existingServerRecord.tenantId !== params.tenantId) {
      return {
        hasConflict: true,
        category: "TENANT_CONFLICT",
        classification,
        message: "انتهاك عزل المنشآت: محاولة تعديل سجل يتبع منشأة أخرى.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 2. BRANCH_CONFLICT: Record belongs to a different branch and cross-branch editing is disallowed
    if (
      existingServerRecord &&
      existingServerRecord.branchId &&
      params.branchId &&
      existingServerRecord.branchId !== params.branchId &&
      !["ADMIN", "PLATFORM_OWNER"].includes(mutation.payload?.userRole)
    ) {
      return {
        hasConflict: true,
        category: "BRANCH_CONFLICT",
        classification,
        message: "انتهاك عزل الفروع: هذا السجل مقيد بفرع آخر ولا يسمح بتعديله من هذا الجهاز.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 3. DELETED_RECORD_CONFLICT: Updating or modifying a deleted/archived record
    if (existingServerRecord && (existingServerRecord.isDeleted || existingServerRecord.documentStatus === "ARCHIVED")) {
      return {
        hasConflict: true,
        category: "DELETED_RECORD_CONFLICT",
        classification,
        message: "محاولة تعديل سجل محذوف أو مؤرشف مسبقاً في الخادم السحابي.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 4. Category C: IMMUTABLE FINANCIAL TRANSACTIONS
    // Financial transactions once posted/committed CANNOT be mutated directly
    if (classification === "FINANCIAL_TRANSACTION" && existingServerRecord) {
      const isCommitted =
        existingServerRecord.documentStatus === "POSTED" ||
        existingServerRecord.status === "COMPLETED" ||
        existingServerRecord.status === "PAID" ||
        mutation.operation === "UPDATE" ||
        mutation.operation === "DELETE";

      if (isCommitted && (mutation.operation === "UPDATE" || mutation.operation === "DELETE")) {
        return {
          hasConflict: true,
          category: "IMMUTABLE_FINANCIAL_CONFLICT",
          classification,
          message: "المعاملات المالية المعتمدة غير قابلة للتعديل أو الحذف المباشر؛ يتطلب التصحيح إصدار معاملة تعويضية (إشعار دائن/مدين أو قيد عكسي).",
          resolutionStrategy: "MANUAL_MERGE"
        };
      }
    }

    // 5. ACCOUNTING_CONFLICT: Trying to post or adjust records in a closed fiscal period or unbalanced
    if (isPeriodClosed) {
      return {
        hasConflict: true,
        category: "ACCOUNTING_CONFLICT",
        classification,
        message: "تعارض محاسبي: الفترة المالية مغلقة ومقفلة ضد أي تعديلات جديدة.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 6. Category B: STOCK_CONFLICT: Insufficient stock on server for sale/transfer
    if (
      requiredStock !== undefined &&
      currentStock !== undefined &&
      currentStock < requiredStock &&
      ["INVENTORY_MOVEMENT", "SALE_DISPENSE", "STOCK_OUT", "TRANSFER"].includes(mutation.operation)
    ) {
      return {
        hasConflict: true,
        category: "STOCK_CONFLICT",
        classification,
        message: `تعارض رصيد المخزون: الرصيد الفعلي في الخادم (${currentStock}) غير كافٍ لتنفيذ العملية المخصصة (${requiredStock}).`,
        resolutionStrategy: "MANUAL_MERGE"
      };
    }

    // 7. VERSION_CONFLICT: Server has a higher version number than client mutation
    if (existingServerRecord && mutation.version !== undefined && existingServerRecord.version !== undefined) {
      if (existingServerRecord.version > mutation.version) {
        return {
          hasConflict: true,
          category: "VERSION_CONFLICT",
          classification,
          message: `تعارض إصدار السجل: الخادم يحمل الإصدار (${existingServerRecord.version}) بينما الجهاز يحمل (${mutation.version}).`,
          resolutionStrategy: "RETRY_WITH_NEW_VERSION"
        };
      }
    }

    // 8. Category A: METADATA_MUTABLE Handling
    if (classification === "METADATA_MUTABLE" && existingServerRecord && existingServerRecord.updatedAt && mutation.payload?.updatedAt) {
      const serverTime = new Date(existingServerRecord.updatedAt).getTime();
      const clientTime = new Date(mutation.payload.updatedAt).getTime();
      if (serverTime > clientTime + 1000) {
        // Safe to merge fields or let latest writer win for metadata
        return {
          hasConflict: false,
          classification,
          resolutionStrategy: "OPTIMISTIC_MERGE"
        };
      }
    }

    // 9. SAME_RECORD_CONFLICT: Concurrent conflicting updates with conflicting timestamps
    if (existingServerRecord && existingServerRecord.updatedAt && mutation.payload?.updatedAt) {
      const serverTime = new Date(existingServerRecord.updatedAt).getTime();
      const clientTime = new Date(mutation.payload.updatedAt).getTime();
      if (serverTime > clientTime + 1000) {
        return {
          hasConflict: true,
          category: "SAME_RECORD_CONFLICT",
          classification,
          message: "تم تحديث السجل على الخادم بواسطة طرف آخر بتوقيت أحدث.",
          resolutionStrategy: "SERVER_WINS"
        };
      }
    }

    return { hasConflict: false, classification };
  }

  /**
   * Helper to detect conflicts directly from snapshots/versions
   */
  static detectConflict(params: {
    tenantId: string;
    branchId?: string | null;
    entityType: string;
    entityId: string;
    mutationId: string;
    incomingVersion?: number;
    serverRecord: Record<string, any> | null;
    incomingPayload: Record<string, any>;
    originalSnapshot?: Record<string, any>;
    incomingSnapshot?: Record<string, any>;
    conflictReason?: string;
  }): {
    hasConflict: boolean;
    category?: SyncConflictCategory;
    conflictReason?: string;
    resolutionStrategy?: string;
  } {
    const { serverRecord, incomingPayload, incomingVersion, entityType } = params;

    // Check deleted record conflict
    if (serverRecord && serverRecord.isDeleted) {
      return {
        hasConflict: true,
        category: "DELETED_RECORD_CONFLICT",
        conflictReason: "Target entity was deleted on server",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // Check version conflict
    if (serverRecord && serverRecord.version !== undefined && incomingVersion !== undefined) {
      if (serverRecord.version > incomingVersion) {
        return {
          hasConflict: true,
          category: "VERSION_CONFLICT",
          conflictReason: `Server has version ${serverRecord.version}, incoming is version ${incomingVersion}`,
          resolutionStrategy: "RETRY_WITH_NEW_VERSION"
        };
      }
    }

    // Check stock conflict
    if (entityType === "INVENTORY_BATCH" && serverRecord && incomingPayload.requestedReduction !== undefined) {
      const currentStock = serverRecord.stock_qty ?? 0;
      if (currentStock < incomingPayload.requestedReduction) {
        return {
          hasConflict: true,
          category: "STOCK_CONFLICT",
          conflictReason: `Current stock (${currentStock}) is less than requested reduction (${incomingPayload.requestedReduction})`,
          resolutionStrategy: "MANUAL_MERGE"
        };
      }
    }

    // Check accounting conflict
    if (entityType === "JOURNAL_ENTRY" && incomingPayload.lines && Array.isArray(incomingPayload.lines)) {
      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of incomingPayload.lines) {
        totalDebit += line.debit || 0;
        totalCredit += line.credit || 0;
      }
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        return {
          hasConflict: true,
          category: "ACCOUNTING_CONFLICT",
          conflictReason: `Unbalanced journal entry: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit})`,
          resolutionStrategy: "MANUAL_MERGE"
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Records a detected conflict for auditing and manual resolution workflow
   */
  static recordConflict(record: {
    tenantId: string;
    branchId?: string | null;
    entityType?: string;
    entity?: string;
    entityId: string;
    mutationId: string;
    category: SyncConflictCategory;
    classification?: ConflictClassificationCategory;
    deviceId?: string;
    conflictingDeviceId?: string;
    localVersion?: number;
    remoteVersion?: number;
    correlationId?: string;
    resolutionStrategy?: string;
    originalSnapshot?: Record<string, any>;
    incomingSnapshot?: Record<string, any>;
    clientRecord?: Record<string, any>;
    serverRecord?: Record<string, any> | null;
    conflictReason?: string;
    message?: string;
  }): ConflictRecord {
    const id = `CONF-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const entityType = record.entityType || record.entity || "GENERIC";
    const classification = record.classification || this.classifyEntity(entityType);

    const conflict: ConflictRecord = {
      id,
      tenantId: record.tenantId,
      branchId: record.branchId,
      entityType,
      entity: entityType,
      entityId: record.entityId,
      mutationId: record.mutationId,
      category: record.category,
      classification,
      deviceId: record.deviceId,
      conflictingDeviceId: record.conflictingDeviceId,
      localVersion: record.localVersion,
      remoteVersion: record.remoteVersion,
      correlationId: record.correlationId || `CORR-${Date.now()}`,
      resolutionStrategy: record.resolutionStrategy || "MANUAL_MERGE",
      originalSnapshot: record.originalSnapshot || record.serverRecord || {},
      incomingSnapshot: record.incomingSnapshot || record.clientRecord || {},
      clientRecord: record.clientRecord || record.incomingSnapshot || {},
      serverRecord: record.serverRecord || record.originalSnapshot || null,
      conflictReason: record.conflictReason || record.message || "Conflict detected",
      message: record.message || record.conflictReason || "Conflict detected",
      detectedAt: new Date().toISOString(),
      status: "OPEN"
    };

    this.conflicts.unshift(conflict);

    // Limit in-memory conflict size
    if (this.conflicts.length > 1000) {
      this.conflicts.pop();
    }

    return conflict;
  }

  /**
   * Field-level optimistic merge for Category A (Non-financial mutable metadata)
   */
  static mergeMetadata(
    original: Record<string, any>,
    incoming: Record<string, any>,
    protectedKeys: string[] = ["id", "tenantId", "branchId", "version", "createdAt"]
  ): Record<string, any> {
    const merged: Record<string, any> = { ...original };
    for (const [key, value] of Object.entries(incoming)) {
      if (!protectedKeys.includes(key) && value !== undefined && value !== null) {
        merged[key] = value;
      }
    }
    merged.updatedAt = new Date().toISOString();
    merged.version = (original.version || 1) + 1;
    return merged;
  }

  /**
   * Retrieves open conflicts for a tenant and branch
   */
  static getConflicts(tenantId: string, branchId?: string | null): ConflictRecord[] {
    return this.conflicts.filter((c) => {
      if (c.tenantId !== tenantId) return false;
      if (branchId && c.branchId && c.branchId !== branchId) return false;
      return true;
    });
  }

  /**
   * Resolves a conflict manually
   */
  static resolveConflict(
    conflictId: string,
    resolutionStrategy: string,
    resolvedBy: string
  ): ConflictRecord | null {
    const conflict = this.conflicts.find((c) => c.id === conflictId);
    if (conflict) {
      conflict.status = "RESOLVED";
      conflict.resolutionStrategy = resolutionStrategy;
      conflict.resolvedAt = new Date().toISOString();
      conflict.resolvedBy = resolvedBy;
      return conflict;
    }
    return null;
  }
}
