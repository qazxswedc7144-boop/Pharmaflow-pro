// server/database/redis.ts

import Redis, { RedisOptions } from "ioredis";

export function sanitizeRedisUrl(url?: string): string {
  if (!url || typeof url !== "string") {
    return "[NOT_CONFIGURED]";
  }

  const trimmed = url.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) {
    return "[EMPTY]";
  }

  try {
    if (trimmed.includes("://")) {
      const parsed = new URL(trimmed);
      const protocol = parsed.protocol || "redis:";
      const host = parsed.hostname || "endpoint";
      const port = parsed.port ? `:${parsed.port}` : "";
      const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
      const auth = parsed.username || parsed.password ? "***:***@" : "";
      return `${protocol}//${auth}${host}${port}${pathname}`;
    }
    return trimmed.replace(/:\/\/([^@]+)@/, "://***:***@");
  } catch {
    return trimmed.replace(/:([^\/@:]+)@/, ":***@").replace(/\/\/[^@]+@/, "//***@");
  }
}

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

export class RedisConnectionManager {
  private static instance: Redis | null = null;
  private static isConnected = false;
  private static localMemoryStore = new Map<string, MemoryCacheEntry>();
  private static readonly MAX_ENTRIES = 10000;
  private static cleanupInterval: NodeJS.Timeout | null = null;

