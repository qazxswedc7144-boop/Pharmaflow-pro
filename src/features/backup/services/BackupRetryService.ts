import { RetryConfig } from '../backup.types';

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
  timeoutMs: 15000
};

export type OnRetryCallback = (attempt: number, error: Error, nextDelayMs: number) => void;

/**
 * Enterprise Retry & Reliability Service with Exponential Backoff
 * Handles transient network and cloud storage errors without leaking sensitive data.
 */
export class BackupRetryService {
  constructor(
    private readonly defaultConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
    private readonly sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  /**
   * Executes an asynchronous task with exponential backoff and per-attempt timeout.
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: {
      config?: Partial<RetryConfig>;
      onRetry?: OnRetryCallback;
      operationName?: string;
    }
  ): Promise<T> {
    const config: RetryConfig = {
      ...this.defaultConfig,
      ...(options?.config || {})
    };

    let lastError: Error = new Error('Unknown error during operation execution');
    let currentDelay = config.initialDelayMs;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(operation, config.timeoutMs);
        return result;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err?.message || err));

        if (attempt < config.maxAttempts) {
          const delayForThisAttempt = Math.min(currentDelay, config.maxDelayMs);
          if (options?.onRetry) {
            try {
              options.onRetry(attempt, lastError, delayForThisAttempt);
            } catch {
              // Ignore callback errors
            }
          }
          await this.sleepFn(delayForThisAttempt);
          currentDelay = Math.min(currentDelay * config.backoffMultiplier, config.maxDelayMs);
        }
      }
    }

    throw lastError;
  }

  /**
   * Wraps a promise with a timeout rejection.
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`انتهت مهلة العملية السحابية بعد (${timeoutMs / 1000} ثانية).`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([operation(), timeoutPromise]);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export const backupRetryService = new BackupRetryService();
