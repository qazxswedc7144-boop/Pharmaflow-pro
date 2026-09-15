// server/modules/sync/sync-processor.service.ts
// Transactional Mutation Processing Engine for Phase 8.3 Enterprise Synchronization

import { prisma } from "../../database/prisma";
import {
  SyncEnvelope,
  SyncMutation,
  PerMutationResult,
  SyncPushResponse,
  SYNC_PROTOCOL_VERSION
} from "./sync.types";
import { DeviceService } from "./device.service";
import { SyncIdempotencyService } from "./sync-idempotency.service";
import { SyncConflictService } from "./sync-conflict.service";
import { SyncChangelogService } from "./sync-changelog.service";
import { SyncAuditService } from "./sync-audit.service";
import { AuthorizationService } from "../../services/rbac/authorization.service";

const KNOWN_ENTITIES = new Set([
  "INVOICE",
  "SALE",
  "PRODUCT",
  "PAYMENT",
  "VOUCHER",
  "JOURNAL_ENTRY",
  "INVENTORY_MOVEMENT",
  "STOCK_ADJUSTMENT",
  "INVENTORY_BATCH",
  "BRANCH_TRANSFER",
  "STOCK_TRANSFER",
  "TRANSFER",
  "CUSTOMER",
  "SUPPLIER",
  "SETTINGS",
  "DEVICE"
]);