  static {
    // Periodic garbage collector for expired local memory keys
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => {
        RedisConnectionManager.evictExpired();
      }, 60000);
      if (this.cleanupInterval?.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  private static get REDIS_URL(): string {
    return process.env.REDIS_URL ? process.env.REDIS_URL.trim().replace(/^['"]|['"]$/g, "") : "";
  }

  static get isMemoryFallback(): boolean {
    return !this.REDIS_URL || !this.isConnected;
  }

  static getStatus(): "REDIS_AVAILABLE" | "REDIS_FALLBACK_MEMORY_MODE" {
    return this.isConnected ? "REDIS_AVAILABLE" : "REDIS_FALLBACK_MEMORY_MODE";
  }

  /**
   * Returns a singleton Redis connection pool or null in memory fallback.
   */
  static getClient(): Redis | null {
    if (!this.REDIS_URL) {
      return null;
    }

    if (!this.instance) {
      try {
        const sanitized = sanitizeRedisUrl(this.REDIS_URL);
        console.log(`[REDIS] Initializing connection to: ${sanitized}`);

        const options: RedisOptions = {
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          connectTimeout: 5000,
          lazyConnect: false,
          reconnectOnError: (err) => {
            if (err.message && err.message.slice(0, 8) === "READONLY") {
              return true;
            }
            return false;
          },
          retryStrategy: (times) => {
            if (times > 3) {
              console.warn("[REDIS] Exceeded retry margin. Operating in process-local memory fallback mode.");
              this.isConnected = false;
              return null;
            }
            return Math.min(times * 300, 2000);
          }
        };

        this.instance = new Redis(this.REDIS_URL, options);

        this.instance.on("error", (err) => {
          console.warn("[REDIS] Socket notice:", err?.message || err);
          this.isConnected = false;
        });

        this.instance.on("connect", () => {
          this.isConnected = true;
          console.log(`[REDIS] REDIS_AVAILABLE (Connected to ${sanitizeRedisUrl(this.REDIS_URL)})`);
        });

        this.instance.on("ready", () => {
          this.isConnected = true;
        });

        this.instance.on("close", () => {
          this.isConnected = false;
        });
      } catch (err: any) {
        console.warn("[REDIS] Initialization failed. Falling back to in-memory store.", err?.message || err);
        this.instance = null;
        this.isConnected = false;
      }
    }

    return this.isConnected ? this.instance : null;
  }

  /**
   * Safe SET command supporting EX/PX TTL and NX (Set if Not Exists)
   */
  static async set(key: string, value: string, mode?: "PX" | "EX", ttl?: number, nx?: boolean): Promise<boolean> {
    const redis = this.getClient();
    if (redis && this.isConnected) {
      try {
        if (nx) {
          if (mode && ttl) {
            const res = await (redis as any).set(key, value, mode, ttl, "NX");
            return res === "OK";
          } else {
            const res = await (redis as any).set(key, value, "NX");
            return res === "OK";
          }
        } else {
          if (mode && ttl) {
            await (redis as any).set(key, value, mode, ttl);
          } else {
            await redis.set(key, value);
          }
          return true;
        }
      } catch (err) {
        console.warn("[REDIS] SET command failed, falling back to local memory store.", err);
      }
    }

    // In-memory fallback
    const now = Date.now();
    const existing = this.localMemoryStore.get(key);

    if (nx && existing && existing.expiresAt > now) {
      return false;
    }

    if (this.localMemoryStore.size >= this.MAX_ENTRIES) {
      this.evictExpired();
      if (this.localMemoryStore.size >= this.MAX_ENTRIES) {
        const keysToEvict = Array.from(this.localMemoryStore.keys()).slice(0, 1000);
        for (const k of keysToEvict) {
          this.localMemoryStore.delete(k);
        }
      }
    }

    let expiresAt = Infinity;
    if (ttl && ttl > 0) {
      expiresAt = mode === "EX" ? now + ttl * 1000 : now + ttl;
    }

    this.localMemoryStore.set(key, { value, expiresAt });
    return true;
  }

  /**
   * Safe GET command
   */
  static async get(key: string): Promise<string | null> {
    const redis = this.getClient();
    if (redis && this.isConnected) {
      try {
        return await redis.get(key);
      } catch (err) {
        console.warn("[REDIS] GET command failed, falling back to local memory store.", err);
      }
    }

    const entry = this.localMemoryStore.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.localMemoryStore.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Safe DEL command
   */
  static async del(key: string): Promise<boolean> {
    const redis = this.getClient();
    if (redis && this.isConnected) {
      try {
        await redis.del(key);
        return true;
      } catch (err) {
        console.warn("[REDIS] DEL command failed, falling back to local memory store.", err);
      }
    }

    return this.localMemoryStore.delete(key);
  }

  /**
   * Pattern scan keys
   */
  static async scanKeys(pattern: string): Promise<string[]> {
    const redis = this.getClient();
    if (redis && this.isConnected) {
      try {
        let keys: string[] = [];
        let cursor = "0";
        do {
          const reply = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
          cursor = reply[0];
          keys.push(...reply[1]);
        } while (cursor !== "0");
        return keys;
      } catch (err) {
        console.warn("[REDIS] SCAN command failed, scanning local memory store.", err);
      }
    }

    const now = Date.now();
    const results: string[] = [];
    const escaped = pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&").replace(/\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`);

    for (const [key, entry] of this.localMemoryStore.entries()) {
      if (entry.expiresAt > now) {
        if (regex.test(key)) {
          results.push(key);
        }
      } else {
        this.localMemoryStore.delete(key);
      }
    }

    return results;
  }

  /**
   * Evaluates Lua script on Redis, or handles token-verified Mutex evaluation locally
   */
  static async eval(script: string, numKeys: number, ...args: string[]): Promise<any> {
    const redis = this.getClient();
    if (redis && this.isConnected) {
      try {
        return await redis.eval(script, numKeys, ...args);
      } catch (err) {
        console.warn("[REDIS] Lua evaluation failed, evaluating local process-local mutex.", err);
      }
    }

    const key = args[0] || "";
    const token = args[1] || "";
    const entry = this.localMemoryStore.get(key);
    const now = Date.now();

    if (entry && entry.expiresAt <= now) {
      this.localMemoryStore.delete(key);
    }

    const currentVal = entry && entry.expiresAt > now ? entry.value : null;

    // Mutex Release
    if (script.includes("del") && script.includes("get")) {
      if (currentVal === token) {
        this.localMemoryStore.delete(key);
        return 1;
      }
      return 0;
    }

    // Mutex Extend
    if (script.includes("pexpire") || script.includes("expire")) {
      const ttlMs = parseInt(args[2] || "0", 10);
      if (currentVal === token && ttlMs > 0) {
        this.localMemoryStore.set(key, {
          value: currentVal,
          expiresAt: Date.now() + ttlMs
        });
        return 1;
      }
      return 0;
    }

    return 0;
  }

  static async clear(): Promise<void> {
    this.localMemoryStore.clear();
  }

  private static evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.localMemoryStore.entries()) {
      if (entry.expiresAt <= now) {
        this.localMemoryStore.delete(key);
      }
    }
  }
}

export default RedisConnectionManager;
