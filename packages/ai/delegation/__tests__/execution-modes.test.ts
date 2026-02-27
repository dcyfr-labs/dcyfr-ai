/**
 * Tests for DelegationContractManager.selectExecutionMode() and handoffSession()
 * Phase 6.6 — delegation-execution-modes
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DelegationContractManager } from '../contract-manager.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { SessionHandoffRequest } from '../../types/agent-capabilities.js';
import type { CreateDelegationContractRequest } from '../../types/delegation-contracts.js';

/** Returns a minimal CreateDelegationContractRequest */
const makeContractRequest = (
  overrides: Partial<CreateDelegationContractRequest> = {},
): CreateDelegationContractRequest => ({
  delegator: { agent_id: 'delegator-a', agent_name: 'Delegator A' },
  delegatee: { agent_id: 'delegatee-b', agent_name: 'Delegatee B' },
  task_id: 'task-test',
  task_description: 'Test task',
  verification_policy: 'direct_inspection',
  success_criteria: { required_checks: [] },
  timeout_ms: 60_000,
  ...overrides,
});

const makeHandoffRequest = (
  fromContractId: string,
  overrides: Partial<SessionHandoffRequest> = {},
): SessionHandoffRequest => ({
  fromContractId,
  toExecutionMode: ExecutionMode.BACKGROUND,
  contextSnapshot: { conversationHistory: [], artifacts: [] },
  handoffReason: 'switching to background for long task',
  ...overrides,
});

describe('DelegationContractManager.selectExecutionMode()', () => {
  let cm: DelegationContractManager;

  beforeEach(() => {
    cm = new DelegationContractManager();
  });

  it('Tier 1: explicit request.execution_mode overrides all', () => {
    const req = makeContractRequest({ execution_mode: ExecutionMode.BACKGROUND });
    const mode = cm.selectExecutionMode(req as any);
    expect(mode).toBe(ExecutionMode.BACKGROUND);
  });

  it('Tier 2: openspec hint from metadata.openspec_execution_mode', () => {
    const req = { metadata: { openspec_execution_mode: ExecutionMode.ASYNC } };
    const mode = cm.selectExecutionMode(req as any);
    expect(mode).toBe(ExecutionMode.ASYNC);
  });

  it('Tier 3: agent manifest preferred_execution_mode', () => {
    const req = {};
    const manifest = {
      agentName: 'test-agent',
      capabilities: [],
      preferred_execution_mode: ExecutionMode.BACKGROUND,
      supported_execution_modes: [ExecutionMode.BACKGROUND, ExecutionMode.INTERACTIVE],
    } as any;
    const mode = cm.selectExecutionMode(req as any, manifest);
    expect(mode).toBe(ExecutionMode.BACKGROUND);
  });

  it('Tier 4: defaults to INTERACTIVE', () => {
    const req = {};
    const mode = cm.selectExecutionMode(req as any);
    expect(mode).toBe(ExecutionMode.INTERACTIVE);
  });

  it('Tier 1 explicit overrides Tier 2 openspec hint', () => {
    const req = {
      execution_mode: ExecutionMode.INTERACTIVE,
      metadata: { openspec_execution_mode: ExecutionMode.ASYNC },
    };
    const mode = cm.selectExecutionMode(req as any);
    expect(mode).toBe(ExecutionMode.INTERACTIVE);
  });

  it('Tier 2 overrides Tier 3 manifest preference', () => {
    const req = { metadata: { openspec_execution_mode: ExecutionMode.ASYNC } };
    const manifest = {
      agentName: 'test-agent',
      capabilities: [],
      preferred_execution_mode: ExecutionMode.BACKGROUND,
      supported_execution_modes: [ExecutionMode.ASYNC, ExecutionMode.BACKGROUND, ExecutionMode.INTERACTIVE],
    } as any;
    const mode = cm.selectExecutionMode(req as any, manifest);
    expect(mode).toBe(ExecutionMode.ASYNC);
  });

  it('degrades BACKGROUND to INTERACTIVE when queue is full', async () => {
    // Manually fill the queue to the max by acquiring slots
    const queue = cm['backgroundQueue'];
    for (let i = 0; i < 10; i++) {
      await queue.acquire(`test-session-${i}`, `contract-${i}`);
    }

    const req = { execution_mode: ExecutionMode.BACKGROUND };
    const degradedMode = cm.selectExecutionMode(req as any);
    expect(degradedMode).toBe(ExecutionMode.INTERACTIVE);
  });
});

describe('DelegationContractManager.handoffSession()', () => {
  let cm: DelegationContractManager;

  beforeEach(() => {
    cm = new DelegationContractManager();
  });

  it('throws for unknown source contract', async () => {
    await expect(
      cm.handoffSession(makeHandoffRequest('nonexistent-contract-id')),
    ).rejects.toThrow('not found');
  });

  it('creates new contract in target execution mode', async () => {
    const sourceContract = await cm.createContract(makeContractRequest());
    const fromContractId = sourceContract.contract_id;

    const newContract = await cm.handoffSession(
      makeHandoffRequest(fromContractId, { toExecutionMode: ExecutionMode.BACKGROUND }),
    );

    expect(newContract).toBeDefined();
    expect(newContract.contract_id).not.toBe(fromContractId);
    expect(newContract.parent_contract_id).toBe(fromContractId);
  });

  it('emits session.handoff event on success', async () => {
    const sourceContract = await cm.createContract(makeContractRequest());
    const fromContractId = sourceContract.contract_id;

    const events: any[] = [];
    cm.on('session.handoff', (e) => events.push(e));

    await cm.handoffSession(
      makeHandoffRequest(fromContractId, {
        toExecutionMode: ExecutionMode.ASYNC,
        handoffReason: 'promoting to PR',
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0].toMode).toBe(ExecutionMode.ASYNC);
    expect(events[0].fromContractId).toBe(fromContractId);
  });

  it('getBackgroundQueueStatus() exposes queue state', () => {
    const status = cm.getBackgroundQueueStatus();
    expect(status).toBeDefined();
    expect(typeof status.activeCount).toBe('number');
    expect(typeof status.remainingCapacity).toBe('number');
    expect(typeof status.atCapacity).toBe('boolean');
  });
});
