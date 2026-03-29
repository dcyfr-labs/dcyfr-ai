/**
 * Metacognitive Improvement — Structured Telemetry
 * TLP:AMBER - Internal Use Only
 *
 * Emits structured telemetry events for the metacognitive improvement lifecycle.
 * Tracks proposal throughput, approval ratio, and rollback rate.
 *
 * The telemetry system is intentionally thin and side-effect-free:
 * - Events are emitted to registered sinks (console, remote, in-memory).
 * - Sinks are async and non-blocking; errors are caught and ignored.
 * - The default sink writes structured JSON to stdout (compatible with log aggregators).
 *
 * @module ai/metacognition/telemetry
 */

import type { ImprovementLifecycleState } from './types.js';

// ---------------------------------------------------------------------------
// Telemetry event types
// ---------------------------------------------------------------------------

/** All metacognitive lifecycle event types. */
export type MetacogTelemetryEventType =
  | 'metacog.proposal.submitted'
  | 'metacog.proposal.evaluated'
  | 'metacog.proposal.approved'
  | 'metacog.proposal.rejected'
  | 'metacog.proposal.applied'
  | 'metacog.proposal.rolled_back'
  | 'metacog.transfer.evaluated';

/** Base fields present on every metacognitive telemetry event. */
export interface MetacogTelemetryEventBase {
  event: MetacogTelemetryEventType;
  /** ISO timestamp when the event was emitted. */
  timestamp: string;
  proposal_id: string;
  /** Actor that triggered the event (agent id or human reviewer id). */
  actor: string;
  domain: string;
  tlp_classification: string;
  scope: string;
  trace_id?: string;
  session_id?: string;
}

/** Emitted when a proposal is submitted to the runtime. */
export interface ProposalSubmittedEvent extends MetacogTelemetryEventBase {
  event: 'metacog.proposal.submitted';
  source_snapshot_id: string;
}

/** Emitted when a proposal finishes evaluation (pass or fail). */
export interface ProposalEvaluatedEvent extends MetacogTelemetryEventBase {
  event: 'metacog.proposal.evaluated';
  passed: boolean;
  score: number;
  regression_detected: boolean;
}

/** Emitted when a proposal is approved. */
export interface ProposalApprovedEvent extends MetacogTelemetryEventBase {
  event: 'metacog.proposal.approved';
  verification_method: string;
}

/** Emitted when a proposal is rejected (at any lifecycle stage). */
export interface ProposalRejectedEvent extends MetacogTelemetryEventBase {
  event: 'metacog.proposal.rejected';
  rejected_at_state: ImprovementLifecycleState;
  reason: string;
}

/** Emitted when a proposal is applied. */
export interface ProposalAppliedEvent extends MetacogTelemetryEventBase {
  event: 'metacog.proposal.applied';
  result_snapshot_id: string;
}

/** Emitted when a proposal is rolled back. */
export interface ProposalRolledBackEvent extends MetacogTelemetryEventBase {
  event: 'metacog.proposal.rolled_back';
  reason: string;
  restored_snapshot_id: string;
}

/** Emitted when a transfer evaluation completes. */
export interface TransferEvaluatedEvent extends MetacogTelemetryEventBase {
  event: 'metacog.transfer.evaluated';
  source_domain_id: string;
  target_domain_ids: string[];
  transfer_score: number;
  promotable: boolean;
}

/** Union of all metacognitive telemetry events. */
export type MetacogTelemetryEvent =
  | ProposalSubmittedEvent
  | ProposalEvaluatedEvent
  | ProposalApprovedEvent
  | ProposalRejectedEvent
  | ProposalAppliedEvent
  | ProposalRolledBackEvent
  | TransferEvaluatedEvent;

// ---------------------------------------------------------------------------
// Telemetry sink
// ---------------------------------------------------------------------------

