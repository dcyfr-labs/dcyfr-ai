/**
 * DelegationContractManager container reputation integration tests
 * TLP:CLEAR
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';

import { DelegationContractManager } from '../../delegation/contract-manager';
import { ReputationEngine } from '../../reputation/reputation-engine';
import type { CreateDelegationContractRequest, DelegationAgent } from '../../types/delegation-contracts';

const MANAGER_DB_PATH = '/tmp/test-delegation-contracts-container-reputation.db';
const REPUTATION_DB_PATH = '/tmp/test-reputation-container-results.db';

describe('DelegationContractManager container result reputation wiring', () => {
  let manager: DelegationContractManager;
  let reputationEngine: ReputationEngine;
  let testDelegator: DelegationAgent;
  let testDelegatee: DelegationAgent;

  beforeEach(() => {
    if (existsSync(MANAGER_DB_PATH)) unlinkSync(MANAGER_DB_PATH);
    if (existsSync(REPUTATION_DB_PATH)) unlinkSync(REPUTATION_DB_PATH);

    reputationEngine = new ReputationEngine({
      databasePath: REPUTATION_DB_PATH,
      debug: false,
    });

    manager = new DelegationContractManager({
      databasePath: MANAGER_DB_PATH,
      maxDelegationDepth: 3,
      debug: false,
      reputationEngine,
    });

    testDelegator = {
      agent_id: 'agent-delegator-reputation',
      agent_name: 'Test Delegator Reputation',
      confidence_level: 0.9,
    };

    testDelegatee = {
      agent_id: 'agent-delegatee-reputation',
      agent_name: 'Test Delegatee Reputation',
      confidence_level: 0.85,
    };
  });

  afterEach(() => {
    manager.close();
    reputationEngine.close();
    if (existsSync(MANAGER_DB_PATH)) unlinkSync(MANAGER_DB_PATH);
    if (existsSync(REPUTATION_DB_PATH)) unlinkSync(REPUTATION_DB_PATH);
  });

  async function createBaseContract(taskId: string): Promise<string> {
    const request: CreateDelegationContractRequest = {
      delegator: testDelegator,
      delegatee: testDelegatee,
      task_id: taskId,
      task_description: 'Container execution reputation test',
      verification_policy: 'direct_inspection',
      success_criteria: { quality_threshold: 0.8 },
      timeout_ms: 3_600_000,
    };

    const contract = await manager.createContract(request);
    return contract.contract_id;
  }

  it('updates delegatee reputation when a container contract completes successfully', async () => {
    const contractId = await createBaseContract('task-container-success');

    await manager.updateContract({
      contract_id: contractId,
      status: 'active',
      metadata: {
        execution_environment: 'container',
        container_handle: { containerId: 'c1', containerName: 'n1', startedAt: new Date().toISOString(), backendType: 'local-docker' },
      },
    });

    await manager.updateContract({
      contract_id: contractId,
      status: 'completed',
      verification_result: {
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: 'container-test',
        verification_method: 'direct_inspection',
        quality_score: 0.9,
      },
      metadata: {
        execution_environment: 'container',
        container_execution_time_ms: 1234,
        container_exit_code: 0,
        timed_out: false,
      },
    });

    await new Promise((r) => setTimeout(r, 0));

    const reputation = await reputationEngine.getReputation(testDelegatee.agent_id);
    expect(reputation).toBeDefined();
    expect(reputation?.total_tasks).toBe(1);
    expect(reputation?.successful_tasks).toBe(1);
    expect(reputation?.failed_tasks).toBe(0);
  });

  it('updates delegatee reputation when a container contract fails', async () => {
    const contractId = await createBaseContract('task-container-failure');

    await manager.updateContract({
      contract_id: contractId,
      status: 'active',
      metadata: {
        execution_environment: 'container',
        container_handle: { containerId: 'c2', containerName: 'n2', startedAt: new Date().toISOString(), backendType: 'local-docker' },
      },
    });

    await manager.updateContract({
      contract_id: contractId,
      status: 'failed',
      metadata: {
        execution_environment: 'container',
        container_execution_time_ms: 2500,
        container_exit_code: 1,
        timed_out: false,
      },
    });

    await new Promise((r) => setTimeout(r, 0));

    const reputation = await reputationEngine.getReputation(testDelegatee.agent_id);
    expect(reputation).toBeDefined();
    expect(reputation?.total_tasks).toBe(1);
    expect(reputation?.successful_tasks).toBe(0);
    expect(reputation?.failed_tasks).toBe(1);
  });
});
