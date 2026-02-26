/**
 * DCYFR Feature Flag Middleware
 * TLP:CLEAR
 *
 * First-in-chain kill-switch middleware.  Blocks all delegation operations when
 * the `delegation_enabled` feature flag is disabled via FeatureFlagManager.
 *
 * Unlike other middleware this one intentionally has NO `featureFlag` property —
 * it IS the gate and gating itself would be circular.
 *
 * @module delegation/middleware/feature-flag-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import { FeatureFlagManager } from '../feature-flags.js';
import type {
  SecurityMiddleware,
  SecurityContext,
  SecurityVerdict,
} from '../../types/security-middleware.js';

/**
 * Thrown when delegation is attempted while the `delegation_enabled` flag is
 * set to `false`.  Extends Error so catch-blocks can distinguish it from other
 * security rejections.
 */
export class DelegationDisabledError extends Error {
  constructor() {
    super('Delegation is disabled via feature flag (delegation_enabled=false)');
    this.name = 'DelegationDisabledError';
  }
}

/**
 * FeatureFlagMiddleware — master kill-switch for the delegation framework.
 *
 * Registers as the first middleware in every `SecurityMiddlewareChain` so that
 * all downstream guards are skipped when delegation is administratively disabled.
 *
 * Usage:
 * ```ts
 * const chain = new SecurityMiddlewareChain();
 * chain.use(new FeatureFlagMiddleware(flagManager));   // must come first
 * chain.use(new IdentityMiddleware(agentRegistry));
 * // …
 * ```
 */
export class FeatureFlagMiddleware implements SecurityMiddleware {
  /** Unique name used in chain events and audit logs */
  readonly name = 'feature-flag';

  // Intentionally NO `featureFlag` property — this is the kill-switch itself
  // and must always execute regardless of feature-flag state.

  private readonly flagManager: FeatureFlagManager;

  constructor(flagManager: FeatureFlagManager) {
    this.flagManager = flagManager;
  }

  async evaluate(_context: SecurityContext): Promise<SecurityVerdict> {
    const evaluation = this.flagManager.isEnabled('delegation_enabled');
    if (!evaluation.enabled) {
      // Throw a typed error so unit tests can assert on `DelegationDisabledError`.
      // The SecurityMiddlewareChain catches this and converts it to a 'block' verdict.
      throw new DelegationDisabledError();
    }
    return { action: 'allow' };
  }
}
