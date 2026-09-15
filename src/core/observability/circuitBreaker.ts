// src/core/observability/circuitBreaker.ts

import { CircuitBreakerState } from './types';
import { observabilityEvents } from './observabilityEvents';

export class CircuitBreakerOpenError extends Error {
  public serviceName: string;
  public state: CircuitBreakerState;

  constructor(serviceName: string) {
    super(`[CircuitBreaker] Service '${serviceName}' is currently unavailable (Circuit OPEN). Action rejected to protect system stability.`);
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
    this.state = 'OPEN';
  }
}

export interface CircuitBreakerOptions {
  serviceName: string;
  failureThreshold?: number; // Failures before opening circuit (default 3)
  recoveryTimeoutMs?: number; // Time in OPEN state before trying HALF_OPEN (default 30000ms)
  successThresholdHalfOpen?: number; // Successes in HALF_OPEN to close circuit (default 2)
}

export class CircuitBreaker {
  public readonly serviceName: string;
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastStateChangeTimestamp: number = Date.now();

  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly successThresholdHalfOpen: number;

  constructor(options: CircuitBreakerOptions) {
    this.serviceName = options.serviceName;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30000;
    this.successThresholdHalfOpen = options.successThresholdHalfOpen ?? 2;
  }

  public getState(): CircuitBreakerState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastStateChangeTimestamp >= this.recoveryTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
    return this.state;
  }

  /**
   * Executes a protected action through the Circuit Breaker.
   * If OPEN, throws CircuitBreakerOpenError immediately (HONEST FAILURE - ZERO MOCK DATA).
   */
  public async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      throw new CircuitBreakerOpenError(this.serviceName);
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      // Re-throw CircuitBreakerOpenError without counting it as internal failure
      if (error instanceof CircuitBreakerOpenError) {
        throw error;
      }
      this.onFailure(error);
      throw error;
    }
  }

  public onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThresholdHalfOpen) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  public onFailure(_error: any): void {
    this.failureCount++;
    this.lastStateChangeTimestamp = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  public reset(): void {
    this.transitionTo('CLOSED');
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.lastStateChangeTimestamp = Date.now();

      if (newState === 'CLOSED') {
        this.failureCount = 0;
        this.successCount = 0;
      } else if (newState === 'HALF_OPEN') {
        this.successCount = 0;
      }

      observabilityEvents.emit({
        type: 'CIRCUIT_BREAKER',
        serviceName: this.serviceName,
        state: this.state,
        failureCount: this.failureCount
      });
    }
  }
}

class CircuitBreakerRegistry {
  private registry: Map<string, CircuitBreaker> = new Map();

  public get(serviceName: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.registry.has(serviceName)) {
      this.registry.set(
        serviceName,
        new CircuitBreaker({
          serviceName,
          ...options
        })
      );
    }
    return this.registry.get(serviceName)!;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