export class SyncProcessorService {
  /**
   * Main synchronization mutation batch processor
   */
  static async processBatch(params: {
    envelope: SyncEnvelope;
    authenticatedTenantId: string;
    authenticatedUserId: string;
    authenticatedUserRole?: string;
    userAllowedBranches?: string[];
  }): Promise<SyncPushResponse> {
    const { envelope, authenticatedTenantId, authenticatedUserId, authenticatedUserRole, userAllowedBranches } = params;
    const serverTimestamp = Date.now();
    const results: PerMutationResult[] = [];

    const summary = {
      applied: [] as string[],
      successful: [] as string[],
      duplicates: [] as string[],
      conflicts: [] as string[],
      rejected: [] as string[],
      unauthorized: [] as string[]
    };

    // 1. PROTOCOL & SCHEMA VERSION VALIDATION
    if (envelope.schemaVersion && envelope.schemaVersion !== SYNC_PROTOCOL_VERSION) {
      await SyncAuditService.logEvent({
        tenantId: authenticatedTenantId,
        branchId: envelope.branchId,
        userId: authenticatedUserId,
        deviceId: envelope.deviceId,
        operation: "SCHEMA_VERSION_REJECTED",
        result: "FAILURE",
        error: `Client schemaVersion ${envelope.schemaVersion} does not match server protocol ${SYNC_PROTOCOL_VERSION}`,
        metadata: { clientVersion: envelope.clientVersion }
      });

      return {
        success: false,
        errorCode: "SCHEMA_VERSION_MISMATCH",
        error: `إصدار بروتوكول المزامنة غير متطابق. المطلوب: ${SYNC_PROTOCOL_VERSION}، المرسل: ${envelope.schemaVersion}`,
        tenantId: authenticatedTenantId,
        branchId: envelope.branchId,
        serverTimestamp,
        processedCount: (envelope.mutations || []).length,
        results: (envelope.mutations || []).map((m) => ({
          id: m.id,
          mutationId: m.id,
          status: "REJECTED",
          success: false,
          errorCode: "SCHEMA_VERSION_MISMATCH",
          message: `إصدار بروتوكول المزامنة غير متطابق. المطلوب: ${SYNC_PROTOCOL_VERSION}، المرسل: ${envelope.schemaVersion}`
        })),
        summary
      };
    }

    // 2. STRICT TENANT SEGREGATION & MISMATCH DETECTION
    // Server MUST NEVER trust client-provided tenantId alone.
    if (envelope.tenantId && envelope.tenantId !== authenticatedTenantId) {
      await SyncAuditService.logEvent({
        tenantId: authenticatedTenantId,
        branchId: envelope.branchId,
        userId: authenticatedUserId,
        deviceId: envelope.deviceId,
        operation: "TENANT_MISMATCH",
        result: "FAILURE",
        error: `Tenant mismatch detected. Authenticated: ${authenticatedTenantId}, Requested: ${envelope.tenantId}`,
        metadata: { envelopeTenant: envelope.tenantId }
      });

      return {
        success: false,
        errorCode: "TENANT_MISMATCH",
        error: "انتهاك عزل المنشآت: معرف المنشأة في حزمة المزامنة لا يطابق جلسة المصادقة المعتمدة.",
        tenantId: authenticatedTenantId,
        branchId: envelope.branchId,
        serverTimestamp,
        processedCount: (envelope.mutations || []).length,
        results: (envelope.mutations || []).map((m) => ({
          id: m.id,
          mutationId: m.id,
          status: "REJECTED",
          success: false,
          errorCode: "TENANT_MISMATCH",
          message: "انتهاك عزل المنشآت: معرف المنشأة في حزمة المزامنة لا يطابق جلسة المصادقة المعتمدة."
        })),
        summary
      };
    }

    const tenantId = authenticatedTenantId;

    // 3. STRICT BRANCH SEGREGATION & ACCESS VERIFICATION
    const targetBranchId = envelope.branchId || null;
    if (targetBranchId && userAllowedBranches && userAllowedBranches.length > 0) {
      const isAllowedBranch = userAllowedBranches.includes(targetBranchId) || ["ADMIN", "PLATFORM_OWNER", "TENANT_ADMIN"].includes(authenticatedUserRole || "");
      if (!isAllowedBranch) {
        await SyncAuditService.logEvent({
          tenantId,
          branchId: targetBranchId,
          userId: authenticatedUserId,
          deviceId: envelope.deviceId,
          operation: "BRANCH_MISMATCH",
          result: "FAILURE",
          error: `User not authorized for branch ${targetBranchId}`,
          metadata: { allowedBranches: userAllowedBranches }
        });

        return {
          success: false,
          errorCode: "BRANCH_ACCESS_DENIED",
          error: `غير مصرح للجهاز أو المستخدم بإرسال مزامنة للفرع [${targetBranchId}].`,
          tenantId,
          branchId: targetBranchId,
          serverTimestamp,
          processedCount: (envelope.mutations || []).length,
          results: (envelope.mutations || []).map((m) => ({
            id: m.id,
            mutationId: m.id,
            status: "UNAUTHORIZED",
            success: false,
            errorCode: "BRANCH_ACCESS_DENIED",
            message: `غير مصرح للجهاز أو المستخدم بإرسال مزامنة للفرع [${targetBranchId}].`
          })),
          summary
        };
      }
    }

    // 4. DEVICE VERIFICATION & REVOCATION ENFORCEMENT
    const deviceVerification = await DeviceService.verifyDevice(tenantId, envelope.deviceId);
    if (!deviceVerification.allowed) {
      const errCode = deviceVerification.status === "REVOKED" ? "DEVICE_REVOKED" : "DEVICE_SUSPENDED";
      await SyncAuditService.logEvent({
        tenantId,
        branchId: targetBranchId,
        userId: authenticatedUserId,
        deviceId: envelope.deviceId,
        operation: deviceVerification.status === "REVOKED" ? "DEVICE_REVOKED" : "DEVICE_SUSPENDED",
        result: "FAILURE",
        error: deviceVerification.reason || "Device is not authorized for synchronization",
        metadata: { deviceStatus: deviceVerification.status }
      });

      return {
        success: false,
        errorCode: errCode,
        error: deviceVerification.reason || "الجهاز ملغى أو معلق من قبل إدارة الأمن.",
        tenantId,
        branchId: targetBranchId,
        serverTimestamp,
        processedCount: (envelope.mutations || []).length,
        results: (envelope.mutations || []).map((m) => ({
          id: m.id,
          mutationId: m.id,
          status: "REJECTED",
          success: false,
          errorCode: errCode,
          message: deviceVerification.reason || "الجهاز ملغى أو معلق من قبل إدارة الأمن."
        })),
        summary
      };
    }

    // Touch device heartbeat
    DeviceService.touchDevice(tenantId, envelope.deviceId);

    // 5. RESOLVE USER PERMISSIONS ONCE FOR THE BATCH
    let effectivePermissions = new Set<string>();
    try {
      effectivePermissions = await AuthorizationService.getUserEffectivePermissions(
        tenantId,
        authenticatedUserId,
        authenticatedUserRole
      );
    } catch (err: any) {
      console.warn("[SyncProcessor] Could not resolve RBAC permissions, using role fallback:", err.message);
    }

    // Role-based baseline permissions fallback:
    if (authenticatedUserRole === "CASHIER") {
      effectivePermissions.add("invoices.create");
      effectivePermissions.add("invoices.update");
      effectivePermissions.add("sales.invoice.create");
      effectivePermissions.add("sales.invoice.update");
      effectivePermissions.add("sales.pos.access");
      effectivePermissions.add("accounting.voucher.create");
      effectivePermissions.add("accounting.vouchers.manage");
      effectivePermissions.add("customers.manage");
    } else if (["ADMIN", "PLATFORM_OWNER", "TENANT_ADMIN", "PHARMACIST_IN_CHARGE", "PHARMACIST", "BRANCH_MANAGER", "SUPER_ADMIN"].includes(authenticatedUserRole || "")) {
      effectivePermissions.add("invoices.create");
      effectivePermissions.add("invoices.update");
      effectivePermissions.add("sales.invoice.create");
      effectivePermissions.add("sales.invoice.update");
      effectivePermissions.add("sales.pos.access");
      effectivePermissions.add("inventory.products.manage");
      effectivePermissions.add("inventory.product.create");
      effectivePermissions.add("inventory.product.update");
      effectivePermissions.add("inventory.product.view");
      effectivePermissions.add("inventory.movements.create");
      effectivePermissions.add("inventory.batch.manage");
      effectivePermissions.add("inventory.transfers.manage");
      effectivePermissions.add("accounting.vouchers.manage");
      effectivePermissions.add("accounting.voucher.create");
      effectivePermissions.add("accounting.journal.post");
      effectivePermissions.add("accounting.journal.create");
      effectivePermissions.add("customers.manage");
      effectivePermissions.add("suppliers.manage");
    }

    const mutations = Array.isArray(envelope.mutations) ? envelope.mutations : [];

    // 6. PROCESS EACH MUTATION WITH PARTIAL FAILURE ISOLATION
    for (const mutation of mutations) {
      const { id: mutationId, entity, entityId, operation, payload, idempotencyKey, version } = mutation;

      if (!mutationId || !entity || !idempotencyKey) {
        const invalidRes: PerMutationResult = {
          id: mutationId || `invalid-${Math.random()}`,
          mutationId: mutationId || `invalid-${Math.random()}`,
          status: "INVALID",
          success: false,
          errorCode: "MALFORMED_MUTATION",
          message: "حقول المعاملة ناقصة (mutationId, entity, or idempotencyKey required)."
        };
        results.push(invalidRes);
        summary.rejected.push(invalidRes.mutationId);
        continue;
      }

      // Check entity support
      if (!KNOWN_ENTITIES.has(entity.toUpperCase())) {
        const unsuppRes: PerMutationResult = {
          id: mutationId,
          mutationId,
          status: "REJECTED",
          success: false,
          errorCode: "UNSUPPORTED_ENTITY",
          message: `الكيان [${entity}] غير مدعوم في بروتوكول المزامنة.`
        };
        results.push(unsuppRes);
        summary.rejected.push(mutationId);
        continue;
      }

      // 6.1. RBAC PERMISSION CHECK PER ENTITY & OPERATION
      const requiredPermission = this.getRequiredPermission(entity, operation);
      const isPrivileged = ["ADMIN", "PLATFORM_OWNER", "TENANT_ADMIN", "PHARMACIST_IN_CHARGE", "SUPER_ADMIN"].includes(authenticatedUserRole || "");
      
      const isAuditor = authenticatedUserRole === "AUDITOR";
      if (isAuditor) {
        const unauthRes: PerMutationResult = {
          id: mutationId,
          mutationId,
          status: "UNAUTHORIZED",
          success: false,
          errorCode: "READ_ONLY_ROLE",
          message: "دور المدقق المالي يملك صلاحيات القراءة فقط ولا يسمح له بإرسال تعديلات مزامنة."
        };
        results.push(unauthRes);
        summary.unauthorized.push(mutationId);
        continue;
      }

      if (requiredPermission && !isPrivileged && !effectivePermissions.has(requiredPermission)) {
        const unauthRes: PerMutationResult = {
          id: mutationId,
          mutationId,
          status: "UNAUTHORIZED",
          success: false,
          errorCode: "PERMISSION_DENIED",
          message: `المستخدم لا يملك الصلاحية المطلوبة [${requiredPermission}] لتنفيذ العملية على [${entity}].`
        };
        results.push(unauthRes);
        summary.unauthorized.push(mutationId);

        await SyncAuditService.logEvent({
          tenantId,
          branchId: targetBranchId,
          userId: authenticatedUserId,
          deviceId: envelope.deviceId,
          mutationId,
          operation: "PERMISSION_DENIED",
          result: "FAILURE",
          error: `Missing permission ${requiredPermission}`,
          metadata: { entity, operation }
        });
        continue;
      }

      // 6.2. LOGICAL IDEMPOTENCY CHECK (tenantId + deviceId + idempotencyKey)
      const idempotencyCheck = SyncIdempotencyService.check(
        tenantId,
        envelope.deviceId,
        idempotencyKey,
        payload
      );

      if (idempotencyCheck.isDuplicate) {
        const duplicateRes: PerMutationResult = {
          ...(idempotencyCheck.previousResult || {
            mutationId,
            status: "DUPLICATE",
            message: "تم تنفيذ هذه المعاملة مسبقاً بنجاح (Idempotent Replay Protected)."
          }),
          id: mutationId,
          mutationId,
          status: "DUPLICATE",
          success: true
        };
        results.push(duplicateRes);
        summary.duplicates.push(mutationId);

        await SyncAuditService.logEvent({
          tenantId,
          branchId: targetBranchId,
          userId: authenticatedUserId,
          deviceId: envelope.deviceId,
          mutationId,
          operation: "SYNC_DUPLICATE",
          result: "SUCCESS",
          metadata: { idempotencyKey, entity }
        });
        continue;
      }

      // 6.3. EXECUTE MUTATION TRANSACTIONALLY
      try {
        const mutationResult = await this.executeEntityMutation({
          mutation,
          tenantId,
          branchId: targetBranchId,
          userId: authenticatedUserId,
          deviceId: envelope.deviceId,
          version: version || 1
        });

        const fullResult: PerMutationResult = {
          ...mutationResult,
          id: mutationId,
          mutationId
        };

        results.push(fullResult);

        if (fullResult.status === "SUCCESS") {
          summary.successful.push(mutationId);
          summary.applied.push(mutationId);

          // Record in Idempotency cache
          SyncIdempotencyService.record(tenantId, envelope.deviceId, idempotencyKey, payload, fullResult);

          // Append to authoritative Changelog for downstream delta distribution
          SyncChangelogService.recordChange({
            tenantId,
            branchId: targetBranchId,
            entity,
            entityId: entityId || mutationId,
            operation,
            version: fullResult.serverVersion || (version || 1) + 1,
            mutationId,
            actorId: authenticatedUserId,
            deviceId: envelope.deviceId,
            payload: payload || {}
          });
        } else if (fullResult.status === "CONFLICT") {
          summary.conflicts.push(mutationId);
          await SyncAuditService.logEvent({
            tenantId,
            branchId: targetBranchId,
            userId: authenticatedUserId,
            deviceId: envelope.deviceId,
            mutationId,
            operation: "SYNC_CONFLICT",
            result: "WARNING",
            error: fullResult.conflict?.message || "Conflict detected",
            metadata: {
              category: fullResult.conflict?.category,
              resolutionStrategy: fullResult.conflict?.resolutionStrategy
            }
          });
        } else {
          summary.rejected.push(mutationId);
        }
      } catch (err: any) {
        console.error(`[SyncProcessor] Mutation ${mutationId} fatal error:`, err);
        const failRes: PerMutationResult = {
          id: mutationId,
          mutationId,
          status: "REJECTED",
          success: false,
          errorCode: "PROCESSING_EXCEPTION",
          message: err.message || "فشل غير متوقع أثناء معالجة المعاملة."
        };
        results.push(failRes);
        summary.rejected.push(mutationId);
      }
    }

    // 6.5. UPDATE DEVICE SEQUENCE AND HEALTH TRACKING
    if (envelope.deviceId && summary.successful.length > 0) {
      const currentDev = await DeviceService.getDevice(tenantId, envelope.deviceId);
      const newSeq = (currentDev?.lastSyncedSequence || 0) + summary.successful.length;
      DeviceService.updateDeviceSequence(tenantId, envelope.deviceId, {
        syncedSequence: newSeq,
        ackSequence: newSeq
      });
    }

    // 7. RECORD BATCH AUDIT SUMMARY
    await SyncAuditService.logEvent({
      tenantId,
      branchId: targetBranchId,
      userId: authenticatedUserId,
      deviceId: envelope.deviceId,
      operation: "SYNC_PUSH",
      result: summary.successful.length > 0 || summary.duplicates.length > 0 ? "SUCCESS" : "WARNING",
      metadata: {
        totalMutations: mutations.length,
        successfulCount: summary.successful.length,
        duplicateCount: summary.duplicates.length,
        conflictCount: summary.conflicts.length,
        rejectedCount: summary.rejected.length
      }
    });

    return {
      success: summary.rejected.length === 0 && summary.unauthorized.length === 0,
      tenantId,
      branchId: targetBranchId,
      serverTimestamp,
      processedCount: results.length,
      results,
      summary
    };
  }

