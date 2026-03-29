/**
 * Cross-Domain Transfer Evaluation Pipeline
 * TLP:AMBER - Internal Use Only
 *
 * Implements the transfer evaluation contract and gate logic for
 * cross-domain promotion of improvement proposals.
 *
 * Pipeline:
 *   1. Evaluate proposal in source domain (caller's responsibility).
 *   2. Call evaluateTransfer() to run target-domain evaluation.
 *   3. Transfer is allowed only when score ≥ threshold AND regression
 *      budget is not exceeded.
 *
 * @module ai/metacognition/transfer
 */

import type { BenchmarkResult, ImprovementProposal } from './types.js';

// ---------------------------------------------------------------------------
// Transfer evaluation contract types (task 3.1)
// ---------------------------------------------------------------------------

/**
 * A domain definition for transfer evaluation.
 * Each domain exposes named benchmarks that proposals must satisfy.
 */
export interface DomainDefinition {
  /** Unique domain identifier. Must match domains referenced in proposals. */
  domain_id: string;

  /** Human-readable name. */
  name: string;

  /** Registered benchmarks available in this domain. */
  benchmarks: BenchmarkDefinition[];
}

/** A single named benchmark within a domain. */
export interface BenchmarkDefinition {
  /** Unique within the domain. */
  benchmark_id: string;

  /** Human-readable description of what this benchmark measures. */
  description: string;

  /**
   * Minimum score (0.0–1.0) for this benchmark to count as passing.
   * A result with score >= pass_threshold is considered a pass.
   */
  pass_threshold: number;

  /**
   * Whether a failure on this benchmark is blocking regardless of
   * aggregate score or regression budget. Safety/security gates should
   * set this to true.
   */
  blocking: boolean;
}

/**
 * Input to the transfer evaluation gate.
 * Carries the proposal being evaluated, the source domain's baseline results,
 * and the target domain configuration.
 */
export interface TransferEvaluationInput {
  proposal: ImprovementProposal;

  /** Domain the improvement was originally developed in. */
  source_domain: DomainDefinition;

  /** Domain the improvement is being promoted to. */
  target_domain: DomainDefinition;

  /**
   * Baseline benchmark results for the target domain
   * (measured before this proposal was applied).
   */
  target_baseline: BaselineRecord[];

  /**
   * Minimum aggregate transfer score (0.0–1.0) required for promotion.
   * Defaults to the proposal's evaluation_criteria.success_threshold.
   */
  score_threshold?: number;

  /**
   * Maximum fraction of benchmarks allowed to regress (0.0–1.0).
   * Defaults to the proposal's evaluation_criteria.regression_budget.
   */
  regression_budget?: number;
}

/** A baseline measurement for a single benchmark in a domain. */
export interface BaselineRecord {
  domain_id: string;
  benchmark_id: string;
  baseline_score: number;
  measured_at: string;
}

/**
 * Transfer score and promotion decision for a single proposal.
 */
export interface TransferEvaluationResult {
  proposal_id: string;
  source_domain_id: string;
  target_domain_id: string;

  evaluated_at: string;

  /** Aggregate transfer score across all target-domain benchmarks (0.0–1.0). */
  transfer_score: number;

  /** Score threshold that was applied. */
  score_threshold: number;

  /** Whether the transfer score meets the threshold. */
  score_passed: boolean;

  /** Whether any benchmark regressed beyond the regression budget. */
  regression_budget_exceeded: boolean;

  /** Fraction of benchmarks that regressed. */
  regression_fraction: number;

  /** True only when score_passed AND NOT regression_budget_exceeded AND no blocking failures. */
  transferable: boolean;

  /** Per-benchmark results in the target domain. */
  benchmark_results: BenchmarkResult[];

  /** IDs of blocking benchmarks that failed. */
  blocking_failures: string[];

  /** Human-readable explanation of the promotion decision. */
  decision_reason: string;
}

// ---------------------------------------------------------------------------
// Benchmark runner interface (task 3.1)
// ---------------------------------------------------------------------------

/**
 * Interface for running benchmarks in a domain.
 * Implementations provide domain-specific evaluation logic.
 */
