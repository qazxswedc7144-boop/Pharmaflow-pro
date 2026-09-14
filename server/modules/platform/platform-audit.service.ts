// server/modules/platform/platform-audit.service.ts
// Platform Audit and Security Event Pipeline for Phase 8.6

import { PlatformAuditEventRecord, SecurityEventSeverity } from './platform.types';
import { prisma } from '../../database/prisma';

export class PlatformAuditService {
  private static memoryLogs: PlatformAuditEventRecord[] = [];
  private static MAX_MEMORY_LOGS = 1000;

  /**
   * Safe payload sanitizer to ensure secrets, passwords, and tokens are NEVER persisted
   */
  private static sanitizePayload(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sanitizePayload(item));

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('hash') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('privatekey')
      ) {
        sanitized[key] = '[REDACTED_SECRET]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizePayload(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Records a platform-level audit event
   */
  static async recordEvent(event: {
    actorId: string;
    actorUsername: string;
    action: string;
    resource: string;
    resourceId?: string | null;
    tenantId?: string | null;
    branchId?: string | null;
    before?: any;
    after?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
    severity?: SecurityEventSeverity;
    metadata?: Record<string, any>;
  }): Promise<PlatformAuditEventRecord> {
    const record: PlatformAuditEventRecord = {
      id: `PAE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      actorId: event.actorId,
      actorUsername: event.actorUsername || 'SYSTEM',
      tenantId: event.tenantId || null,
      branchId: event.branchId || null,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId || null,
      before: this.sanitizePayload(event.before),
      after: this.sanitizePayload(event.after),
      timestamp: new Date().toISOString(),
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent || null,
      severity: event.severity || 'INFO',
      metadata: this.sanitizePayload(event.metadata)
    };

    // Store in ring buffer
    this.memoryLogs.unshift(record);
    if (this.memoryLogs.length > this.MAX_MEMORY_LOGS) {
      this.memoryLogs.pop();
    }

    // Persist to Prisma auditLog if available
    try {
      if (prisma.isConnected && prisma.isConnected() && (prisma as any).auditLog) {
        await (prisma as any).auditLog.create({
          data: {
            userId: event.actorId,
            action: `PLATFORM_${event.action}`,
            entity: event.resource,
            entityId: event.resourceId || 'PLATFORM',
            before: record.before ? JSON.stringify(record.before) : null,
            after: record.after ? JSON.stringify(record.after) : null,
            ipAddress: event.ipAddress || null
          }
        }).catch((e: any) => {
          console.warn('[PlatformAudit] Prisma persist warning:', e.message);
        });
      }
    } catch {
      // Non-blocking fallback
    }

    return record;
  }

  /**
   * Retrieves platform audit logs with pagination and filters
   */
  static getEvents(filters: {
    tenantId?: string;
    resource?: string;
    action?: string;
    severity?: SecurityEventSeverity;
    limit?: number;
    offset?: number;
    search?: string;
  }): { logs: PlatformAuditEventRecord[]; total: number } {
    let filtered = [...this.memoryLogs];

    if (filters.tenantId) {
      filtered = filtered.filter(l => l.tenantId === filters.tenantId);
    }
    if (filters.resource) {
      filtered = filtered.filter(l => l.resource.toLowerCase() === filters.resource!.toLowerCase());
    }
    if (filters.action) {
      filtered = filtered.filter(l => l.action.toLowerCase().includes(filters.action!.toLowerCase()));
    }
    if (filters.severity) {
      filtered = filtered.filter(l => l.severity === filters.severity);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(l =>
        l.action.toLowerCase().includes(q) ||
        l.resource.toLowerCase().includes(q) ||
        l.actorUsername.toLowerCase().includes(q) ||
        (l.tenantId && l.tenantId.toLowerCase().includes(q))
      );
    }

    const total = filtered.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const logs = filtered.slice(offset, offset + limit);

    return { logs, total };
  }

  /**
   * Retrieves security specific events (warnings, high severity, unauthorized attempts)
   */
  static getSecurityEvents(limit: number = 50): PlatformAuditEventRecord[] {
    return this.memoryLogs
      .filter(l => ['MEDIUM', 'HIGH', 'CRITICAL'].includes(l.severity) || l.action.includes('SECURITY') || l.action.includes('DENIED') || l.action.includes('REVOKED'))
      .slice(0, limit);
  }
}
