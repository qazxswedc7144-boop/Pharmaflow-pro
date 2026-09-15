// server/modules/sync/version-vector.ts
// Phase 5 — Distributed Version Vector & Causality Engine
// Mathematically rigorous causality tracking for multi-device concurrent operations

import { VersionVector } from "./sync.types";

export type VectorRelation = "EQUAL" | "DOMINATES" | "DOMINATED_BY" | "CONCURRENT";

export class VersionVectorEngine {
  /**
   * Creates an empty version vector or initializes from seed
   */
  static create(seed?: Record<string, number>): VersionVector {
    return { ...(seed || {}) };
  }

  /**
   * Increments the vector counter for a specific device/replica
   */
  static increment(vector: VersionVector, deviceId: string): VersionVector {
    const current = vector[deviceId] || 0;
    return {
      ...vector,
      [deviceId]: current + 1
    };
  }

  /**
   * Compares two version vectors to determine causal order:
   * - EQUAL: both vectors have identical counters
   * - DOMINATES: v1 is causally after v2 (v1 >= v2 for all components, and v1 > v2 for at least one)
   * - DOMINATED_BY: v1 is causally before v2 (v1 <= v2 for all components, and v1 < v2 for at least one)
   * - CONCURRENT: neither dominates the other (concurrent independent updates)
   */
  static compare(v1: VersionVector = {}, v2: VersionVector = {}): VectorRelation {
    const allKeys = new Set([...Object.keys(v1), ...Object.keys(v2)]);
    
    let hasGreater = false;
    let hasLesser = false;

    for (const key of allKeys) {
      const val1 = v1[key] || 0;
      const val2 = v2[key] || 0;

      if (val1 > val2) {
        hasGreater = true;
      } else if (val1 < val2) {
        hasLesser = true;
      }
    }

    if (hasGreater && hasLesser) {
      return "CONCURRENT";
    }
    if (hasGreater && !hasLesser) {
      return "DOMINATES";
    }
    if (!hasGreater && hasLesser) {
      return "DOMINATED_BY";
    }
    return "EQUAL";
  }

  /**
   * Checks if two version vectors represent concurrent, uncoordinated mutations
   */
  static isConcurrent(v1: VersionVector = {}, v2: VersionVector = {}): boolean {
    return this.compare(v1, v2) === "CONCURRENT";
  }

  static areConcurrent(v1: VersionVector = {}, v2: VersionVector = {}): boolean {
    return this.isConcurrent(v1, v2);
  }

  /**
   * Merges two version vectors by taking the component-wise maximum counter for each device
   */
  static merge(v1: VersionVector = {}, v2: VersionVector = {}): VersionVector {
    const merged: VersionVector = { ...v1 };
    for (const [key, val] of Object.entries(v2)) {
      merged[key] = Math.max(merged[key] || 0, val);
    }
    return merged;
  }

  /**
   * Clones a version vector safely
   */
  static clone(vector: VersionVector): VersionVector {
    return { ...vector };
  }
}
