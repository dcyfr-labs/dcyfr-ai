/**
 * DCYFR Delegation Contract Manager Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive unit tests for the delegation contract manager.
 * Tests CRUD operations, validation, and edge cases.
 * 
 * @module __tests__/delegation/contract-manager.test
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { DelegationContractManager } from '../../delegation/contract-manager';
import type { CreateDelegationContractRequest, DelegationAgent } from '../../types/delegation-contracts';

const TEST_DB_PATH = '/tmp/test-delegation-contracts.db';

describe('DelegationContractManager', () => {
  let manager: DelegationContractManager;
  let testDelegator: DelegationAgent;
  let testDelegatee: DelegationAgent;
  
  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    
    // Initialize manager - it will create schema via initializeSchema()
    manager = new DelegationContractManager({
      databasePath: TEST_DB_PATH,
      maxDelegationDepth: 3,
      debug: false,
    });
    
    testDelegator = {
      agent_id: 'agent-delegator-1',
      agent_name: 'Test Delegator',
      confidence_level: 0.9,
    };
    
    testDelegatee = {
      agent_id: 'agent-delegatee-1',
      agent_name: 'Test Delegatee',
      confidence_level: 0.85,
    };
  });
  
  afterEach(() => {
    manager.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });
  
  describe('createContract', () => {
    it('should create a new delegation contract', async () => {
      const request: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-1',
        task_description: 'Implement feature X',
        verification_policy: 'direct_inspection',
        success_criteria: {
          quality_threshold: 0.8,
          required_checks: ['compile', 'test'],
        },
        timeout_ms: 3600000, // 1 hour
      };
      
      const contract = await manager.createContract(request);
      
      expect(contract).toBeDefined();
      expect(contract.contract_id).toBeTruthy();
      expect(contract.delegator.agent_id).toBe(testDelegator.agent_id);
      expect(contract.delegatee.agent_id).toBe(testDelegatee.agent_id);
      expect(contract.status).toBe('pending');
      expect(contract.delegation_depth).toBe(0);
      expect(contract.created_at).toBeTruthy();
    });
    
    it('should create a contract with permission tokens', async () => {
      const request: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-2',
        task_description: 'Code review',
        verification_policy: 'third_party_audit',
        success_criteria: { quality_threshold: 0.9 },
        timeout_ms: 1800000,
        permission_tokens: [{
          token_id: 'token-1',
          scopes: ['workspace.read.code'],
          delegatable: false,
          max_delegation_depth: 0,
        }],
      };
      
      const contract = await manager.createContract(request);
      
      expect(contract.permission_tokens).toBeDefined();
      expect(contract.permission_tokens?.length).toBe(1);
      expect(contract.permission_tokens?.[0].scopes).toContain('workspace.read.code');
    });
    
    it('should create nested delegation contracts', async () => {
      // Create parent contract
      const parentRequest: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-parent',
        task_description: 'Parent task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 7200000,
      };
      
      const parent = await manager.createContract(parentRequest);
      
      // Create child contract
      const childRequest: CreateDelegationContractRequest = {
        delegator: testDelegatee,
        delegatee: {
          agent_id: 'agent-delegatee-2',
          agent_name: 'Sub Delegatee',
        },
        task_id: 'task-child',
        task_description: 'Child task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.75 },
        timeout_ms: 3600000,
        parent_contract_id: parent.contract_id,
      };
      
      const child = await manager.createContract(childRequest);
      
      expect(child.parent_contract_id).toBe(parent.contract_id);
      expect(child.delegation_depth).toBe(1);
    });
    
    it('should reject delegation exceeding max depth', async () => {
      let parentId: string | undefined;
      
      // Create chain up to max depth
      for (let i = 0; i < 3; i++) {
        const request: CreateDelegationContractRequest = {
          delegator: testDelegator,
          delegatee: testDelegatee,
          task_id: `task-${i}`,
          task_description: `Task ${i}`,
          verification_policy: 'direct_inspection',
          success_criteria: { quality_threshold: 0.8 },
          timeout_ms: 3600000,
          parent_contract_id: parentId,
        };
        
        const contract = await manager.createContract(request);
        parentId = contract.contract_id;
      }
      
      // Attempt to exceed max depth
      const excessRequest: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-excess',
        task_description: 'Excess depth task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: parentId,
      };
      
      await expect(manager.createContract(excessRequest)).rejects.toThrow('Maximum delegation depth exceeded');
    });
  });
  
  describe('getContract', () => {
    it('should retrieve an existing contract', async () => {
      const request: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-get',
        task_description: 'Test get',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      };
      
      const created = await manager.createContract(request);
      const retrieved = await manager.getContract(created.contract_id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.contract_id).toBe(created.contract_id);
      expect(retrieved?.task_id).toBe('task-get');
    });
    
    it('should return null for non-existent contract', async () => {
      const result = await manager.getContract('non-existent-id');
      expect(result).toBeNull();
    });
  });
  
  describe('updateContract', () => {
    it('should update contract status', async () => {
      const request: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-update',
        task_description: 'Test update',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      };
      
      const contract = await manager.createContract(request);
      
      const updated = await manager.updateContract({
        contract_id: contract.contract_id,
        status: 'active',
      });
      
      expect(updated.status).toBe('active');
      expect(updated.activated_at).toBeTruthy();
    });
    
    it('should update contract with verification result', async () => {
      const request: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-verify',
        task_description: 'Test verification',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      };
      
      const contract = await manager.createContract(request);
      
      const verificationResult = {
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: 'agent-verifier-1',
        verification_method: 'direct_inspection' as const,
        quality_score: 0.9,
      };
      
      const updated = await manager.updateContract({
        contract_id: contract.contract_id,
        status: 'completed',
        verification_result: verificationResult,
      });
      
      expect(updated.status).toBe('completed');
      expect(updated.verification_result).toBeDefined();
      expect(updated.verification_result?.verified).toBe(true);
      expect(updated.verification_result?.quality_score).toBe(0.9);
      expect(updated.completed_at).toBeTruthy();
    });
    
    it('should throw error for non-existent contract', async () => {
      await expect(manager.updateContract({
        contract_id: 'non-existent',
        status: 'active',
      })).rejects.toThrow('Contract not found');
    });
  });
  
  describe('queryContracts', () => {
    beforeEach(async () => {
      // Create test contracts
      await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-1',
        task_description: 'Task 1',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      await manager.createContract({
        delegator: testDelegator,
        delegatee: { agent_id: 'agent-2', agent_name: 'Agent 2' },
        task_id: 'task-2',
        task_description: 'Task 2',
        verification_policy: 'third_party_audit',
        success_criteria: { quality_threshold: 0.9 },
        timeout_ms: 1800000,
      });
    });
    
    it('should query contracts by delegatee', async () => {
      const results = await manager.queryContracts({
        delegatee_id: testDelegatee.agent_id,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].delegatee.agent_id).toBe(testDelegatee.agent_id);
    });
    
    it('should query contracts by delegator', async () => {
      const results = await manager.queryContracts({
        delegator_id: testDelegator.agent_id,
      });
      
      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(contract => {
        expect(contract.delegator.agent_id).toBe(testDelegator.agent_id);
      });
    });
    
    it('should query contracts by task_id', async () => {
      const results = await manager.queryContracts({
        task_id: 'task-1',
      });
      
      expect(results.length).toBe(1);
      expect(results[0].task_id).toBe('task-1');
    });
    
    it('should query contracts by status', async () => {
      const results = await manager.queryContracts({
        status: 'pending',
      });
      
      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(contract => {
        expect(contract.status).toBe('pending');
      });
    });
    
    it('should query contracts with multiple statuses', async () => {
      const results = await manager.queryContracts({
        status: ['pending', 'active'],
      });
      
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should apply limit and offset', async () => {
      const results = await manager.queryContracts({
        limit: 1,
        offset: 0,
      });
      
      expect(results.length).toBe(1);
    });
    
    it('should apply offset without limit', async () => {
      const results = await manager.queryContracts({
        offset: 1,
      });
      
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should sort contracts', async () => {
      const results = await manager.queryContracts({
        sort_by: 'created_at',
        sort_order: 'asc',
      });
      
      expect(results.length).toBeGreaterThanOrEqual(2);
      // Verify ascending order
      for (let i = 1; i < results.length; i++) {
        expect(new Date(results[i].created_at).getTime())
          .toBeGreaterThanOrEqual(new Date(results[i - 1].created_at).getTime());
      }
    });
    
    it('should query contracts by delegation_depth', async () => {
      const results = await manager.queryContracts({
        delegation_depth: 0,
      });
      
      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(contract => {
        expect(contract.delegation_depth).toBe(0);
      });
    });
    
    it('should query contracts by parent_contract_id', async () => {
      // Create parent and child contracts
      const parent = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'parent-for-query',
        task_description: 'Parent task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const child = await manager.createContract({
        delegator: testDelegatee,
        delegatee: { agent_id: 'agent-child', agent_name: 'Child Agent' },
        task_id: 'child-task',
        task_description: 'Child task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: parent.contract_id,
      });
      
      const results = await manager.queryContracts({
        parent_contract_id: parent.contract_id,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].contract_id).toBe(child.contract_id);
      expect(results[0].parent_contract_id).toBe(parent.contract_id);
    });
  });
  
  describe('deleteContract', () => {
    it('should soft delete a contract', async () => {
      const request: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-delete',
        task_description: 'Test delete',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      };
      
      const contract = await manager.createContract(request);
      
      await manager.deleteContract(contract.contract_id, 'Test deletion');
      
      const deleted = await manager.getContract(contract.contract_id);
      expect(deleted?.status).toBe('revoked');
      expect(deleted?.completed_at).toBeTruthy();
    });
    
    it('should throw error for non-existent contract', async () => {
      await expect(manager.deleteContract('non-existent'))
        .rejects.toThrow('Contract not found');
    });
  });
  
  describe('getActiveContracts', () => {
    it('should return only active/pending contracts for agent', async () => {
      // Create contracts in various states
      const pending = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-pending',
        task_description: 'Pending task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const active = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-active',
        task_description: 'Active task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      await manager.updateContract({
        contract_id: active.contract_id,
        status: 'active',
      });
      
      const completed = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'task-completed',
        task_description: 'Completed task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      await manager.updateContract({
        contract_id: completed.contract_id,
        status: 'completed',
      });
      
      const activeContracts = await manager.getActiveContracts(testDelegatee.agent_id);
      
      expect(activeContracts.length).toBe(2); // pending + active
      const statuses = activeContracts.map(c => c.status);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('active');
      expect(statuses).not.toContain('completed');
    });
  });
  
  describe('getStatistics', () => {
    beforeEach(async () => {
      // Create contracts in various states
      const contracts = await Promise.all([
        manager.createContract({
          delegator: testDelegator,
          delegatee: testDelegatee,
          task_id: 'stat-1',
          task_description: 'Stat 1',
          verification_policy: 'direct_inspection',
          success_criteria: { quality_threshold: 0.8 },
          timeout_ms: 3600000,
        }),
        manager.createContract({
          delegator: testDelegator,
          delegatee: testDelegatee,
          task_id: 'stat-2',
          task_description: 'Stat 2',
          verification_policy: 'direct_inspection',
          success_criteria: { quality_threshold: 0.8 },
          timeout_ms: 3600000,
        }),
      ]);
      
      await manager.updateContract({
        contract_id: contracts[0].contract_id,
        status: 'completed',
      });
      
      await manager.updateContract({
        contract_id: contracts[1].contract_id,
        status: 'failed',
      });
    });
    
    it('should calculate global statistics', async () => {
      const stats = await manager.getStatistics();
      
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.success_rate).toBeGreaterThan(0);
    });
    
    it('should calculate agent-specific statistics', async () => {
      const stats = await manager.getStatistics(testDelegatee.agent_id);
      
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.success_rate).toBe(0.5); // 1 completed / (1 completed + 1 failed)
    });
  });
  
  describe('debug mode', () => {
    let debugManager: DelegationContractManager;
    
    beforeEach(() => {
      debugManager = new DelegationContractManager({
        databasePath: TEST_DB_PATH,
        debug: true,
      });
    });
    
    afterEach(() => {
      debugManager.close();
    });
    
    it('should log debug messages when enabled', async () => {
      const request: CreateDelegationContractRequest = {
        delegator: testDelegator,
        delegatee: testDelegatee,
        task_id: 'debug-task',
        task_description: 'Debug test',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      };
      
      const contract = await debugManager.createContract(request);
      expect(contract).toBeDefined();
      
      await debugManager.updateContract({
        contract_id: contract.contract_id,
        status: 'active',
      });
      
      await debugManager.deleteContract(contract.contract_id, 'Debug test');
      
      // All operations should complete successfully with debug logging
      expect(contract.contract_id).toBeTruthy();
    });
  });
});
