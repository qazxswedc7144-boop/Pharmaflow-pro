// src/features/purchases/services/smartImport/providers/circuitBreaker.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: Circuit Breaker for Resilient Provider Isolation
 */

import { CircuitBreakerConfig, ProviderHealthStatus } from './provider.types';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenSuccessThreshold: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold || 3;
    this.cooldownMs = config.cooldownMs || 15000;
    this.halfOpenSuccessThreshold = config.halfOpenSuccessThreshold || 1;
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      }
    }
    return this.state;
  }

  public getHealthStatus(): ProviderHealthStatus {
    const currentState = this.getState();
    if (currentState === 'OPEN') return 'CIRCUIT_OPEN';
    if (currentState === 'HALF_OPEN') return 'DEGRADED';
    return this.failureCount > 0 ? 'DEGRADED' : 'HEALTHY';
  }

  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  public recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  public isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  public canExecute(): boolean {
    return !this.isOpen();
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}
