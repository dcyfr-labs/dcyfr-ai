/**
 * Metacognitive Improvement Runtime — Type Contracts
 * TLP:AMBER - Internal Use Only
 *
 * Interfaces and policy schema for the metacognitive improvement runtime.
 * Defines the governed lifecycle (`propose → evaluate → approve → apply → rollback`)
 * for versioned improvement-policy documents, with verification-policy enforcement
 * and TLP-gated governance thresholds.
 *
 * @module ai/metacognition/types
 * @version 1.0.0
 */

import type { VerificationPolicy } from '../types/delegation-contracts';

// ---------------------------------------------------------------------------
// Lifecycle state machine
// ---------------------------------------------------------------------------

/**
 * Improvement lifecycle states.
 *
 * Valid forward transitions:
 *   proposed → evaluated → approved → applied
 *   proposed → rejected          (evaluation failed or governance blocked)
 *   evaluated → rejected         (score below threshold)
 *   approved → applied
 *   applied → rolled_back        (regression detected post-apply)
 */
export type ImprovementLifecycleState =
  | 'proposed'
  | 'evaluated'
  | 'approved'
  | 'applied'
  | 'rolled_back'
  | 'rejected';

/** All valid (from, to) lifecycle transitions. */
export const VALID_LIFECYCLE_TRANSITIONS: ReadonlyArray<
  readonly [ImprovementLifecycleState, ImprovementLifecycleState]
> = [
  ['proposed', 'evaluated'],
  ['proposed', 'rejected'],
  ['evaluated', 'approved'],
  ['evaluated', 'rejected'],
  ['approved', 'applied'],
  ['applied', 'rolled_back'],
] as const;

// ---------------------------------------------------------------------------
// TLP and scope classification
// ---------------------------------------------------------------------------

/**
 * TLP classification for improvement contexts.
 * Determines the minimum verification policy required for approval.
 */
export type TlpClassification = 'WHITE' | 'GREEN' | 'AMBER' | 'RED';

/**
 * Impact scope of an improvement.
 *
 * - `non_production`: shadow mode, experiments, dev/staging only.
 * - `production_indirect`: affects production through a non-critical path
 *   (e.g., telemetry policy, scoring weights).
 * - `production_direct`: directly mutates production-impacting behavior
 *   (e.g., delegation thresholds, safety gates).
 */
export type ImprovementScope =
  | 'non_production'
  | 'production_indirect'
  | 'production_direct';

// ---------------------------------------------------------------------------
// Policy schema versioning
// ---------------------------------------------------------------------------

/** Semantic version for schema compatibility checks. */
export interface PolicySchemaVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * Returns true if `runtime` can process a policy document at `document` version.
 * Runtime must match major; minor must be >=; patch is ignored.
 */
export function isSchemaCompatible(
  runtime: PolicySchemaVersion,
  document: PolicySchemaVersion,
): boolean {
  return runtime.major === document.major && runtime.minor >= document.minor;
}

