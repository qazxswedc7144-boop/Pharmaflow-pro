// ==========================================
// FILE: src/features/sync/sync.engine.ts
// Phase 8.3 Distributed Synchronization Engine
// ==========================================

import Dexie from 'dexie';
import { LocalSyncQueueItem, SYNC_PROTOCOL_VERSION, CLIENT_VERSION } from './sync.types';
import { SYNC_CONFIG } from './sync.constants';
import { PharmaFlowDexieExtension } from './sync.queue';
import { getSyncActions } from './sync.events';
import { getCurrentUserSession } from '@/core/db';
import { SyncLockManager } from './sync.lock';
import { DeviceManager } from './device.manager';

export class DistributedSyncEngine {
  private db: Dexie & PharmaFlowDexieExtension;
  private isProcessing = false;
  private timerId: any = null;
  private lastPulledCursor: number = 0;
  private lastSyncTimestamp: number = 0;

  constructor(dexieInstance: unknown) {
    this.db = dexieInstance as Dexie & PharmaFlowDexieExtension;
  }

  public start(): void {
    if (this.timerId) return;
    
    // Register device identity in background
    DeviceManager.registerWithServer().catch(() => {});

    window.addEventListener('online', this.handleNetworkChange);
    window.addEventListener('offline', this.handleNetworkChange);
    
    this.timerId = setInterval(() => {
      this.syncCycle();
    }, SYNC_CONFIG.POLLING_INTERVAL_MS);

    // Initial sync run on boot
    this.syncCycle();
  }

