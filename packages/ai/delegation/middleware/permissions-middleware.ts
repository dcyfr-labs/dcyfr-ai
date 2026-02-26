/**
 * DCYFR Permissions Middleware
 * TLP:CLEAR
 *
 * SecurityMiddleware that validates permission token attenuation — child tokens
 * must be strict subsets of their parent tokens.  Wraps PermissionAttenuationEngine.
 *
 * @module delegation/middleware/permissions-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import { PermissionAttenuationEngine } from '../../permissions/attenuation-engine.js';
import type { PermissionToken } from '../../types/permission-tokens.js';
import type {
  SecurityMiddleware,
  SecurityContext,
  SecurityVerdict,
  SecurityOperationType,
} from '../../types/security-middleware.js';

/** Simplified token shape used in DelegationContract.permission_tokens */
export interface SimplifiedPermissionToken {
  token_id: string;
  scopes: string[];
  delegatable?: boolean;
  max_delegation_depth?: number;
}

/**
 * PermissionsMiddleware — validates permission attenuation in delegation chains.
 *
 * For each permission token in the child contract that matches a parent token by
 * `token_id`, the middleware calls `PermissionAttenuationEngine.validateAttenuation()`
 * to ensure scopes have not been escalated.
 *
 * Construction requires a callback that resolves the parent contract's tokens
 * given the parent contract ID.  If no parent exists (root delegation), or the
 * callback returns null/empty, validation is skipped and the verdict is `allow`.
 */
export class PermissionsMiddleware implements SecurityMiddleware {
  readonly name = 'permissions';
  /** Feature flag that must be `true` for this middleware to run */
  readonly featureFlag = 'security_monitoring';
  readonly appliesTo: SecurityOperationType[] = ['create'];

  private readonly engine: PermissionAttenuationEngine;
  private readonly fetchParentTokens: (
    parentContractId: string
  ) => SimplifiedPermissionToken[] | null;

  constructor(
    fetchParentTokens: (
      parentContractId: string
    ) => SimplifiedPermissionToken[] | null,
  ) {
    this.engine = new PermissionAttenuationEngine();
    this.fetchParentTokens = fetchParentTokens;
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const childTokens = context.contract.permission_tokens;
    const parentContractId = context.contract.parent_contract_id;

    // Skip validation when there are no child tokens or this is a root delegation
    if (!childTokens?.length || !parentContractId) {
      return { action: 'allow' };
    }

    const parentTokens = this.fetchParentTokens(parentContractId);
    if (!parentTokens?.length) {
      return { action: 'allow' };
    }

    const errors: string[] = [];

    for (const childToken of childTokens) {
      // Find the corresponding parent token by ID
      const parentSimplified = parentTokens.find(
        (p) => p.token_id === childToken.token_id,
      );

      if (!parentSimplified) {
        // No matching parent token — child token has no basis; treat as escalation
        errors.push(
          `No parent token found for token_id '${childToken.token_id}' in parent contract '${parentContractId}'`,
        );
        continue;
      }

      // Build a minimal PermissionToken from the simplified parent token
      const parentToken = this.buildMinimalPermissionToken(parentSimplified);

      // Build the AttenuatePermissionRequest from the child token
      const result = this.engine.validateAttenuation(parentToken, {
        parent_token_id: parentSimplified.token_id,
        new_holder: context.contract.delegatee?.agent_id ?? 'unknown',
        scopes: childToken.scopes,
        // actions, resources omitted — only scope attenuation is enforced here
      });

      if (!result.valid) {
        errors.push(
          `Permission escalation on token '${childToken.token_id}': ${result.errors.join('; ')}`,
        );
      }
    }

    if (errors.length > 0) {
      return {
        action: 'block',
        reason: errors.join(' | '),
        threat_type: 'permission_escalation',
        severity: 'critical',
        evidence: { errors },
      };
    }

    return { action: 'allow' };
  }

  /**
   * Build a minimal PermissionToken from a SimplifiedPermissionToken so that
   * PermissionAttenuationEngine.validateAttenuation() can be called.
   *
   * Fields not present in the simplified form are given safe defaults.
   */
  private buildMinimalPermissionToken(
    simplified: SimplifiedPermissionToken,
  ): PermissionToken {
    return {
      token_id: simplified.token_id,
      version: '1.0.0',
      status: 'active',
      holder: 'parent-holder',
      issuer: 'parent-issuer',
      scopes: simplified.scopes,
      actions: ['read', 'write', 'execute', 'delete', 'create', 'manage', 'delegate'],
      resource_types: ['workspace'],
      delegatable: simplified.delegatable ?? true,
      max_delegation_depth: simplified.max_delegation_depth ?? 5,
      delegation_depth: 0,
      grant: {
        granted_by: 'parent-issuer',
        granted_at: new Date().toISOString(),
        reason: 'inherited',
      },
      created_at: new Date().toISOString(),
    };
  }
}
