/**
 * Security Middleware Types for DCYFR Delegation Framework
 * TLP:AMBER - Internal Use Only
 *
 * Defines the pluggable middleware contracts used by SecurityMiddlewareChain to
 * evaluate delegation operation requests against a composable set of guards.
 *
 * @module types/security-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { DelegationContract, AuthenticatedAgent, TaskContent } from './delegation-contracts.js';

// ──────────────────────────────────────────────────────────────────────────────
// Verdict
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Allow or block the delegation operation.
 *
 * - `allow`  – proceed unchanged
 * - `warn`   – proceed but attach an advisory annotation
 * - `block`  – reject with `reason` and log a threat event
 */
export type SecurityVerdictAction = 'allow' | 'warn' | 'block';

/**
 * Typed verdict returned by every SecurityMiddleware.evaluate() call.
 */
export type SecurityVerdict =
  | { action: 'allow' }
  | {
      action: 'warn';
      reason: string;
      threat_type: SecurityThreatType;
      severity?: SecuritySeverity;
      evidence?: Record<string, unknown>;
    }
  | {
      action: 'block';
      reason: string;
      threat_type: SecurityThreatType;
      severity: SecuritySeverity;
      evidence?: Record<string, unknown>;
    };

/**
 * Threat type taxonomy — kept in sync with ThreatDetectionResult.threat_type
 * from the standalone security-threat-model.
 */
export type SecurityThreatType =
  | 'permission_escalation'
  | 'reputation_gaming'
  | 'abuse_pattern'
  | 'anomaly'
  | 'context_insufficiency'
  | 'prompt_injection'
  | 'resource_exhaustion'
  | 'identity_failure'
  | 'tlp_violation'
  | 'chain_depth_exceeded'
  | 'fan_out_exceeded'
  | 'rate_limit_exceeded'
  | 'circuit_open'
  | 'content_policy_violation'
  | 'none';

/** Severity levels aligned with ThreatDetectionResult */
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

// ──────────────────────────────────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────────────────────────────────

/** Operation type being evaluated — controls which middlewares fire */
export type SecurityOperationType = 'create' | 'update' | 'handoff';

/**
 * Full evaluation context passed to every SecurityMiddleware.evaluate().
 *
 * Optional fields are not always available — middleware should handle absence
 * gracefully (e.g. `context.delegatee_auth` is absent for bare DelegationAgent callers).
 */
export interface SecurityContext {
  /** What kind of operation is being evaluated */
  operation: SecurityOperationType;

  /** The contract being created/updated/handed-off (may be partial pre-creation) */
  contract: Partial<DelegationContract>;

  /** Authenticated identity of the delegating agent */
  delegator_auth?: AuthenticatedAgent;

  /** Authenticated identity of the receiving agent */
  delegatee_auth?: AuthenticatedAgent;

  /** Resolved task content for content-policy checks */
  task_content?: TaskContent;

  /** Wall clock for expiry/timeout math — defaults to Date.now() */
  timestamp_ms?: number;

  /** feature-flag state snapshot at evaluation time */
  feature_flags?: Record<string, boolean>;

  /** Arbitrary pass-through for middleware-specific enrichment */
  metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Middleware interface
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Single middleware unit.
 *
 * Implement this interface to add a new guard to the SecurityMiddlewareChain.
 *
 * ORDERING:
 * Middleware is evaluated in the order it is registered. Early-blocking
 * middleware should be registered first (feature-flags, identity) so
 * expensive checks (threat-model, rate-limits) are skipped when not needed.
 */
export interface SecurityMiddleware {
  /**
   * Human-readable identifier — must be unique within a chain.
   * Used in events, logs, and circuit-breaker metrics.
   */
  readonly name: string;

  /**
   * Optional feature-flag name that gates this middleware.
   * When the flag is absent from `context.feature_flags` or explicitly false,
   * the middleware returns `{ action: 'allow' }` without evaluation.
   */
  readonly featureFlag?: string;

  /**
   * Set of operation types this middleware applies to.
   * When omitted, the middleware fires for all operations.
   */
  readonly appliesTo?: SecurityOperationType[];

  /**
   * Evaluate the context and return a verdict.
   * Must NOT mutate `context`.
   */
  evaluate(context: SecurityContext): Promise<SecurityVerdict>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Chain result
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Aggregated output from SecurityMiddlewareChain.evaluate().
 */
export interface SecurityChainResult {
  /** Final outcome: first `block` verdict wins; otherwise `allow` (or `warn` if any advisories). */
  action: SecurityVerdictAction;

  /** Populated when action === 'block' */
  blocking_verdict?: Extract<SecurityVerdict, { action: 'block' }>;

  /** All advisory warnings accumulated (action may still be 'allow') */
  warnings: Array<Extract<SecurityVerdict, { action: 'warn' }>>;

  /** Name of the middleware that issued the blocking verdict (if any) */
  blocked_by?: string;

  /** Total elapsed evaluation time (ms) */
  evaluation_time_ms: number;

  /** Per-middleware verdicts for audit trails */
  middleware_results: Array<{
    middleware: string;
    verdict: SecurityVerdict;
    elapsed_ms: number;
  }>;
}
