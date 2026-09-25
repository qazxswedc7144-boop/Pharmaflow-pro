// apps/api/src/modules/audit/audit.repository.ts
import { prisma } from "../../../../../server/database/prisma.js";
import { AuditLogPayload } from "./audit.types.js";

export class AuditRepository {
  /**
   * Append-only database insertion of audit traces.
   * Modifying existing audit logs is strictly impossible due to lack of update/delete actions.
   */
  static async create(payload: AuditLogPayload) {
    return prisma.auditLog.create({
      data: {
        userId: payload.userId || null,
        action: payload.action,
        entity: payload.entity,
        entityId: payload.entityId,
        before: payload.before || null,
        after: payload.after || null,
        ipAddress: payload.ipAddress || "system"
      }
    });
  }

  static async findMany(filters: { userId?: string; entity?: string; action?: string }) {
    return prisma.auditLog.findMany({
      where: {
        userId: filters.userId,
        entity: filters.entity,
        action: filters.action
      },
      orderBy: {
        timestamp: "desc"
      }
    });
  }
}
