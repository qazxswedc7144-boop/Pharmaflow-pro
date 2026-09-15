// src/core/observability/observabilityContext.ts

import { ObservabilityContext } from './types';
import { getActiveCorrelationId, generateOperationId, generateRequestId } from './correlation';
import { getCurrentUserSession } from '@/core/db';
import { configurationService } from '@/services/config/configurationService';

/**
 * Builds standard ObservabilityContext using consolidated sources of truth.
 */
export function createObservabilityContext(
  overrides?: Partial<ObservabilityContext>
): ObservabilityContext {
  const session = getCurrentUserSession();

  let deviceId = configurationService.getSync<string>('device.uuid') || 'DEV-LOCAL-01';

  return {
    correlationId: overrides?.correlationId || getActiveCorrelationId(),
    operationId: overrides?.operationId || generateOperationId(),
    requestId: overrides?.requestId || generateRequestId(),
    tenantId: overrides?.tenantId || session.tenantId || 'default-tenant',
    branchId: overrides?.branchId !== undefined ? overrides.branchId : session.branchId,
    userId: overrides?.userId || session.userId || 'default-user',
    deviceId: overrides?.deviceId || deviceId,
    feature: overrides?.feature || 'GENERAL',
    workflow: overrides?.workflow,
    timestamp: overrides?.timestamp || new Date().toISOString()
  };
}
