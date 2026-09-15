// src/core/observability/correlation.ts

let activeCorrelationId: string | null = null;
let activeOperationId: string | null = null;

/**
 * Generates a standard UUID v4 or random hex string for tracing operations.
 */
export function generateCorrelationId(prefix: string = 'corr'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

export function generateOperationId(prefix: string = 'op'): string {
  return generateCorrelationId(prefix);
}

export function generateRequestId(prefix: string = 'req'): string {
  return generateCorrelationId(prefix);
}

/**
 * Gets current active correlation ID, or generates a new one if not set.
 */
export function getActiveCorrelationId(): string {
  if (!activeCorrelationId) {
    activeCorrelationId = generateCorrelationId();
  }
  return activeCorrelationId;
}

/**
 * Sets current active correlation ID manually.
 */
export function setActiveCorrelationId(correlationId: string | null): void {
  activeCorrelationId = correlationId;
}

/**
 * Executes an async callback within a scoped correlation context.
 */
export async function runWithCorrelationContext<T>(
  correlationId: string,
  callback: () => Promise<T>,
  operationId?: string
): Promise<T> {
  const previousCorr = activeCorrelationId;
  const previousOp = activeOperationId;

  activeCorrelationId = correlationId;
  if (operationId) {
    activeOperationId = operationId;
  }

  try {
    return await callback();
  } finally {
    activeCorrelationId = previousCorr;
    activeOperationId = previousOp;
  }
}