/** Receives emitted telemetry events. Must not throw. */
export type TelemetrySink = (event: MetacogTelemetryEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Metrics aggregator
// ---------------------------------------------------------------------------

/**
 * Running metrics for a metacognitive improvement session or time window.
 * Provides throughput, approval ratio, and rollback rate.
 */
export interface MetacogMetrics {
  /** Total proposals submitted. */
  proposals_submitted: number;
  /** Proposals that passed evaluation. */
  proposals_evaluated_pass: number;
  /** Proposals that failed evaluation or were rejected. */
  proposals_evaluated_fail: number;
  /** Proposals approved (verification passed). */
  proposals_approved: number;
  /** Proposals applied to production. */
  proposals_applied: number;
  /** Proposals rolled back after apply. */
  proposals_rolled_back: number;
  /** Approval ratio: approved / submitted (0–1, or null if none submitted). */
  approval_ratio: number | null;
  /** Rollback rate: rolled_back / applied (0–1, or null if none applied). */
  rollback_rate: number | null;
}

// ---------------------------------------------------------------------------
// MetacogTelemetryEmitter
// ---------------------------------------------------------------------------

/**
 * Emits structured telemetry events and aggregates running metrics.
 *
 * Usage:
 * ```typescript
 * const emitter = new MetacogTelemetryEmitter([consoleSink]);
 * emitter.proposalSubmitted({ proposal_id, actor, domain, ... });
 * const metrics = emitter.getMetrics();
 * ```
 */
export class MetacogTelemetryEmitter {
  private readonly sinks: TelemetrySink[];
  private counts = {
    submitted: 0,
    evaluatedPass: 0,
    evaluatedFail: 0,
    approved: 0,
    applied: 0,
    rolledBack: 0,
  };

  constructor(sinks: TelemetrySink[] = [defaultConsoleSink]) {
    this.sinks = sinks;
  }

  // -------------------------------------------------------------------------
  // Emit helpers
  // -------------------------------------------------------------------------

  proposalSubmitted(
    fields: Omit<ProposalSubmittedEvent, 'event' | 'timestamp'>,
  ): void {
    this.counts.submitted++;
    this.emit({ event: 'metacog.proposal.submitted', timestamp: now(), ...fields });
  }

  proposalEvaluated(
    fields: Omit<ProposalEvaluatedEvent, 'event' | 'timestamp'>,
  ): void {
    if (fields.passed) this.counts.evaluatedPass++;
    else this.counts.evaluatedFail++;
    this.emit({ event: 'metacog.proposal.evaluated', timestamp: now(), ...fields });
  }

  proposalApproved(
    fields: Omit<ProposalApprovedEvent, 'event' | 'timestamp'>,
  ): void {
    this.counts.approved++;
    this.emit({ event: 'metacog.proposal.approved', timestamp: now(), ...fields });
  }

  proposalRejected(
    fields: Omit<ProposalRejectedEvent, 'event' | 'timestamp'>,
  ): void {
    this.counts.evaluatedFail++;
    this.emit({ event: 'metacog.proposal.rejected', timestamp: now(), ...fields });
  }

  proposalApplied(
    fields: Omit<ProposalAppliedEvent, 'event' | 'timestamp'>,
  ): void {
    this.counts.applied++;
    this.emit({ event: 'metacog.proposal.applied', timestamp: now(), ...fields });
  }

  proposalRolledBack(
    fields: Omit<ProposalRolledBackEvent, 'event' | 'timestamp'>,
  ): void {
    this.counts.rolledBack++;
    this.emit({ event: 'metacog.proposal.rolled_back', timestamp: now(), ...fields });
  }

  transferEvaluated(
    fields: Omit<TransferEvaluatedEvent, 'event' | 'timestamp'>,
  ): void {
    this.emit({ event: 'metacog.transfer.evaluated', timestamp: now(), ...fields });
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  /**
   * Return computed metrics from all events observed since construction.
   */
  getMetrics(): MetacogMetrics {
    const { submitted, evaluatedPass, evaluatedFail, approved, applied, rolledBack } = this.counts;
    return {
      proposals_submitted: submitted,
      proposals_evaluated_pass: evaluatedPass,
      proposals_evaluated_fail: evaluatedFail,
      proposals_approved: approved,
      proposals_applied: applied,
      proposals_rolled_back: rolledBack,
      approval_ratio: submitted > 0 ? approved / submitted : null,
      rollback_rate: applied > 0 ? rolledBack / applied : null,
    };
  }

  /** Reset all counters (useful for time-windowed metrics). */
  resetMetrics(): void {
    this.counts = {
      submitted: 0, evaluatedPass: 0, evaluatedFail: 0,
      approved: 0, applied: 0, rolledBack: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private emit(event: MetacogTelemetryEvent): void {
    for (const sink of this.sinks) {
      try {
        const result = sink(event);
        if (result instanceof Promise) {
          result.catch(() => { /* non-fatal */ });
        }
      } catch {
        // Sinks must not crash the runtime
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Built-in sinks
// ---------------------------------------------------------------------------

/**
 * Default sink: writes structured JSON to stdout.
 * Compatible with log aggregators that parse JSON lines.
 */
export const defaultConsoleSink: TelemetrySink = (event) => {
  console.log(JSON.stringify(event));
};

/**
 * In-memory sink: collects events for test assertions.
 */
export class InMemoryTelemetrySink {
  readonly events: MetacogTelemetryEvent[] = [];

  readonly sink: TelemetrySink = (event) => {
    this.events.push(event);
  };

  /** Filter events by type. */
  byType<T extends MetacogTelemetryEvent>(type: T['event']): T[] {
    return this.events.filter((e) => e.event === type) as T[];
  }

  clear(): void {
    this.events.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}