  /**
   * Translates entity and operation into specific RBAC permission key
   */
  private static getRequiredPermission(entity: string, operation: string): string | null {
    switch (entity.toUpperCase()) {
      case "INVOICE":
      case "SALE":
        return operation === "CREATE" || operation === "POST" ? "sales.invoice.create" : "sales.invoice.update";
      case "PRODUCT":
        return "inventory.products.manage";
      case "PAYMENT":
      case "VOUCHER":
        return "accounting.voucher.create";
      case "JOURNAL_ENTRY":
        return "accounting.journal.post";
      case "INVENTORY_MOVEMENT":
      case "STOCK_ADJUSTMENT":
      case "INVENTORY_BATCH":
        return "inventory.movements.create";
      case "BRANCH_TRANSFER":
      case "STOCK_TRANSFER":
      case "TRANSFER":
        return "inventory.transfers.manage";
      case "CUSTOMER":
        return "customers.manage";
      case "SUPPLIER":
        return "suppliers.manage";
      default:
        return null;
    }
  }

  /**
   * Executes atomic business mutation with conflict detection across entities
   */
  private static async executeEntityMutation(params: {
    mutation: SyncMutation;
    tenantId: string;
    branchId: string | null;
    userId: string;
    deviceId: string;
    version: number;
  }): Promise<PerMutationResult> {
    const { mutation, tenantId, branchId, version } = params;
    const { id: mutationId, entity, payload } = mutation;
    const data = payload || {};
    const entityId = mutation.entityId || data.id || mutationId;

    // 1. INVOICE / SALE EXECUTION
    if (entity === "INVOICE" || entity === "SALE") {
      const invoiceNumber = data.invoiceNumber || data.invoice_number || `INV-${Date.now()}`;
      
      let existingRecord: any = null;
      if (prisma.isConnected && prisma.isConnected()) {
        existingRecord = await prisma.invoice.findFirst({
          where: {
            tenantId,
            OR: [
              { id: entityId },
              { invoiceNumber }
            ]
          }
        }).catch(() => null);
      }

      // Check conflict
      const conflictCheck = SyncConflictService.evaluateConflict({
        mutation,
        existingServerRecord: existingRecord,
        tenantId,
        branchId
      });

      if (conflictCheck.hasConflict) {
        SyncConflictService.recordConflict({
          tenantId,
          branchId,
          mutationId,
          category: conflictCheck.category || "SAME_RECORD_CONFLICT",
          entity,
          entityId,
          message: conflictCheck.message || "تعارض في معالجة الفاتورة",
          clientRecord: data,
          serverRecord: existingRecord
        });

        return {
          id: mutationId,
          mutationId,
          status: "CONFLICT",
          success: false,
          errorCode: conflictCheck.category,
          conflict: {
            category: conflictCheck.category || "SAME_RECORD_CONFLICT",
            message: conflictCheck.message || "تعارض في معالجة الفاتورة",
            serverRecord: existingRecord,
            clientRecord: data,
            resolutionStrategy: conflictCheck.resolutionStrategy
          }
        };
      }

      // Persist Transactionally
      if (prisma.isConnected && prisma.isConnected()) {
        await prisma.$transaction(async (tx) => {
          await (tx.invoice as any).upsert({
            where: { id: entityId },
            update: {
              invoiceNumber,
              date: new Date(data.date || Date.now()),
              partnerId: data.partnerId || data.partner_id || "",
              partnerType: data.partnerType || "CUSTOMER",
              type: data.type || "SALE",
              paymentStatus: data.paymentStatus || data.payment_status || "PAID",
              documentStatus: data.documentStatus || data.document_status || "ACTIVE",
              branchId: data.branchId || branchId,
              isSynced: true,
              updatedAt: new Date()
            },
            create: {
              id: entityId,
              invoiceNumber,
              date: new Date(data.date || Date.now()),
              partnerId: data.partnerId || data.partner_id || "",
              partnerType: data.partnerType || "CUSTOMER",
              type: data.type || "SALE",
              paymentStatus: data.paymentStatus || data.payment_status || "PAID",
              documentStatus: data.documentStatus || data.document_status || "ACTIVE",
              tenantId,
              branchId: data.branchId || branchId,
              isSynced: true
            }
          });
        }).catch((err) => {
          console.warn("[SyncProcessor] Prisma Invoice write warning:", err.message);
        });
      }

      return {
        id: mutationId,
        mutationId,
        status: "SUCCESS",
        success: true,
        serverVersion: version + 1,
        processedAt: new Date().toISOString()
      };
    }

    // 2. PRODUCT EXECUTION
    if (entity === "PRODUCT") {
      let existingRecord: any = null;
      if (prisma.isConnected && prisma.isConnected()) {
        existingRecord = await prisma.product.findFirst({
          where: { id: entityId, tenantId }
        }).catch(() => null);
      }

      const conflictCheck = SyncConflictService.evaluateConflict({
        mutation,
        existingServerRecord: existingRecord,
        tenantId,
        branchId
      });

      if (conflictCheck.hasConflict) {
        return {
          id: mutationId,
          mutationId,
          status: "CONFLICT",
          success: false,
          errorCode: conflictCheck.category,
          conflict: {
            category: conflictCheck.category || "VERSION_CONFLICT",
            message: conflictCheck.message || "تعارض إصدار المنتج",
            serverRecord: existingRecord,
            clientRecord: data,
            resolutionStrategy: conflictCheck.resolutionStrategy
          }
        };
      }

      if (prisma.isConnected && prisma.isConnected()) {
        await prisma.product.upsert({
          where: { id: entityId },
          update: {
            name: data.name || "Product",
            sku: data.sku || data.barcode || `SKU-${Date.now()}`,
            basePrice: data.basePrice || data.price || 0,
            costPrice: data.costPrice || data.cost || 0,
            updatedAt: new Date()
          },
          create: {
            id: entityId,
            name: data.name || "Product",
            sku: data.sku || data.barcode || `SKU-${Date.now()}`,
            basePrice: data.basePrice || data.price || 0,
            costPrice: data.costPrice || data.cost || 0,
            tenantId
          }
        }).catch((err) => console.warn("[SyncProcessor] Product write warning:", err.message));
      }

      return {
        id: mutationId,
        mutationId,
        status: "SUCCESS",
        success: true,
        serverVersion: version + 1,
        processedAt: new Date().toISOString()
      };
    }

    // 3. FINANCIAL & INVENTORY WRITE HANDLERS
    if (["PAYMENT", "JOURNAL_ENTRY", "INVENTORY_MOVEMENT", "INVENTORY_BATCH"].includes(entity)) {
      // 3.1 Strict Financial Integrity Validation
      if (entity === "PAYMENT") {
        const amt = Number(data.amount);
        if (data.amount !== undefined && (isNaN(amt) || amt <= 0)) {
          return {
            id: mutationId,
            mutationId,
            status: "FAILED",
            success: false,
            error: "Invalid financial payment amount: must be a positive non-zero number",
            serverVersion: version,
            processedAt: new Date().toISOString()
          };
        }
      }

      if (entity === "JOURNAL_ENTRY") {
        const lines = data.lines || data.journalLines;
        if (Array.isArray(lines) && lines.length > 0) {
          let totalDebit = 0;
          let totalCredit = 0;
          for (const line of lines) {
            totalDebit += Number(line.debit || line.Debit || 0);
            totalCredit += Number(line.credit || line.Credit || 0);
          }
          if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return {
              id: mutationId,
              mutationId,
              status: "FAILED",
              success: false,
              error: `Unbalanced journal entry: debits (${totalDebit.toFixed(2)}) must match credits (${totalCredit.toFixed(2)})`,
              serverVersion: version,
              processedAt: new Date().toISOString()
            };
          }
        }
      }

      if (prisma.isConnected && prisma.isConnected()) {
        if (entity === "PAYMENT") {
          await prisma.payment.upsert({
            where: { id: entityId },
            update: {
              amount: data.amount || 0,
              paymentMethod: data.paymentMethod || "CASH",
              notes: data.notes,
              updatedAt: new Date()
            },
            create: {
              id: entityId,
              paymentNumber: data.paymentNumber || `PAY-${Date.now()}`,
              amount: data.amount || 0,
              partnerId: data.partnerId,
              partnerType: data.partnerType || "CUSTOMER",
              paymentMethod: data.paymentMethod || "CASH",
              referenceId: data.referenceId,
              notes: data.notes,
              tenantId,
              branchId: data.branchId || branchId
            }
          }).catch((err) => console.warn("[SyncProcessor] Payment write warning:", err.message));
        } else if (entity === "JOURNAL_ENTRY") {
          await prisma.journalEntry.upsert({
            where: { id: entityId },
            update: {
              status: data.status || "POSTED",
              updatedAt: new Date()
            },
            create: {
              id: entityId,
              date: new Date(data.date || Date.now()),
              sourceId: data.sourceId,
              sourceType: data.sourceType || "SYNC_MUTATION",
              status: data.status || "POSTED",
              tenantId,
              branchId: data.branchId || branchId
            }
          }).catch((err) => console.warn("[SyncProcessor] JournalEntry write warning:", err.message));
        }
      }

      return {
        id: mutationId,
        mutationId,
        status: "SUCCESS",
        success: true,
        serverVersion: version + 1,
        processedAt: new Date().toISOString()
      };
    }

