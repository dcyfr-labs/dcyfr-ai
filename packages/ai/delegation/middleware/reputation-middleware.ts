/**
 * DCYFR Reputation Middleware
 * TLP:CLEAR
 *
 * SecurityMiddleware that consults the ReputationEngine to block low-reputation
 * agents from handling TLP:AMBER+ tasks.  Agents with a reliability_score below
 * the configured threshold (default 0.5) are rejected for sensitive tasks.
 *
 * @module delegation/middleware/reputation-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { ReputationEngine } from '../../reputation/reputation-engine.js';
import type {
  SecurityMiddleware,
  SecurityContext,
  SecurityVerdict,
  SecurityOperationType,
} from '../../types/security-middleware.js';

/** TLP levels that trigger reputation enforcement (AMBER and above) */
const SENSITIVE_TLP_LEVELS = new Set(['AMBER', 'RED', 'TLP:AMBER', 'TLP:RED']);

export interface ReputationMiddlewareConfig {
  /** Minimum reliability_score required for TLP:AMBER+ tasks. Default: 0.5 */
  minScoreForSensitiveTasks?: number;
  /** Whether to block or warn on reputation check failure. Default: 'block' */
  failureAction?: 'block' | 'warn';
}

/**
 * ReputationMiddleware — guards TLP:AMBER+ tasks against low-reputation agents.
 *
 * Skips enforcement when:
 * - `reputation_tracking` feature flag is `false`
 * - TLP classification is CLEAR
 * - No reputation data exists for the agent (benefit of the doubt on first tasks)
 */
export class ReputationMiddleware implements SecurityMiddleware {
  readonly name = 'reputation';
  readonly featureFlag = 'reputation_tracking';
  readonly appliesTo: SecurityOperationType[] = ['create'];

  private readonly engine: ReputationEngine;
  private readonly minScore: number;
  private readonly failureAction: 'block' | 'warn';

  constructor(engine: ReputationEngine, config: ReputationMiddlewareConfig = {}) {
    this.engine = engine;
    this.minScore = config.minScoreForSensitiveTasks ?? 0.5;
    this.failureAction = config.failureAction ?? 'block';
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const tlp = context.contract.tlp_classification as string | undefined;

    // Only enforce for AMBER+ tasks
    if (!tlp || !SENSITIVE_TLP_LEVELS.has(tlp)) {
      return { action: 'allow' };
    }

    const delegateeId = context.contract.delegatee?.agent_id;
    const delegateeName = context.contract.delegatee?.agent_name ?? delegateeId ?? 'unknown';

    if (!delegateeId) {
      return { action: 'allow' };
    }

    const reputation = await this.engine.getReputation(delegateeId);

    // No reputation yet — allow (first-task benefit of the doubt)
    if (!reputation) {
      return { action: 'allow' };
    }

    const score = reputation.reliability_score;

    if (score < this.minScore) {
      const reason = (
        `Agent '${delegateeName}' has insufficient reliability score ` +
        `(${score.toFixed(2)} < ${this.minScore}) for ${tlp} task`
      );

      if (this.failureAction === 'warn') {
        return {
          action: 'warn',
          threat_type: 'reputation_gaming',
          severity: 'high',
          reason,
          evidence: { agent_id: delegateeId, score, threshold: this.minScore, tlp },
        };
      }

      return {
        action: 'block',
        threat_type: 'reputation_gaming',
        severity: 'high',
        reason,
        evidence: { agent_id: delegateeId, score, threshold: this.minScore, tlp },
      };
    }

    return { action: 'allow' };
  }
}
