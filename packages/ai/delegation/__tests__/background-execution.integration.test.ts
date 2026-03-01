/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Integration Tests: Background Execution Mode
 * TLP:AMBER - Internal Use Only
 *
 * Task 6.3 — delegation-execution-modes
 *
 * Tests the end-to-end lifecycle of BACKGROUND execution mode contracts,
 * including queue management, concurrency limits, and session isolation.
 *
 * @module delegation/__tests__/background-execution.integration
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DelegationContractManager } from '../contract-manager.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { CreateDelegationContractRequest } from '../../types/delegation-contracts.js';
import { MAX_BACKGROUND_SESSIONS } from '../session-queue.js';
import { existsSync, unlinkSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DB = '/tmp/test-background-exec-integration.db';

const makeRequest = (
  overrides: Partial<CreateDelegationContractRequest> = {},
): CreateDelegationContractRequest => ({
  delegator: { agent_id: 'orchestrator', agent_name: 'Orchestrator' },
  delegatee: { agent_id: 'fullstack-developer', agent_name: 'Fullstack Developer' },
  task_id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  task_description: 'Integration: build background feature',
  verification_policy: 'direct_inspection',
  success_criteria: { required_checks: [] },
  timeout_ms: 60_000,
  execution_mode: ExecutionMode.BACKGROUND,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Background Execution Mode — Integration', () => {
  let cm: DelegationContractManager;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    cm = new DelegationContractManager({ databasePath: TEST_DB });
  });

  afterEach(() => {
    cm.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  // ── 1. Full lifecycle ──────────────────────────────────────────────────────

  describe('end-to-end lifecycle', () => {
    it('creates BACKGROUND contract, acquires slot, registers session, then cleans up', async () => {
      const contract = await cm.createContract(makeRequest());
      expect(contract.execution_mode).toBe(ExecutionMode.BACKGROUND);

      const sessionId = `session-${contract.contract_id}`;
      const worktreePath = `/tmp/worktrees/${sessionId}`;

      // beforeBackgroundExecution: acquires slot + registers session
      await cm.beforeBackgroundExecution(contract.contract_id, sessionId, worktreePath);

      const queueStatus = cm.getBackgroundQueueStatus();
      expect(queueStatus.activeCount).toBe(1);
      expect(queueStatus.remainingCapacity).toBe(MAX_BACKGROUND_SESSIONS - 1);
      expect(queueStatus.activeSessionIds).toContain(sessionId);

      const sessionMgr = cm.getSessionManager();
      const session = sessionMgr.get(sessionId);
      expect(session).toBeDefined();
      expect(session!.executionMode).toBe(ExecutionMode.BACKGROUND);
      expect(session!.lifeCycle).toBe('active');
      expect(session!.state.worktreePath).toBe(worktreePath);

      // afterBackgroundExecution: releases slot + archives session
      cm.afterBackgroundExecution(contract.contract_id, sessionId);

      const finalStatus = cm.getBackgroundQueueStatus();
      expect(finalStatus.activeCount).toBe(0);
      expect(finalStatus.remainingCapacity).toBe(MAX_BACKGROUND_SESSIONS);
    });

    it('emits session.created and session.archived events during lifecycle', async () => {
      const createdEvents: any[] = [];
      const archivedEvents: any[] = [];
      cm.on('session.created', (e) => createdEvents.push(e));
      cm.on('session.archived', (e) => archivedEvents.push(e));

      const contract = await cm.createContract(makeRequest());
      const sessionId = `sess-${contract.contract_id}`;

      await cm.beforeBackgroundExecution(contract.contract_id, sessionId, '/tmp/wt/test');
      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0].mode).toBe(ExecutionMode.BACKGROUND);
      expect(createdEvents[0].sessionId).toBe(sessionId);
      expect(createdEvents[0].worktreePath).toBe('/tmp/wt/test');

      cm.afterBackgroundExecution(contract.contract_id, sessionId);
      expect(archivedEvents).toHaveLength(1);
      expect(archivedEvents[0].mode).toBe(ExecutionMode.BACKGROUND);
    });

    it('handles worktreePath being optional', async () => {
      const contract = await cm.createContract(makeRequest());
      const sessionId = `sess-noworktree-${contract.contract_id}`;

      await cm.beforeBackgroundExecution(contract.contract_id, sessionId);

      const session = cm.getSessionManager().get(sessionId);
      expect(session).toBeDefined();
      expect(session!.state.worktreePath).toBeUndefined();

      cm.afterBackgroundExecution(contract.contract_id, sessionId);
    });
  });

  // ── 2. Concurrent sessions ─────────────────────────────────────────────────

  describe('concurrent background sessions', () => {
    it('supports up to MAX_BACKGROUND_SESSIONS (10) concurrent slots', async () => {
      const contracts = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          cm.createContract(makeRequest({ task_id: `concurrent-task-${i}` })),
        ),
      );

      // Acquire all 10 slots simultaneously
      await Promise.all(
        contracts.map((c, i) =>
          cm.beforeBackgroundExecution(c.contract_id, `session-${i}`),
        ),
      );

      const status = cm.getBackgroundQueueStatus();
      expect(status.activeCount).toBe(10);
      expect(status.atCapacity).toBe(true);
      expect(status.remainingCapacity).toBe(0);

      // Clean up
      contracts.forEach((c, i) => cm.afterBackgroundExecution(c.contract_id, `session-${i}`));
    });

    it('queues an 11th session and unblocks it when a slot is freed', async () => {
      // Fill 10 slots
      const firstTen = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          cm.createContract(makeRequest({ task_id: `fill-${i}` })),
        ),
      );
      await Promise.all(
        firstTen.map((c, i) =>
          cm.beforeBackgroundExecution(c.contract_id, `slot-${i}`),
        ),
      );
      expect(cm.getBackgroundQueueStatus().atCapacity).toBe(true);

      // 11th session — will be queued
      const eleventh = await cm.createContract(makeRequest({ task_id: 'eleventh' }));
      let slot11Ready = false;
      const slot11Promise = cm
        .beforeBackgroundExecution(eleventh.contract_id, 'slot-11')
        .then(() => { slot11Ready = true; });

      // Not yet ready
      await Promise.resolve();
      expect(slot11Ready).toBe(false);
      expect(cm.getBackgroundQueueStatus().queuedSessionIds).toContain('slot-11');

      // Release one slot → 11th should activate
      cm.afterBackgroundExecution(firstTen[0].contract_id, 'slot-0');
      await slot11Promise;
      expect(slot11Ready).toBe(true);

      // Cleanup remaining
      for (let i = 1; i < 10; i++) {
        cm.afterBackgroundExecution(firstTen[i].contract_id, `slot-${i}`);
      }
      cm.afterBackgroundExecution(eleventh.contract_id, 'slot-11');
    });

    it('degrades to INTERACTIVE when at capacity', async () => {
      // Fill queue to capacity by directly acquiring slots
      const queue = (cm as any).backgroundQueue;
      for (let i = 0; i < MAX_BACKGROUND_SESSIONS; i++) {
        await queue.acquire(`pre-fill-${i}`, `c-${i}`);
      }

      const req = makeRequest({ execution_mode: ExecutionMode.BACKGROUND });
      const selectedMode = cm.selectExecutionMode(req as any);
      expect(selectedMode).toBe(ExecutionMode.INTERACTIVE);
    });

    it('emits background_queue_full event when degrading', async () => {
      const queueFullEvents: any[] = [];
      cm.on('background_queue_full', (e) => queueFullEvents.push(e));

      const queue = (cm as any).backgroundQueue;
      for (let i = 0; i < MAX_BACKGROUND_SESSIONS; i++) {
        await queue.acquire(`pre-fill-${i}`, `c-${i}`);
      }

      cm.selectExecutionMode(makeRequest({ execution_mode: ExecutionMode.BACKGROUND }) as any);
      expect(queueFullEvents).toHaveLength(1);
      expect(queueFullEvents[0].atCapacity).toBe(true);
    });
  });

  // ── 3. Session isolation ───────────────────────────────────────────────────

  describe('session isolation', () => {
    it('each background session has an independent worktree path', async () => {
      const paths = ['/tmp/wt/feat-a', '/tmp/wt/feat-b'];
      const contracts = await Promise.all([
        cm.createContract(makeRequest({ task_id: 'iso-a' })),
        cm.createContract(makeRequest({ task_id: 'iso-b' })),
      ]);

      await cm.beforeBackgroundExecution(contracts[0].contract_id, 'iso-sess-a', paths[0]);
      await cm.beforeBackgroundExecution(contracts[1].contract_id, 'iso-sess-b', paths[1]);

      const mgr = cm.getSessionManager();
      expect(mgr.get('iso-sess-a')!.state.worktreePath).toBe(paths[0]);
      expect(mgr.get('iso-sess-b')!.state.worktreePath).toBe(paths[1]);

      // Updating one session does not affect the other
      mgr.updateState('iso-sess-a', { conversationMessages: ['msg-a'] });
      expect(mgr.get('iso-sess-b')!.state.conversationMessages).toEqual([]);

      cm.afterBackgroundExecution(contracts[0].contract_id, 'iso-sess-a');
      cm.afterBackgroundExecution(contracts[1].contract_id, 'iso-sess-b');
    });

    it('archiving one background session does not affect others', async () => {
      const contracts = await Promise.all([
        cm.createContract(makeRequest({ task_id: 'arch-x' })),
        cm.createContract(makeRequest({ task_id: 'arch-y' })),
      ]);

      await cm.beforeBackgroundExecution(contracts[0].contract_id, 'arch-sess-x');
      await cm.beforeBackgroundExecution(contracts[1].contract_id, 'arch-sess-y');

      cm.afterBackgroundExecution(contracts[0].contract_id, 'arch-sess-x');

      // sess-y still active
      const mgr = cm.getSessionManager();
      expect(mgr.get('arch-sess-y')!.lifeCycle).toBe('active');
      expect(cm.getBackgroundQueueStatus().activeCount).toBe(1);

      cm.afterBackgroundExecution(contracts[1].contract_id, 'arch-sess-y');
    });

    it('double-archive is safe (idempotent)', async () => {
      const contract = await cm.createContract(makeRequest());
      const sessionId = 'double-archive-sess';

      await cm.beforeBackgroundExecution(contract.contract_id, sessionId);
      cm.afterBackgroundExecution(contract.contract_id, sessionId);
      // Second call should not throw
      expect(() =>
        cm.afterBackgroundExecution(contract.contract_id, sessionId),
      ).not.toThrow();
    });
  });

  // ── 4. Queue status queries ────────────────────────────────────────────────

  describe('queue status queries', () => {
    it('getBackgroundQueueStatus() reflects accurate counts', async () => {
      let status = cm.getBackgroundQueueStatus();
      expect(status.activeCount).toBe(0);
      expect(status.atCapacity).toBe(false);
      expect(status.remainingCapacity).toBe(MAX_BACKGROUND_SESSIONS);

      const contract = await cm.createContract(makeRequest());
      await cm.beforeBackgroundExecution(contract.contract_id, 'qs-sess-1');

      status = cm.getBackgroundQueueStatus();
      expect(status.activeCount).toBe(1);
      expect(status.remainingCapacity).toBe(MAX_BACKGROUND_SESSIONS - 1);
      expect(status.activeSessionIds).toContain('qs-sess-1');

      cm.afterBackgroundExecution(contract.contract_id, 'qs-sess-1');

      status = cm.getBackgroundQueueStatus();
      expect(status.activeCount).toBe(0);
    });
  });
});
