/**
 * Chain Depth + Fan-Out Middleware
 * TLP:AMBER - Internal Use Only
 *
 * Enforces:
 *   1. Maximum delegation chain depth (default: 5)
 *   2. Maximum fan-out per delegator in a single session (default: 10)
 *
 * Both limits are configurable and gated by the `chain_tracking` feature flag.
 *
 * @module delegation/middleware/chain-depth-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { SecurityMiddleware, SecurityContext, SecurityVerdict, SecurityOperationType } from '../../types/security-middleware.js';

export interface ChainDepthMiddlewareOptions {
  /** Maximum delegation chain depth before blocking (inclusive). Default: 5 */
  maxDepth?: number;
  /** Maximum direct delegations from one agent in one session. Default: 10 */
  maxFanOut?: number;
}

export class ChainDepthMiddleware implements SecurityMiddleware {
  readonly name = 'chain-depth';
  readonly featureFlag = 'chain_tracking';
  readonly appliesTo: SecurityOperationType[] = ['create'];

  private readonly maxDepth: number;
  private readonly maxFanOut: number;

  /**
   * Per-delegator fan-out counter: agent_id → count of active delegations
   * Managed by contract-manager which calls `incrementFanOut` / `decrementFanOut`.
   */
  private readonly fanOutCounters = new Map<string, number>();

  constructor(options: ChainDepthMiddlewareOptions = {}) {
    this.maxDepth = options.maxDepth ?? 5;
    this.maxFanOut = options.maxFanOut ?? 10;
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const depth = context.contract.delegation_depth ?? 0;

    // Block if depth exceeds limit
    if (depth > this.maxDepth) {
      return {
        action: 'block',
        reason: `Delegation chain depth ${depth} exceeds maximum allowed depth of ${this.maxDepth}.`,
        threat_type: 'chain_depth_exceeded',
        severity: 'critical',
        evidence: { depth, max_depth: this.maxDepth },
      };
    }

    // Check fan-out for the delegating agent
    const delegatorId = context.delegator_auth?.agent_id ?? context.contract.delegator?.agent_id;
    if (delegatorId) {
      const current = this.fanOutCounters.get(delegatorId) ?? 0;
      if (current >= this.maxFanOut) {
        return {
          action: 'block',
          reason: `Agent '${delegatorId}' has reached the fan-out limit of ${this.maxFanOut} concurrent delegations.`,
          threat_type: 'fan_out_exceeded',
          severity: 'high',
          evidence: { delegator_id: delegatorId, current_fan_out: current, max_fan_out: this.maxFanOut },
        };
      }
    }

    return { action: 'allow' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fan-out counter management (called by contract-manager lifecycle hooks)
  // ──────────────────────────────────────────────────────────────────────────

  incrementFanOut(delegatorId: string): void {
    this.fanOutCounters.set(delegatorId, (this.fanOutCounters.get(delegatorId) ?? 0) + 1);
  }

  decrementFanOut(delegatorId: string): void {
    const current = this.fanOutCounters.get(delegatorId) ?? 0;
    if (current <= 1) {
      this.fanOutCounters.delete(delegatorId);
    } else {
      this.fanOutCounters.set(delegatorId, current - 1);
    }
  }

  getFanOut(delegatorId: string): number {
    return this.fanOutCounters.get(delegatorId) ?? 0;
  }
}
