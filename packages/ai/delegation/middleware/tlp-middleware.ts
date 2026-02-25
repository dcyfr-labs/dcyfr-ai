/**
 * TLP Classification Middleware — wraps TLPEnforcementEngine
 * TLP:AMBER - Internal Use Only
 *
 * Checks that the delegatee agent has sufficient TLP clearance for the contract's
 * classification level.  Delegates to the standalone TLPEnforcementEngine already
 * present in src/delegation/tlp-enforcement.ts.
 *
 * @module delegation/middleware/tlp-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { SecurityMiddleware, SecurityContext, SecurityVerdict } from '../../types/security-middleware.js';
import { TLPEnforcementEngine } from '../../src/delegation/tlp-enforcement.js';


export class TLPMiddleware implements SecurityMiddleware {
  readonly name = 'tlp';
  readonly featureFlag = 'security_monitoring';

  private readonly engine: TLPEnforcementEngine;

  constructor(engine?: TLPEnforcementEngine) {
    this.engine = engine ?? new TLPEnforcementEngine();
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const tlpClass = context.contract.tlp_classification;

    // No classification — nothing to enforce
    if (!tlpClass) return { action: 'allow' };

    const delegateeId =
      context.delegatee_auth?.agent_id ??
      context.contract.delegatee?.agent_id;

    if (!delegateeId) return { action: 'allow' };

    // Build a minimal contract shape the engine understands.
    // TLPEnforcementEngine accesses `delegatee_agent_id` (legacy flat field)
    // and expects full TLP prefix (e.g., 'TLP:CLEAR'), while our SecurityContext
    // stores unprefixed values ('CLEAR'). Bridge that here.
    const prefixedTlp = tlpClass.startsWith('TLP:') ? tlpClass : `TLP:${tlpClass}`;
    const legacyContract = {
      ...context.contract,
      contract_id: context.contract.contract_id ?? 'preflight',
      delegatee_agent_id: delegateeId,
      tlp_classification: prefixedTlp,
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = this.engine.enforceTLPClassification(legacyContract);

    if (result.allowed) {
      return { action: 'allow' };
    }

    return {
      action: 'block',
      reason: result.reason,
      threat_type: 'tlp_violation',
      severity: 'critical',
      evidence: {
        required_clearance: result.required_clearance,
        agent_clearance: result.agent_clearance,
        agent_id: delegateeId,
      },
    };
  }
}
