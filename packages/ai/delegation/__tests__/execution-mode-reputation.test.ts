/**
 * Tests for ExecutionModeReputationAdjuster
 * Phase 6.6 — delegation-execution-modes
 */
import { describe, it, expect } from 'vitest';
import {
  ExecutionModeReputationAdjuster,
  MODE_DIMENSION_WEIGHTS,
  SCORE_DECAY_PER_30_DAYS,
} from '../../reputation/execution-mode-reputation.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { AgentReputation } from '../../reputation/reputation-engine.js';

const makeRep = (overrides: Partial<AgentReputation> = {}): AgentReputation => ({
  agent_id: 'test-agent',
  agent_name: 'Test Agent',
  confidence_score: 0.8,
  reliability_score: 0.8,
  speed_score: 0.7,
  quality_score: 0.9,
  security_score: 0.6,
  total_tasks: 10,
  successful_tasks: 9,
  failed_tasks: 1,
  success_rate: 0.9,
  avg_completion_time_ms: 5000,
  min_completion_time_ms: 1000,
  max_completion_time_ms: 10000,
  last_updated: new Date().toISOString(), // fresh = no decay
  ...overrides,
});

describe('ExecutionModeReputationAdjuster', () => {
  describe('computeAdjustedScore()', () => {
    it('returns undefined for unknown agent', () => {
      const adjuster = new ExecutionModeReputationAdjuster(() => undefined);
      expect(adjuster.computeAdjustedScore('unknown', ExecutionMode.INTERACTIVE)).toBeUndefined();
    });

    it('applies interactive weights (speed=40%, reliability=35%)', () => {
      const rep = makeRep();
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const score = adjuster.computeAdjustedScore('test-agent', ExecutionMode.INTERACTIVE)!;

      const weights = MODE_DIMENSION_WEIGHTS[ExecutionMode.INTERACTIVE];
      const expected =
        rep.reliability_score * weights.reliability +
        rep.speed_score * weights.speed +
        rep.quality_score * weights.quality +
        rep.security_score * weights.security;

      expect(score.adjustedScore).toBeCloseTo(expected, 5);
      expect(score.appliedWeights).toEqual(weights);
    });

    it('applies background weights (reliability=50%, quality=25%)', () => {
      const rep = makeRep();
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const score = adjuster.computeAdjustedScore('test-agent', ExecutionMode.BACKGROUND)!;

      const weights = MODE_DIMENSION_WEIGHTS[ExecutionMode.BACKGROUND];
      const expected =
        rep.reliability_score * weights.reliability +
        rep.speed_score * weights.speed +
        rep.quality_score * weights.quality +
        rep.security_score * weights.security;

      expect(score.adjustedScore).toBeCloseTo(expected, 5);
    });

    it('applies async weights (reliability=45%, quality=30%, security=15%)', () => {
      const rep = makeRep();
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const score = adjuster.computeAdjustedScore('test-agent', ExecutionMode.ASYNC)!;

      const weights = MODE_DIMENSION_WEIGHTS[ExecutionMode.ASYNC];
      const expected =
        rep.reliability_score * weights.reliability +
        rep.speed_score * weights.speed +
        rep.quality_score * weights.quality +
        rep.security_score * weights.security;

      expect(score.adjustedScore).toBeCloseTo(expected, 5);
    });

    it('decay factor is 1.0 for a fresh last_updated timestamp', () => {
      const rep = makeRep({ last_updated: new Date().toISOString() });
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const score = adjuster.computeAdjustedScore('test-agent', ExecutionMode.INTERACTIVE)!;
      expect(score.decayFactor).toBeCloseTo(1.0, 2);
    });

    it('decay factor is <1.0 for an old last_updated timestamp', () => {
      // 90 days ago
      const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const rep = makeRep({ last_updated: old });
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const score = adjuster.computeAdjustedScore('test-agent', ExecutionMode.BACKGROUND)!;

      // Expected: (1 - 0.05)^3 ≈ 0.857
      const expectedDecay = Math.pow(1 - SCORE_DECAY_PER_30_DAYS, 3);
      expect(score.decayFactor).toBeCloseTo(expectedDecay, 2);
    });

    it('decay is clamped to a minimum of 0.5', () => {
      // 1000 days ago — would decay far below 0.5
      const veryOld = new Date(Date.now() - 1000 * 24 * 60 * 60 * 1000).toISOString();
      const rep = makeRep({ last_updated: veryOld });
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const score = adjuster.computeAdjustedScore('test-agent', ExecutionMode.INTERACTIVE)!;
      expect(score.decayFactor).toBeGreaterThanOrEqual(0.5);
    });

    it('effectiveScore = adjustedScore * decayFactor', () => {
      const rep = makeRep();
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const score = adjuster.computeAdjustedScore('test-agent', ExecutionMode.INTERACTIVE)!;
      expect(score.effectiveScore).toBeCloseTo(score.adjustedScore * score.decayFactor, 5);
    });
  });

  describe('computeAllModes()', () => {
    it('returns scores for all three modes', () => {
      const rep = makeRep();
      const adjuster = new ExecutionModeReputationAdjuster(() => rep);
      const all = adjuster.computeAllModes('test-agent');

      expect(all[ExecutionMode.INTERACTIVE]).toBeDefined();
      expect(all[ExecutionMode.BACKGROUND]).toBeDefined();
      expect(all[ExecutionMode.ASYNC]).toBeDefined();
    });

    it('returns undefined for each mode when agent is unknown', () => {
      const adjuster = new ExecutionModeReputationAdjuster(() => undefined);
      const all = adjuster.computeAllModes('unknown');

      expect(all[ExecutionMode.INTERACTIVE]).toBeUndefined();
      expect(all[ExecutionMode.BACKGROUND]).toBeUndefined();
      expect(all[ExecutionMode.ASYNC]).toBeUndefined();
    });
  });

  describe('rankByMode()', () => {
    it('orders agents descending by effectiveScore', () => {
      const reps: Record<string, AgentReputation> = {
        'low-agent':  makeRep({ agent_id: 'low-agent',  agent_name: 'Low',  reliability_score: 0.3, speed_score: 0.3, quality_score: 0.3, security_score: 0.3 }),
        'high-agent': makeRep({ agent_id: 'high-agent', agent_name: 'High', reliability_score: 0.9, speed_score: 0.9, quality_score: 0.9, security_score: 0.9 }),
        'mid-agent':  makeRep({ agent_id: 'mid-agent',  agent_name: 'Mid',  reliability_score: 0.6, speed_score: 0.6, quality_score: 0.6, security_score: 0.6 }),
      };
      const adjuster = new ExecutionModeReputationAdjuster((id) => reps[id]);
      const ranked = adjuster.rankByMode(Object.keys(reps), ExecutionMode.INTERACTIVE);

      expect(ranked[0].agentId).toBe('high-agent');
      expect(ranked[ranked.length - 1].agentId).toBe('low-agent');
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score.effectiveScore).toBeGreaterThanOrEqual(ranked[i].score.effectiveScore);
      }
    });

    it('excludes agents with no reputation', () => {
      const rep = makeRep({ agent_id: 'known' });
      const adjuster = new ExecutionModeReputationAdjuster((id) => (id === 'known' ? rep : undefined));
      const ranked = adjuster.rankByMode(['known', 'unknown'], ExecutionMode.INTERACTIVE);

      expect(ranked.map((r) => r.agentId)).toContain('known');
      expect(ranked.map((r) => r.agentId)).not.toContain('unknown');
    });
  });
});
