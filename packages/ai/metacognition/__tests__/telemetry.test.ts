/**
 * Metacognitive telemetry tests — task 5.1
 * TLP:AMBER - Internal Use Only
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MetacogTelemetryEmitter,
  InMemoryTelemetrySink,
} from '../telemetry.js';

function baseFields(overrides: Record<string, unknown> = {}) {
  return {
    proposal_id: 'p-1',
    actor: 'agent-1',
    domain: 'scoring_strategy',
    tlp_classification: 'GREEN',
    scope: 'non_production',
    ...overrides,
  };
}

describe('MetacogTelemetryEmitter', () => {
  let sink: InMemoryTelemetrySink;
  let emitter: MetacogTelemetryEmitter;

  beforeEach(() => {
    sink = new InMemoryTelemetrySink();
    emitter = new MetacogTelemetryEmitter([sink.sink]);
  });

  // -------------------------------------------------------------------------
  // Event emission
  // -------------------------------------------------------------------------

  it('proposalSubmitted emits correct event type and fields', () => {
    emitter.proposalSubmitted({ ...baseFields(), source_snapshot_id: 'snap-1' });
    const events = sink.byType('metacog.proposal.submitted');
    expect(events).toHaveLength(1);
    expect(events[0]!.proposal_id).toBe('p-1');
    expect(events[0]!.source_snapshot_id).toBe('snap-1');
    expect(events[0]!.timestamp).toMatch(/^\d{4}-/);
  });

  it('proposalEvaluated emits with pass=true and score', () => {
    emitter.proposalEvaluated({ ...baseFields(), passed: true, score: 0.9, regression_detected: false });
    const [ev] = sink.byType('metacog.proposal.evaluated');
    expect(ev!.passed).toBe(true);
    expect(ev!.score).toBe(0.9);
  });

  it('proposalApproved emits with verification_method', () => {
    emitter.proposalApproved({ ...baseFields(), verification_method: 'third_party_audit' });
    const [ev] = sink.byType('metacog.proposal.approved');
    expect(ev!.verification_method).toBe('third_party_audit');
  });

  it('proposalRejected emits with reason', () => {
    emitter.proposalRejected({ ...baseFields(), rejected_at_state: 'evaluated', reason: 'score too low' });
    const [ev] = sink.byType('metacog.proposal.rejected');
    expect(ev!.reason).toBe('score too low');
  });

  it('proposalApplied emits with result_snapshot_id', () => {
    emitter.proposalApplied({ ...baseFields(), result_snapshot_id: 'snap-result' });
    const [ev] = sink.byType('metacog.proposal.applied');
    expect(ev!.result_snapshot_id).toBe('snap-result');
  });

  it('proposalRolledBack emits with reason and restored_snapshot_id', () => {
    emitter.proposalRolledBack({ ...baseFields(), reason: 'regression', restored_snapshot_id: 'snap-old' });
    const [ev] = sink.byType('metacog.proposal.rolled_back');
    expect(ev!.reason).toBe('regression');
    expect(ev!.restored_snapshot_id).toBe('snap-old');
  });

  it('transferEvaluated emits with transfer_score and promotable', () => {
    emitter.transferEvaluated({
      ...baseFields(),
      source_domain_id: 'scoring_strategy',
      target_domain_ids: ['delegation_thresholds'],
      transfer_score: 0.85,
      promotable: true,
    });
    const [ev] = sink.byType('metacog.transfer.evaluated');
    expect(ev!.transfer_score).toBe(0.85);
    expect(ev!.promotable).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Metrics — throughput, approval ratio, rollback rate
  // -------------------------------------------------------------------------

  it('getMetrics returns zero counts on init', () => {
    const m = emitter.getMetrics();
    expect(m.proposals_submitted).toBe(0);
    expect(m.approval_ratio).toBeNull();
    expect(m.rollback_rate).toBeNull();
  });

  it('tracks proposal throughput across lifecycle', () => {
    emitter.proposalSubmitted({ ...baseFields(), source_snapshot_id: 's1' });
    emitter.proposalSubmitted({ ...baseFields({ proposal_id: 'p-2' }), source_snapshot_id: 's2' });
    expect(emitter.getMetrics().proposals_submitted).toBe(2);
  });

  it('computes approval_ratio correctly', () => {
    // 3 submitted, 2 approved
    for (let i = 0; i < 3; i++) {
      emitter.proposalSubmitted({ ...baseFields({ proposal_id: `p-${i}` }), source_snapshot_id: 's' });
    }
    emitter.proposalApproved({ ...baseFields(), verification_method: 'direct_inspection' });
    emitter.proposalApproved({ ...baseFields(), verification_method: 'direct_inspection' });
    expect(emitter.getMetrics().approval_ratio).toBeCloseTo(2 / 3);
  });

  it('computes rollback_rate correctly', () => {
    // 4 applied, 1 rolled back → rate = 0.25
    for (let i = 0; i < 4; i++) {
      emitter.proposalApplied({ ...baseFields({ proposal_id: `p-${i}` }), result_snapshot_id: 'snap' });
    }
    emitter.proposalRolledBack({ ...baseFields(), reason: 'regression', restored_snapshot_id: 'snap-old' });
    expect(emitter.getMetrics().rollback_rate).toBeCloseTo(0.25);
  });

  it('resetMetrics zeroes all counters', () => {
    emitter.proposalSubmitted({ ...baseFields(), source_snapshot_id: 's1' });
    emitter.resetMetrics();
    const m = emitter.getMetrics();
    expect(m.proposals_submitted).toBe(0);
    expect(m.approval_ratio).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Sink error isolation
  // -------------------------------------------------------------------------

  it('does not throw if a sink throws', () => {
    const throwingSink = () => { throw new Error('sink failure'); };
    const safe = new MetacogTelemetryEmitter([throwingSink]);
    expect(() => safe.proposalSubmitted({ ...baseFields(), source_snapshot_id: 's' })).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // InMemoryTelemetrySink helpers
  // -------------------------------------------------------------------------

  it('byType filters events correctly', () => {
    emitter.proposalSubmitted({ ...baseFields(), source_snapshot_id: 's' });
    emitter.proposalApproved({ ...baseFields(), verification_method: 'direct_inspection' });
    expect(sink.byType('metacog.proposal.submitted')).toHaveLength(1);
    expect(sink.byType('metacog.proposal.approved')).toHaveLength(1);
    expect(sink.byType('metacog.proposal.applied')).toHaveLength(0);
  });

  it('clear removes all events', () => {
    emitter.proposalSubmitted({ ...baseFields(), source_snapshot_id: 's' });
    sink.clear();
    expect(sink.events).toHaveLength(0);
  });
});
