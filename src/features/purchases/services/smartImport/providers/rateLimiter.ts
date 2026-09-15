// src/features/purchases/services/smartImport/providers/rateLimiter.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Rate Limiter with Exponential Backoff & Jitter
 */

export interface RateLimiterOptions {
  minIntervalMs?: number; // Minimum gap between API calls (e.g. 1000ms)
  maxRetries?: number;    // e.g. 2 retries
  initialBackoffMs?: number; // e.g. 500ms
  maxBackoffMs?: number;     // e.g. 4000ms
}

export class RateLimiter {
  private lastCallTimestamp = 0;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.maxRetries = options.maxRetries ?? 2;
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 4000;
  }

  /**
   * Enforces minimum interval before proceeding
   */
  public async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTimestamp;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastCallTimestamp = Date.now();
  }

  /**
   * Executes an asynchronous task with rate limiting and exponential backoff on retryable errors
   */
  public async executeWithRetry<T>(
    task: (attempt: number) => Promise<T>,
    isRetryableError: (err: any) => boolean = () => true
  ): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.throttle();

      try {
        return await task(attempt);
      } catch (err: any) {
        lastError = err;
        if (attempt >= this.maxRetries || !isRetryableError(err)) {
          throw err;
        }

        // Calculate Exponential Backoff with Jitter
        const exponentialWait = Math.min(
          this.maxBackoffMs,
          this.initialBackoffMs * Math.pow(2, attempt)
        );
        const jitter = Math.random() * (exponentialWait * 0.3);
        const totalDelay = exponentialWait + jitter;

        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }

    throw lastError;
  }
}