/** Serialize a PolicySchemaVersion to a `major.minor.patch` string. */
export function formatSchemaVersion(v: PolicySchemaVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

// ---------------------------------------------------------------------------
// Policy constraints
// ---------------------------------------------------------------------------

/**
 * Safety constraints embedded in a policy document.
 * These constrain what verification is required and how rollback behaves.
 */
export interface PolicyConstraints {
  /**
   * Minimum verification policy required to approve an improvement.
   * The runtime enforces that the requested policy meets or exceeds this.
   */
  min_verification_policy: VerificationPolicy;

  /** TLP classification of this policy's domain. */
  tlp_classification: TlpClassification;

  /** Impact scope of mutations to this policy. */
  scope: ImprovementScope;

  /**
   * Window in milliseconds after apply during which rollback is permitted.
   * Undefined means rollback is always permitted.
   */
  rollback_window_ms?: number;

  /**
   * Maximum fraction of benchmark checks (0.0–1.0) allowed to regress
   * before evaluation auto-fails.
   */
  max_regression_budget?: number;
}

// ---------------------------------------------------------------------------
// Policy document and snapshot
// ---------------------------------------------------------------------------

/**
 * A versioned improvement-policy document.
 * This is the artifact the runtime improves — not agent behavior directly,
 * but the policy that governs how improvements are proposed and applied.
 */
export interface ImprovementPolicyDocument {
  /** Stable identifier for this policy. */
  readonly id: string;

  /** Schema version; used for compatibility checks. */
  readonly schema_version: PolicySchemaVersion;

  /** Human-readable name. */
  name: string;

  /** Purpose and scope description. */
  description: string;

  /**
   * Domain this policy governs.
   * Examples: `'memory_policy'`, `'scoring_strategy'`, `'delegation_thresholds'`
   */
  domain: string;

  /** Domain-specific policy parameters (typed by each domain's schema). */
  parameters: Record<string, unknown>;

  /** Embedded safety constraints. */
  constraints: PolicyConstraints;

  /** ISO timestamp when this document was created. */
  created_at: string;

  /** ISO timestamp of the last update. */
  updated_at: string;
}

/**
 * An immutable, point-in-time snapshot of a policy document.
 * The ledger references snapshots by ID; originals must never be mutated.
 */
export interface PolicySnapshot {
  /** Unique snapshot identifier (UUIDv4). */
  readonly snapshot_id: string;

  /** ID of the source ImprovementPolicyDocument. */
  readonly policy_id: string;

  /** Schema version at capture time. */
  readonly schema_version: PolicySchemaVersion;

  /** Full copy of the policy at capture time. */
  readonly content: ImprovementPolicyDocument;

  /** ISO timestamp when this snapshot was captured. */
  readonly captured_at: string;

  /** Actor (agent or human) that triggered the snapshot. */
  readonly captured_by: string;

  /**
   * SHA-256 hex digest of the canonical JSON serialization of `content`.
   * Used for integrity verification before processing.
   */
  readonly content_hash: string;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

/** A single parameter change within a PolicyDiff. */
export interface PolicyParameterChange {
  /** Dot-notation path to the changed parameter (e.g., `'parameters.threshold'`). */
  path: string;
  previous_value: unknown;
  proposed_value: unknown;
}

/** Structured diff between two policy versions. */
export interface PolicyDiff {
  /** Individual parameter-level changes. */
  parameter_changes: PolicyParameterChange[];

  /** Optional changes to policy constraints. */
  constraint_changes?: Partial<PolicyConstraints>;

  /** Human-readable summary of what changes and why. */
  description: string;
}

/** Criteria used to evaluate whether a proposal passes. */
export interface ProposalEvaluationCriteria {
  /** Minimum aggregate score (0.0–1.0) for the proposal to pass. */
  success_threshold: number;

  /**
   * Maximum fraction of benchmark checks (0.0–1.0) allowed to regress.
   * Overrides the policy document's `max_regression_budget` for this proposal.
   */
  regression_budget: number;

  /** Domain names to run benchmarks in. Must include the source domain. */
  benchmark_domains: string[];

  /** Named checks that must all pass for evaluation to succeed. */
  required_checks: string[];
}

/**
 * Context for an improvement operation.
 * Carries TLP classification, scope, and tracing identifiers.
 */
export interface ImprovementContext {
  tlp_classification: TlpClassification;
  scope: ImprovementScope;
  domain: string;
  initiated_by: string;
  session_id?: string;
  trace_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A proposed change to a policy document.
 * Enters the ledger in `proposed` state when submitted to the runtime.
 */
export interface ImprovementProposal {
  /** Unique proposal identifier (UUIDv4). */
  readonly proposal_id: string;

  /** Snapshot ID of the policy version being modified. */
  readonly source_snapshot_id: string;

  /** Structured diff to apply if approved. */
  proposed_changes: PolicyDiff;

  /** Explanation of why this improvement is being proposed. */
  rationale: string;

  /** Actor submitting this proposal. */
  proposed_by: string;

  /** ISO timestamp when proposed. */
  proposed_at: string;

  /** Criteria used to evaluate this proposal. */
  evaluation_criteria: ProposalEvaluationCriteria;

  /** Context including TLP classification and scope. */
  context: ImprovementContext;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Result of a single benchmark check. */
export interface BenchmarkResult {
  domain: string;
  benchmark_id: string;
  passed: boolean;
  /** Score on this benchmark (0.0–1.0). */
  score: number;
  /** Baseline score before this proposal. */
  baseline_score: number;
  /** score − baseline_score; negative means regression. */
  delta: number;
}

/**
 * Result of evaluating an ImprovementProposal.
 * Produced by the transfer evaluation pipeline (Section 3 of tasks).
 */
export interface ImprovementEvaluationResult {
  readonly proposal_id: string;
  readonly evaluated_at: string;
  readonly evaluated_by: string;

  /** Whether the proposal passed all evaluation criteria. */
  passed: boolean;

  /** Aggregate score across all benchmarks (0.0–1.0). */
  score: number;

  /** True if any benchmark regressed beyond the allowed budget. */
  regression_detected: boolean;

  /** Fraction of benchmarks that regressed (0.0–1.0). */
  regression_magnitude?: number;

  /** Per-domain, per-benchmark results. */
  benchmark_results: BenchmarkResult[];

  /**
   * Minimum verification policy needed to approve based on
   * the proposal's context and governance config.
   */
  required_verification_policy: VerificationPolicy;

  notes?: string;
}

// ---------------------------------------------------------------------------
// Governance configuration
// ---------------------------------------------------------------------------

/**
 * Governance configuration — maps scopes and TLP classifications to minimum
 * required verification policies.
 *
 * Invariants enforced at runtime construction:
 *   - `production_direct_min_policy` strength ≥ `third_party_audit`
 *   - `tlp_red_policy` strength = `human_required`
 */
export interface GovernanceConfig {
  /**
   * Minimum verification policy for `production_direct` scope improvements.
   * Must be `third_party_audit` or stronger.
   */
  production_direct_min_policy: VerificationPolicy;

  /**
   * Required verification policy for TLP:RED improvements.
   * Must be `human_required`.
   */
  tlp_red_policy: VerificationPolicy;

  /**
   * Default verification policy for `non_production` or `production_indirect`
   * improvements not matching a stricter rule.
   */
  default_policy: VerificationPolicy;
}

/**
 * Default governance config enforcing spec requirements:
 * - production_direct → third_party_audit minimum
 * - TLP:RED → human_required
 */
export const DEFAULT_GOVERNANCE_CONFIG: Readonly<GovernanceConfig> = {
  production_direct_min_policy: 'third_party_audit',
  tlp_red_policy: 'human_required',
  default_policy: 'direct_inspection',
} as const;

// ---------------------------------------------------------------------------
// Runtime configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the MetacognitiveImprovementRuntime.
 * The `enabled` flag is controlled by the `ENABLE_METACOG_RUNTIME` env var
 * (see runtime.ts); when false the runtime is a no-op.
 */
export interface MetacognitiveRuntimeConfig {
  /**
   * Master switch. When false, all runtime methods are no-ops and the
   * runtime returns a disabled sentinel rather than executing proposals.
   * Controlled by `ENABLE_METACOG_RUNTIME=true` at startup.
   */
  enabled: boolean;

  /**
   * Schema version this runtime instance supports.
   * Policy snapshots with incompatible schema versions are rejected
   * before any lifecycle processing begins.
   */
  policy_schema_version: PolicySchemaVersion;

  /** Governance thresholds for verification policy enforcement. */
  governance: GovernanceConfig;
}

// ---------------------------------------------------------------------------
// Verification policy ordering
// ---------------------------------------------------------------------------

/**
 * Numeric strength for each VerificationPolicy.
 * Used to enforce governance thresholds: a requested policy is sufficient
 * if and only if its strength ≥ the required policy's strength.
 *
 *   direct_inspection(1) < third_party_audit(2) < cryptographic_proof(3) < human_required(4)
 */
export const VERIFICATION_POLICY_STRENGTH: Readonly<
  Record<VerificationPolicy, number>
> = {
  direct_inspection: 1,
  third_party_audit: 2,
  cryptographic_proof: 3,
  human_required: 4,
} as const;

/**
 * Returns true if `candidate` meets or exceeds `required` strength.
 */
export function meetsVerificationThreshold(
  candidate: VerificationPolicy,
  required: VerificationPolicy,
): boolean {
  return (
    VERIFICATION_POLICY_STRENGTH[candidate] >=
    VERIFICATION_POLICY_STRENGTH[required]
  );
}

/**
 * Derive the required VerificationPolicy for a given context and governance config.
 * TLP:RED always wins; then production_direct; then default.
 */
export function resolveRequiredPolicy(
  context: Pick<ImprovementContext, 'tlp_classification' | 'scope'>,
  governance: GovernanceConfig,
): VerificationPolicy {
  if (context.tlp_classification === 'RED') {
    return governance.tlp_red_policy;
  }
  if (context.scope === 'production_direct') {
    return governance.production_direct_min_policy;
  }
  return governance.default_policy;
}
