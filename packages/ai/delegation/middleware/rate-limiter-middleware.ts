/**
 * Rate Limiter Middleware — per-agent sliding window
 * TLP:AMBER - Internal Use Only
 *
 * Limits how many delegation operations an agent can initiate per hour.
 * Uses a simple in-memory sliding-window algorithm.
 *
 * Default limit: 50 contract-creates per agent per hour.
 *
 * @module delegation/middleware/rate-limiter-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { SecurityMiddleware, SecurityContext, SecurityVerdict, SecurityOperationType } from '../../types/security-middleware.js';

export interface RateLimiterOptions {
  /** Max operations per window. Default: 50 */
  maxOps?: number;
  /** Window size in ms. Default: 3_600_000 (1 hour) */
  windowMs?: number;
  /** Operations to rate-limit. Default: ['create'] */
  appliesTo?: SecurityOperationType[];
}

export class RateLimiterMiddleware implements SecurityMiddleware {
  readonly name = 'rate-limiter';
  readonly featureFlag = 'security_monitoring';
  readonly appliesTo: SecurityOperationType[];

  private readonly maxOps: number;
  private readonly windowMs: number;

  /** agent_id → sorted array of operation timestamps */
  private readonly windows = new Map<string, number[]>();

  constructor(options: RateLimiterOptions = {}) {
    this.maxOps = options.maxOps ?? 50;
    this.windowMs = options.windowMs ?? 3_600_000;
    this.appliesTo = options.appliesTo ?? ['create'];
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const agentId = context.delegator_auth?.agent_id ?? context.contract.delegator?.agent_id;
    if (!agentId) return { action: 'allow' };

    const now = context.timestamp_ms ?? Date.now();
    const cutoff = now - this.windowMs;

    // Prune old timestamps
    const ts = this.windows.get(agentId) ?? [];
    const fresh = ts.filter(t => t > cutoff);

    if (fresh.length >= this.maxOps) {
      return {
        action: 'block',
        reason: `Agent '${agentId}' has exceeded the rate limit of ${this.maxOps} operations per ${this.windowMs / 1000}s.`,
        threat_type: 'rate_limit_exceeded',
        severity: 'high',
        evidence: {
          agent_id: agentId,
          operations_in_window: fresh.length,
          limit: this.maxOps,
          window_ms: this.windowMs,
        },
      };
    }

    // Record this operation
    fresh.push(now);
    this.windows.set(agentId, fresh);

    return { action: 'allow' };
  }

  /** Exposed for testing and instrumentation */
  getWindowCount(agentId: string, nowMs = Date.now()): number {
    const cutoff = nowMs - this.windowMs;
    return (this.windows.get(agentId) ?? []).filter(t => t > cutoff).length;
  }

  /** Reset counter for an agent (e.g. after ban lifted) */
  reset(agentId: string): void {
    this.windows.delete(agentId);
  }
}
