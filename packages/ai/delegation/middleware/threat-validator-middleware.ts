/**
 * Threat Validator Middleware — wraps SecurityThreatValidator
 * TLP:AMBER - Internal Use Only
 *
 * Runs the full 7-vector threat detection pipeline from
 * src/delegation/security-threat-model.ts against the contract being created or
 * updated.  Replaces the 4-rule inline detectSecurityThreat() in contract-manager.
 *
 * @module delegation/middleware/threat-validator-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { SecurityMiddleware, SecurityContext, SecurityVerdict, SecuritySeverity } from '../../types/security-middleware.js';
import { SecurityThreatValidator } from '../../src/delegation/security-threat-model.js';
import type { DelegationContract } from '../../types/delegation-contracts.js';

export class ThreatValidatorMiddleware implements SecurityMiddleware {
  readonly name = 'threat-validator';
  readonly featureFlag = 'security_monitoring';

  private readonly validator: SecurityThreatValidator;

  constructor(validator?: SecurityThreatValidator) {
    this.validator = validator ?? new SecurityThreatValidator();
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    // Build a minimal DelegationContract for the validator
    const partial = context.contract;
    if (!partial.contract_id && !partial.task_id) {
      // Nothing to validate yet
      return { action: 'allow' };
    }

    // Build synthetic contract for threat detection; only fields used by
    // SecurityThreatValidator are required
    const syntheticContract: DelegationContract = {
      contract_id: partial.contract_id ?? `preflight-${Date.now()}`,
      delegator: partial.delegator ?? context.delegator_auth ?? { agent_id: 'unknown', agent_name: 'unknown' },
      delegatee: partial.delegatee ?? context.delegatee_auth ?? { agent_id: 'unknown', agent_name: 'unknown' },
      task_id: partial.task_id ?? 'unknown',
      task_description: partial.task_description ?? '',
      verification_policy: partial.verification_policy ?? 'direct_inspection',
      success_criteria: partial.success_criteria ?? {},
      timeout_ms: partial.timeout_ms ?? 30000,
      status: partial.status ?? 'pending',
      created_at: partial.created_at ?? new Date().toISOString(),
      delegation_depth: partial.delegation_depth ?? 0,
      tlp_classification: partial.tlp_classification,
      permission_tokens: partial.permission_tokens,
      parent_contract_id: partial.parent_contract_id,
      metadata: partial.metadata,
    };

    const result = await this.validator.validateDelegationSecurity(syntheticContract as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!result.threat_detected) return { action: 'allow' };

    const severity: SecuritySeverity = (result.severity as SecuritySeverity) ?? 'high';
    const isCritical = result.action === 'block' || result.action === 'terminate_chain';

    if (isCritical) {
      return {
        action: 'block',
        reason: result.description,
        threat_type: result.threat_type as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        severity,
        evidence: {
          confidence: result.confidence,
          action_recommended: result.action,
          ...result.evidence,
        },
      };
    }

    return {
      action: 'warn',
      reason: result.description,
      threat_type: result.threat_type as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      severity,
      evidence: {
        confidence: result.confidence,
        action_recommended: result.action,
        ...result.evidence,
      },
    };
  }
}
