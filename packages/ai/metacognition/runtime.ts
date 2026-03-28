/**
 * Metacognitive Improvement Runtime — Lifecycle State Machine
 * TLP:AMBER - Internal Use Only
 *
 * Implements the governed lifecycle state machine for improvement proposals:
 *   propose → evaluate → approve → apply → (rollback)
 *
 * Enforcement rules:
 *   - Schema version must be compatible before any proposal is processed.
 *   - `production_direct` scope requires at least `third_party_audit`.
 *   - TLP:RED context requires `human_required`.
 *   - State transitions are validated; invalid transitions throw.
 *   - All lifecycle events are written to the injected ImprovementLedger.
 *
 * Feature flag: controlled by `MetacognitiveRuntimeConfig.enabled`.
 * When disabled the runtime is a structural no-op (see task 1.3 for env wiring).
 *
 * @module ai/metacognition/runtime
 * @version 1.0.0
 */

import type { VerificationPolicy, VerificationResult } from '../types/delegation-contracts.js';
import type {
  ImprovementLifecycleState,
  ImprovementProposal,
  ImprovementEvaluationResult,
  MetacognitiveRuntimeConfig,
  PolicySnapshot,
} from './types.js';
import {
  VALID_LIFECYCLE_TRANSITIONS,
  DEFAULT_GOVERNANCE_CONFIG,
  VERIFICATION_POLICY_STRENGTH,
  isSchemaCompatible,
  meetsVerificationThreshold,
  resolveRequiredPolicy,
  formatSchemaVersion,
} from './types.js';

// ---------------------------------------------------------------------------
// Ledger interface (implemented in full by task 2.1)
// ---------------------------------------------------------------------------

/** A single entry in the improvement ledger. */
export interface LedgerEntry {
  readonly entry_id: string;
  readonly proposal_id: string;
  readonly state: ImprovementLifecycleState;
  readonly actor: string;
  readonly timestamp: string;
  /** ID of the previous ledger entry for this proposal (null for first). */
  readonly previous_entry_id: string | null;
  readonly payload: LedgerEntryPayload;
}

/** Discriminated union payload per lifecycle state. */
export type LedgerEntryPayload =
  | { kind: 'proposed'; proposal: ImprovementProposal; source_snapshot: PolicySnapshot }
  | { kind: 'evaluated'; result: ImprovementEvaluationResult }
  | { kind: 'approved'; verification_result: VerificationResult; approved_by: string }
  | { kind: 'rejected'; reason: string; at_state: ImprovementLifecycleState }
  | { kind: 'applied'; result_snapshot: PolicySnapshot }
  | { kind: 'rolled_back'; reason: string; restored_snapshot_id: string };

/**
 * Minimal ledger interface consumed by the runtime.
 * Full implementation (append-only persistence, lineage queries) is in task 2.1.
 */
export interface ImprovementLedger {
  /** Append a new entry. Must be idempotent on duplicate entry_ids. */
  append(entry: LedgerEntry): Promise<void>;
  /** Return all entries for a proposal in insertion order. */
  getEntriesForProposal(proposal_id: string): Promise<LedgerEntry[]>;
  /** Return the latest entry for a proposal, or null. */
  getLatestEntry(proposal_id: string): Promise<LedgerEntry | null>;
}

// ---------------------------------------------------------------------------
// Runtime errors
// ---------------------------------------------------------------------------

/** Thrown when an invalid lifecycle transition is attempted. */
export class InvalidLifecycleTransitionError extends Error {
  constructor(
    public readonly proposal_id: string,
    public readonly from: ImprovementLifecycleState,
    public readonly to: ImprovementLifecycleState,
  ) {
    super(
      `Invalid lifecycle transition for proposal ${proposal_id}: ${from} → ${to}`,
    );
    this.name = 'InvalidLifecycleTransitionError';
  }
}

/** Thrown when a policy snapshot fails schema version compatibility check. */
export class SchemaIncompatibleError extends Error {
  constructor(
    public readonly snapshot_id: string,
    public readonly snapshot_version: string,
    public readonly runtime_version: string,
  ) {
    super(
      `Policy snapshot ${snapshot_id} schema version ${snapshot_version} is incompatible with runtime version ${runtime_version}`,
    );
    this.name = 'SchemaIncompatibleError';
  }
}

/** Thrown when an approve request fails governance threshold checks. */
export class GovernanceViolationError extends Error {
  constructor(
    public readonly proposal_id: string,
    public readonly provided: VerificationPolicy,
    public readonly required: VerificationPolicy,
    public readonly reason: string,
  ) {
    super(
      `Governance violation for proposal ${proposal_id}: provided "${provided}" but required "${required}" — ${reason}`,
    );
    this.name = 'GovernanceViolationError';
  }
}

