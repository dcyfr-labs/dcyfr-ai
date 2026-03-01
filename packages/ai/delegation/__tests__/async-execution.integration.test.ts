/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration Tests: Async Execution Mode
 * TLP:AMBER - Internal Use Only
 *
 * Task 6.4 — delegation-execution-modes
 *
 * Tests the ASYNC execution mode lifecycle, including feature branch
 * tracking, PR number recording, and handoff from BACKGROUND → ASYNC.
 *
 * Note: GitHub API calls are simulated; no real GITHUB_TOKEN is required.
 *
 * @module delegation/__tests__/async-execution.integration
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DelegationContractManager } from '../contract-manager.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { CreateDelegationContractRequest } from '../../types/delegation-contracts.js';
import { existsSync, unlinkSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DB = '/tmp/test-async-exec-integration.db';

const makeRequest = (
  overrides: Partial<CreateDelegationContractRequest> = {},
): CreateDelegationContractRequest => ({
  delegator: { agent_id: 'orchestrator', agent_name: 'Orchestrator' },
  delegatee: { agent_id: 'fullstack-developer', agent_name: 'Fullstack Developer' },
  task_id: `task-async-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  task_description: 'Integration: async feature implementation',
  verification_policy: 'direct_inspection',
  success_criteria: { required_checks: [] },
  timeout_ms: 60_000,
  execution_mode: ExecutionMode.ASYNC,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Async Execution Mode — Integration', () => {
  let cm: DelegationContractManager;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    cm = new DelegationContractManager({ databasePath: TEST_DB });
  });

  afterEach(() => {
    cm.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  // ── 1. Feature branch creation ─────────────────────────────────────────────

  describe('feature branch tracking', () => {
    it('creates ASYNC contract and records feature branch name', async () => {
      // Simulate creating the contract after a GitHub branch was created
      const branchName = 'feature/add-user-preferences-2026-02';

      const contract = await cm.createContract(makeRequest());
      const sessionId = `async-sess-${contract.contract_id}`;
      cm.beforeAsyncExecution(contract.contract_id, sessionId, branchName);

      const mgr = cm.getSessionManager();
      const session = mgr.get(sessionId);
      expect(session).toBeDefined();
      expect(session!.executionMode).toBe(ExecutionMode.ASYNC);
      expect(session!.lifeCycle).toBe('active');
    });

    it('registers async session with branch name in emitted event', async () => {
      const createdEvents: any[] = [];
      cm.on('session.created', (e) => createdEvents.push(e));

      const contract = await cm.createContract(makeRequest());
      const sessionId = `branch-evt-${contract.contract_id}`;
      const branchName = 'feature/auth-refactor';

      cm.beforeAsyncExecution(contract.contract_id, sessionId, branchName);

      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0].mode).toBe(ExecutionMode.ASYNC);
      expect(createdEvents[0].sessionId).toBe(sessionId);
      expect(createdEvents[0].branchName).toBe(branchName);
    });

    it('handles missing branch name gracefully', async () => {
      const contract = await cm.createContract(makeRequest());
      const sessionId = `async-no-branch-${contract.contract_id}`;

      // Should not throw when branchName is omitted
      expect(() => cm.beforeAsyncExecution(contract.contract_id, sessionId)).not.toThrow();

      const session = cm.getSessionManager().get(sessionId);
      expect(session).toBeDefined();
      expect(session!.executionMode).toBe(ExecutionMode.ASYNC);
    });
  });

  // ── 2. PR preparation (mocked GitHub API) ─────────────────────────────────

  describe('PR preparation', () => {
    it('records PR number in session state before archiving', async () => {
      const archivedEvents: any[] = [];
      cm.on('session.archived', (e) => archivedEvents.push(e));

      const contract = await cm.createContract(makeRequest());
      const sessionId = `pr-sess-${contract.contract_id}`;
      const prNumber = 42;

      cm.beforeAsyncExecution(contract.contract_id, sessionId, 'feature/pr-test');
      cm.afterAsyncExecution(contract.contract_id, sessionId, prNumber);

      expect(archivedEvents).toHaveLength(1);
      expect(archivedEvents[0].prNumber).toBe(prNumber);
      expect(archivedEvents[0].mode).toBe(ExecutionMode.ASYNC);
    });

    it('archives session without PR number (optional)', async () => {
      const archivedEvents: any[] = [];
      cm.on('session.archived', (e) => archivedEvents.push(e));

      const contract = await cm.createContract(makeRequest());
      const sessionId = `pr-no-num-${contract.contract_id}`;

      cm.beforeAsyncExecution(contract.contract_id, sessionId, 'feature/no-pr');
      cm.afterAsyncExecution(contract.contract_id, sessionId);

      expect(archivedEvents).toHaveLength(1);
      expect(archivedEvents[0].prNumber).toBeUndefined();
    });

    it('emits session.archived for ASYNC mode', async () => {
      const events: any[] = [];
      cm.on('session.archived', (e) => events.push(e));

      const contract = await cm.createContract(makeRequest());
      const sessionId = `async-arch-${contract.contract_id}`;

      cm.beforeAsyncExecution(contract.contract_id, sessionId);
      cm.afterAsyncExecution(contract.contract_id, sessionId, 100);

      expect(events[0].mode).toBe(ExecutionMode.ASYNC);
      expect(events[0].contractId).toBe(contract.contract_id);
    });
  });

  // ── 3. Async handoff from BACKGROUND ──────────────────────────────────────

  describe('async handoff from background mode', () => {
    it('hands off BACKGROUND → ASYNC and creates new ASYNC contract', async () => {
      // Start as BACKGROUND
      const bgContract = await cm.createContract(
        makeRequest({ execution_mode: ExecutionMode.BACKGROUND }),
      );
      const bgSessionId = `bg-to-async-${bgContract.contract_id}`;

      await cm.beforeBackgroundExecution(bgContract.contract_id, bgSessionId, '/tmp/wt/bg');
      expect(cm.getBackgroundQueueStatus().activeCount).toBe(1);

      // Handoff to ASYNC
      const asyncContract = await cm.handoffSession({
        fromContractId: bgContract.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'background work complete, promoting to PR',
        contextSnapshot: {
          conversationHistory: ['step 1 done', 'step 2 done'],
          artifacts: [{ type: 'code', path: 'src/feature.ts' }],
        },
      });

      expect(asyncContract.execution_mode).toBe(ExecutionMode.ASYNC);
      expect(asyncContract.parent_contract_id).toBe(bgContract.contract_id);

      // Background slot should be released
      expect(cm.getBackgroundQueueStatus().activeCount).toBe(0);
    });

    it('handoff emits session.handoff event with mode info', async () => {
      const handoffEvents: any[] = [];
      cm.on('session.handoff', (e) => handoffEvents.push(e));

      const bgContract = await cm.createContract(
        makeRequest({ execution_mode: ExecutionMode.BACKGROUND, task_id: 'handoff-emit-test' }),
      );
      const bgSessionId = `bg-handoff-${bgContract.contract_id}`;
      await cm.beforeBackgroundExecution(bgContract.contract_id, bgSessionId);

      await cm.handoffSession({
        fromContractId: bgContract.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'ready for PR',
        contextSnapshot: { conversationHistory: [], artifacts: [] },
      });

      expect(handoffEvents).toHaveLength(1);
      expect(handoffEvents[0].fromMode).toBe(ExecutionMode.BACKGROUND);
      expect(handoffEvents[0].toMode).toBe(ExecutionMode.ASYNC);
      expect(handoffEvents[0].fromContractId).toBe(bgContract.contract_id);
    });

    it('preserves conversation history during handoff', async () => {
      const history = ['message 1', 'message 2', 'message 3'];
      const bgContract = await cm.createContract(
        makeRequest({ task_id: 'history-preserve' }),
      );

      await cm.handoffSession({
        fromContractId: bgContract.contract_id,
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'context transfer',
        contextSnapshot: {
          conversationHistory: history,
          artifacts: [{ name: 'schema.ts', type: 'code' }],
        },
      });

      const handoffEvents: any[] = [];
      cm.on('session.handoff', (e) => handoffEvents.push(e));

      // Re-verify via a second handoff to capture the event
      const asyncContract = await cm.createContract(
        makeRequest({ task_id: 'verify-history' }),
      );
      await cm.handoffSession({
        fromContractId: asyncContract.contract_id,
        toExecutionMode: ExecutionMode.INTERACTIVE,
        handoffReason: 're-checking history',
        contextSnapshot: {
          conversationHistory: history,
          artifacts: [],
        },
      });

      expect(handoffEvents[0].contextSnapshot.conversationHistory).toEqual(history);
    });
  });

  // ── 4. ASYNC contract mode selection ──────────────────────────────────────

  describe('mode selection for ASYNC', () => {
    it('selects ASYNC when explicitly requested', () => {
      const req = makeRequest({ execution_mode: ExecutionMode.ASYNC });
      expect(cm.selectExecutionMode(req as any)).toBe(ExecutionMode.ASYNC);
    });

    it('selects ASYNC from OpenSpec hint in metadata', () => {
      const req = { metadata: { openspec_execution_mode: ExecutionMode.ASYNC } };
      expect(cm.selectExecutionMode(req as any)).toBe(ExecutionMode.ASYNC);
    });

    it('selects ASYNC from agent manifest preference', () => {
      const manifest = {
        agentName: 'test-agent',
        capabilities: [],
        preferred_execution_mode: ExecutionMode.ASYNC,
        supported_execution_modes: [ExecutionMode.ASYNC, ExecutionMode.INTERACTIVE],
      } as any;
      expect(cm.selectExecutionMode({} as any, manifest)).toBe(ExecutionMode.ASYNC);
    });
  });

  // ── 5. Double-archive safety ───────────────────────────────────────────────

  describe('idempotency', () => {
    it('double afterAsyncExecution does not throw', async () => {
      const contract = await cm.createContract(makeRequest());
      const sid = `idem-${contract.contract_id}`;

      cm.beforeAsyncExecution(contract.contract_id, sid);
      cm.afterAsyncExecution(contract.contract_id, sid, 99);
      expect(() => cm.afterAsyncExecution(contract.contract_id, sid, 99)).not.toThrow();
    });
  });
});
