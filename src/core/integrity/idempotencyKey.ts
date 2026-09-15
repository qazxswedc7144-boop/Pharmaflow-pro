import { IdempotencyKeyParams } from './types';

/**
 * Standardized Idempotency Key Formatter & Business Fingerprint Generator
 */
export class IdempotencyKeyBuilder {
  /**
   * Formats a fully qualified, multi-tenant & branch-isolated Idempotency Key
   * Standard: tenantId:branchId:operationType:entityType:entityId:requestFingerprint
   */
  public static buildKey(params: IdempotencyKeyParams): string {
    const tenant = (params.tenantId || 'default').trim();
    const branch = (params.branchId || 'main').trim();
    const op = (params.operationType || 'unknown').trim();
    const entity = (params.entityType || 'entity').trim();
    const id = (params.entityId || 'new').trim();
    const fp = (params.requestFingerprint || 'nofp').trim();

    return `tenant:${tenant}|branch:${branch}|op:${op}|entity:${entity}|id:${id}|fp:${fp}`;
  }

  /**
   * Parses a formatted Idempotency Key into its constituent parts
   */
  public static parseKey(key: string): Partial<IdempotencyKeyParams> {
    const parts = key.split('|');
    const result: Partial<IdempotencyKeyParams> = {};

    for (const part of parts) {
      const [k, v] = part.split(':');
      if (!k || !v) continue;
      if (k === 'tenant') result.tenantId = v;
      if (k === 'branch') result.branchId = v;
      if (k === 'op') result.operationType = v;
      if (k === 'entity') result.entityType = v;
      if (k === 'id') result.entityId = v;
      if (k === 'fp') result.requestFingerprint = v;
    }

    return result;
  }

  /**
   * Generates a deterministic business fingerprint based ONLY on intrinsic business payload data.
   * Strips dynamic UI noise like buttonState, modalOpen, screenWidth, raw local system timestamps (unless business date), etc.
   */
  public static generateFingerprint(operationType: string, payload: any): string {
    if (!payload || typeof payload !== 'object') {
      return this.simpleHash(String(payload || 'empty'));
    }

    const normalized = this.extractBusinessPayload(operationType, payload);
    const jsonStr = JSON.stringify(normalized, Object.keys(normalized).sort());
    return this.simpleHash(jsonStr);
  }

  /**
   * Extracts essential business fields based on operation type
   */
  private static extractBusinessPayload(operationType: string, payload: any): Record<string, any> {
    const op = operationType.toLowerCase();

    // Sales Invoice / Sale Return
    if (op.includes('sale')) {
      return {
        customerId: payload.customerId || payload.partnerId || 'cash',
        total: Number(payload.total || payload.amount || 0).toFixed(2),
        currency: payload.currency || 'USD',
        isReturn: Boolean(payload.isReturn || op.includes('return')),
        items: Array.isArray(payload.items)
          ? payload.items
              .map((item: any) => ({
                id: item.productId || item.id || item.name,
                name: String(item.name || '').trim(),
                qty: Number(item.quantity || item.qty || 0),
                price: Number(item.price || item.unitPrice || 0).toFixed(2)
              }))
              .sort((a: any, b: any) => a.id.localeCompare(b.id))
          : []
      };
    }

    // Purchase Invoice / Purchase Return
    if (op.includes('purchase')) {
      return {
        supplierId: payload.supplierId || payload.partnerId || 'cash',
        total: Number(payload.total || payload.amount || 0).toFixed(2),
        currency: payload.currency || 'USD',
        isReturn: Boolean(payload.isReturn || op.includes('return')),
        items: Array.isArray(payload.items)
          ? payload.items
              .map((item: any) => ({
                id: item.productId || item.id || item.name,
                name: String(item.name || '').trim(),
                qty: Number(item.quantity || item.qty || 0),
                price: Number(item.price || item.unitPrice || 0).toFixed(2)
              }))
              .sort((a: any, b: any) => a.id.localeCompare(b.id))
          : []
      };
    }

    // Payment / Receipt Vouchers
    if (op.includes('payment') || op.includes('receipt') || op.includes('voucher')) {
      return {
        partnerId: payload.partnerId || payload.supplierId || payload.customerId || '',
        amount: Number(payload.amount || payload.total || 0).toFixed(2),
        paymentMethod: payload.paymentMethod || 'CASH',
        notes: String(payload.notes || '').trim()
      };
    }

    // Inventory Adjustment
    if (op.includes('adjustment') || op.includes('inventory')) {
      return {
        productId: payload.productId,
        warehouseId: payload.warehouseId || payload.branchId,
        actualQty: Number(payload.actualQty || 0),
        diff: Number(payload.diff || 0)
      };
    }

    // Generic fallback: scrub common UI noise keys
    const scrubbed: Record<string, any> = {};
    const ignoreKeys = new Set([
      'buttonState', 'modalOpen', 'screenWidth', 'screenHeight',
      'uiTimestamp', 'hoverState', 'activeTab', 'loading', 'isSubmitting',
      'attachmentPreview', 'clientTimestamp'
    ]);

    for (const [key, val] of Object.entries(payload)) {
      if (!ignoreKeys.has(key) && val !== undefined && typeof val !== 'function') {
        scrubbed[key] = val;
      }
    }
    return scrubbed;
  }

  /**
   * Fast, reliable FNV-1a non-cryptographic hash for fingerprint string generation
   */
  private static simpleHash(str: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