  public stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    window.removeEventListener('online', this.handleNetworkChange);
    window.removeEventListener('offline', this.handleNetworkChange);
  }

  private handleNetworkChange = (): void => {
    const actions = getSyncActions();
    if (navigator.onLine) {
      actions.setNetworkStatus('ONLINE');
      this.syncCycle();
    } else {
      actions.setNetworkStatus('OFFLINE');
    }
  };

  /**
   * Executes a full synchronization cycle wrapped in safe lock.
   */
  public async syncCycle(): Promise<void> {
    if (!navigator.onLine) return;

    await SyncLockManager.withSyncLock(async () => {
      await this.drainQueue();
      await this.pullSync();
    });
  }

  /**
   * Pull server updates (sales/invoices & inventory/products) using cursor-based delta synchronization.
   */
  public async pullSync(): Promise<void> {
    if (!navigator.onLine) return;

    try {
      const session = getCurrentUserSession();
      const device = DeviceManager.getDeviceIdentity();
      const token = localStorage.getItem("pharmaflow_token") || "local-admin-token";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('/api/v1/sync/pull', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': session.tenantId,
          'X-Branch-ID': session.branchId || '',
          'X-User-ID': session.userId,
          'X-Device-ID': device.deviceId
        },
        body: JSON.stringify({ 
          tenantId: session.tenantId,
          branchId: session.branchId,
          userId: session.userId,
          deviceId: device.deviceId,
          cursor: this.lastPulledCursor,
          lastSyncTimestamp: this.lastSyncTimestamp,
          schemaVersion: SYNC_PROTOCOL_VERSION
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          if (data.nextCursor) {
            this.lastPulledCursor = data.nextCursor;
          }
          if (data.serverTimestamp) {
            this.lastSyncTimestamp = data.serverTimestamp;
          }

          // Apply changes from server-side change log
          if (Array.isArray(data.changes) && data.changes.length > 0) {
            for (const change of data.changes) {
              await this.applyServerChange(change);
            }
          }

          // Also apply legacy delta collections if present
          if (data.delta) {
            const { products, invoices } = data.delta;
            
            if (Array.isArray(products) && products.length > 0 && (this.db as any).products) {
              await (this.db as any).products.bulkPut(products.map((p: any) => ({
                ...p,
                tenantId: p.tenantId || session.tenantId,
                is_synced: 1,
                isSynced: true,
                syncStatus: 'SYNCED',
                updatedAt: p.updatedAt || new Date().toISOString()
              }))).catch((err: any) => console.warn('[SyncEngine] Product pull update warning:', err));
            }

            if (Array.isArray(invoices) && invoices.length > 0 && (this.db as any).invoices) {
              await (this.db as any).invoices.bulkPut(invoices.map((inv: any) => ({
                ...inv,
                tenantId: inv.tenantId || session.tenantId,
                branchId: inv.branchId || session.branchId,
                is_synced: 1,
                isSynced: true,
                syncStatus: 'SYNCED',
                updatedAt: inv.updatedAt || new Date().toISOString()
              }))).catch((err: any) => console.warn('[SyncEngine] Invoice pull update warning:', err));
            }
          }
        }
      }
    } catch (error) {
      console.warn('[SyncEngine] Downstream pull sync skipped:', (error as Error).message);
    }
  }

  /**
   * Applies an individual downstream change record to the local Dexie database.
   */
  private async applyServerChange(change: any): Promise<void> {
    try {
      const entity = change.entity?.toUpperCase();
      const payload = change.payload || {};
      const entityId = change.entityId;

      if (!entityId) return;

      if (entity === "PRODUCT" && (this.db as any).products) {
        if (change.operation === "DELETE") {
          await (this.db as any).products.delete(entityId).catch(() => {});
        } else {
          await (this.db as any).products.put({
            ...payload,
            id: entityId,
            tenantId: change.tenantId,
            is_synced: 1,
            isSynced: true,
            syncStatus: "SYNCED",
            updatedAt: change.createdAt
          }).catch(() => {});
        }
      } else if ((entity === "INVOICE" || entity === "SALE") && (this.db as any).invoices) {
        if (change.operation === "DELETE") {
          await (this.db as any).invoices.delete(entityId).catch(() => {});
        } else {
          await (this.db as any).invoices.put({
            ...payload,
            id: entityId,
            tenantId: change.tenantId,
            branchId: change.branchId,
            is_synced: 1,
            isSynced: true,
            syncStatus: "SYNCED",
            updatedAt: change.createdAt
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("[SyncEngine] Failed applying downstream server change:", err);
    }
  }

  public async drainQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;
    this.isProcessing = true;
    const actions = getSyncActions();
    actions.setQueueDraining(true);

    try {
      // 1. Drain syncQueue table
      if (this.db.syncQueue) {
        let hasMore = true;
        while (hasMore) {
          const batch = await this.db.syncQueue
            .where('[syncStatus+createdAt]')
            .between(['PENDING', Dexie.minKey], ['PENDING', Dexie.maxKey])
            .limit(SYNC_CONFIG.BATCH_CHUNK_SIZE)
            .toArray()
            .catch(() => []);

          if (batch.length === 0) {
            hasMore = false;
            break;
          }

          for (const mutation of batch) {
            await this.processMutationWithRetry(mutation);
          }
        }
      }

      // 2. Drain outbox table
      if ((this.db as any).outbox) {
        const outboxEvents = await (this.db as any).outbox
          .where('status')
          .anyOf('PENDING', 'pending', 'RETRYING')
          .toArray()
          .catch(() => []);

        for (const event of outboxEvents) {
          await this.processOutboxEvent(event);
        }
      }

    } finally {
      this.isProcessing = false;
      actions.setQueueDraining(false);
    }
  }

  private async processOutboxEvent(event: any): Promise<void> {
    try {
      const session = getCurrentUserSession();
      const device = DeviceManager.getDeviceIdentity();
      const token = localStorage.getItem("pharmaflow_token") || "local-admin-token";

      await (this.db as any).outbox.update(event.id, { status: 'SENDING', updatedAt: new Date().toISOString() });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('/api/v1/sync/push', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': session.tenantId,
          'X-Branch-ID': session.branchId || '',
          'X-User-ID': session.userId,
          'X-Device-ID': device.deviceId
        },
        body: JSON.stringify({
          tenantId: session.tenantId,
          branchId: session.branchId,
          userId: session.userId,
          deviceId: device.deviceId,
          schemaVersion: SYNC_PROTOCOL_VERSION,
          clientVersion: CLIENT_VERSION,
          mutations: [{
            id: event.mutationId || String(event.id),
            entity: event.entityType || event.type || 'MUTATION',
            operation: event.operation || 'CREATE',
            payload: event.payload || {},
            idempotencyKey: event.idempotencyKey || event.mutationId || String(event.id),
            timestamp: event.createdAt || Date.now()
          }]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        await (this.db as any).outbox.update(event.id, { status: 'CONFIRMED', updatedAt: new Date().toISOString() });
      } else {
        const errorBody = await response.json().catch(() => ({}));
        const isFatal = [400, 401, 403].includes(response.status) || errorBody.errorCode === "SCHEMA_VERSION_MISMATCH";
        await (this.db as any).outbox.update(event.id, { 
          status: isFatal ? 'FAILED' : 'RETRYING', 
          error: errorBody.message || `HTTP ${response.status}`,
          updatedAt: new Date().toISOString() 
        });
      }
    } catch (err: any) {
      await (this.db as any).outbox.update(event.id, { 
        status: 'RETRYING', 
        error: err.message || "Network Error",
        updatedAt: new Date().toISOString() 
      });
    }
  }

  private async processMutationWithRetry(mutation: LocalSyncQueueItem): Promise<void> {
    await this.db.syncQueue.update(mutation.id!, { syncStatus: 'PROCESSING', updatedAt: new Date() });

    let delay: number = SYNC_CONFIG.BACKOFF_INITIAL_DELAY_MS;
    const session = getCurrentUserSession();
    const device = DeviceManager.getDeviceIdentity();
    const token = localStorage.getItem("pharmaflow_token") || "local-admin-token";
    
    while (mutation.retryCount <= SYNC_CONFIG.MAX_RETRY_ATTEMPTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch('/api/v1/sync/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Tenant-ID': session.tenantId,
            'X-Branch-ID': session.branchId || '',
            'X-User-ID': session.userId,
            'X-Device-ID': device.deviceId,
            'X-Session-ID': (mutation as any).sessionId || 'local-session',
            'X-Correlation-ID': mutation.correlationId || 'local-correlation',
          },
          body: JSON.stringify({
            tenantId: session.tenantId,
            branchId: session.branchId,
            userId: session.userId,
            deviceId: device.deviceId,
            schemaVersion: SYNC_PROTOCOL_VERSION,
            clientVersion: CLIENT_VERSION,
            mutations: [{
              id: mutation.mutationId,
              entity: mutation.entityType || 'MUTATION',
              operation: mutation.operationType || 'CREATE',
              payload: mutation.payload,
              idempotencyKey: mutation.idempotencyKey || mutation.mutationId,
              version: mutation.version || 1,
              timestamp: mutation.createdAt
            }]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          await this.db.syncQueue.delete(mutation.id!);

          // Mark local record as synced
          if (mutation.payload && (mutation.payload as any).id) {
            const entityId = (mutation.payload as any).id;
            const eType = String(mutation.entityType).toUpperCase();
            if (eType === 'SALE' || eType === 'INVOICE') {
              if ((this.db as any).invoices) {
                await (this.db as any).invoices.update(entityId, {
                  is_synced: 1,
                  isSynced: true,
                  syncStatus: 'SYNCED',
                  updatedAt: new Date().toISOString()
                }).catch(() => null);
              }
            } else if (eType === 'PRODUCT') {
              if ((this.db as any).products) {
                await (this.db as any).products.update(entityId, {
                  is_synced: 1,
                  isSynced: true,
                  syncStatus: 'SYNCED',
                  updatedAt: new Date().toISOString()
                }).catch(() => null);
              }
            }
          }
          return;
        }

        const errPayload = await response.json().catch(() => ({}));
        
        // Handle explicit conflicts or fatal authorization errors
        if (response.status === 409 || errPayload.errorType === 'CONFLICT' || errPayload.results?.[0]?.status === 'CONFLICT') {
          const conflictData = errPayload.results?.[0]?.conflict || errPayload;
          await this.handleConflict(mutation, conflictData.message || 'تعارض في مزامنة السجل مع الخادم');
          return;
        }

        // Non-retryable fatal errors (e.g. schema mismatch, unauthorized, revoked device)
        if ([400, 401, 403].includes(response.status) || errPayload.errorCode === "SCHEMA_VERSION_MISMATCH" || errPayload.errorCode === "DEVICE_REVOKED") {
          await this.db.syncQueue.update(mutation.id!, {
            syncStatus: 'REJECTED',
            lastError: errPayload.message || `Rejected by server with code ${errPayload.errorCode || response.status}`,
            updatedAt: new Date()
          });
          return;
        }

        throw new Error(`Server returned status: ${response.status}`);

      } catch (error) {
        mutation.retryCount++;
        await this.db.syncQueue.update(mutation.id!, { retryCount: mutation.retryCount, updatedAt: new Date() });

        if (mutation.retryCount > SYNC_CONFIG.MAX_RETRY_ATTEMPTS) {
          await this.db.syncQueue.update(mutation.id!, { syncStatus: 'FAILED', updatedAt: new Date() });
          return;
        }

        // Add random jitter to exponential backoff (e.g. 10-20% variance)
        const jitter = Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        delay = Math.min(delay * 2, SYNC_CONFIG.BACKOFF_MAX_DELAY_MS);
      }
    }
  }

  private async handleConflict(mutation: LocalSyncQueueItem, reason: string): Promise<void> {
    await this.db.transaction('rw', [this.db.syncQueue, this.db.failedMutations], async () => {
      await this.db.failedMutations.add({
        mutationId: mutation.mutationId,
        reason: reason,
        payload: mutation.payload,
        createdAt: new Date(),
      });
      await this.db.syncQueue.update(mutation.id!, {
        syncStatus: 'CONFLICT',
        updatedAt: new Date(),
      });
    });
  }
}
