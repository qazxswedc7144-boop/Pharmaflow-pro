// ==========================================
// FILE: src/features/sync/SyncEngine.ts
// Phase 8.3 Enterprise Outbox Sync Engine
// ==========================================

import { db, getCurrentUserSession } from "@/core/db";
import { rtdb } from "@/services/firebase";
import { ref, serverTimestamp, set } from "firebase/database";
import { SYNC_PROTOCOL_VERSION } from "./sync.types";
import { SyncLockManager } from "./sync.lock";
import { DeviceManager } from "./device.manager";

export type SyncStatus = 'PENDING' | 'SENDING' | 'FAILED' | 'CONFIRMED' | 'RETRYING';

export interface OutboxEvent {
  id?: number;
  mutationId: string;
  type: string;
  payload: Record<string, unknown>;
  status: SyncStatus;
  retries: number;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  entityType?: string;
  error?: string;
}

export interface SyncLog {
  id?: number;
  action: 'SYNC_START' | 'SYNC_SUCCESS' | 'SYNC_FAIL' | 'DUPLICATE_DETECTED' | 'CONFLICT_RESOLVED' | 'RETRY_DELAYED';
  entity?: string;
  user?: string;
  branch?: string;
  version?: number;
  mutationId?: string;
  details: string;
  timestamp: string;
  result?: string;
}

export class SyncEngine {
  private static MAX_RETRIES = 5;
  private static BACKOFF_MS = [0, 2000, 5000, 15000, 30000, 60000]; // Exponential Backoff
  private static isProcessing = false;

  /**
   * Initializes the Sync Engine Event Listeners
   */
  static init() {
    window.addEventListener("online", () => {
      this.log('SYNC_START', 'Network came online, starting sync drain', undefined, 'SYSTEM');
      this.drainQueue();
    });

    // Offline Recovery - process on load
    if (typeof window !== "undefined") {
      if (navigator.onLine) {
         setTimeout(() => this.drainQueue(), 1000);
      }
    }
  }

  /**
   * Generates a robust Idempotency Key based on entity context
   */
  static generateIdempotencyKey(entityType: string, entityId: string, mutationType: string, version: number, branchId: string): string {
    return `${entityType}:${entityId}:${mutationType}:${version}:${branchId}`;
  }

