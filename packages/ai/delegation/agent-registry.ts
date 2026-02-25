/**
 * Agent Registry — HMAC-SHA256 Identity Provider
 * TLP:AMBER - Internal Use Only
 *
 * Provides agent registration, key management, and HMAC-SHA256 token
 * verification for the delegation identity layer.
 *
 * Design decision D2: HMAC-SHA256 over asymmetric PKI — simpler operational
 * overhead while providing sufficient integrity; keys rotated via grace-period
 * mechanism to allow in-flight contracts to finish with the old key.
 *
 * @module delegation/agent-registry
 * @version 1.0.0
 * @date 2026-02-24
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A registered signing key for an agent.
 */
export interface AgentKey {
  /** Unique key identifier (returned during registration) */
  key_id: string;
  /** The raw HMAC secret (never exposed outside this module) */
  secret: string;
  /** ISO 8601 creation timestamp */
  issued_at: string;
  /** ISO 8601 expiry — after which the key is hard-rejected */
  expires_at?: string;
  /** When present, the key is in grace-period and will be removed after this time */
  grace_until?: string;
  /** Whether the key has been explicitly revoked */
  revoked: boolean;
}

/**
 * Registry entry for a single agent.
 */
export interface AgentRegistryEntry {
  agent_id: string;
  agent_name: string;
  /** Active key — used for new tokens */
  primary_key: AgentKey;
  /** Previous key kept during rotation grace period */
  grace_key?: AgentKey;
  registered_at: string;
  last_verified_at?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────────────────

export class AgentAlreadyRegisteredError extends Error {
  constructor(agent_id: string) {
    super(`Agent '${agent_id}' is already registered in this registry.`);
    this.name = 'AgentAlreadyRegisteredError';
  }
}

export class AgentNotFoundError extends Error {
  constructor(agent_id: string) {
    super(`Agent '${agent_id}' is not registered in this registry.`);
    this.name = 'AgentNotFoundError';
  }
}

export class AuthenticationFailedError extends Error {
  constructor(reason: string) {
    super(`Authentication failed: ${reason}`);
    this.name = 'AuthenticationFailedError';
  }
}

export class AuthenticationExpiredError extends Error {
  constructor(agent_id: string) {
    super(`Authentication token for agent '${agent_id}' has expired.`);
    this.name = 'AuthenticationExpiredError';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** Default token validity window: 5 minutes */
const DEFAULT_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Default key rotation grace period: 10 minutes */
const DEFAULT_GRACE_PERIOD_MS = 10 * 60 * 1000;

/** HMAC algorithm */
const HMAC_ALGO = 'sha256';

// ──────────────────────────────────────────────────────────────────────────────
// AgentRegistry
// ──────────────────────────────────────────────────────────────────────────────

/**
 * In-memory agent registry.
 *
 * Usage:
 * ```typescript
 * const registry = new AgentRegistry();
 * const { key_id } = registry.register('agent-123', 'my-agent', 'secret-key');
 *
 * // Sign a request:
 * const token = registry.signToken('agent-123', 'secret-key');
 *
 * // Verify:
 * registry.verifyToken(token.auth_token, 'agent-123', token.auth_timestamp, token.key_id);
 * ```
 */
export class AgentRegistry {
  private readonly store = new Map<string, AgentRegistryEntry>();
  private readonly tokenTtlMs: number;
  private readonly gracePeriodMs: number;

  constructor(options: { tokenTtlMs?: number; gracePeriodMs?: number } = {}) {
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    this.gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
  }

  // ────────────────────────────────────────────────
  // Registration
  // ────────────────────────────────────────────────

  /**
   * Register a new agent with an HMAC secret.
   *
   * @param agent_id   - unique agent identifier
   * @param agent_name - human-readable name
   * @param secret     - HMAC signing secret (caller must manage secure delivery)
   * @returns `key_id` to include in auth tokens
   * @throws AgentAlreadyRegisteredError if agent_id is taken
   */
  register(agent_id: string, agent_name: string, secret: string): { key_id: string } {
    if (this.store.has(agent_id)) {
      throw new AgentAlreadyRegisteredError(agent_id);
    }
    const key_id = `key-${randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    this.store.set(agent_id, {
      agent_id,
      agent_name,
      primary_key: { key_id, secret, issued_at: now, revoked: false },
      registered_at: now,
    });
    return { key_id };
  }

  /**
   * Rotate the agent's signing key.
   *
   * The old key enters a grace period (default 10 min) so in-flight tokens
   * signed with it remain valid.
   *
   * @returns new `key_id`
   * @throws AgentNotFoundError
   */
  rotateKey(agent_id: string, new_secret: string): { key_id: string } {
    const entry = this.requireEntry(agent_id);
    const key_id = `key-${randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    const graceUntil = new Date(Date.now() + this.gracePeriodMs).toISOString();

    entry.grace_key = { ...entry.primary_key, grace_until: graceUntil };
    entry.primary_key = { key_id, secret: new_secret, issued_at: now, revoked: false };
    return { key_id };
  }

  /**
   * Revoke a specific key immediately.
   * @throws AgentNotFoundError
   */
  revokeKey(agent_id: string, key_id: string): void {
    const entry = this.requireEntry(agent_id);
    if (entry.primary_key.key_id === key_id) entry.primary_key.revoked = true;
    if (entry.grace_key?.key_id === key_id) entry.grace_key.revoked = true;
  }

  // ────────────────────────────────────────────────
  // Token creation (helper for callers)
  // ────────────────────────────────────────────────

  /**
   * Produce an auth token for an agent using their secret.
   *
   * The caller owns the secret; this is a convenience helper that mirrors what
   * the agent SDK would do on the client side.
   *
   * @returns `{ auth_token, auth_timestamp, key_id }` — include all three in AuthenticatedAgent
   */
  signToken(agent_id: string, secret: string): {
    auth_token: string;
    auth_timestamp: string;
    key_id: string;
  } {
    const entry = this.requireEntry(agent_id);
    const auth_timestamp = new Date().toISOString();
    const message = `${agent_id}:${auth_timestamp}`;
    const auth_token = createHmac(HMAC_ALGO, secret).update(message).digest('hex');
    return { auth_token, auth_timestamp, key_id: entry.primary_key.key_id };
  }

  // ────────────────────────────────────────────────
  // Verification
  // ────────────────────────────────────────────────

  /**
   * Verify an auth token.
   *
   * @param auth_token     - hex HMAC digest from AuthenticatedAgent
   * @param agent_id       - claimed agent identity
   * @param auth_timestamp - ISO 8601 timestamp from AuthenticatedAgent
   * @param key_id         - key identifier from AuthenticatedAgent
   * @throws AgentNotFoundError, AuthenticationFailedError, AuthenticationExpiredError
   */
  verifyToken(auth_token: string, agent_id: string, auth_timestamp: string, key_id: string): void {
    const entry = this.requireEntry(agent_id);

    // Expiry check
    const tokenAge = Date.now() - new Date(auth_timestamp).getTime();
    if (tokenAge > this.tokenTtlMs) {
      throw new AuthenticationExpiredError(agent_id);
    }

    // Find the matching key (primary or grace)
    const key = this.resolveKey(entry, key_id);
    if (!key) {
      throw new AuthenticationFailedError(`key_id '${key_id}' not found or revoked for agent '${agent_id}'`);
    }

    // Prune expired grace key opportunistically
    this.pruneGraceKey(entry);

    // Constant-time compare
    const message = `${agent_id}:${auth_timestamp}`;
    const expected = createHmac(HMAC_ALGO, key.secret).update(message).digest();
    const actual = Buffer.from(auth_token, 'hex');

    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new AuthenticationFailedError(`HMAC mismatch for agent '${agent_id}'`);
    }

    entry.last_verified_at = new Date().toISOString();
  }

  // ────────────────────────────────────────────────
  // Lookup helpers
  // ────────────────────────────────────────────────

  /** Return true if agent is registered (does not check revocation) */
  isRegistered(agent_id: string): boolean {
    return this.store.has(agent_id);
  }

  /** Return the registry entry, or undefined */
  getEntry(agent_id: string): AgentRegistryEntry | undefined {
    return this.store.get(agent_id);
  }

  /** Return all registered agent IDs */
  listAgentIds(): string[] {
    return Array.from(this.store.keys());
  }

  // ────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────

  private requireEntry(agent_id: string): AgentRegistryEntry {
    const entry = this.store.get(agent_id);
    if (!entry) throw new AgentNotFoundError(agent_id);
    return entry;
  }

  private resolveKey(entry: AgentRegistryEntry, key_id: string): AgentKey | null {
    if (entry.primary_key.key_id === key_id && !entry.primary_key.revoked) {
      return entry.primary_key;
    }
    if (
      entry.grace_key &&
      entry.grace_key.key_id === key_id &&
      !entry.grace_key.revoked &&
      new Date(entry.grace_key.grace_until!).getTime() > Date.now()
    ) {
      return entry.grace_key;
    }
    return null;
  }

  private pruneGraceKey(entry: AgentRegistryEntry): void {
    if (
      entry.grace_key &&
      entry.grace_key.grace_until &&
      new Date(entry.grace_key.grace_until).getTime() <= Date.now()
    ) {
      entry.grace_key = undefined;
    }
  }
}
