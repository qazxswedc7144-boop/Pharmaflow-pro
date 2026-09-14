/**
 * PharmaFlow AI Usage Tracker & Audit Service
 * Tracks token consumption, latency, user context, and safety block events.
 */

import { AIUsageLog } from './types';

class AIUsageTrackerService {
  private logs: AIUsageLog[] = [];
  private readonly MAX_LOGS_MEMORY = 500;

  /**
   * Records an AI execution attempt (success, blocked, or error).
   */
  public logUsage(logEntry: Omit<AIUsageLog, 'id' | 'timestamp'>): AIUsageLog {
    const fullLog: AIUsageLog = {
      ...logEntry,
      id: `ai_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    this.logs.unshift(fullLog);

    if (this.logs.length > this.MAX_LOGS_MEMORY) {
      this.logs.pop();
    }

    // Console logging for audit compliance
    if (fullLog.status === 'blocked' || fullLog.status === 'error') {
      console.warn(`[AI Usage Tracker Warning] Status: ${fullLog.status} | User: ${fullLog.userId} | Error/Reason: ${fullLog.errorMessage}`);
    } else {
      console.log(`[AI Usage Tracker] Model: ${fullLog.model} | Tokens: ${fullLog.promptTokens + fullLog.completionTokens} | Latency: ${fullLog.latencyMs}ms`);
    }

    return fullLog;
  }

  /**
   * Get recent usage logs for monitoring dashboard.
   */
  public getLogs(limit: number = 50): AIUsageLog[] {
    return this.logs.slice(0, limit);
  }

  /**
   * Get aggregated stats for AI token consumption.
   */
  public getUsageSummary(userId?: string): {
    totalRequests: number;
    totalTokens: number;
    averageLatencyMs: number;
    blockedCount: number;
  } {
    const filtered = userId ? this.logs.filter(l => l.userId === userId) : this.logs;
    const totalRequests = filtered.length;
    if (totalRequests === 0) {
      return { totalRequests: 0, totalTokens: 0, averageLatencyMs: 0, blockedCount: 0 };
    }

    const totalTokens = filtered.reduce((acc, curr) => acc + curr.promptTokens + curr.completionTokens, 0);
    const totalLatency = filtered.reduce((acc, curr) => acc + curr.latencyMs, 0);
    const blockedCount = filtered.filter(l => l.status === 'blocked').length;

    return {
      totalRequests,
      totalTokens,
      averageLatencyMs: Math.round(totalLatency / totalRequests),
      blockedCount,
    };
  }
}

export const AIUsageTracker = new AIUsageTrackerService();