export interface BenchmarkRunner {
  domain_id: string;

  /**
   * Run a single benchmark against the proposed policy changes.
   * Returns the achieved score (0.0–1.0).
   */
  runBenchmark(
    benchmark_id: string,
    proposal: ImprovementProposal,
  ): Promise<number>;
}

// ---------------------------------------------------------------------------
// Transfer gate logic (task 3.2)
// ---------------------------------------------------------------------------

/**
 * Evaluate whether an improvement proposal is transferable to a target domain.
 *
 * Algorithm:
 *   1. For each benchmark in target domain, run evaluation via `runner`.
 *   2. Compute delta vs baseline: negative delta = regression.
 *   3. Check for blocking failures (regardless of aggregate score).
 *   4. Compute regression fraction vs regression_budget.
 *   5. Compute aggregate transfer score.
 *   6. transferable = score_passed AND NOT budget_exceeded AND no blocking failures.
 *
 * @param input - Transfer evaluation configuration and baselines.
 * @param runner - Domain-specific benchmark runner for the target domain.
 */
export async function evaluateTransfer(
  input: TransferEvaluationInput,
  runner: BenchmarkRunner,
): Promise<TransferEvaluationResult> {
  if (runner.domain_id !== input.target_domain.domain_id) {
    throw new TransferEvaluationError(
      `Runner domain "${runner.domain_id}" does not match target domain "${input.target_domain.domain_id}"`,
    );
  }

  const scoreThreshold =
    input.score_threshold ?? input.proposal.evaluation_criteria.success_threshold;
  const regressionBudget =
    input.regression_budget ?? input.proposal.evaluation_criteria.regression_budget;

  const baselineMap = new Map<string, number>();
  for (const b of input.target_baseline) {
    if (b.domain_id === input.target_domain.domain_id) {
      baselineMap.set(b.benchmark_id, b.baseline_score);
    }
  }

  const benchmarkResults: BenchmarkResult[] = [];
  const blockingFailures: string[] = [];

  for (const bench of input.target_domain.benchmarks) {
    const score = await runner.runBenchmark(bench.benchmark_id, input.proposal);
    const baselineScore = baselineMap.get(bench.benchmark_id) ?? 0;
    const delta = score - baselineScore;
    const passed = score >= bench.pass_threshold;

    benchmarkResults.push({
      domain: input.target_domain.domain_id,
      benchmark_id: bench.benchmark_id,
      passed,
      score,
      baseline_score: baselineScore,
      delta,
    });

    if (bench.blocking && !passed) {
      blockingFailures.push(bench.benchmark_id);
    }
  }

  const regressedCount = benchmarkResults.filter((r) => r.delta < 0).length;
  const regressionFraction =
    benchmarkResults.length > 0 ? regressedCount / benchmarkResults.length : 0;
  const regressionBudgetExceeded = regressionFraction > regressionBudget;

  const transferScore =
    benchmarkResults.length > 0
      ? benchmarkResults.reduce((sum, r) => sum + r.score, 0) / benchmarkResults.length
      : 0;

  const scorePassed = transferScore >= scoreThreshold;
  const transferable =
    scorePassed && !regressionBudgetExceeded && blockingFailures.length === 0;

  return {
    proposal_id: input.proposal.proposal_id,
    source_domain_id: input.source_domain.domain_id,
    target_domain_id: input.target_domain.domain_id,
    evaluated_at: new Date().toISOString(),
    transfer_score: transferScore,
    score_threshold: scoreThreshold,
    score_passed: scorePassed,
    regression_budget_exceeded: regressionBudgetExceeded,
    regression_fraction: regressionFraction,
    transferable,
    benchmark_results: benchmarkResults,
    blocking_failures: blockingFailures,
    decision_reason: buildDecisionReason(
      transferable,
      scorePassed,
      transferScore,
      scoreThreshold,
      regressionBudgetExceeded,
      regressionFraction,
      regressionBudget,
      blockingFailures,
    ),
  };
}

