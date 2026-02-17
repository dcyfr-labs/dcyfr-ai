/**
 * DCYFR Delegation Chain Tracker Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive tests for delegation chain tracking with loop detection.
 * 
 * @module __tests__/delegation/chain-tracker.test
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { DelegationContractManager } from '../../delegation/contract-manager';
import { DelegationChainTracker } from '../../delegation/chain-tracker';
import type { CreateDelegationContractRequest, DelegationAgent, DelegationContract } from '../../types/delegation-contracts';

const TEST_DB_PATH = '/tmp/test-chain-tracker.db';

describe('DelegationChainTracker', () => {
  let manager: DelegationContractManager;
  let tracker: DelegationChainTracker;
  let testDelegator: DelegationAgent;
  let testDelegatee1: DelegationAgent;
  let testDelegatee2: DelegationAgent;
  let testDelegatee3: DelegationAgent;
  
  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    
    // Initialize database with schema
    const Database = require('better-sqlite3');
    const db = new Database(TEST_DB_PATH);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS delegation_contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id TEXT NOT NULL UNIQUE,
        delegator_agent_id TEXT NOT NULL,
        delegatee_agent_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        task_description TEXT NOT NULL,
        verification_policy TEXT NOT NULL,
        success_criteria TEXT NOT NULL,
        timeout_ms INTEGER NOT NULL,
        permission_tokens TEXT,
        priority INTEGER DEFAULT 3,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        activated_at TEXT,
        completed_at TEXT,
        verification_result TEXT,
        parent_contract_id TEXT,
        delegation_depth INTEGER DEFAULT 0,
        tlp_classification TEXT
      );
      
      CREATE TABLE IF NOT EXISTS reputation_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        event_data TEXT NOT NULL,
        task_id TEXT,
        delegation_contract_id TEXT,
        source_system TEXT NOT NULL DEFAULT 'dcyfr-ai'
      );
    `);
    
    db.close();
    
    // Initialize manager and tracker
    manager = new DelegationContractManager({
      databasePath: TEST_DB_PATH,
      maxDelegationDepth: 5,
      debug: false,
    });
    
    tracker = new DelegationChainTracker(manager, {
      maxChainDepth: 5,
      debug: false,
    });
    
    testDelegator = {
      agent_id: 'agent-root',
      agent_name: 'Root Agent',
    };
    
    testDelegatee1 = {
      agent_id: 'agent-level-1',
      agent_name: 'Level 1 Agent',
    };
    
    testDelegatee2 = {
      agent_id: 'agent-level-2',
      agent_name: 'Level 2 Agent',
    };
    
    testDelegatee3 = {
      agent_id: 'agent-level-3',
      agent_name: 'Level 3 Agent',
    };
  });
  
  afterEach(() => {
    manager?.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });
  
  describe('buildChain', () => {
    it('should build a simple chain', async () => {
      const contract = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'task-1',
        task_description: 'Test task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const chain = await tracker.buildChain(contract.contract_id);
      
      expect(chain).toBeDefined();
      expect(chain.contracts.length).toBe(1);
      expect(chain.depth).toBe(1);
      expect(chain.has_loops).toBe(false);
    });
    
    it('should build a multi-level chain', async () => {
      // Create chain: root -> level1 -> level2 -> level3
      const level0 = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'task-0',
        task_description: 'Root task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 7200000,
      });
      
      const level1 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee2,
        task_id: 'task-1',
        task_description: 'Level 1 task',
        verification_policy: 'third_party_audit',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: level0.contract_id,
      });
      
      const level2 = await manager.createContract({
        delegator: testDelegatee2,
        delegatee: testDelegatee3,
        task_id: 'task-2',
        task_description: 'Level 2 task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 1800000,
        parent_contract_id: level1.contract_id,
      });
      
      const chain = await tracker.buildChain(level2.contract_id);
      
      expect(chain.contracts.length).toBe(3);
      expect(chain.depth).toBe(3);
      expect(chain.contracts[0].contract_id).toBe(level0.contract_id);
      expect(chain.contracts[1].contract_id).toBe(level1.contract_id);
      expect(chain.contracts[2].contract_id).toBe(level2.contract_id);
      expect(chain.has_loops).toBe(false);
    });
    
    it('should throw error for non-existent contract', async () => {
      await expect(tracker.buildChain('non-existent')).rejects.toThrow('Contract not found');
    });
  });
  
  describe('analyzeChain', () => {
    it('should analyze a valid simple chain', async () => {
      const contract = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'analyze-1',
        task_description: 'Analyze task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const analysis = await tracker.analyzeChain(contract.contract_id);
      
      expect(analysis.valid).toBe(true);
      expect(analysis.depth).toBe(1);
      expect(analysis.has_loops).toBe(false);
      expect(analysis.errors).toBeUndefined();
    });
    
    it('should detect excessive chain depth', async () => {
      // Create chain at exactly max depth (should be valid)
      let parentId: string | undefined;
      let lastContract: DelegationContract | undefined;
      
      // Create chain up to max depth (5 levels = depth 0-4)
      for (let i = 0; i <= 4; i++) {
        const contract = await manager.createContract({
          delegator: { agent_id: `agent-${i}`, agent_name: `Agent ${i}` },
          delegatee: { agent_id: `agent-${i + 1}`, agent_name: `Agent ${i + 1}` },
          task_id: `task-${i}`,
          task_description: `Task ${i}`,
          verification_policy: 'direct_inspection',
          success_criteria: { quality_threshold: 0.8 },
          timeout_ms: 3600000,
          parent_contract_id: parentId,
        });
        lastContract = contract;
        parentId = contract.contract_id;
      }
      
      // analyzeChain should detect that chain is at max depth
      const analysis = await tracker.analyzeChain(lastContract!.contract_id);
      
      expect(analysis.depth).toBe(5); // 5 contracts in chain
      expect(analysis.valid).toBe(true); // Still valid at max depth
      
      // Verify that attempting to add a child would fail
      const validation = await tracker.validateNewChild(lastContract!.contract_id, {
        delegatee: { agent_id: 'agent-too-deep', agent_name: 'Too Deep Agent' },
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('exceed maximum chain depth');
    });
    
    it('should identify firebreak contracts', async () => {
      // Create chain with human verification (firebreak)
      const root = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'firebreak-root',
        task_description: 'Root task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const firebreak = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee2,
        task_id: 'firebreak-task',
        task_description: 'Firebreak task',
        verification_policy: 'human_required',
        success_criteria: { quality_threshold: 0.9 },
        timeout_ms: 3600000,
        parent_contract_id: root.contract_id,
      });
      
      const analysis = await tracker.analyzeChain(firebreak.contract_id);
      
      expect(analysis.firebreak_contracts).toContain(firebreak.contract_id);
      expect(analysis.firebreak_contracts.length).toBeGreaterThan(0);
    });
    
    it('should identify TLP-based firebreaks', async () => {
      const contract = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'tlp-task',
        task_description: 'Sensitive task',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        tlp_classification: 'AMBER',
      });
      
      const analysis = await tracker.analyzeChain(contract.contract_id);
      
      expect(analysis.firebreak_contracts).toContain(contract.contract_id);
    });
    
    it('should warn about incorrect delegation depths', async () => {
      const contract = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'depth-check',
        task_description: 'Depth check',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const analysis = await tracker.analyzeChain(contract.contract_id);
      
      expect(analysis.valid).toBe(true);
      // Depth should be consistent
      expect(contract.delegation_depth).toBe(0);
    });
  });
  
  describe('loop detection', () => {
    it('should not detect loops in linear chain', async () => {
      const c1 = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'no-loop-1',
        task_description: 'Task 1',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const c2 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee2,
        task_id: 'no-loop-2',
        task_description: 'Task 2',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: c1.contract_id,
      });
      
      const chain = await tracker.buildChain(c2.contract_id);
      
      expect(chain.has_loops).toBe(false);
    });
  });
  
  describe('getDescendants', () => {
    it('should get all descendants from a contract', async () => {
      // Create tree structure
      const root = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'root',
        task_description: 'Root',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const child1 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee2,
        task_id: 'child-1',
        task_description: 'Child 1',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: root.contract_id,
      });
      
      const child2 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee3,
        task_id: 'child-2',
        task_description: 'Child 2',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: root.contract_id,
      });
      
      const grandchild = await manager.createContract({
        delegator: testDelegatee2,
        delegatee: { agent_id: 'agent-gc', agent_name: 'Grandchild' },
        task_id: 'grandchild',
        task_description: 'Grandchild',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: child1.contract_id,
      });
      
      const descendants = await tracker.getDescendants(root.contract_id);
      
      expect(descendants.length).toBe(3); // child1, child2, grandchild
      const descendantIds = descendants.map(d => d.contract_id);
      expect(descendantIds).toContain(child1.contract_id);
      expect(descendantIds).toContain(child2.contract_id);
      expect(descendantIds).toContain(grandchild.contract_id);
    });
    
    it('should return empty array for leaf contract', async () => {
      const leaf = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'leaf',
        task_description: 'Leaf',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const descendants = await tracker.getDescendants(leaf.contract_id);
      
      expect(descendants.length).toBe(0);
    });
  });
  
  describe('getAncestors', () => {
    it('should get all ancestors from a contract', async () => {
      const c1 = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'ancestor-1',
        task_description: 'Ancestor 1',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const c2 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee2,
        task_id: 'ancestor-2',
        task_description: 'Ancestor 2',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: c1.contract_id,
      });
      
      const c3 = await manager.createContract({
        delegator: testDelegatee2,
        delegatee: testDelegatee3,
        task_id: 'ancestor-3',
        task_description: 'Ancestor 3',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: c2.contract_id,
      });
      
      const ancestors = await tracker.getAncestors(c3.contract_id);
      
      expect(ancestors.length).toBe(2); // c1, c2
      expect(ancestors[0].contract_id).toBe(c1.contract_id);
      expect(ancestors[1].contract_id).toBe(c2.contract_id);
    });
    
    it('should return empty array for root contract', async () => {
      const root = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'root-only',
        task_description: 'Root',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const ancestors = await tracker.getAncestors(root.contract_id);
      
      expect(ancestors.length).toBe(0);
    });
  });
  
  describe('validateNewChild', () => {
    it('should validate a valid new child', async () => {
      const parent = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'parent-valid',
        task_description: 'Parent',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const validation = await tracker.validateNewChild(parent.contract_id, {
        delegatee: testDelegatee2,
      });
      
      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });
    
    it('should reject child that would create loop', async () => {
      const c1 = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'loop-prevent-1',
        task_description: 'Task 1',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const c2 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee2,
        task_id: 'loop-prevent-2',
        task_description: 'Task 2',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: c1.contract_id,
      });
      
      // Try to add testDelegator (already in chain) as child
      const validation = await tracker.validateNewChild(c2.contract_id, {
        delegatee: testDelegator,
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('loop');
    });
    
    it('should reject child that would exceed max depth', async () => {
      let parentId: string | undefined;
      let lastContract: DelegationContract | undefined;
      
      // Create chain up to max depth
      for (let i = 0; i < 5; i++) {
        const contract = await manager.createContract({
          delegator: { agent_id: `agent-depth-${i}`, agent_name: `Agent ${i}` },
          delegatee: { agent_id: `agent-depth-${i + 1}`, agent_name: `Agent ${i + 1}` },
          task_id: `depth-task-${i}`,
          task_description: `Task ${i}`,
          verification_policy: 'direct_inspection',
          success_criteria: { quality_threshold: 0.8 },
          timeout_ms: 3600000,
          parent_contract_id: parentId,
        });
        lastContract = contract;
        parentId = contract.contract_id;
      }
      
      const validation = await tracker.validateNewChild(lastContract!.contract_id, {
        delegatee: { agent_id: 'agent-excess', agent_name: 'Excess Agent' },
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('exceed maximum chain depth');
    });
    
    it('should reject for non-existent parent', async () => {
      const validation = await tracker.validateNewChild('non-existent', {
        delegatee: testDelegatee1,
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('Parent contract not found');
    });
  });
  
  describe('getChainStatistics', () => {
    it('should calculate statistics for simple chain', async () => {
      const contract = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'stats-simple',
        task_description: 'Simple stats',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const stats = await tracker.getChainStatistics(contract.contract_id);
      
      expect(stats.total_contracts).toBe(1);
      expect(stats.chain_depth).toBe(1);
      expect(stats.max_depth).toBe(1);
      expect(stats.unique_agents).toBe(2); // delegator + delegatee
      expect(stats.has_loops).toBe(false);
    });
    
    it('should calculate statistics for complex chain with descendants', async () => {
      const root = await manager.createContract({
        delegator: testDelegator,
        delegatee: testDelegatee1,
        task_id: 'stats-root',
        task_description: 'Root',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
      });
      
      const child1 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee2,
        task_id: 'stats-child1',
        task_description: 'Child 1',
        verification_policy: 'human_required',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: root.contract_id,
      });
      
      const child2 = await manager.createContract({
        delegator: testDelegatee1,
        delegatee: testDelegatee3,
        task_id: 'stats-child2',
        task_description: 'Child 2',
        verification_policy: 'direct_inspection',
        success_criteria: { quality_threshold: 0.8 },
        timeout_ms: 3600000,
        parent_contract_id: root.contract_id,
      });
      
      const stats = await tracker.getChainStatistics(root.contract_id);
      
      expect(stats.total_contracts).toBe(3); // root + 2 children
      expect(stats.chain_depth).toBe(1); // one contract in root chain
      expect(stats.max_depth).toBe(1); // children have depth 1
      expect(stats.unique_agents).toBeGreaterThanOrEqual(4);
      expect(stats.firebreak_count).toBeGreaterThan(0); // child1 has human_required
    });
  });
});
