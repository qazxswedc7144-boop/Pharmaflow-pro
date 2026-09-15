import { observabilityService } from '@/core/observability/observabilityService';

export type IntegrityEventType =
  | 'IDEMPOTENCY_CONFLICT'
  | 'DOUBLE_POSTING_BLOCKED'
  | 'INCONSISTENCY_DETECTED'
  | 'REPAIR_EXECUTED'
  | 'OPERATION_RECOVERED'
  | 'TRANSACTION_ROLLED_BACK';

export interface IntegrityEventData {
  type: IntegrityEventType;
  tenantId?: string;
  branchId?: string;
  operationId?: string;
  idempotencyKey?: string;
  details: Record<string, any>;
  timestamp?: string;
}

export class IntegrityEventBus {
  private static listeners: Array<(event: IntegrityEventData) => void> = [];

  public static subscribe(listener: (event: IntegrityEventData) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static publish(type: IntegrityEventType, details: Record<string, any>, context?: { tenantId?: string; branchId?: string; operationId?: string; idempotencyKey?: string }): void {
    const event: IntegrityEventData = {
      type,
      tenantId: context?.tenantId || 'default',
      branchId: context?.branchId || 'main',
      operationId: context?.operationId,
      idempotencyKey: context?.idempotencyKey,
      details,
      timestamp: new Date().toISOString()
    };

    // 1. Notify local subscribers
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[IntegrityEventBus] Subscriber error:', err);
      }
    }

    // 2. Integration with Phase 3.4.6 Observability Core
    observabilityService
      .recordInfo(
        `[IntegrityEvent] ${type}`,
        { feature: 'INTEGRITY' },
        { ...event.details, tenantId: event.tenantId, branchId: event.branchId, idempotencyKey: event.idempotencyKey }
      )
      .catch(() => {});
  }
}