function buildDecisionReason(
  transferable: boolean,
  scorePassed: boolean,
  score: number,
  threshold: number,
  budgetExceeded: boolean,
  regressionFraction: number,
  budget: number,
  blockingFailures: string[],
): string {
  if (transferable) {
    return `Transfer approved: score ${score.toFixed(3)} ≥ threshold ${threshold.toFixed(3)}, regression fraction ${regressionFraction.toFixed(3)} within budget.`;
  }
  const reasons: string[] = [];
  if (!scorePassed) {
    reasons.push(`score ${score.toFixed(3)} below threshold ${threshold.toFixed(3)}`);
  }
  if (budgetExceeded) {
    reasons.push(`regression fraction ${regressionFraction.toFixed(3)} exceeds budget ${budget.toFixed(3)}`);
  }
  if (blockingFailures.length > 0) {
    reasons.push(`blocking benchmarks failed: ${blockingFailures.join(', ')}`);
  }
  return `Transfer blocked: ${reasons.join('; ')}.`;
}

/** Thrown when transfer evaluation configuration is invalid. */
export class TransferEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferEvaluationError';
  }
}

// ---------------------------------------------------------------------------
// Baseline benchmark fixtures (task 3.3)
// ---------------------------------------------------------------------------

/**
 * Domain A: scoring_strategy
 * Representative benchmarks for a scoring-weight policy domain.
 */
export const SCORING_STRATEGY_DOMAIN: DomainDefinition = {
  domain_id: 'scoring_strategy',
  name: 'Scoring Strategy',
  benchmarks: [
    {
      benchmark_id: 'precision_at_k',
      description: 'Precision at K for top-ranked results',
      pass_threshold: 0.75,
      blocking: false,
    },
    {
      benchmark_id: 'recall_at_k',
      description: 'Recall at K for top-ranked results',
      pass_threshold: 0.70,
      blocking: false,
    },
    {
      benchmark_id: 'safety_gate',
      description: 'Safety filter pass-rate — must not regress',
      pass_threshold: 0.95,
      blocking: true,
    },
  ],
};

/**
 * Domain B: delegation_thresholds
 * Representative benchmarks for a delegation-threshold policy domain.
 */
export const DELEGATION_THRESHOLDS_DOMAIN: DomainDefinition = {
  domain_id: 'delegation_thresholds',
  name: 'Delegation Thresholds',
  benchmarks: [
    {
      benchmark_id: 'approval_latency_p95',
      description: 'P95 approval latency within SLA',
      pass_threshold: 0.90,
      blocking: false,
    },
    {
      benchmark_id: 'false_positive_rate',
      description: 'False positive approval rate below ceiling',
      pass_threshold: 0.85,
      blocking: false,
    },
    {
      benchmark_id: 'security_boundary',
      description: 'Security boundary enforcement — blocking gate',
      pass_threshold: 1.0,
      blocking: true,
    },
  ],
};

/** Pre-measured baselines for the scoring_strategy domain. */
export const SCORING_STRATEGY_BASELINES: BaselineRecord[] = [
  { domain_id: 'scoring_strategy', benchmark_id: 'precision_at_k', baseline_score: 0.80, measured_at: '2026-01-01T00:00:00.000Z' },
  { domain_id: 'scoring_strategy', benchmark_id: 'recall_at_k', baseline_score: 0.75, measured_at: '2026-01-01T00:00:00.000Z' },
  { domain_id: 'scoring_strategy', benchmark_id: 'safety_gate', baseline_score: 0.98, measured_at: '2026-01-01T00:00:00.000Z' },
];

/** Pre-measured baselines for the delegation_thresholds domain. */
export const DELEGATION_THRESHOLDS_BASELINES: BaselineRecord[] = [
  { domain_id: 'delegation_thresholds', benchmark_id: 'approval_latency_p95', baseline_score: 0.92, measured_at: '2026-01-01T00:00:00.000Z' },
  { domain_id: 'delegation_thresholds', benchmark_id: 'false_positive_rate', baseline_score: 0.88, measured_at: '2026-01-01T00:00:00.000Z' },
  { domain_id: 'delegation_thresholds', benchmark_id: 'security_boundary', baseline_score: 1.0, measured_at: '2026-01-01T00:00:00.000Z' },
];
