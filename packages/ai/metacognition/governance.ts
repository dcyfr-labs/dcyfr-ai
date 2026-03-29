/**
 * Metacognitive Improvement — Explicit Governance Guards
 * TLP:AMBER - Internal Use Only
 *
 * Named, standalone governance guard functions that enforce:
 *   4.2 — production_direct improvements require at least `third_party_audit`
 *   4.3 — TLP:RED improvements require `human_required`
 *
 * These guards are extracted from the runtime's `approve()` method so they
 * can be composed, tested, and invoked independently of the full runtime.
 * They are the authoritative source of governance rules — the runtime
 * delegates to them internally.
 *
 * @module ai/metacognition/governance
 */

import type { VerificationPolicy } from '../types/delegation-contracts.js';
import type { ImprovementContext, GovernanceConfig } from './types.js';
import {
  VERIFICATION_POLICY_STRENGTH,
  DEFAULT_GOVERNANCE_CONFIG,
  meetsVerificationThreshold,
  resolveRequiredPolicy,
} from './types.js';

// ---------------------------------------------------------------------------
// Guard result type
// ---------------------------------------------------------------------------

/** Result of a governance guard check. */
export type GovernanceGuardResult =
  | { allowed: true }
  | { allowed: false; required: VerificationPolicy; provided: VerificationPolicy; reason: string };

// ---------------------------------------------------------------------------
// 4.2 — Production-affecting promotion guard
// ---------------------------------------------------------------------------

/**
 * Guard: production_direct scope requires at least `third_party_audit`.
 *
 * Returns `{ allowed: true }` if the provided policy meets the minimum strength
 * for the given context. Returns `{ allowed: false, ... }` with the violation
 * details otherwise.
 *
 * This guard is a no-op for `non_production` and `production_indirect` scopes
 * when using the default governance config.
 */
export function checkProductionPromotionPolicy(
  context: Pick<ImprovementContext, 'scope' | 'tlp_classification'>,
  providedPolicy: VerificationPolicy,
  governance: GovernanceConfig = DEFAULT_GOVERNANCE_CONFIG,
): GovernanceGuardResult {
  if (context.scope !== 'production_direct') {
    return { allowed: true };
  }

  const required = governance.production_direct_min_policy;

  if (meetsVerificationThreshold(providedPolicy, required)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    required,
    provided: providedPolicy,
    reason:
      `production_direct improvements require at least "${required}" verification ` +
      `(provided: "${providedPolicy}", strength: ${VERIFICATION_POLICY_STRENGTH[providedPolicy]} < ` +
      `required: ${VERIFICATION_POLICY_STRENGTH[required]})`,
  };
}

// ---------------------------------------------------------------------------
// 4.3 — TLP:RED hard gate
// ---------------------------------------------------------------------------

/**
 * Hard gate: TLP:RED context requires `human_required` verification.
 *
 * Returns `{ allowed: true }` only when the provided policy is `human_required`.
 * Any weaker policy produces `{ allowed: false, ... }` regardless of scope.
 */
export function checkTlpRedGate(
  context: Pick<ImprovementContext, 'tlp_classification'>,
  providedPolicy: VerificationPolicy,
  governance: GovernanceConfig = DEFAULT_GOVERNANCE_CONFIG,
): GovernanceGuardResult {
  if (context.tlp_classification !== 'RED') {
    return { allowed: true };
  }

  const required = governance.tlp_red_policy; // always 'human_required'

  if (providedPolicy === required) {
    return { allowed: true };
  }

  return {
    allowed: false,
    required,
    provided: providedPolicy,
    reason:
      `TLP:RED improvements require "${required}" verification — ` +
      `no weaker policy is acceptable (provided: "${providedPolicy}")`,
  };
}

// ---------------------------------------------------------------------------
// Composite guard — run all governance checks in one call
// ---------------------------------------------------------------------------

/**
 * Run all governance guards for a given context and provided policy.
 * Returns the first failing guard result, or `{ allowed: true }` if all pass.
 *
 * Guards are evaluated in priority order:
 *   1. TLP:RED hard gate (most restrictive)
 *   2. Production promotion policy
 */
export function checkGovernance(
  context: Pick<ImprovementContext, 'scope' | 'tlp_classification'>,
  providedPolicy: VerificationPolicy,
  governance: GovernanceConfig = DEFAULT_GOVERNANCE_CONFIG,
): GovernanceGuardResult {
  const tlpResult = checkTlpRedGate(context, providedPolicy, governance);
  if (!tlpResult.allowed) return tlpResult;

  const prodResult = checkProductionPromotionPolicy(context, providedPolicy, governance);
  if (!prodResult.allowed) return prodResult;

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Policy resolution helper (re-exported for convenience)
// ---------------------------------------------------------------------------

/**
 * Resolve the minimum required verification policy for a context.
 * Delegates to `resolveRequiredPolicy` from types; re-exported here so
 * callers only need to import from this module.
 */
export { resolveRequiredPolicy };

/**
 * Assert that a governance config satisfies the invariants required for safe
 * operation. Throws with a descriptive message if violated.
 *
 * Called during runtime construction; may also be called in CI safety checks.
 */
export function assertGovernanceConfigValid(config: GovernanceConfig): void {
  if (
    VERIFICATION_POLICY_STRENGTH[config.production_direct_min_policy] <
    VERIFICATION_POLICY_STRENGTH['third_party_audit']
  ) {
    throw new Error(
      `GovernanceConfig invariant violated: production_direct_min_policy must be ` +
      `at least "third_party_audit" — got "${config.production_direct_min_policy}"`,
    );
  }

  if (config.tlp_red_policy !== 'human_required') {
    throw new Error(
      `GovernanceConfig invariant violated: tlp_red_policy must be "human_required" ` +
      `— got "${config.tlp_red_policy}"`,
    );
  }
}
