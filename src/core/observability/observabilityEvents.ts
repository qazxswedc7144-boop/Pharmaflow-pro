// src/core/observability/observabilityEvents.ts

import { ObservabilityEventPayload, SystemHealthStatus, SystemOperatingMode } from './types';

type EventCallback = (event: ObservabilityEventPayload) => void;
type HealthCallback = (status: SystemHealthStatus, mode: SystemOperatingMode) => void;

class ObservabilityEventEmitter {
  private eventListeners: Set<EventCallback> = new Set();
  private healthListeners: Set<HealthCallback> = new Set();

  public subscribe(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  public subscribeHealth(callback: HealthCallback): () => void {
    this.healthListeners.add(callback);
    return () => {
      this.healthListeners.delete(callback);
    };
  }

  public emit(event: ObservabilityEventPayload): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('[ObservabilityEvents] Error in event listener:', err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('PHARMAFLOW_OBSERVABILITY_EVENT', { detail: event }));
    }
  }

  public emitHealthChange(status: SystemHealthStatus, mode: SystemOperatingMode): void {
    this.healthListeners.forEach(listener => {
      try {
        listener(status, mode);
      } catch (err) {
        console.error('[ObservabilityEvents] Error in health listener:', err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('PHARMAFLOW_HEALTH_CHANGED', { detail: { status, mode } }));
    }
  }
}

export const observabilityEvents = new ObservabilityEventEmitter();
