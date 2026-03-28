/**
 * Cross-Domain Transfer Evaluation tests — tasks 3.1, 3.2, 3.3
 * TLP:AMBER - Internal Use Only
 *
 * Covers:
 *   3.1 — Contract and type validation (source/target domain, transfer score schema)
 *   3.2 — Gate logic: threshold success, regression budget exceeded, blocking failures
 *   3.3 — Baseline benchmark fixture integration
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateTransfer,
  TransferEvaluationError,
  SCORING_STRATEGY_DOMAIN,
  DELEGATION_THRESHOLDS_DOMAIN,
  SCORING_STRATEGY_BASELINES,
  DELEGATION_THRESHOLDS_BASELINES,
} from '../transfer.js';
import type {
  BenchmarkRunner,
  TransferEvaluationInput,
  DomainDefinition,
  BaselineRecord,
} from '../transfer.js';
import type { ImprovementProposal } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let seq = 0;
const nextId = () => `tr-test-${++seq}`;

function makeProposal(overrides: Partial<ImprovementProposal> = {}): ImprovementProposal {
  return {
    proposal_id: nextId(),
    source_snapshot_id: 'snap-src',
    proposed_changes: {
      parameter_changes: [{ path: 'parameters.threshold', previous_value: 0.7, proposed_value: 0.8 }],
      description: 'Raise threshold',
    },
    rationale: 'Benchmarks show improvement',
    proposed_by: 'optimizer',
    proposed_at: '2026-01-01T00:00:00.000Z',
    evaluation_criteria: {
      success_threshold: 0.80,
      regression_budget: 0.1,
      benchmark_domains: ['scoring_strategy', 'delegation_thresholds'],
      required_checks: [],
    },
    context: {
      tlp_classification: 'GREEN',
      scope: 'non_production',
      domain: 'scoring_strategy',
      initiated_by: 'optimizer',
    },
    ...overrides,
  };
}

/** Create a deterministic runner that returns fixed scores per benchmark. */
function fixedRunner(domainId: string, scores: Record<string, number>): BenchmarkRunner {
  return {
    domain_id: domainId,
    async runBenchmark(benchmarkId) {
      const score = scores[benchmarkId];
      if (score === undefined) throw new Error(`No score for benchmark ${benchmarkId}`);
      return score;
    },
  };
}

function makeInput(
  proposal: ImprovementProposal,
  sourceDomain: DomainDefinition,
  targetDomain: DomainDefinition,
  baselines: BaselineRecord[],
  overrides: Partial<TransferEvaluationInput> = {},
): TransferEvaluationInput {
  return {
    proposal,
    source_domain: sourceDomain,
    target_domain: targetDomain,
    target_baseline: baselines,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 3.1 — Contract validation
// ---------------------------------------------------------------------------

describe('3.1 — transfer evaluation contract', () => {
  it('throws when runner domain does not match target domain', async () => {
    const proposal = makeProposal();
    const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES);
    const wrongRunner = fixedRunner('scoring_strategy', {});
    await expect(evaluateTransfer(input, wrongRunner)).rejects.toThrow(TransferEvaluationError);
  });

  it('result has correct shape for all required fields', async () => {
    const proposal = makeProposal();
    const runner = fixedRunner('delegation_thresholds', {
      approval_latency_p95: 0.93,
      false_positive_rate: 0.89,
      security_boundary: 1.0,
    });
    const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES);
    const result = await evaluateTransfer(input, runner);

    expect(result.proposal_id).toBe(proposal.proposal_id);
    expect(result.source_domain_id).toBe('scoring_strategy');
    expect(result.target_domain_id).toBe('delegation_thresholds');
    expect(typeof result.transfer_score).toBe('number');
    expect(typeof result.transferable).toBe('boolean');
    expect(Array.isArray(result.benchmark_results)).toBe(true);
    expect(typeof result.decision_reason).toBe('string');
    expect(result.evaluated_at).toBeTruthy();
  });

  it('benchmark_results has one entry per benchmark in target domain', async () => {
    const proposal = makeProposal();
    const runner = fixedRunner('delegation_thresholds', {
      approval_latency_p95: 0.91,
      false_positive_rate: 0.87,
      security_boundary: 1.0,
    });
    const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES);
    const result = await evaluateTransfer(input, runner);
    expect(result.benchmark_results).toHaveLength(DELEGATION_THRESHOLDS_DOMAIN.benchmarks.length);
  });
});

// ---------------------------------------------------------------------------
// 3.2 — Gate logic
// ---------------------------------------------------------------------------

