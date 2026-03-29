/**
 * MetacognitiveImprovementRuntime — lifecycle state machine tests
 * TLP:AMBER - Internal Use Only
 *
 * Covers:
 *   - Schema version compatibility enforcement
 *   - Full happy-path lifecycle: propose → evaluate → approve → apply → rollback
 *   - Governance threshold enforcement (production_direct, TLP:RED)
 *   - Invalid lifecycle transition rejection
 *   - RuntimeDisabledError when feature flag is off
 *   - GovernanceConfig invariant enforcement at construction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MetacognitiveImprovementRuntime,
  InMemoryImprovementLedger,
  InvalidLifecycleTransitionError,
  SchemaIncompatibleError,
  GovernanceViolationError,
  RuntimeDisabledError,
  createMetacognitiveRuntime,
} from '../runtime.js';
import { DEFAULT_GOVERNANCE_CONFIG } from '../types.js';
import type {
  ImprovementProposal,
  PolicySnapshot,
  ImprovementEvaluationResult,
  MetacognitiveRuntimeConfig,
} from '../types.js';
import type { VerificationResult } from '../../types/delegation-contracts.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let idCounter = 0;
const nextId = () => `test-id-${++idCounter}`;

function makeSnapshot(overrides: Partial<PolicySnapshot> = {}): PolicySnapshot {
  return {
    snapshot_id: nextId(),
    policy_id: 'policy-1',
    schema_version: { major: 1, minor: 0, patch: 0 },
    content: {
      id: 'policy-1',
      schema_version: { major: 1, minor: 0, patch: 0 },
      name: 'Test Policy',
      description: 'A test policy document',
      domain: 'scoring_strategy',
      parameters: { threshold: 0.7 },
      constraints: {
        min_verification_policy: 'direct_inspection',
        tlp_classification: 'GREEN',
        scope: 'non_production',
      },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    captured_at: '2026-01-01T00:00:00.000Z',
    captured_by: 'test-actor',
    content_hash: 'abc123',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<ImprovementProposal> = {}): ImprovementProposal {
  return {
    proposal_id: nextId(),
    source_snapshot_id: 'snap-1',
    proposed_changes: {
      parameter_changes: [{ path: 'parameters.threshold', previous_value: 0.7, proposed_value: 0.8 }],
      description: 'Raise threshold to reduce false positives',
    },
    rationale: 'Recent benchmarks show improved precision at 0.8',
    proposed_by: 'agent-optimizer',
    proposed_at: '2026-01-01T00:00:00.000Z',
    evaluation_criteria: {
      success_threshold: 0.8,
      regression_budget: 0.1,
      benchmark_domains: ['scoring_strategy'],
      required_checks: ['precision_check'],
    },
    context: {
      tlp_classification: 'GREEN',
      scope: 'non_production',
      domain: 'scoring_strategy',
      initiated_by: 'agent-optimizer',
    },
    ...overrides,
  };
}

function makeEvalResult(passed: boolean, overrides: Partial<ImprovementEvaluationResult> = {}): ImprovementEvaluationResult {
  return {
    proposal_id: 'p-1',
    evaluated_at: '2026-01-01T01:00:00.000Z',
    evaluated_by: 'evaluator-agent',
    passed,
    score: passed ? 0.9 : 0.5,
    regression_detected: false,
    benchmark_results: [{
      domain: 'scoring_strategy',
      benchmark_id: 'precision_check',
      passed: true,
      score: 0.9,
      baseline_score: 0.85,
      delta: 0.05,
    }],
    required_verification_policy: 'direct_inspection',
    ...overrides,
  };
}

function makeVerificationResult(
  verified: boolean,
  method: VerificationResult['verification_method'] = 'direct_inspection',
): VerificationResult {
  return {
    verified,
    verified_at: '2026-01-01T02:00:00.000Z',
    verified_by: 'test-verifier',
    verification_method: method,
    quality_score: verified ? 0.95 : 0.3,
  };
}

function makeRuntime(ledger = new InMemoryImprovementLedger()): MetacognitiveImprovementRuntime {
  return new MetacognitiveImprovementRuntime(
    {
      enabled: true,
      policy_schema_version: { major: 1, minor: 0, patch: 0 },
      governance: DEFAULT_GOVERNANCE_CONFIG,
    },
    ledger,
    nextId,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetacognitiveImprovementRuntime', () => {
  let ledger: InMemoryImprovementLedger;
  let runtime: MetacognitiveImprovementRuntime;

  beforeEach(() => {
    ledger = new InMemoryImprovementLedger();
    runtime = makeRuntime(ledger);
  });

  // -------------------------------------------------------------------------
  // Feature flag
  // -------------------------------------------------------------------------

  describe('feature flag', () => {
    it('throws RuntimeDisabledError when enabled=false', async () => {
      const disabled = createMetacognitiveRuntime({ enabled: false });
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await expect(disabled.propose(snapshot, proposal)).rejects.toThrow(RuntimeDisabledError);
    });

    it('proceeds normally when enabled=true', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      const entry = await runtime.propose(snapshot, proposal);
      expect(entry.state).toBe('proposed');
    });
  });

  // -------------------------------------------------------------------------
  // Schema compatibility
  // -------------------------------------------------------------------------

  describe('schema compatibility', () => {
    it('accepts a snapshot with matching major version and equal minor', async () => {
      const snapshot = makeSnapshot({ schema_version: { major: 1, minor: 0, patch: 5 } });
      const proposal = makeProposal();
      const entry = await runtime.propose(snapshot, proposal);
      expect(entry.state).toBe('proposed');
    });

    it('accepts a snapshot with lower minor version (runtime is newer)', async () => {
      const config: MetacognitiveRuntimeConfig = {
        enabled: true,
        policy_schema_version: { major: 1, minor: 3, patch: 0 },
        governance: DEFAULT_GOVERNANCE_CONFIG,
      };
      const rt = new MetacognitiveImprovementRuntime(config, ledger, nextId);
      const snapshot = makeSnapshot({ schema_version: { major: 1, minor: 1, patch: 0 } });
      const entry = await rt.propose(snapshot, makeProposal());
      expect(entry.state).toBe('proposed');
    });

    it('rejects snapshot with higher minor version (runtime is older)', async () => {
      const snapshot = makeSnapshot({ schema_version: { major: 1, minor: 2, patch: 0 } });
      await expect(runtime.propose(snapshot, makeProposal())).rejects.toThrow(SchemaIncompatibleError);
    });

    it('rejects snapshot with different major version', async () => {
      const snapshot = makeSnapshot({ schema_version: { major: 2, minor: 0, patch: 0 } });
      await expect(runtime.propose(snapshot, makeProposal())).rejects.toThrow(SchemaIncompatibleError);
    });
  });

  // -------------------------------------------------------------------------
  // Happy-path lifecycle
  // -------------------------------------------------------------------------

  describe('happy-path lifecycle', () => {
    it('propose: appends proposed entry and returns it', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      const entry = await runtime.propose(snapshot, proposal);

      expect(entry.state).toBe('proposed');
      expect(entry.proposal_id).toBe(proposal.proposal_id);
      expect(entry.previous_entry_id).toBeNull();
      expect(entry.payload.kind).toBe('proposed');
    });

    it('evaluate (pass): transitions proposed → evaluated', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);

      const evalResult = makeEvalResult(true, { proposal_id: proposal.proposal_id });
      const entry = await runtime.evaluate(proposal.proposal_id, evalResult, 'evaluator');

      expect(entry.state).toBe('evaluated');
      expect(entry.payload.kind).toBe('evaluated');
      expect(await runtime.getState(proposal.proposal_id)).toBe('evaluated');
    });

    it('evaluate (fail): transitions proposed → rejected', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);

      const evalResult = makeEvalResult(false, { proposal_id: proposal.proposal_id });
      const entry = await runtime.evaluate(proposal.proposal_id, evalResult, 'evaluator');

      expect(entry.state).toBe('rejected');
    });

    it('approve: transitions evaluated → approved', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'evaluator');

      const vr = makeVerificationResult(true, 'direct_inspection');
      const entry = await runtime.approve(proposal.proposal_id, vr, 'approver');

      expect(entry.state).toBe('approved');
      expect(entry.payload.kind).toBe('approved');
    });

    it('apply: transitions approved → applied', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'evaluator');
      await runtime.approve(proposal.proposal_id, makeVerificationResult(true), 'approver');

      const resultSnapshot = makeSnapshot({ snapshot_id: 'result-snap' });
      const entry = await runtime.apply(proposal.proposal_id, resultSnapshot, 'applier');

      expect(entry.state).toBe('applied');
      expect(entry.payload.kind).toBe('applied');
    });

    it('rollback: transitions applied → rolled_back', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'evaluator');
      await runtime.approve(proposal.proposal_id, makeVerificationResult(true), 'approver');
      await runtime.apply(proposal.proposal_id, makeSnapshot(), 'applier');

      const entry = await runtime.rollback(proposal.proposal_id, 'regression detected', 'snap-original', 'ops');

      expect(entry.state).toBe('rolled_back');
      const payload = entry.payload;
      if (payload.kind !== 'rolled_back') throw new Error('unexpected payload kind');
      expect(payload.reason).toBe('regression detected');
      expect(payload.restored_snapshot_id).toBe('snap-original');
    });

    it('full lifecycle: entry chain is linked via previous_entry_id', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      const e1 = await runtime.propose(snapshot, proposal);
      const e2 = await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'ev');
      const e3 = await runtime.approve(proposal.proposal_id, makeVerificationResult(true), 'ap');
      const e4 = await runtime.apply(proposal.proposal_id, makeSnapshot(), 'ap');

      expect(e2.previous_entry_id).toBe(e1.entry_id);
      expect(e3.previous_entry_id).toBe(e2.entry_id);
      expect(e4.previous_entry_id).toBe(e3.entry_id);
    });
  });

  // -------------------------------------------------------------------------
  // Governance enforcement
  // -------------------------------------------------------------------------

  describe('governance enforcement', () => {
    it('production_direct scope: rejects direct_inspection (too weak)', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal({
        context: {
          tlp_classification: 'GREEN',
          scope: 'production_direct',
          domain: 'delegation_thresholds',
          initiated_by: 'optimizer',
        },
      });
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'ev');

      const vr = makeVerificationResult(true, 'direct_inspection');
      await expect(
        runtime.approve(proposal.proposal_id, vr, 'approver'),
      ).rejects.toThrow(GovernanceViolationError);
    });

    it('production_direct scope: accepts third_party_audit', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal({
        context: {
          tlp_classification: 'GREEN',
          scope: 'production_direct',
          domain: 'delegation_thresholds',
          initiated_by: 'optimizer',
        },
      });
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'ev');

      const vr = makeVerificationResult(true, 'third_party_audit');
      const entry = await runtime.approve(proposal.proposal_id, vr, 'approver');
      expect(entry.state).toBe('approved');
    });

    it('production_direct scope: accepts human_required (stronger than required)', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal({
        context: {
          tlp_classification: 'GREEN',
          scope: 'production_direct',
          domain: 'delegation_thresholds',
          initiated_by: 'optimizer',
        },
      });
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'ev');

      const vr = makeVerificationResult(true, 'human_required');
      const entry = await runtime.approve(proposal.proposal_id, vr, 'approver');
      expect(entry.state).toBe('approved');
    });

    it('TLP:RED: rejects third_party_audit (requires human_required)', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal({
        context: {
          tlp_classification: 'RED',
          scope: 'non_production',
          domain: 'scoring_strategy',
          initiated_by: 'optimizer',
        },
      });
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'ev');

      const vr = makeVerificationResult(true, 'third_party_audit');
      await expect(
        runtime.approve(proposal.proposal_id, vr, 'approver'),
      ).rejects.toThrow(GovernanceViolationError);
    });

    it('TLP:RED: accepts human_required', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal({
        context: {
          tlp_classification: 'RED',
          scope: 'non_production',
          domain: 'scoring_strategy',
          initiated_by: 'optimizer',
        },
      });
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'ev');

      const vr = makeVerificationResult(true, 'human_required');
      const entry = await runtime.approve(proposal.proposal_id, vr, 'approver');
      expect(entry.state).toBe('approved');
    });

    it('approve: transitions to rejected if verification did not pass', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);
      await runtime.evaluate(proposal.proposal_id, makeEvalResult(true), 'ev');

      const vr = makeVerificationResult(false, 'direct_inspection');
      const entry = await runtime.approve(proposal.proposal_id, vr, 'approver');
      expect(entry.state).toBe('rejected');
    });
  });

  // -------------------------------------------------------------------------
  // Invalid transition guards
  // -------------------------------------------------------------------------

  describe('invalid transition guards', () => {
    it('throws on skipping evaluate (proposed → approved)', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);

      const vr = makeVerificationResult(true);
      await expect(
        runtime.approve(proposal.proposal_id, vr, 'approver'),
      ).rejects.toThrow(InvalidLifecycleTransitionError);
    });

    it('throws on double-propose (proposed → proposed)', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);

      await expect(
        runtime.propose(snapshot, proposal),
      ).rejects.toThrow(InvalidLifecycleTransitionError);
    });

    it('throws on rolling back a non-applied proposal', async () => {
      const snapshot = makeSnapshot();
      const proposal = makeProposal();
      await runtime.propose(snapshot, proposal);

      await expect(
        runtime.rollback(proposal.proposal_id, 'oops', 'snap-x', 'ops'),
      ).rejects.toThrow(InvalidLifecycleTransitionError);
    });

    it('getState returns null for unknown proposal', async () => {
      expect(await runtime.getState('unknown-id')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Governance config invariants
  // -------------------------------------------------------------------------

  describe('governance config invariants', () => {
    it('throws at construction if production_direct_min_policy is too weak', () => {
      expect(() => new MetacognitiveImprovementRuntime(
        {
          enabled: true,
          policy_schema_version: { major: 1, minor: 0, patch: 0 },
          governance: {
            production_direct_min_policy: 'direct_inspection', // too weak
            tlp_red_policy: 'human_required',
            default_policy: 'direct_inspection',
          },
        },
        new InMemoryImprovementLedger(),
      )).toThrow('production_direct_min_policy');
    });

    it('throws at construction if tlp_red_policy is not human_required', () => {
      expect(() => new MetacognitiveImprovementRuntime(
        {
          enabled: true,
          policy_schema_version: { major: 1, minor: 0, patch: 0 },
          governance: {
            production_direct_min_policy: 'third_party_audit',
            tlp_red_policy: 'third_party_audit', // wrong
            default_policy: 'direct_inspection',
          },
        },
        new InMemoryImprovementLedger(),
      )).toThrow('tlp_red_policy');
    });

    it('does NOT throw invariant checks when enabled=false', () => {
      expect(() => new MetacognitiveImprovementRuntime(
        {
          enabled: false, // disabled — invariants not checked
          policy_schema_version: { major: 1, minor: 0, patch: 0 },
          governance: {
            production_direct_min_policy: 'direct_inspection',
            tlp_red_policy: 'direct_inspection',
            default_policy: 'direct_inspection',
          },
        },
        new InMemoryImprovementLedger(),
      )).not.toThrow();
    });
  });
});
