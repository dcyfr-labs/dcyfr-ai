/**
 * Execution Mode Reputation Adjuster
 * TLP:AMBER - Internal Use Only
 *
 * Provides mode-specific dimension weighting on top of the existing
 * `ReputationEngine`. Each execution mode has different performance criteria:
 *
 * | Mode        | Reliability | Speed | Quality | Security |
 * |-------------|-------------|-------|---------|----------|
 * | interactive | 35%         | 40%   | 15%     | 10%      |
 * | background  | 50%         | 15%   | 25%     | 10%      |
 * | async       | 45%         | 10%   | 30%     | 15%      |
 *
 * Additionally, unused-mode scores decay at 5% per 30 days.
 *
 * @module reputation/execution-mode-reputation
 * @version 1.0.0
 */

import type { AgentReputation } from './reputation-engine.js';
import { ExecutionMode } from '../types/agent-capabilities.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mode-specific dimension weights
// ─────────────────────────────────────────────────────────────────────────────

/** Weights for each reputation dimension, by execution mode. */
export const MODE_DIMENSION_WEIGHTS: Record<
  ExecutionMode,
  { reliability: number; speed: number; quality: number; security: number }
> = {
  [ExecutionMode.INTERACTIVE]: {
    reliability: 0.35,
    speed: 0.40,
    quality: 0.15,
    security: 0.10,
  },
  [ExecutionMode.BACKGROUND]: {
    reliability: 0.50,
    speed: 0.15,
    quality: 0.25,
    security: 0.10,
  },
  [ExecutionMode.ASYNC]: {
    reliability: 0.45,
    speed: 0.10,
    quality: 0.30,
    security: 0.15,
  },
};

/** Score decay constant: 5% per 30-day period. */
export const SCORE_DECAY_PER_30_DAYS = 0.05;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Mode-specific score view for a single agent. */
export interface ModeAdjustedScore {
  agentId: string;
  executionMode: ExecutionMode;
  /** Reweighted overall score (0–1). */
  adjustedScore: number;
  /** Dimension breakdown (raw, before weighting). */
  dimensions: {
    reliability: number;
    speed: number;
    quality: number;
    security: number;
  };
  /** Weights applied for this mode. */
  appliedWeights: {
    reliability: number;
    speed: number;
    quality: number;
    security: number;
  };
  /** Decay factor applied based on last-updated timestamp vs now. */
  decayFactor: number;
  /** Effective (decayed) adjusted score. */
  effectiveScore: number;
  /** ISO 8601 */
  computedAt: string;
}

/** Function type for querying a base reputation record. */
export type ReputationGetter = (agentId: string) => AgentReputation | undefined | null;

// ─────────────────────────────────────────────────────────────────────────────
// ExecutionModeReputationAdjuster
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes mode-specific adjusted reputation scores on top of base `AgentReputation`.
 *
 * This class is intentionally stateless — all computation is derived from
 * the base reputation record at query time. No separate persistence needed.
 *
 * Usage:
 * ```ts
 * const adjuster = new ExecutionModeReputationAdjuster(reputationEngine.getScore.bind(reputationEngine));
 * const score = adjuster.computeAdjustedScore('security-engineer', ExecutionMode.INTERACTIVE);
 * ```
 */
export class ExecutionModeReputationAdjuster {
  constructor(private readonly getReputation: ReputationGetter) {}

  /**
   * Compute the mode-adjusted score for a given agent.
   *
   * @returns `undefined` if no reputation record exists for the agent.
   */
  computeAdjustedScore(
    agentId: string,
    mode: ExecutionMode,
  ): ModeAdjustedScore | undefined {
    const rep = this.getReputation(agentId);
    if (!rep) return undefined;

    const weights = MODE_DIMENSION_WEIGHTS[mode];
    const dimensions = {
      reliability: rep.reliability_score,
      speed: rep.speed_score,
      quality: rep.quality_score,
      security: rep.security_score,
    };

    const adjustedScore =
      dimensions.reliability * weights.reliability +
      dimensions.speed * weights.speed +
      dimensions.quality * weights.quality +
      dimensions.security * weights.security;

    // Compute decay: 5% per 30 days since last_updated
    const decayFactor = this._computeDecay(rep.last_updated);

    return {
      agentId,
      executionMode: mode,
      adjustedScore,
      dimensions,
      appliedWeights: weights,
      decayFactor,
      effectiveScore: adjustedScore * decayFactor,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Compute adjusted scores for all three execution modes for a given agent.
   */
  computeAllModes(agentId: string): Record<ExecutionMode, ModeAdjustedScore | undefined> {
    return {
      [ExecutionMode.INTERACTIVE]: this.computeAdjustedScore(agentId, ExecutionMode.INTERACTIVE),
      [ExecutionMode.BACKGROUND]: this.computeAdjustedScore(agentId, ExecutionMode.BACKGROUND),
      [ExecutionMode.ASYNC]: this.computeAdjustedScore(agentId, ExecutionMode.ASYNC),
    };
  }

  /**
   * Rank a list of agents by their mode-adjusted score for the given mode.
   *
   * @param agentIds - List of agent IDs to rank.
   * @param mode     - Execution mode to rank for.
   * @returns Agents sorted by `effectiveScore` descending, with their scores.
   */
  rankByMode(
    agentIds: string[],
    mode: ExecutionMode,
  ): Array<{ agentId: string; score: ModeAdjustedScore }> {
    const scored = agentIds
      .map((id) => ({ agentId: id, score: this.computeAdjustedScore(id, mode) }))
      .filter((x): x is { agentId: string; score: ModeAdjustedScore } => x.score !== undefined);

    scored.sort((a, b) => b.score.effectiveScore - a.score.effectiveScore);
    return scored;
  }

  /**
   * Compute the decay factor given a `last_updated` ISO timestamp.
   *
   * Decay = (1 - SCORE_DECAY_PER_30_DAYS) ^ (daysSinceUpdate / 30)
   *
   * Clamped to [0.5, 1.0] — a score never decays below 50%.
   */
  private _computeDecay(lastUpdated: string): number {
    const MS_PER_DAY = 86_400_000;
    const now = Date.now();
    const last = new Date(lastUpdated).getTime();
    if (Number.isNaN(last)) return 1.0;

    const daysSince = Math.max(0, (now - last) / MS_PER_DAY);
    const periods = daysSince / 30;
    const decay = Math.pow(1 - SCORE_DECAY_PER_30_DAYS, periods);
    return Math.max(0.5, Math.min(1.0, decay));
  }
}