describe('3.2 — transfer gate logic', () => {
  describe('threshold success allows promotion', () => {
    it('transferable when score ≥ threshold and no regressions', async () => {
      const proposal = makeProposal();
      const runner = fixedRunner('delegation_thresholds', {
        approval_latency_p95: 0.95, // above baseline 0.92
        false_positive_rate: 0.90,  // above baseline 0.88
        security_boundary: 1.0,     // at baseline 1.0
      });
      const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES);
      const result = await evaluateTransfer(input, runner);

      expect(result.score_passed).toBe(true);
      expect(result.regression_budget_exceeded).toBe(false);
      expect(result.blocking_failures).toHaveLength(0);
      expect(result.transferable).toBe(true);
      expect(result.decision_reason).toMatch(/Transfer approved/);
    });
  });

  describe('regression budget exceeded blocks promotion', () => {
    it('not transferable when regression fraction exceeds budget', async () => {
      // All three benchmarks regress → fraction = 1.0 > budget 0.1
      const proposal = makeProposal();
      const runner = fixedRunner('delegation_thresholds', {
        approval_latency_p95: 0.80, // regress from 0.92
        false_positive_rate: 0.75,  // regress from 0.88
        security_boundary: 0.90,    // regress from 1.0
      });
      const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES, {
        regression_budget: 0.1,
      });
      const result = await evaluateTransfer(input, runner);

      expect(result.regression_budget_exceeded).toBe(true);
      expect(result.transferable).toBe(false);
      expect(result.decision_reason).toMatch(/Transfer blocked/);
    });

    it('transferable when regression fraction within budget', async () => {
      // 1 of 3 regresses → fraction = 0.33, budget = 0.5 → within budget
      const proposal = makeProposal({ evaluation_criteria: { success_threshold: 0.75, regression_budget: 0.5, benchmark_domains: [], required_checks: [] } });
      const runner = fixedRunner('delegation_thresholds', {
        approval_latency_p95: 0.85, // slight regress from 0.92 but passes threshold
        false_positive_rate: 0.95,  // improve
        security_boundary: 1.0,
      });
      const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES, {
        regression_budget: 0.5,
        score_threshold: 0.75,
      });
      const result = await evaluateTransfer(input, runner);

      expect(result.regression_budget_exceeded).toBe(false);
      expect(result.transferable).toBe(true);
    });
  });

  describe('blocking benchmark failure blocks promotion', () => {
    it('not transferable when blocking benchmark fails regardless of aggregate score', async () => {
      const proposal = makeProposal();
      // High scores everywhere except the blocking security_boundary
      const runner = fixedRunner('delegation_thresholds', {
        approval_latency_p95: 0.99,
        false_positive_rate: 0.99,
        security_boundary: 0.85, // below pass_threshold of 1.0 — blocking!
      });
      const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES);
      const result = await evaluateTransfer(input, runner);

      expect(result.blocking_failures).toContain('security_boundary');
      expect(result.transferable).toBe(false);
      expect(result.decision_reason).toMatch(/blocking benchmarks failed/);
    });

    it('non-blocking benchmark failure does not block when score still passes', async () => {
      // approval_latency_p95 fails (below 0.90 threshold) but it's not blocking
      // security_boundary passes
      const proposal = makeProposal({ evaluation_criteria: { success_threshold: 0.70, regression_budget: 0.5, benchmark_domains: [], required_checks: [] } });
      const runner = fixedRunner('delegation_thresholds', {
        approval_latency_p95: 0.80, // below pass_threshold 0.90, but not blocking
        false_positive_rate: 0.90,
        security_boundary: 1.0,
      });
      const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES, {
        score_threshold: 0.70,
        regression_budget: 0.5,
      });
      const result = await evaluateTransfer(input, runner);

      expect(result.blocking_failures).toHaveLength(0);
      // avg = (0.80 + 0.90 + 1.0) / 3 = 0.90 ≥ 0.70
      expect(result.score_passed).toBe(true);
      expect(result.transferable).toBe(true);
    });
  });

  describe('score computation', () => {
    it('transfer_score is the mean of all benchmark scores', async () => {
      const proposal = makeProposal({ evaluation_criteria: { success_threshold: 0.5, regression_budget: 1.0, benchmark_domains: [], required_checks: [] } });
      const runner = fixedRunner('delegation_thresholds', {
        approval_latency_p95: 0.9,
        false_positive_rate: 0.6,
        security_boundary: 1.0, // keep passing
      });
      const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES, {
        score_threshold: 0.5,
        regression_budget: 1.0,
      });
      const result = await evaluateTransfer(input, runner);
      const expected = (0.9 + 0.6 + 1.0) / 3;
      expect(result.transfer_score).toBeCloseTo(expected, 5);
    });

    it('uses proposal success_threshold when input score_threshold not provided', async () => {
      const proposal = makeProposal({ evaluation_criteria: { success_threshold: 0.99, regression_budget: 0.0, benchmark_domains: [], required_checks: [] } });
      const runner = fixedRunner('delegation_thresholds', {
        approval_latency_p95: 0.93,
        false_positive_rate: 0.88,
        security_boundary: 1.0,
      });
      const input = makeInput(proposal, SCORING_STRATEGY_DOMAIN, DELEGATION_THRESHOLDS_DOMAIN, DELEGATION_THRESHOLDS_BASELINES);
      const result = await evaluateTransfer(input, runner);
      // Mean ≈ 0.937, threshold = 0.99 → should fail
      expect(result.score_threshold).toBe(0.99);
      expect(result.score_passed).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 3.3 — Baseline fixtures
// ---------------------------------------------------------------------------

describe('3.3 — baseline benchmark fixtures', () => {
  it('SCORING_STRATEGY_DOMAIN has expected benchmarks', () => {
    const ids = SCORING_STRATEGY_DOMAIN.benchmarks.map((b) => b.benchmark_id);
    expect(ids).toContain('precision_at_k');
    expect(ids).toContain('recall_at_k');
    expect(ids).toContain('safety_gate');
    // safety_gate must be blocking
    const safety = SCORING_STRATEGY_DOMAIN.benchmarks.find((b) => b.benchmark_id === 'safety_gate');
    expect(safety?.blocking).toBe(true);
  });

  it('DELEGATION_THRESHOLDS_DOMAIN has expected benchmarks', () => {
    const ids = DELEGATION_THRESHOLDS_DOMAIN.benchmarks.map((b) => b.benchmark_id);
    expect(ids).toContain('approval_latency_p95');
    expect(ids).toContain('false_positive_rate');
    expect(ids).toContain('security_boundary');
    const sec = DELEGATION_THRESHOLDS_DOMAIN.benchmarks.find((b) => b.benchmark_id === 'security_boundary');
    expect(sec?.blocking).toBe(true);
  });

  it('SCORING_STRATEGY_BASELINES cover all scoring_strategy benchmarks', () => {
    const benchIds = SCORING_STRATEGY_DOMAIN.benchmarks.map((b) => b.benchmark_id);
    for (const id of benchIds) {
      expect(SCORING_STRATEGY_BASELINES.some((b) => b.benchmark_id === id)).toBe(true);
    }
  });

  it('DELEGATION_THRESHOLDS_BASELINES cover all delegation_thresholds benchmarks', () => {
    const benchIds = DELEGATION_THRESHOLDS_DOMAIN.benchmarks.map((b) => b.benchmark_id);
    for (const id of benchIds) {
      expect(DELEGATION_THRESHOLDS_BASELINES.some((b) => b.benchmark_id === id)).toBe(true);
    }
  });

  it('baselines use the correct domain_id', () => {
    for (const b of SCORING_STRATEGY_BASELINES) {
      expect(b.domain_id).toBe('scoring_strategy');
    }
    for (const b of DELEGATION_THRESHOLDS_BASELINES) {
      expect(b.domain_id).toBe('delegation_thresholds');
    }
  });

  it('scoring_strategy transfer: safe improvement is transferable', async () => {
    const proposal = makeProposal();
    const runner = fixedRunner('scoring_strategy', {
      precision_at_k: 0.85,  // above baseline 0.80
      recall_at_k: 0.78,     // above baseline 0.75
      safety_gate: 0.98,     // matches baseline
    });
    const input: TransferEvaluationInput = {
      proposal,
      source_domain: SCORING_STRATEGY_DOMAIN,
      target_domain: SCORING_STRATEGY_DOMAIN,
      target_baseline: SCORING_STRATEGY_BASELINES,
    };
    const result = await evaluateTransfer(input, runner);
    expect(result.transferable).toBe(true);
  });

  it('delegation_thresholds transfer: security boundary regression blocks promotion', async () => {
    const proposal = makeProposal();
    const runner = fixedRunner('delegation_thresholds', {
      approval_latency_p95: 0.95,
      false_positive_rate: 0.92,
      security_boundary: 0.50, // blocking — must fail
    });
    const input: TransferEvaluationInput = {
      proposal,
      source_domain: SCORING_STRATEGY_DOMAIN,
      target_domain: DELEGATION_THRESHOLDS_DOMAIN,
      target_baseline: DELEGATION_THRESHOLDS_BASELINES,
    };
    const result = await evaluateTransfer(input, runner);
    expect(result.transferable).toBe(false);
    expect(result.blocking_failures).toContain('security_boundary');
  });
});