/** Thrown when the runtime is disabled and a proposal is submitted. */
export class RuntimeDisabledError extends Error {
  constructor() {
    super(
      'MetacognitiveImprovementRuntime is disabled. Set ENABLE_METACOG_RUNTIME=true to enable.',
    );
    this.name = 'RuntimeDisabledError';
  }
}

// ---------------------------------------------------------------------------
// ID generation helper (injected for testability)
// ---------------------------------------------------------------------------

export type IdGenerator = () => string;

function defaultIdGenerator(): string {
  // crypto.randomUUID is available in Node 19+; fall back to a simple impl
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// MetacognitiveImprovementRuntime
// ---------------------------------------------------------------------------

/**
 * Governed runtime for the improvement lifecycle state machine.
 *
 * Usage:
 * ```typescript
 * const runtime = new MetacognitiveImprovementRuntime(config, ledger);
 * await runtime.propose(snapshot, proposal);
 * await runtime.evaluate(proposal_id, evaluationResult);
 * await runtime.approve(proposal_id, verificationResult, 'human-reviewer-1');
 * await runtime.apply(proposal_id, resultSnapshot);
 * ```
 */
export class MetacognitiveImprovementRuntime {
  private readonly config: MetacognitiveRuntimeConfig;
  private readonly ledger: ImprovementLedger;
  private readonly generateId: IdGenerator;

  constructor(
    config: MetacognitiveRuntimeConfig,
    ledger: ImprovementLedger,
    generateId: IdGenerator = defaultIdGenerator,
  ) {
    this.config = config;
    this.ledger = ledger;
    this.generateId = generateId;

    if (config.enabled) {
      this.assertGovernanceInvariants(config);
    }
  }

  // -------------------------------------------------------------------------
  // Public lifecycle methods
  // -------------------------------------------------------------------------

  /**
   * Submit an improvement proposal.
   *
   * Validates:
   * 1. Runtime is enabled.
   * 2. Source snapshot schema version is compatible with this runtime.
   *
   * On success appends a `proposed` ledger entry.
   *
   * @throws {RuntimeDisabledError} if the runtime is disabled.
   * @throws {SchemaIncompatibleError} if the snapshot schema is incompatible.
   */
  async propose(
    sourceSnapshot: PolicySnapshot,
    proposal: ImprovementProposal,
  ): Promise<LedgerEntry> {
    this.assertEnabled();
    this.assertSchemaCompatible(sourceSnapshot);

    // Reject if this proposal has already been submitted
    const existing = await this.ledger.getLatestEntry(proposal.proposal_id);
    if (existing) {
      throw new InvalidLifecycleTransitionError(proposal.proposal_id, existing.state, 'proposed');
    }

    const entry: LedgerEntry = {
      entry_id: this.generateId(),
      proposal_id: proposal.proposal_id,
      state: 'proposed',
      actor: proposal.proposed_by,
      timestamp: new Date().toISOString(),
      previous_entry_id: null,
      payload: { kind: 'proposed', proposal, source_snapshot: sourceSnapshot },
    };

    await this.ledger.append(entry);
    return entry;
  }

  /**
   * Record the evaluation result for a proposal.
   *
   * Transitions `proposed → evaluated` (pass) or `proposed → rejected` (fail).
   * Rejection occurs when the evaluation did not pass.
   *
   * @throws {InvalidLifecycleTransitionError} if proposal is not in `proposed` state.
   */
  async evaluate(
    proposalId: string,
    result: ImprovementEvaluationResult,
    evaluatedBy: string,
  ): Promise<LedgerEntry> {
    this.assertEnabled();

    const current = await this.requireLatestEntry(proposalId, 'proposed');
    const nextState: ImprovementLifecycleState = result.passed ? 'evaluated' : 'rejected';
    this.assertValidTransition(proposalId, current.state, nextState);

    const entry: LedgerEntry = {
      entry_id: this.generateId(),
      proposal_id: proposalId,
      state: nextState,
      actor: evaluatedBy,
      timestamp: new Date().toISOString(),
      previous_entry_id: current.entry_id,
      payload:
        nextState === 'evaluated'
          ? { kind: 'evaluated', result }
          : { kind: 'rejected', reason: `Evaluation failed: score ${result.score} below threshold`, at_state: 'proposed' },
    };

    await this.ledger.append(entry);
    return entry;
  }

  /**
   * Approve an evaluated proposal.
   *
   * Transitions `evaluated → approved`.
   *
   * Governance enforcement:
   * - Resolves the required verification policy from the proposal's context.
   * - Rejects if `verificationResult.verification_method` does not meet the
   *   required policy strength.
   * - TLP:RED always requires `human_required`.
   * - `production_direct` scope requires at minimum `third_party_audit`.
   *
   * @throws {InvalidLifecycleTransitionError} if proposal is not in `evaluated` state.
   * @throws {GovernanceViolationError} if the verification policy is insufficient.
   */
  async approve(
    proposalId: string,
    verificationResult: VerificationResult,
    approvedBy: string,
  ): Promise<LedgerEntry> {
    this.assertEnabled();

    const current = await this.requireLatestEntry(proposalId, 'evaluated');
    this.assertValidTransition(proposalId, current.state, 'approved');

    // Extract context from the original proposed entry
    const proposedEntry = await this.requireProposedEntry(proposalId);
    const proposedPayload = proposedEntry.payload;
    if (proposedPayload.kind !== 'proposed') {
      throw new Error(`Unexpected payload kind for proposed entry: ${proposedPayload.kind}`);
    }
    const context = proposedPayload.proposal.context;

    // Resolve required policy and enforce
    const requiredPolicy = resolveRequiredPolicy(context, this.config.governance);
    const providedPolicy = verificationResult.verification_method;

    if (!meetsVerificationThreshold(providedPolicy, requiredPolicy)) {
      const reason = this.buildGovernanceViolationReason(context, requiredPolicy);
      throw new GovernanceViolationError(proposalId, providedPolicy, requiredPolicy, reason);
    }

    // If verification itself did not pass, reject instead
    if (!verificationResult.verified) {
      this.assertValidTransition(proposalId, current.state, 'rejected');
      const rejectedEntry: LedgerEntry = {
        entry_id: this.generateId(),
        proposal_id: proposalId,
        state: 'rejected',
        actor: approvedBy,
        timestamp: new Date().toISOString(),
        previous_entry_id: current.entry_id,
        payload: {
          kind: 'rejected',
          reason: 'Verification did not pass',
          at_state: 'evaluated',
        },
      };
      await this.ledger.append(rejectedEntry);
      return rejectedEntry;
    }

    const entry: LedgerEntry = {
      entry_id: this.generateId(),
      proposal_id: proposalId,
      state: 'approved',
      actor: approvedBy,
      timestamp: new Date().toISOString(),
      previous_entry_id: current.entry_id,
      payload: { kind: 'approved', verification_result: verificationResult, approved_by: approvedBy },
    };

    await this.ledger.append(entry);
    return entry;
  }

  /**
   * Apply an approved proposal, recording the resulting policy snapshot.
   *
   * Transitions `approved → applied`.
   *
   * @throws {InvalidLifecycleTransitionError} if proposal is not in `approved` state.
   */
  async apply(
    proposalId: string,
    resultSnapshot: PolicySnapshot,
    appliedBy: string,
  ): Promise<LedgerEntry> {
    this.assertEnabled();

    const current = await this.requireLatestEntry(proposalId, 'approved');
    this.assertValidTransition(proposalId, current.state, 'applied');

    const entry: LedgerEntry = {
      entry_id: this.generateId(),
      proposal_id: proposalId,
      state: 'applied',
      actor: appliedBy,
      timestamp: new Date().toISOString(),
      previous_entry_id: current.entry_id,
      payload: { kind: 'applied', result_snapshot: resultSnapshot },
    };

    await this.ledger.append(entry);
    return entry;
  }

  /**
   * Roll back an applied proposal to a prior snapshot.
   *
   * Transitions `applied → rolled_back`.
   *
   * @throws {InvalidLifecycleTransitionError} if proposal is not in `applied` state.
   */
  async rollback(
    proposalId: string,
    reason: string,
    restoredSnapshotId: string,
    rolledBackBy: string,
  ): Promise<LedgerEntry> {
    this.assertEnabled();

    const current = await this.requireLatestEntry(proposalId, 'applied');
    this.assertValidTransition(proposalId, current.state, 'rolled_back');

    const entry: LedgerEntry = {
      entry_id: this.generateId(),
      proposal_id: proposalId,
      state: 'rolled_back',
      actor: rolledBackBy,
      timestamp: new Date().toISOString(),
      previous_entry_id: current.entry_id,
      payload: { kind: 'rolled_back', reason, restored_snapshot_id: restoredSnapshotId },
    };

    await this.ledger.append(entry);
    return entry;
  }

  /**
   * Return the current lifecycle state of a proposal, or null if unknown.
   */
  async getState(proposalId: string): Promise<ImprovementLifecycleState | null> {
    const entry = await this.ledger.getLatestEntry(proposalId);
    return entry?.state ?? null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new RuntimeDisabledError();
    }
  }

  private assertSchemaCompatible(snapshot: PolicySnapshot): void {
    if (!isSchemaCompatible(this.config.policy_schema_version, snapshot.schema_version)) {
      throw new SchemaIncompatibleError(
        snapshot.snapshot_id,
        formatSchemaVersion(snapshot.schema_version),
        formatSchemaVersion(this.config.policy_schema_version),
      );
    }
  }

  private assertValidTransition(
    proposalId: string,
    from: ImprovementLifecycleState,
    to: ImprovementLifecycleState,
  ): void {
    const valid = VALID_LIFECYCLE_TRANSITIONS.some(([f, t]) => f === from && t === to);
    if (!valid) {
      throw new InvalidLifecycleTransitionError(proposalId, from, to);
    }
  }

  private async requireLatestEntry(
    proposalId: string,
    expectedState: ImprovementLifecycleState,
  ): Promise<LedgerEntry> {
    const entry = await this.ledger.getLatestEntry(proposalId);
    if (!entry) {
      throw new Error(`No ledger entry found for proposal ${proposalId}`);
    }
    if (entry.state !== expectedState) {
      throw new InvalidLifecycleTransitionError(proposalId, entry.state, expectedState);
    }
    return entry;
  }

  private async requireProposedEntry(proposalId: string): Promise<LedgerEntry> {
    const entries = await this.ledger.getEntriesForProposal(proposalId);
    const proposed = entries.find((e) => e.payload.kind === 'proposed');
    if (!proposed) {
      throw new Error(`No proposed entry found for proposal ${proposalId}`);
    }
    return proposed;
  }

  private buildGovernanceViolationReason(
    context: { tlp_classification: string; scope: string },
    requiredPolicy: VerificationPolicy,
  ): string {
    if (context.tlp_classification === 'RED') {
      return `TLP:RED context requires human_required verification`;
    }
    if (context.scope === 'production_direct') {
      return `production_direct scope requires at least third_party_audit`;
    }
    return `context requires ${requiredPolicy}`;
  }

  /**
   * Assert governance config invariants at construction time.
   * Prevents misconfiguration that would weaken production safety gates.
   */
  private assertGovernanceInvariants(config: MetacognitiveRuntimeConfig): void {
    const gov = config.governance;

    if (
      VERIFICATION_POLICY_STRENGTH[gov.production_direct_min_policy] <
      VERIFICATION_POLICY_STRENGTH['third_party_audit']
    ) {
      throw new Error(
        `GovernanceConfig.production_direct_min_policy must be at least "third_party_audit" — got "${gov.production_direct_min_policy}"`,
      );
    }

    if (gov.tlp_red_policy !== 'human_required') {
      throw new Error(
        `GovernanceConfig.tlp_red_policy must be "human_required" — got "${gov.tlp_red_policy}"`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory ledger (for testing and shadow mode)
// ---------------------------------------------------------------------------

/**
 * Simple in-memory ImprovementLedger.
 * Used in tests and non-production shadow mode.
 * Not suitable for production (no persistence, no durability guarantees).
 */
export class InMemoryImprovementLedger implements ImprovementLedger {
  private entries: Map<string, LedgerEntry[]> = new Map();

  async append(entry: LedgerEntry): Promise<void> {
    const existing = this.entries.get(entry.proposal_id) ?? [];
    // Idempotent: skip if entry_id already present
    if (existing.some((e) => e.entry_id === entry.entry_id)) return;
    this.entries.set(entry.proposal_id, [...existing, entry]);
  }

  async getEntriesForProposal(proposalId: string): Promise<LedgerEntry[]> {
    return this.entries.get(proposalId) ?? [];
  }

  async getLatestEntry(proposalId: string): Promise<LedgerEntry | null> {
    const entries = this.entries.get(proposalId) ?? [];
    return entries[entries.length - 1] ?? null;
  }

  /** Test helper: clear all entries. */
  clear(): void {
    this.entries.clear();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a MetacognitiveImprovementRuntime with the default governance config.
 */
export function createMetacognitiveRuntime(
  options: {
    enabled?: boolean;
    ledger?: ImprovementLedger;
    generateId?: IdGenerator;
  } = {},
): MetacognitiveImprovementRuntime {
  const config: MetacognitiveRuntimeConfig = {
    enabled: options.enabled ?? false,
    policy_schema_version: { major: 1, minor: 0, patch: 0 },
    governance: DEFAULT_GOVERNANCE_CONFIG,
  };
  const ledger = options.ledger ?? new InMemoryImprovementLedger();
  return new MetacognitiveImprovementRuntime(config, ledger, options.generateId);
}