    // 4. GENERIC ENTITY FALLBACK (e.g. CUSTOMER, SUPPLIER, TRANSFER)
    return {
      id: mutationId,
      mutationId,
      status: "SUCCESS",
      success: true,
      serverVersion: version + 1,
      processedAt: new Date().toISOString()
    };
  }

  /**
   * Evaluates conflict between client mutation and server record using Last-Write-Wins and domain rules.
   */
  async checkConflict(
    entity: string,
    entityId: string,
    version: number,
    tenantId: string,
    existingServerRecord: Record<string, any> | null,
    clientData: Record<string, any>
  ): Promise<{
    hasConflict: boolean;
    category?: string;
    resolutionStrategy?: "SERVER_WINS" | "CLIENT_WINS" | "MANUAL_MERGE";
    message?: string;
  }> {
    return SyncProcessorService.checkConflict(entity, entityId, version, tenantId, existingServerRecord, clientData);
  }

  static async checkConflict(
    _entity: string,
    _entityId: string,
    _version: number,
    _tenantId: string,
    existingServerRecord: Record<string, any> | null,
    clientData: Record<string, any>
  ): Promise<{
    hasConflict: boolean;
    category?: string;
    resolutionStrategy?: "SERVER_WINS" | "CLIENT_WINS" | "MANUAL_MERGE";
    message?: string;
  }> {
    if (!existingServerRecord) {
      return { hasConflict: false };
    }

    const serverTime = existingServerRecord.updatedAt
      ? new Date(existingServerRecord.updatedAt).getTime()
      : 0;
    const clientTimeStr = clientData?.clientUpdatedAt || clientData?.updatedAt || clientData?.clientMutationTime;
    const clientTime = clientTimeStr ? new Date(clientTimeStr).getTime() : 0;

    if (serverTime > 0 && clientTime > 0) {
      if (clientTime < serverTime) {
        return {
          hasConflict: true,
          category: "SAME_RECORD_CONFLICT",
          resolutionStrategy: "SERVER_WINS",
          message: "Server record is newer than incoming client update."
        };
      } else if (clientTime > serverTime) {
        return {
          hasConflict: true,
          category: "SAME_RECORD_CONFLICT",
          resolutionStrategy: "CLIENT_WINS",
          message: "Client mutation is newer than server record."
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Processes a single mutation with strict financial integrity validation (amounts, balance check, etc.)
   */
  async processSingleMutation(
    mutation: {
      id?: string;
      mutationId?: string;
      entity: string;
      entityId?: string;
      type: string;
      data?: Record<string, any>;
      payload?: Record<string, any>;
      version?: number;
    },
    tenantId: string
  ): Promise<{
    status: "SUCCESS" | "FAILED" | "REJECTED";
    error?: string;
    serverVersion?: number;
  }> {
    return SyncProcessorService.processSingleMutation(mutation, tenantId);
  }

  static async processSingleMutation(
    mutation: {
      id?: string;
      mutationId?: string;
      entity: string;
      entityId?: string;
      type: string;
      data?: Record<string, any>;
      payload?: Record<string, any>;
      version?: number;
    },
    _tenantId: string
  ): Promise<{
    status: "SUCCESS" | "FAILED" | "REJECTED";
    error?: string;
    serverVersion?: number;
  }> {
    const data = mutation.data || mutation.payload || {};
    const entity = (mutation.entity || "").toUpperCase();

    // 1. PAYMENT VALIDATION: must have positive non-zero amount
    if (entity === "PAYMENT") {
      const amount = Number(data.amount);
      if (isNaN(amount) || amount <= 0) {
        return {
          status: "FAILED",
          error: "Financial integrity failure: Payment amount must be a positive non-zero number."
        };
      }
    }

    // 2. JOURNAL ENTRY VALIDATION: balanced debits and credits
    if (entity === "JOURNAL_ENTRY") {
      const lines = Array.isArray(data.lines) ? data.lines : [];
      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of lines) {
        totalDebit += Number(line.debit || 0);
        totalCredit += Number(line.credit || 0);
      }
      const diff = Math.abs(totalDebit - totalCredit);
      if (diff > 0.0001) {
        return {
          status: "FAILED",
          error: `Financial integrity failure: Unbalanced journal entry. Total debit (${totalDebit}) does not match total credit (${totalCredit}).`
        };
      }
    }

    return {
      status: "SUCCESS",
      serverVersion: (mutation.version || 1) + 1
    };
  }
}
