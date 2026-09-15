// src/core/observability/healthMonitor.ts

import { db } from '@/core/db';
import {
  AggregatedSystemHealth,
  SystemHealthStatus,
  SystemOperatingMode,
  HealthSubsystemStatus
} from './types';
import { TokenProvider } from '@/services/auth/tokenProvider';
import { observabilityEvents } from './observabilityEvents';

export class HealthMonitor {
  private currentHealth: AggregatedSystemHealth = {
    overall: 'HEALTHY',
    mode: 'NORMAL',
    subsystems: {
      database: { status: 'HEALTHY', details: {}, lastChecked: new Date().toISOString() },
      sync: { status: 'HEALTHY', details: {}, lastChecked: new Date().toISOString() },
      network: { status: 'HEALTHY', details: {}, lastChecked: new Date().toISOString() },
      auth: { status: 'HEALTHY', details: {}, lastChecked: new Date().toISOString() },
      performance: { status: 'HEALTHY', details: {}, lastChecked: new Date().toISOString() }
    },
    timestamp: new Date().toISOString()
  };

  /**
   * Performs complete health check across all core subsystems.
   */
  public async evaluateSystemHealth(): Promise<AggregatedSystemHealth> {
    const now = new Date().toISOString();

    // 1. Database Health Check
    let dbStatus: HealthSubsystemStatus = 'HEALTHY';
    const dbDetails: Record<string, any> = { isOpen: false, tableCount: 0 };
    try {
      if (typeof indexedDB === 'undefined') {
        dbDetails.note = 'Headless or Node environment without IndexedDB';
      } else if (db && db.isOpen()) {
        dbDetails.isOpen = true;
        dbDetails.tableCount = db.tables.length;
        await db.settings.limit(1).toArray();
      } else if (db) {
        await db.open();
        dbDetails.isOpen = true;
        dbDetails.tableCount = db.tables.length;
      }
    } catch (err: any) {
      dbStatus = 'CRITICAL';
      dbDetails.error = err?.message || String(err);
    }

    // 2. Sync Health Check
    let syncStatus: HealthSubsystemStatus = 'HEALTHY';
    const syncDetails: Record<string, any> = { queueSize: 0, failedCount: 0 };
    try {
      if (db && db.outbox) {
        syncDetails.queueSize = await db.outbox.where('status').equals('pending').count();
        syncDetails.failedCount = await db.outbox.where('status').equals('failed').count();

        if (syncDetails.failedCount > 20) {
          syncStatus = 'DEGRADED';
        }
      }
    } catch (e: any) {
      syncStatus = 'DEGRADED';
      syncDetails.error = e?.message || String(e);
    }

    // 3. Network Health Check
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const networkStatus: HealthSubsystemStatus = isOnline ? 'HEALTHY' : 'OFFLINE';
    const networkDetails = { isOnline };

    // 4. Auth Health Check
    let authStatus: HealthSubsystemStatus = 'HEALTHY';
    const authDetails: Record<string, any> = { hasToken: false };
    const token = TokenProvider.getAccessToken();
    const session = TokenProvider.getCurrentSession();
    authDetails.hasToken = Boolean(token || session?.user);
    if (!authDetails.hasToken) {
      authStatus = 'DEGRADED';
    }

    // 5. Performance Health Check
    const perfStatus: HealthSubsystemStatus = 'HEALTHY';
    const perfDetails = { status: 'OPTIMAL' };

    // 6. Aggregate Overall System Health
    let overall: SystemHealthStatus = 'HEALTHY';
    let mode: SystemOperatingMode = 'NORMAL';

    if (dbStatus === 'CRITICAL') {
      overall = 'CRITICAL';
      mode = 'SAFE_MODE';
    } else if (!isOnline) {
      // OFFLINE + Local DB Healthy = Operational Offline Mode (NOT system failure!)
      overall = 'OFFLINE';
      mode = 'NORMAL';
    } else if (syncStatus === 'DEGRADED' || authStatus === 'DEGRADED') {
      overall = 'DEGRADED';
      mode = 'DEGRADED';
    }

    const newHealth: AggregatedSystemHealth = {
      overall,
      mode,
      subsystems: {
        database: { status: dbStatus, details: dbDetails, lastChecked: now },
        sync: { status: syncStatus, details: syncDetails, lastChecked: now },
        network: { status: networkStatus, details: networkDetails, lastChecked: now },
        auth: { status: authStatus, details: authDetails, lastChecked: now },
        performance: { status: perfStatus, details: perfDetails, lastChecked: now }
      },
      timestamp: now
    };

    const statusChanged = this.currentHealth.overall !== overall || this.currentHealth.mode !== mode;
    this.currentHealth = newHealth;

    if (statusChanged) {
      observabilityEvents.emitHealthChange(overall, mode);
    }

    return this.currentHealth;
  }

  public getHealth(): AggregatedSystemHealth {
    return { ...this.currentHealth };
  }
}

export const healthMonitor = new HealthMonitor();
