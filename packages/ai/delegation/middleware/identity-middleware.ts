/**
 * Identity Middleware — HMAC-SHA256 token verification
 * TLP:AMBER - Internal Use Only
 *
 * Verifies that delegator and delegatee have valid auth tokens before allowing
 * a delegation operation.  When the `identity_auth` feature flag is disabled
 * (default in legacy environments) the middleware is a no-op pass-through.
 *
 * @module delegation/middleware/identity-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { SecurityMiddleware, SecurityContext, SecurityVerdict } from '../../types/security-middleware.js';
import {
  AgentRegistry,
  AuthenticationFailedError,
  AuthenticationExpiredError,
  AgentNotFoundError,
} from '../agent-registry.js';

export class IdentityMiddleware implements SecurityMiddleware {
  readonly name = 'identity';
  readonly featureFlag = 'identity_auth';

  constructor(private readonly registry: AgentRegistry) {}

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const errors: string[] = [];

    // Verify delegator if auth fields are present
    if (context.delegator_auth) {
      const err = this.verify(context.delegator_auth, 'delegator');
      if (err) errors.push(err);
    }

    // Verify delegatee if auth fields are present
    if (context.delegatee_auth) {
      const err = this.verify(context.delegatee_auth, 'delegatee');
      if (err) errors.push(err);
    }

    if (errors.length === 0) return { action: 'allow' };

    return {
      action: 'block',
      reason: `Identity verification failed: ${errors.join('; ')}`,
      threat_type: 'identity_failure',
      severity: 'critical',
      evidence: { errors },
    };
  }

  private verify(
    agent: { agent_id: string; auth_token?: string; auth_timestamp?: string; key_id?: string },
    role: string,
  ): string | null {
    if (!agent.auth_token || !agent.auth_timestamp || !agent.key_id) {
      return `${role} '${agent.agent_id}' is missing auth credentials`;
    }
    try {
      this.registry.verifyToken(agent.auth_token, agent.agent_id, agent.auth_timestamp, agent.key_id);
      return null;
    } catch (err) {
      if (err instanceof AuthenticationExpiredError) {
        return `${role} token expired for '${agent.agent_id}'`;
      }
      if (err instanceof AuthenticationFailedError || err instanceof AgentNotFoundError) {
        return `${role} auth failed for '${agent.agent_id}': ${(err as Error).message}`;
      }
      return `${role} auth error for '${agent.agent_id}': ${(err as Error).message}`;
    }
  }
}
