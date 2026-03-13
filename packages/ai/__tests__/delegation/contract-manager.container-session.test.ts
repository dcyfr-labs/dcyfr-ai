/**
 * DelegationContractManager container session tracking tests
 * TLP:CLEAR
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';

import { DelegationContractManager } from '../../delegation/contract-manager';
import type { CreateDelegationContractRequest, DelegationAgent } from '../../types/delegation-contracts';
import { ExecutionMode } from '../../types/agent-capabilities';

const TEST_DB_PATH = '/tmp/test-delegation-contracts-container-session.db';

describe('DelegationContractManager container session tracking', () => {
  let manager: DelegationContractManager;
  let testDelegator: DelegationAgent;
  let testDelegatee: DelegationAgent;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);

    manager = new DelegationContractManager({
      databasePath: TEST_DB_PATH,
      maxDelegationDepth: 3,
      debug: false,
    });

    testDelegator = {
      agent_id: 'agent-delegator-session',
      agent_name: 'Test Delegator Session',
      confidence_level: 0.9,
    };

    testDelegatee = {
      agent_id: 'agent-delegatee-session',
      agent_name: 'Test Delegatee Session',
      confidence_level: 0.85,
    };
  });

  afterEach(() => {
    manager.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('stores containerHandle in session state when a session exists for the contract', async () => {
    const sessionId = 'session-container-tracking-1';

    const request: CreateDelegationContractRequest = {
      delegator: testDelegator,
      delegatee: testDelegatee,
      task_id: 'task-container-session',
      task_description: 'Track container handle in session state',
      verification_policy: 'direct_inspection',
      success_criteria: { quality_threshold: 0.8 },
      timeout_ms: 3_600_000,
      execution_mode: ExecutionMode.BACKGROUND,
      session_id: sessionId,
    };

    const contract = await manager.createContract(request);
    await manager.beforeBackgroundExecution(contract.contract_id, sessionId, '/tmp/worktree-session-test');

    manager.dispatchToContainer(contract.contract_id, {
      containerId: 'container-session-1',
      containerName: 'dcyfr-agent-session-1',
      startedAt: new Date().toISOString(),
      backendType: 'local-docker',
    });

    const session = manager.getSessionManager().get(sessionId);
    expect(session).toBeDefined();
    expect(session?.state.containerHandle).toMatchObject({
      containerId: 'container-session-1',
      containerName: 'dcyfr-agent-session-1',
      backendType: 'local-docker',
    });
  });
});
