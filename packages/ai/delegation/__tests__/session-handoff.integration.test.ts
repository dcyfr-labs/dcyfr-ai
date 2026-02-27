/**
 * Integration Tests: Session Handoff Scenarios
 * TLP:AMBER - Internal Use Only
 *
 * Task 6.5 — delegation-execution-modes
 *
 * Tests all session handoff mode transitions:
 *   INTERACTIVE → BACKGROUND
 *   BACKGROUND  → ASYNC
 *   ASYNC       → INTERACTIVE
 *   Chain: INTERACTIVE → BACKGROUND → ASYNC
 *
 * @module delegation/__tests__/session-handoff.integration
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DelegationContractManager } from '../contract-manager.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { CreateDelegationContractRequest } from '../../types/delegation-contracts.js';
import { existsSync, unlinkSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DB = '/tmp/test-session-handoff-integration.db';

let _taskSeq = 0;

const makeRequest = (
  executionMode: ExecutionMode = ExecutionMode.INTERACTIVE,
  overrides: Partial<CreateDelegationContractRequest> = {},
): CreateDelegationContractRequest => ({
  delegator: { agent_id: 'orchestrator', agent_name: 'Orchestrator' },
  delegatee: { agent_id: 'fullstack-developer', agent_name: 'Fullstack Developer' },
  task_id: `handoff-task-${++_taskSeq}`,
  task_description: `Handoff integration task ${_taskSeq}`,
  verification_policy: 'direct_inspection',
  success_criteria: { required_checks: [] },
  timeout_ms: 60_000,
  execution_mode: executionMode,
  ...overrides,
});

const snapshot = (msgs: string[] = []) => ({
  conversationHistory: msgs,
  artifacts: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Session Handoff — Integration', () => {
  let cm: DelegationContractManager;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    cm = new DelegationContractManager({ databasePath: TEST_DB });
  });

  afterEach(() => {
    cm.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  // ── 1. INTERACTIVE → BACKGROUND ───────────────────────────────────────────

  describe('INTERACTIVE → BACKGROUND', () => {
    it('creates a BACKGROUND contract from an INTERACTIVE source', async () => {
      const source = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));

      const target = await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.BACKGROUND,
        handoffReason: 'task too long for interactive — promoting to background',
        contextSnapshot: snapshot(['analysing requirements', 'plan created']),
      });

      expect(target.execution_mode).toBe(ExecutionMode.BACKGROUND);
      expect(target.parent_contract_id).toBe(source.contract_id);
      expect(target.delegator.agent_id).toBe(source.delegator.agent_id);
      expect(target.delegatee.agent_id).toBe(source.delegatee.agent_id);
      expect(target.task_description).toBe(source.task_description);
    });

    it('emits session.handoff with correct mode transition', async () => {
      const events: unknown[] = [];
      cm.on('session.handoff', (e) => events.push(e));

      const source = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));
      await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.BACKGROUND,
        handoffReason: 'promoting',
        contextSnapshot: snapshot(),
      });

      expect(events).toHaveLength(1);
      const evt = events[0] as Record<string, unknown>;
      expect(evt['fromMode']).toBe(ExecutionMode.INTERACTIVE);
      expect(evt['toMode']).toBe(ExecutionMode.BACKGROUND);
      expect(evt['fromContractId']).toBe(source.contract_id);
    });

    it('archives the source session after handoff', async () => {
      const source = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));
      const sessionId = `i-to-b-${source.contract_id}`;
      // Register source session
      cm.getSessionManager().register(
        sessionId,
        source.contract_id,
        ExecutionMode.INTERACTIVE,
        { status: 'active', conversationMessages: [], lastActivity: new Date().toISOString() },
      );

      await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.BACKGROUND,
        handoffReason: 'too long for interactive',
        contextSnapshot: snapshot(['step 1', 'step 2']),
      });

      // Session should be archived after handoff
      const session = cm.getSessionManager().get(sessionId);
      // Session may be archived (no longer active), or null if cleaned up
      if (session) {
        expect(session.lifeCycle).toBe('archived');
      }
    });

    it('preserves context snapshot in handoff record', async () => {
      const handoffEvents: unknown[] = [];
      cm.on('session.handoff', (e) => handoffEvents.push(e));

      const msgs = ['msg-1', 'msg-2', 'msg-3'];
      const source = await cm.createContract(makeRequest());
      await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.BACKGROUND,
        handoffReason: 'context test',
        contextSnapshot: { conversationHistory: msgs, artifacts: [{ name: 'plan.md' }] },
      });

      const evt = handoffEvents[0] as Record<string, unknown>;
      const snap = evt['contextSnapshot'] as Record<string, unknown>;
      expect(snap['conversationHistory']).toEqual(msgs);
    });
  });

  // ── 2. BACKGROUND → ASYNC ─────────────────────────────────────────────────

  describe('BACKGROUND → ASYNC', () => {
    it('creates an ASYNC contract from a BACKGROUND source', async () => {
      const source = await cm.createContract(makeRequest(ExecutionMode.BACKGROUND));
      const bgSessionId = `bg-src-${source.contract_id}`;
      await cm.beforeBackgroundExecution(source.contract_id, bgSessionId);

      // Handoff to ASYNC
      const target = await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'background work done — promote to PR',
        contextSnapshot: snapshot(['step 1 done', 'ready for review']),
      });

      expect(target.execution_mode).toBe(ExecutionMode.ASYNC);
      expect(target.parent_contract_id).toBe(source.contract_id);

      // Background slot should be released
      expect(cm.getBackgroundQueueStatus().activeCount).toBe(0);
    });

    it('releases background queue slot on handoff', async () => {
      const contracts = await Promise.all([
        cm.createContract(makeRequest(ExecutionMode.BACKGROUND, { task_id: 'bg-slot-1' })),
        cm.createContract(makeRequest(ExecutionMode.BACKGROUND, { task_id: 'bg-slot-2' })),
      ]);

      await cm.beforeBackgroundExecution(contracts[0].contract_id, 'bg-slot-sess-1');
      await cm.beforeBackgroundExecution(contracts[1].contract_id, 'bg-slot-sess-2');
      expect(cm.getBackgroundQueueStatus().activeCount).toBe(2);

      // Handoff the first — its slot is released
      await cm.handoffSession({
        fromContractId: contracts[0].contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'promote first task',
        contextSnapshot: snapshot(),
      });

      expect(cm.getBackgroundQueueStatus().activeCount).toBe(1);

      // Cleanup second
      cm.afterBackgroundExecution(contracts[1].contract_id, 'bg-slot-sess-2');
    });

    it('emits session.handoff with BACKGROUND→ASYNC transition', async () => {
      const events: unknown[] = [];
      cm.on('session.handoff', (e) => events.push(e));

      const source = await cm.createContract(makeRequest(ExecutionMode.BACKGROUND));
      await cm.beforeBackgroundExecution(source.contract_id, `bg-emit-${source.contract_id}`);

      await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'bg→async emit test',
        contextSnapshot: snapshot(),
      });

      const evt = events[0] as Record<string, unknown>;
      expect(evt['fromMode']).toBe(ExecutionMode.BACKGROUND);
      expect(evt['toMode']).toBe(ExecutionMode.ASYNC);
    });
  });

  // ── 3. ASYNC → INTERACTIVE ────────────────────────────────────────────────

  describe('ASYNC → INTERACTIVE', () => {
    it('creates an INTERACTIVE contract from an ASYNC source', async () => {
      const source = await cm.createContract(makeRequest(ExecutionMode.ASYNC));
      cm.beforeAsyncExecution(source.contract_id, `async-src-${source.contract_id}`, 'feature/branch');

      const target = await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.INTERACTIVE,
        handoffReason: 'PR needs interactive review session',
        contextSnapshot: snapshot(['PR opened', 'awaiting review']),
      });

      expect(target.execution_mode).toBe(ExecutionMode.INTERACTIVE);
      expect(target.parent_contract_id).toBe(source.contract_id);
    });

    it('emits session.handoff with ASYNC→INTERACTIVE transition', async () => {
      const events: unknown[] = [];
      cm.on('session.handoff', (e) => events.push(e));

      const source = await cm.createContract(makeRequest(ExecutionMode.ASYNC));
      cm.beforeAsyncExecution(source.contract_id, `async-emit-${source.contract_id}`);

      await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.INTERACTIVE,
        handoffReason: 'async→interactive emit test',
        contextSnapshot: snapshot(),
      });

      const evt = events[0] as Record<string, unknown>;
      expect(evt['fromMode']).toBe(ExecutionMode.ASYNC);
      expect(evt['toMode']).toBe(ExecutionMode.INTERACTIVE);
    });

    it('does not affect background queue when handing off from ASYNC', async () => {
      const source = await cm.createContract(makeRequest(ExecutionMode.ASYNC));
      cm.beforeAsyncExecution(source.contract_id, `async-no-bg-${source.contract_id}`);

      expect(cm.getBackgroundQueueStatus().activeCount).toBe(0);

      await cm.handoffSession({
        fromContractId: source.contract_id,
        toExecutionMode: ExecutionMode.INTERACTIVE,
        handoffReason: 'async to interactive',
        contextSnapshot: snapshot(),
      });

      // Queue should still be 0 — no background slots were used
      expect(cm.getBackgroundQueueStatus().activeCount).toBe(0);
    });
  });

  // ── 4. Chained handoff: INTERACTIVE → BACKGROUND → ASYNC ─────────────────

  describe('chained handoffs', () => {
    it('chains INTERACTIVE → BACKGROUND → ASYNC without errors', async () => {
      const handoffEvents: unknown[] = [];
      cm.on('session.handoff', (e) => handoffEvents.push(e));

      // Step 1: Create INTERACTIVE contract
      const interactiveContract = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));

      // Step 2: Hand off INTERACTIVE → BACKGROUND
      const bgContract = await cm.handoffSession({
        fromContractId: interactiveContract.contract_id,
        toExecutionMode: ExecutionMode.BACKGROUND,
        handoffReason: 'long task — moving to background',
        contextSnapshot: snapshot(['requirements gathered']),
      });

      expect(bgContract.execution_mode).toBe(ExecutionMode.BACKGROUND);
      expect(bgContract.parent_contract_id).toBe(interactiveContract.contract_id);

      // Step 3: Hand off BACKGROUND → ASYNC
      const asyncContract = await cm.handoffSession({
        fromContractId: bgContract.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'background complete — opening PR',
        contextSnapshot: snapshot(['requirements gathered', 'implementation done']),
      });

      expect(asyncContract.execution_mode).toBe(ExecutionMode.ASYNC);
      expect(asyncContract.parent_contract_id).toBe(bgContract.contract_id);

      // Two handoff events should have been emitted
      expect(handoffEvents).toHaveLength(2);

      const first = handoffEvents[0] as Record<string, unknown>;
      expect(first['fromMode']).toBe(ExecutionMode.INTERACTIVE);
      expect(first['toMode']).toBe(ExecutionMode.BACKGROUND);

      const second = handoffEvents[1] as Record<string, unknown>;
      expect(second['fromMode']).toBe(ExecutionMode.BACKGROUND);
      expect(second['toMode']).toBe(ExecutionMode.ASYNC);
    });

    it('chain preserves task description across all hops', async () => {
      const taskDesc = 'Build user preferences feature';
      const c1 = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE, {
        task_description: taskDesc,
      }));
      const c2 = await cm.handoffSession({
        fromContractId: c1.contract_id,
        toExecutionMode: ExecutionMode.BACKGROUND,
        handoffReason: 'hop 1',
        contextSnapshot: snapshot(),
      });
      const c3 = await cm.handoffSession({
        fromContractId: c2.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'hop 2',
        contextSnapshot: snapshot(),
      });

      expect(c2.task_description).toBe(taskDesc);
      expect(c3.task_description).toBe(taskDesc);
    });

    it('chain maintains unique contract IDs at each hop', async () => {
      const c1 = await cm.createContract(makeRequest());
      const c2 = await cm.handoffSession({
        fromContractId: c1.contract_id,
        toExecutionMode: ExecutionMode.BACKGROUND,
        handoffReason: 'id-chain hop 1',
        contextSnapshot: snapshot(),
      });
      const c3 = await cm.handoffSession({
        fromContractId: c2.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'id-chain hop 2',
        contextSnapshot: snapshot(),
      });

      const ids = new Set([c1.contract_id, c2.contract_id, c3.contract_id]);
      expect(ids.size).toBe(3);
    });
  });

  // ── 5. Error cases ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws when source contract does not exist', async () => {
      await expect(
        cm.handoffSession({
          fromContractId: 'nonexistent-contract-id',
          toExecutionMode: ExecutionMode.BACKGROUND,
          handoffReason: 'bad request',
          contextSnapshot: snapshot(),
        }),
      ).rejects.toThrow('not found');
    });

    it('throws when unauthorized caller tries to initiate handoff', async () => {
      const source = await cm.createContract(makeRequest());

      await expect(
        cm.handoffSession({
          fromContractId: source.contract_id,
          toExecutionMode: ExecutionMode.ASYNC,
          handoffReason: 'unauthorized attempt',
          contextSnapshot: snapshot(),
          caller_id: 'unauthorized-agent-xyz',
        }),
      ).rejects.toThrow('Unauthorized');
    });

    it('allows delegatee to initiate handoff', async () => {
      const source = await cm.createContract(makeRequest());

      // The delegatee is 'fullstack-developer' — should succeed
      await expect(
        cm.handoffSession({
          fromContractId: source.contract_id,
          toExecutionMode: ExecutionMode.BACKGROUND,
          handoffReason: 'authorized handoff',
          contextSnapshot: snapshot(),
          caller_id: 'fullstack-developer',
        }),
      ).resolves.toBeDefined();
    });
  });
});
