/**
 * Security Middleware Chain
 * TLP:AMBER - Internal Use Only
 *
 * Composable pipeline that runs a registered set of SecurityMiddleware
 * implementations against a SecurityContext.  The chain:
 *
 *  1. Iterates middleware in registration order.
 *  2. Short-circuits on the first `block` verdict.
 *  3. Accumulates `warn` verdicts and continues.
 *  4. Returns a SecurityChainResult with full audit detail.
 *
 * Design decision D1: Fixed-order middleware chain — simpler to reason about
 * than a DAG; the canonical order is enforced by the builder helpers exported
 * at the bottom of this file.
 *
 * @module delegation/security-middleware-chain
 * @version 1.0.0
 * @date 2026-02-24
 */

import { EventEmitter } from 'events';
import type {
  SecurityMiddleware,
  SecurityContext,
  SecurityChainResult,
  SecurityVerdict,
} from '../types/security-middleware.js';

// ──────────────────────────────────────────────────────────────────────────────
// Chain class
// ──────────────────────────────────────────────────────────────────────────────

/**
 * SecurityMiddlewareChain
 *
 * Usage:
 * ```typescript
 * const chain = new SecurityMiddlewareChain();
 * chain.use(new FeatureFlagMiddleware(flagManager));
 * chain.use(new IdentityMiddleware(agentRegistry));
 * chain.use(new TLPMiddleware(tlpEngine));
 * // …
 *
 * const result = await chain.evaluate(context);
 * if (result.action === 'block') { throw … }
 * ```
 *
 * Alternatively use `buildDefaultChain()` for the canonical ordering.
 */
export class SecurityMiddlewareChain extends EventEmitter {
  private readonly middleware: SecurityMiddleware[] = [];

  /** Add a middleware to the END of the chain */
  use(mw: SecurityMiddleware): this {
    this.middleware.push(mw);
    return this;
  }

  /** Add a middleware at a specific index (for patching canonical order) */
  insert(index: number, mw: SecurityMiddleware): this {
    this.middleware.splice(index, 0, mw);
    return this;
  }

  /** Return a snapshot of registered middleware names */
  get names(): string[] {
    return this.middleware.map(m => m.name);
  }

  /**
   * Evaluate all middleware against `context`.
   *
   * Events emitted:
   * - `security_warning`  { middleware, verdict, context }
   * - `security_blocked`  { middleware, verdict, context }
   * - `chain_evaluated`   { result, context }
   */
  async evaluate(context: SecurityContext): Promise<SecurityChainResult> {
    const start = Date.now();
    const middlewareResults: SecurityChainResult['middleware_results'] = [];
    const warnings: Array<Extract<SecurityVerdict, { action: 'warn' }>> = [];

    let blockingVerdict: Extract<SecurityVerdict, { action: 'block' }> | undefined;
    let blockedBy: string | undefined;

    for (const mw of this.middleware) {
      // Skip if feature flag is absent/false
      if (mw.featureFlag && !context.feature_flags?.[mw.featureFlag]) {
        middlewareResults.push({
          middleware: mw.name,
          verdict: { action: 'allow' },
          elapsed_ms: 0,
        });
        continue;
      }

      // Skip if operations filter doesn't match
      if (mw.appliesTo && !mw.appliesTo.includes(context.operation)) {
        middlewareResults.push({
          middleware: mw.name,
          verdict: { action: 'allow' },
          elapsed_ms: 0,
        });
        continue;
      }

      const mwStart = Date.now();
      let verdict: SecurityVerdict;
      try {
        verdict = await mw.evaluate(context);
      } catch (err) {
        // Middleware threw — treat as a blocking error to fail safe
        verdict = {
          action: 'block',
          reason: `Middleware '${mw.name}' threw an unexpected error: ${(err as Error).message}`,
          threat_type: 'anomaly',
          severity: 'critical',
          evidence: { error: String(err) },
        };
      }
      const elapsed_ms = Date.now() - mwStart;

      middlewareResults.push({ middleware: mw.name, verdict, elapsed_ms });

      if (verdict.action === 'warn') {
        warnings.push(verdict);
        this.emit('security_warning', { middleware: mw.name, verdict, context });
      } else if (verdict.action === 'block') {
        blockingVerdict = verdict;
        blockedBy = mw.name;
        this.emit('security_blocked', { middleware: mw.name, verdict, context });
        break; // short-circuit
      }
    }

    const evaluation_time_ms = Date.now() - start;
    const action = blockingVerdict ? 'block' : warnings.length > 0 ? 'warn' : 'allow';

    const result: SecurityChainResult = {
      action,
      blocking_verdict: blockingVerdict,
      warnings,
      blocked_by: blockedBy,
      evaluation_time_ms,
      middleware_results: middlewareResults,
    };

    this.emit('chain_evaluated', { result, context });
    return result;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal stub middleware (used during bootstrap before real engines load)
// ──────────────────────────────────────────────────────────────────────────────

/** Always allows — useful as a placeholder / no-op in tests */
export class AllowAllMiddleware implements SecurityMiddleware {
  constructor(public readonly name: string) {}
  async evaluate(): Promise<SecurityVerdict> {
    return { action: 'allow' };
  }
}

/** Always blocks with a fixed reason — useful in tests */
export class BlockAllMiddleware implements SecurityMiddleware {
  constructor(
    public readonly name: string,
    private readonly reason = 'blocked by test fixture',
  ) {}
  async evaluate(): Promise<SecurityVerdict> {
    return {
      action: 'block',
      reason: this.reason,
      threat_type: 'anomaly',
      severity: 'critical',
    };
  }
}
