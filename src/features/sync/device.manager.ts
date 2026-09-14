// ==========================================
// FILE: src/features/sync/device.manager.ts
// Phase 8.3 Persistent Device Identity Manager
// ==========================================

import { DeviceMetadata, SYNC_PROTOCOL_VERSION } from "./sync.types";
import { getCurrentUserSession } from "@/core/db";

const DEVICE_STORAGE_KEY = "pharmaflow_device_identity";

export class DeviceManager {
  private static cachedIdentity: DeviceMetadata | null = null;

  /**
   * Generates or retrieves persistent device identity
   */
  static getDeviceIdentity(): DeviceMetadata {
    if (this.cachedIdentity) {
      return this.cachedIdentity;
    }

    const session = getCurrentUserSession();

    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.deviceId) {
            this.cachedIdentity = {
              ...parsed,
              tenantId: session.tenantId || parsed.tenantId,
              branchId: session.branchId || parsed.branchId,
              userId: session.userId || parsed.userId
            };
            return this.cachedIdentity!;
          }
        }
      } catch (err) {
        console.warn("[DeviceManager] Error reading stored device identity:", err);
      }
    }

    // Generate fresh persistent device ID
    const newDeviceId = `DEV-${crypto.randomUUID().substring(0, 12).toUpperCase()}`;
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "Desktop POS";
    const deviceName = userAgent.includes("Android") 
      ? "Android POS Terminal" 
      : (userAgent.includes("Mobile") ? "Mobile Terminal" : "Workstation Terminal");

    const identity: DeviceMetadata = {
      deviceId: newDeviceId,
      deviceName,
      tenantId: session.tenantId || "default-tenant",
      branchId: session.branchId || "default-branch",
      userId: session.userId || "default-user",
      status: "ACTIVE",
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };

    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(identity));
      } catch (err) {
        console.warn("[DeviceManager] Error persisting device identity:", err);
      }
    }

    this.cachedIdentity = identity;
    return identity;
  }

  /**
   * Registers or sends heartbeat for this device to the server
   */
  static async registerWithServer(): Promise<boolean> {
    if (typeof window === "undefined" || !navigator.onLine) return false;

    const identity = this.getDeviceIdentity();
    const session = getCurrentUserSession();
    const token = localStorage.getItem("pharmaflow_token") || "local-admin-token";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("/api/v1/sync/device/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "X-Tenant-ID": session.tenantId,
          "X-Branch-ID": session.branchId || "",
          "X-Device-ID": identity.deviceId
        },
        body: JSON.stringify({
          deviceId: identity.deviceId,
          deviceName: identity.deviceName,
          branchId: session.branchId || "default-branch",
          appVersion: "8.3.0",
          schemaVersion: SYNC_PROTOCOL_VERSION
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          identity.status = result.data.status || "ACTIVE";
          if (typeof window !== "undefined" && window.localStorage) {
            localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(identity));
          }
          return true;
        }
      }
    } catch (err) {
      console.warn("[DeviceManager] Background device registration deferred:", err);
    }
    return false;
  }
}