  /**
   * Enqueues a new mutation into the Outbox
   */
  static async enqueue(type: string, payload: Record<string, unknown>, entityType: string = 'generic', customIdempotencyKey?: string) {
    const mutationId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const session = getCurrentUserSession();
    
    // Idempotency pattern: EntityType:EntityId:MutationType:Version:BranchId
    const version = (payload?.version as number) || 1;
    const entityId = (payload?.id as string) || 'unknown';
    const branchId = session.branchId || 'default-branch';
    
    const idempotencyKey = customIdempotencyKey || this.generateIdempotencyKey(entityType, entityId, type, version, branchId);

    // Filter sensitive data before storing locally
    const sanitizedPayload = this.sanitizePayload(payload) || {};

    const outboxEvent: OutboxEvent = {
      mutationId,
      type,
      payload: sanitizedPayload,
      status: 'PENDING',
      retries: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      idempotencyKey,
      entityType
    };

    try {
      await db.outbox.add(outboxEvent);
      this.log('SYNC_START', `Enqueued mutation ${mutationId} (${type})`, mutationId, 'SUCCESS', entityType, version as number);
      
      if (navigator.onLine) {
        this.drainQueue();
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error("[SyncEngine] Failed to enqueue:", err);
      this.log('SYNC_FAIL', `Enqueue Failed: ${err.message}`, mutationId, 'ERROR', entityType, version as number);
    }
  }

  /**
   * Dead Letter Queue - Resubmit FAILED mutations manually
   */
  static async resubmitFailed(mutationId: string) {
    try {
      const event = await db.outbox.where('mutationId').equals(mutationId).first();
      if (event && event.status === 'FAILED') {
        await db.outbox.update(event.id!, {
          status: 'PENDING',
          retries: 0,
          error: undefined,
          updatedAt: new Date().toISOString()
        });
        if (navigator.onLine) this.drainQueue();
      }
    } catch (e) {
      console.error("[SyncEngine] Failed to resubmit:", e);
    }
  }

  /**
   * Main Queue Drain logic (Outbox Pattern) with strict lock
   */
  static async drainQueue() {
    if (this.isProcessing) return;
    if (!navigator.onLine) return;

    await SyncLockManager.withSyncLock(async () => {
      this.isProcessing = true;

      try {
        const pendingEvents = await db.outbox
          .where('status').anyOf('PENDING', 'RETRYING')
          .sortBy('createdAt');

        if (pendingEvents.length === 0) {
          return; 
        }

        for (const event of pendingEvents) {
          if (event.status === 'RETRYING') {
            const delay = this.BACKOFF_MS[Math.min(event.retries, this.BACKOFF_MS.length - 1)] || 60000;
            const timeSinceLastRetry = Date.now() - new Date(event.updatedAt).getTime();
            if (timeSinceLastRetry < delay) {
              continue;
            }
          }

          await this.processEvent(event);
        }
      } catch (error: unknown) {
        const err = error as Error;
        console.error("[SyncEngine] Drain queue failed:", err);
      } finally {
        this.isProcessing = false;
      }
    });
  }

  /**
   * Strip secrets, API keys, tokens before sending
   */
  private static sanitizePayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined {
    if (!payload || typeof payload !== 'object') return payload;
    const sanitized: Record<string, unknown> = { ...payload };
    
    const forbiddenKeys = ['password', 'token', 'apiKey', 'secret', 'credentials'];
    for (const key of Object.keys(sanitized)) {
      if (forbiddenKeys.some(fk => key.toLowerCase().includes(fk))) {
        delete sanitized[key];
      } else if (typeof sanitized[key] === 'function') {
        delete sanitized[key];
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizePayload(sanitized[key] as Record<string, unknown>);
      }
    }
    return sanitized;
  }

  /**
   * Processes a single Outbox Event
   */
  private static async processEvent(event: OutboxEvent) {
    const session = getCurrentUserSession();
    const device = DeviceManager.getDeviceIdentity();
    const branchId = session.branchId || "default-branch";

    try {
      // Mark as SENDING
      await db.outbox.update(event.id!, { 
        status: 'SENDING', 
        updatedAt: new Date().toISOString() 
      });

      // 1. Send via HTTPS sync API endpoint
      const token = localStorage.getItem("pharmaflow_token") || "local-admin-token";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch("/api/v1/sync/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "X-Tenant-ID": session.tenantId,
          "X-Branch-ID": branchId,
          "X-User-ID": session.userId,
          "X-Device-ID": device.deviceId
        },
        body: JSON.stringify({
          tenantId: session.tenantId,
          branchId,
          userId: session.userId,
          deviceId: device.deviceId,
          schemaVersion: SYNC_PROTOCOL_VERSION,
          clientVersion: "8.3.0",
          mutations: [{
            id: event.mutationId,
            entity: event.entityType || event.type || "MUTATION",
            operation: event.type === "DELETE" ? "DELETE" : "CREATE",
            payload: event.payload,
            idempotencyKey: event.idempotencyKey,
            timestamp: event.createdAt
          }]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 2. Also replicate to Firebase RTDB if available
      if (rtdb) {
        try {
          const pubRef = ref(rtdb, `replication_events/${branchId}/${event.mutationId}`);
          await set(pubRef, {
            mutationId: event.mutationId,
            idempotencyKey: event.idempotencyKey,
            type: event.type,
            payload: event.payload,
            sequence: Date.now(),
            clientTimestamp: event.createdAt,
            serverTimestamp: serverTimestamp()
          });
        } catch (rtdbErr) {
          console.warn("[SyncEngine] Firebase RTDB replication note:", rtdbErr);
        }
      }

      if (response.ok) {
        // Mark as CONFIRMED
        await db.outbox.update(event.id!, { 
          status: 'CONFIRMED', 
          updatedAt: new Date().toISOString() 
        });
        
        this.log('SYNC_SUCCESS', `Successfully synced ${event.type}`, event.mutationId, 'SUCCESS', event.entityType, event.payload?.version as number | undefined);
      } else {
        const errorBody = await response.json().catch(() => ({}));
        const isFatal = [400, 401, 403].includes(response.status) || errorBody.errorCode === "SCHEMA_VERSION_MISMATCH";
        
        const newRetries = (event.retries || 0) + 1;
        const nextStatus = isFatal || newRetries >= this.MAX_RETRIES ? 'FAILED' : 'RETRYING';
        
        await db.outbox.update(event.id!, { 
          status: nextStatus, 
          retries: newRetries,
          error: errorBody.message || `HTTP ${response.status}`,
          updatedAt: new Date().toISOString() 
        });

        this.log('SYNC_FAIL', `Failed to sync. Retry ${newRetries}/${this.MAX_RETRIES}. Error: ${errorBody.message || response.statusText}`, event.mutationId, 'ERROR', event.entityType, event.payload?.version as number | undefined);
      }

    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[SyncEngine] Failed to process event ${event.mutationId}:`, err);
      
      const newRetries = (event.retries || 0) + 1;
      const nextStatus = newRetries >= this.MAX_RETRIES ? 'FAILED' : 'RETRYING';
      
      await db.outbox.update(event.id!, { 
        status: nextStatus, 
        retries: newRetries,
        error: err.message || 'Unknown error',
        updatedAt: new Date().toISOString() 
      });

      this.log('SYNC_FAIL', `Failed to sync. Retry ${newRetries}/${this.MAX_RETRIES}. Error: ${err.message}`, event.mutationId, 'ERROR', event.entityType, event.payload?.version as number | undefined);
    }
  }

  /**
   * Structured Logging
   */
  private static async log(
    action: SyncLog['action'], 
    details: string, 
    mutationId?: string, 
    result?: string,
    entity?: string,
    version?: number
  ) {
    try {
      const session = getCurrentUserSession();
      await db.syncLogs.add({
        action,
        details,
        mutationId,
        entity,
        user: session.userId || "system",
        branch: session.branchId || "default-branch",
        version,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Failed to write sync log:", e);
    }
  }
}
