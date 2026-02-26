/**
 * Circuit Breaker — per-agent failure state machine
 * TLP:AMBER - Internal Use Only
 *
 * Design decision D6: Circuit breaker with cascading revocation.
 *
 * States: closed (normal) → open (blocked) ↔ half-open (probe allowed)
 *
 * The companion CircuitBreakerMiddleware wraps this as a SecurityMiddleware
 * that can be inserted into the SecurityMiddlewareChain.
 *
 * @module delegation/circuit-breaker
 * @version 1.0.0
 * @date 2026-02-24
 */

import { EventEmitter } from 'events';
import type { SecurityMiddleware, SecurityContext, SecurityVerdict, SecurityOperationType } from '../types/security-middleware.js';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'half-open' | 'open';

export interface CircuitBreakerConfig {
  /** Number of failures within windowMs before opening. Default: 5 */
  failureThreshold?: number;
  /** Sliding window for counting failures. Default: 60 000 ms */
  windowMs?: number;
  /** How long to stay open before testing with half-open. Default: 30 000 ms */
  cooldownMs?: number;
}

interface AgentCircuit {
  state: CircuitState;
  failures: number[];  // timestamps of recent failures
  openedAt: number;    // Epoch ms when circuit opened (0 if not open)
  probeAllowed: boolean; // half-open: true if a probe is currently in-flight
}

// ──────────────────────────────────────────────────────────────────────────
// CircuitBreaker
// ──────────────────────────────────────────────────────────────────────────

/**
 * CircuitBreaker emits:
 *   - `circuit_opened`      when an agent circuit trips open
 *   - `circuit_half_opened` when cooldown expires and probe is allowed
 *   - `circuit_closed`      when a probe succeeds and circuit resets
 */
export class CircuitBreaker extends EventEmitter {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;

  private readonly circuits = new Map<string, AgentCircuit>();

  constructor(config: CircuitBreakerConfig = {}) {
    super();
    this.failureThreshold = config.failureThreshold ?? 5;
    this.windowMs = config.windowMs ?? 60_000;
    this.cooldownMs = config.cooldownMs ?? 30_000;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns true if the agent may proceed; false if the circuit is open.
   * Transitions open → half-open when cooldown expires.
   */
  canProceed(agentId: string): boolean {
    const circuit = this.getOrCreate(agentId);
    const now = Date.now();

    switch (circuit.state) {
      case 'closed':
        return true;

      case 'open': {
        if (now - circuit.openedAt >= this.cooldownMs) {
          circuit.state = 'half-open';
          circuit.probeAllowed = true;
          this.emit('circuit_half_opened', { agent_id: agentId });
        }
        return circuit.state === 'half-open' && circuit.probeAllowed;
      }

      case 'half-open':
        // Only allow one probe at a time
        return circuit.probeAllowed;
    }
  }

  recordSuccess(agentId: string): void {
    const circuit = this.circuits.get(agentId);
    if (!circuit) return;

    if (circuit.state === 'half-open') {
      circuit.state = 'closed';
      circuit.failures = [];
      circuit.openedAt = 0;
      circuit.probeAllowed = false;
      this.emit('circuit_closed', { agent_id: agentId });
    }
    // No-op for closed circuits — do not penalise successes
  }

  recordFailure(agentId: string): void {
    const circuit = this.getOrCreate(agentId);
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Prune old failures
    circuit.failures = circuit.failures.filter(t => t > cutoff);
    circuit.failures.push(now);

    if (circuit.state === 'half-open') {
      // Probe failed — reopen immediately
      circuit.state = 'open';
      circuit.openedAt = now;
      circuit.probeAllowed = false;
      this.emit('circuit_opened', { agent_id: agentId, failure_count: circuit.failures.length });
      return;
    }

    if (circuit.state === 'closed' && circuit.failures.length >= this.failureThreshold) {
      circuit.state = 'open';
      circuit.openedAt = now;
      this.emit('circuit_opened', { agent_id: agentId, failure_count: circuit.failures.length });
    }
  }

  getState(agentId: string): CircuitState {
    return this.circuits.get(agentId)?.state ?? 'closed';
  }

  /** Force-reset a circuit (e.g., after manual review). */
  reset(agentId: string): void {
    this.circuits.delete(agentId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  private getOrCreate(agentId: string): AgentCircuit {
    let circuit = this.circuits.get(agentId);
    if (!circuit) {
      circuit = { state: 'closed', failures: [], openedAt: 0, probeAllowed: false };
      this.circuits.set(agentId, circuit);
    }
    return circuit;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// CircuitBreakerMiddleware — SecurityMiddleware adapter
// ──────────────────────────────────────────────────────────────────────────

export class CircuitBreakerMiddleware implements SecurityMiddleware {
  readonly name = 'circuit-breaker';
  readonly featureFlag = 'security_monitoring';
  readonly appliesTo: SecurityOperationType[] = ['create'];

  constructor(private readonly breaker: CircuitBreaker) {}

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    // Check both delegator and delegatee circuits
    const idsToCheck: string[] = [];
    const delegatorId = context.delegator_auth?.agent_id ?? context.contract.delegator?.agent_id;
    const delegateeId = context.delegatee_auth?.agent_id ?? context.contract.delegatee?.agent_id;
    if (delegatorId) idsToCheck.push(delegatorId);
    if (delegateeId) idsToCheck.push(delegateeId);

    for (const agentId of idsToCheck) {
      if (!this.breaker.canProceed(agentId)) {
        return {
          action: 'block',
          reason: `Circuit breaker is open for agent '${agentId}'. Too many recent failures.`,
          threat_type: 'circuit_open',
          severity: 'critical',
          evidence: {
            agent_id: agentId,
            circuit_state: this.breaker.getState(agentId),
          },
        };
      }
    }

    return { action: 'allow' };
  }
}
