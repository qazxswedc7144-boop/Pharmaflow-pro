// server/modules/sync/sync-conflict.service.ts
// Deterministic Conflict Detection Engine for Phase 8.3 Enterprise Synchronization

import { SyncConflictCategory, SyncMutation } from "./sync.types";

export interface ConflictRecord {
  id: string;
  tenantId: string;
  branchId?: string | null;
  mutationId: string;
  category: SyncConflictCategory;
  entity?: string;
  entityType?: string;
  entityId: string;
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
   * Evaluates if a mutation conflicts with existing server-side state across the 10 categories
   */
  static evaluateConflict(params: {
    mutation: SyncMutation;
    existingServerRecord: Record<string, any> | null;
    tenantId: string;
    branchId?: string | null;
    currentStock?: number;
    requiredStock?: number;
    isPeriodClosed?: boolean;
  }): {
    hasConflict: boolean;
    category?: SyncConflictCategory;
    message?: string;
    resolutionStrategy?: "SERVER_WINS" | "CLIENT_WINS" | "MANUAL_MERGE" | "RETRY_WITH_NEW_VERSION";
  } {
    const { mutation, existingServerRecord, currentStock, requiredStock, isPeriodClosed } = params;

    // 1. TENANT_CONFLICT: Record belongs to a different tenant
    if (existingServerRecord && existingServerRecord.tenantId && existingServerRecord.tenantId !== params.tenantId) {
      return {
        hasConflict: true,
        category: "TENANT_CONFLICT",
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
        message: "انتهاك عزل الفروع: هذا السجل مقيد بفرع آخر ولا يسمح بتعديله من هذا الجهاز.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 3. DELETED_RECORD_CONFLICT: Updating or modifying a deleted/archived record
    if (existingServerRecord && (existingServerRecord.isDeleted || existingServerRecord.documentStatus === "ARCHIVED")) {
      return {
        hasConflict: true,
        category: "DELETED_RECORD_CONFLICT",
        message: "محاولة تعديل سجل محذوف أو مؤرشف مسبقاً في الخادم السحابي.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    // 4. ACCOUNTING_CONFLICT: Trying to post or adjust records in a closed fiscal period or posted invoice
    if (isPeriodClosed) {
      return {
        hasConflict: true,
        category: "ACCOUNTING_CONFLICT",
        message: "تعارض محاسبي: الفترة المالية مغلقة ومقفلة ضد أي تعديلات جديدة.",
        resolutionStrategy: "SERVER_WINS"
      };
    }

    if (existingServerRecord && existingServerRecord.documentStatus === "POSTED" && mutation.operation === "UPDATE") {
      // Conservative handling for posted financial invoices
      if (["INVOICE", "JOURNAL_ENTRY", "PAYMENT"].includes(mutation.entity)) {
        return {
          hasConflict: true,
          category: "ACCOUNTING_CONFLICT",
          message: "تعارض مالي: القيد/الفاتورة مرحلة ومثبتة دفترية في الخادم، يتطلب التعديل إجراء إشعار تسوية محاسبي.",
          resolutionStrategy: "MANUAL_MERGE"
        };
      }
    }

    // 5. STOCK_CONFLICT: Insufficient stock on server for sale/transfer
    if (
      requiredStock !== undefined &&
      currentStock !== undefined &&
      currentStock < requiredStock &&
      ["INVENTORY_MOVEMENT", "SALE_DISPENSE", "STOCK_OUT"].includes(mutation.operation)
    ) {
      return {
        hasConflict: true,
        category: "STOCK_CONFLICT",
        message: `تعارض رصيد المخزون: الرصيد الفعلي في الخادم (${currentStock}) غير كافٍ لتنفيذ العملية المخصصة (${requiredStock}).`,
        resolutionStrategy: "MANUAL_MERGE"
      };
    }

    // 6. VERSION_CONFLICT: Server has a higher version number than client mutation
    if (existingServerRecord && mutation.version !== undefined && existingServerRecord.version !== undefined) {
      if (existingServerRecord.version > mutation.version) {
        return {
          hasConflict: true,
          category: "VERSION_CONFLICT",
          message: `تعارض إصدار السجل: الخادم يحمل الإصدار (${existingServerRecord.version}) بينما الجهاز يحمل (${mutation.version}).`,
          resolutionStrategy: "RETRY_WITH_NEW_VERSION"
        };
      }
    }

    // 7. SAME_RECORD_CONFLICT: Concurrent conflicting updates with conflicting timestamps
    if (existingServerRecord && existingServerRecord.updatedAt && mutation.payload?.updatedAt) {
      const serverTime = new Date(existingServerRecord.updatedAt).getTime();
      const clientTime = new Date(mutation.payload.updatedAt).getTime();
      if (serverTime > clientTime + 1000) { // 1s drift tolerance
        return {
          hasConflict: true,
          category: "SAME_RECORD_CONFLICT",
          message: "تم تحديث السجل على الخادم بواسطة طرف آخر بتوقيت أحدث.",
          resolutionStrategy: "SERVER_WINS"
        };
      }
    }

    return { hasConflict: false };
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
    resolutionStrategy?: string;
    originalSnapshot?: Record<string, any>;
    incomingSnapshot?: Record<string, any>;
    clientRecord?: Record<string, any>;
    serverRecord?: Record<string, any> | null;
    conflictReason?: string;
    message?: string;
  }): ConflictRecord {
    const id = `CONF-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const conflict: ConflictRecord = {
      id,
      tenantId: record.tenantId,
      branchId: record.branchId,
      entityType: record.entityType || record.entity || "GENERIC",
      entity: record.entity || record.entityType || "GENERIC",
      entityId: record.entityId,
      mutationId: record.mutationId,
      category: record.category,
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
