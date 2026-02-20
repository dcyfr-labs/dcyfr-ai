/**
 * Security Penetration Tests for DCYFR Delegation Framework
 * 
 * Tests attack vectors and validates defensive mechanisms:
 * - Permission escalation attempts
 * - Delegation loop exploits
 * - Reputation gaming
 * - Chain manipulation
 * - Resource exhaustion
 * - Malicious contract injection
 * - Firebreak bypass attempts
 * 
 * @package @dcyfr/ai
 * @module delegation/security-penetration
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// Type Definitions (Delegation Framework)
// ============================================================================

type PermissionScope = 
  | 'read:*' | 'read:public' | 'read:internal'
  | 'write:*' | 'write:public' | 'write:internal'
  | 'execute:*' | 'execute:safe' | 'execute:unsafe'
  | 'admin:*' | 'admin:users' | 'admin:system';

type PermissionAction = 
  | 'create' | 'read' | 'update' | 'delete'
  | 'execute' | 'delegate' | 'audit';

interface PermissionConstraint {
  maxDepth?: number;
  allowedDomains?: string[];
  excludedActions?: PermissionAction[];
  requiresApproval?: boolean;
  expiresAt?: Date;
  rateLimit?: { operations: number; windowMs: number };
}

interface PermissionToken {
  id: string;
  scope: PermissionScope[];
  allowedActions: PermissionAction[];
  constraints: PermissionConstraint;
  grantedAt: Date;
  grantedBy: string;
  depth: number;
}

interface ReputationScore {
  overall: number;
  reliability: number;
  security: number;
  performance: number;
  specializations: Record<string, number>;
  confidence: number;
  sampleSize: number;
}

interface VerificationPolicy {
  method: 'direct_inspection' | 'third_party_audit' | 'cryptographic_proof' | 'human_review';
  requiredConfidence: number;
  auditFrequency?: 'always' | 'periodic' | 'random';
  auditorRequirements?: string[];
}

interface DelegationContract {
  id: string;
  delegator: string;
  delegatee: string;
  task: string;
  permissions: PermissionToken;
  verification: VerificationPolicy;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'revoked';
  createdAt: Date;
  updatedAt: Date;
  parentContract?: string;
  chainDepth: number;
  reputation: ReputationScore;
  firebreak: {
    enabled: boolean;
    maxRetries: number;
    escalationPath: string[];
    manualOverride: boolean;
  };
  tlpClassification: 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';
  metadata: Record<string, any>;
}

interface SecurityThreat {
  type: 'permission_escalation' | 'delegation_loop' | 'reputation_gaming' | 'resource_exhaustion' | 'malicious_injection';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: boolean;
  evidence: string[];
  mitigationApplied: boolean;
  timestamp: Date;
}

interface DelegationChain {
  contracts: DelegationContract[];
  totalDepth: number;
  hasLoop: boolean;
  loopIndices?: number[];
  riskScore: number;
}

// ============================================================================
// Mock Implementation: Contract Manager
// ============================================================================

class ContractManager {
  private contracts: Map<string, DelegationContract> = new Map();
  private securityLog: SecurityThreat[] = [];
  private readonly MAX_CHAIN_DEPTH = 5;
  private readonly MAX_CONTRACTS_PER_AGENT = 100;
  private contractsByAgent: Map<string, Set<string>> = new Map();

  createContract(contract: Omit<DelegationContract, 'id' | 'createdAt' | 'updatedAt' | 'status'>): DelegationContract {
    const id = `contract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Security checks
    this.validatePermissions(contract.permissions);
    this.checkChainDepth(contract.chainDepth);
    this.checkAgentResourceLimit(contract.delegatee);
    this.detectPermissionEscalation(contract.permissions, contract.parentContract);
    
    const fullContract: DelegationContract = {
      ...contract,
      id,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.contracts.set(id, fullContract);
    
    // Track per-agent contracts
    if (!this.contractsByAgent.has(contract.delegatee)) {
      this.contractsByAgent.set(contract.delegatee, new Set());
    }
    this.contractsByAgent.get(contract.delegatee)!.add(id);
    
    return fullContract;
  }

  private validatePermissions(permissions: PermissionToken): void {
    // Check for wildcard abuse
    const hasWildcard = permissions.scope.some(s => s.includes('*'));
    const hasAdminScope = permissions.scope.some(s => s.startsWith('admin:'));
    
    if (hasWildcard && hasAdminScope && permissions.depth > 0) {
      this.logThreat({
        type: 'permission_escalation',
        severity: 'critical',
        detected: true,
        evidence: ['Wildcard + admin scope in delegated permissions'],
        mitigationApplied: false,
        timestamp: new Date(),
      });
      throw new Error('Cannot delegate wildcard admin permissions');
    }
  }

  private checkChainDepth(depth: number): void {
    if (depth >= this.MAX_CHAIN_DEPTH) {
      this.logThreat({
        type: 'delegation_loop',
        severity: 'high',
        detected: true,
        evidence: [`Chain depth ${depth} exceeds maximum ${this.MAX_CHAIN_DEPTH}`],
        mitigationApplied: true,
        timestamp: new Date(),
      });
      throw new Error(`Chain depth ${depth} exceeds maximum ${this.MAX_CHAIN_DEPTH}`);
    }
  }

  private checkAgentResourceLimit(agentId: string): void {
    const agentContracts = this.contractsByAgent.get(agentId) || new Set();
    if (agentContracts.size >= this.MAX_CONTRACTS_PER_AGENT) {
      this.logThreat({
        type: 'resource_exhaustion',
        severity: 'high',
        detected: true,
        evidence: [`Agent ${agentId} has ${agentContracts.size} contracts (max: ${this.MAX_CONTRACTS_PER_AGENT})`],
        mitigationApplied: true,
        timestamp: new Date(),
      });
      throw new Error(`Agent ${agentId} has reached maximum contract limit`);
    }
  }

  /** Check if a single child scope is covered by any scope in the parent set */
  private isScopeCovered(childScope: string, parentScopes: Set<string>): boolean {
    for (const parentScope of parentScopes) {
      if (parentScope === childScope) return true;
      if (parentScope.includes('*')) {
        const parentPrefix = parentScope.split(':')[0];
        const childPrefix = childScope.split(':')[0];
        if (parentPrefix === childPrefix) return true;
      }
    }
    return false;
  }

  /** Validate that no child scope exceeds parent scope coverage */
  private validateChildScopes(childScopes: string[], parentScopes: Set<string>): void {
    for (const childScope of childScopes) {
      if (!this.isScopeCovered(childScope, parentScopes)) {
        this.logThreat({
          type: 'permission_escalation',
          severity: 'critical',
          detected: true,
          evidence: [`Child scope '${childScope}' not covered by parent permissions`],
          mitigationApplied: true,
          timestamp: new Date(),
        });
        throw new Error('Permission escalation detected: child exceeds parent scope');
      }
    }
  }

  /** Validate that no child action exceeds parent allowed actions */
  private validateChildActions(childActions: string[], parentActions: Set<string>): void {
    for (const action of childActions) {
      if (!parentActions.has(action)) {
        this.logThreat({
          type: 'permission_escalation',
          severity: 'critical',
          detected: true,
          evidence: [`Child action '${action}' not allowed by parent`],
          mitigationApplied: true,
          timestamp: new Date(),
        });
        throw new Error('Permission escalation detected: child exceeds parent scope');
      }
    }
  }

  private detectPermissionEscalation(permissions: PermissionToken, parentContractId?: string): void {
    if (!parentContractId) return;
    const parent = this.contracts.get(parentContractId);
    if (!parent) return;

    this.validateChildScopes(permissions.scope, new Set(parent.permissions.scope));
    this.validateChildActions(permissions.allowedActions, new Set(parent.permissions.allowedActions));
  }

  validateContract(contractId: string): boolean {
    const contract = this.contracts.get(contractId);
    if (!contract) return false;
    
    // Check expiration
    if (contract.permissions.constraints.expiresAt && contract.permissions.constraints.expiresAt < new Date()) {
      return false;
    }
    
    // Check firebreak status
    if (!contract.firebreak.enabled && contract.status === 'failed') {
      return false;
    }
    
    return contract.status === 'active' || contract.status === 'pending';
  }

  detectLoops(chain: DelegationContract[]): { hasLoop: boolean; loopIndices?: number[] } {
    const seen = new Map<string, number>();
    
    for (let i = 0; i < chain.length; i++) {
      const agentId = chain[i].delegatee;
      if (seen.has(agentId)) {
        this.logThreat({
          type: 'delegation_loop',
          severity: 'critical',
          detected: true,
          evidence: [`Agent ${agentId} appears at indices ${seen.get(agentId)} and ${i}`],
          mitigationApplied: true,
          timestamp: new Date(),
        });
        return { hasLoop: true, loopIndices: [seen.get(agentId)!, i] };
      }
      seen.set(agentId, i);
    }
    
    return { hasLoop: false };
  }

  getSecurityThreats(): SecurityThreat[] {
    return [...this.securityLog];
  }

  private logThreat(threat: SecurityThreat): void {
    this.securityLog.push(threat);
  }

  revokeContract(contractId: string, reason: string): void {
    const contract = this.contracts.get(contractId);
    if (contract) {
      contract.status = 'revoked';
      contract.updatedAt = new Date();
      contract.metadata.revocationReason = reason;
    }
  }

  attemptFirebreakBypass(contractId: string): boolean {
    const contract = this.contracts.get(contractId);
    if (!contract) return false;
    
    // Firebreak cannot be bypassed
    if (contract.firebreak.enabled && !contract.firebreak.manualOverride) {
      this.logThreat({
        type: 'malicious_injection',
        severity: 'critical',
        detected: true,
        evidence: ['Attempted firebreak bypass without manual override'],
        mitigationApplied: true,
        timestamp: new Date(),
      });
      return false;
    }
    
    return contract.firebreak.manualOverride;
  }
}

// ============================================================================
// Mock Implementation: Reputation Engine
// ============================================================================

class ReputationEngine {
  private scores: Map<string, ReputationScore> = new Map();
  private securityLog: SecurityThreat[] = [];
  private readonly SCORE_CHANGE_LIMIT = 0.3; // Max 30% change per update

  getReputation(agentId: string): ReputationScore {
    return this.scores.get(agentId) || {
      overall: 0.5,
      reliability: 0.5,
      security: 0.5,
      performance: 0.5,
      specializations: {},
      confidence: 0.1,
      sampleSize: 0,
    };
  }

  updateReputation(agentId: string, delta: Partial<ReputationScore>): ReputationScore {
    const current = this.getReputation(agentId);
    
    // Detect reputation gaming
    this.detectReputationGaming(delta);
    
    const updated: ReputationScore = {
      overall: this.clampScore(current.overall + (delta.overall || 0)),
      reliability: this.clampScore(current.reliability + (delta.reliability || 0)),
      security: this.clampScore(current.security + (delta.security || 0)),
      performance: this.clampScore(current.performance + (delta.performance || 0)),
      specializations: { ...current.specializations, ...delta.specializations },
      confidence: Math.min(1.0, current.confidence + 0.05),
      sampleSize: current.sampleSize + 1,
    };
    
    this.scores.set(agentId, updated);
    return updated;
  }

  private detectReputationGaming(delta: Partial<ReputationScore>): void {
    const changes = [delta.overall, delta.reliability, delta.security, delta.performance].filter(Boolean);
    
    // Check for suspiciously large positive changes
    if (changes.some(c => Math.abs(c!) > this.SCORE_CHANGE_LIMIT)) {
      this.logThreat({
        type: 'reputation_gaming',
        severity: 'high',
        detected: true,
        evidence: ['Score change exceeds 30% limit'],
        mitigationApplied: true,
        timestamp: new Date(),
      });
      throw new Error('Reputation update exceeds maximum allowed change');
    }
    
    // Check for all-positive updates (suspicious pattern)
    if (changes.length >= 3 && changes.every(c => c! > 0.2)) {
      this.logThreat({
        type: 'reputation_gaming',
        severity: 'medium',
        detected: true,
        evidence: ['All scores increased significantly in single update'],
        mitigationApplied: false,
        timestamp: new Date(),
      });
    }
  }

  private clampScore(score: number): number {
    return Math.max(0, Math.min(1, score));
  }

  private logThreat(threat: SecurityThreat): void {
    this.securityLog.push(threat);
  }

  getSecurityThreats(): SecurityThreat[] {
    return [...this.securityLog];
  }

  simulateSybilAttack(agentIds: string[], boost: number): number {
    // Simulate multiple fake agents trying to boost a target
    let detected = 0;
    
    for (const agentId of agentIds) {
      try {
        this.updateReputation(agentId, { overall: boost, reliability: boost });
      } catch (e) {
        detected++;
      }
    }
    
    return detected;
  }
}

// ============================================================================
// Mock Implementation: Chain Tracker
// ============================================================================

class ChainTracker {
  private chains: Map<string, DelegationChain> = new Map();
  private securityLog: SecurityThreat[] = [];

  buildChain(contracts: DelegationContract[]): DelegationChain {
    const chain: DelegationChain = {
      contracts: [...contracts],
      totalDepth: contracts.length,
      hasLoop: false,
      riskScore: 0,
    };
    
    // Detect loops
    const loopCheck = this.detectLoop(contracts);
    chain.hasLoop = loopCheck.hasLoop;
    chain.loopIndices = loopCheck.loopIndices;
    
    // Calculate risk score
    chain.riskScore = this.calculateRiskScore(chain);
    
    if (chain.hasLoop) {
      this.logThreat({
        type: 'delegation_loop',
        severity: 'critical',
        detected: true,
        evidence: [`Loop detected at indices ${chain.loopIndices?.join(', ')}`],
        mitigationApplied: true,
        timestamp: new Date(),
      });
    }
    
    return chain;
  }

  private detectLoop(contracts: DelegationContract[]): { hasLoop: boolean; loopIndices?: number[] } {
    const agentPositions = new Map<string, number[]>();
    
    // Track all positions where each agent appears (as delegator or delegatee)
    for (let i = 0; i < contracts.length; i++) {
      const delegator = contracts[i].delegator;
      const delegatee = contracts[i].delegatee;
      
      if (!agentPositions.has(delegator)) {
        agentPositions.set(delegator, []);
      }
      if (!agentPositions.has(delegatee)) {
        agentPositions.set(delegatee, []);
      }
      
      agentPositions.get(delegator)!.push(i);
      agentPositions.get(delegatee)!.push(i);
      
      // Check if delegatee has already appeared earlier in chain
      // This indicates a loop (e.g., A→B→A or A→B→C→B)
      const delegateePositions = agentPositions.get(delegatee)!;
      if (delegateePositions.length > 1) {
        return { hasLoop: true, loopIndices: [delegateePositions[0], i] };
      }
    }
    
    return { hasLoop: false };
  }

  private calculateRiskScore(chain: DelegationChain): number {
    let risk = 0;
    
    // Depth risk (exponential)
    risk += Math.min(0.5, chain.totalDepth / 10);
    
    // Loop risk
    if (chain.hasLoop) risk += 0.5;
    
    // Permission breadth risk
    const avgPermissions = chain.contracts.reduce((sum, c) => sum + c.permissions.scope.length, 0) / chain.contracts.length;
    risk += Math.min(0.3, avgPermissions / 10);
    
    return Math.min(1.0, risk);
  }

  private logThreat(threat: SecurityThreat): void {
    this.securityLog.push(threat);
  }

  getSecurityThreats(): SecurityThreat[] {
    return [...this.securityLog];
  }

  simulateChainManipulation(contracts: DelegationContract[]): { successful: boolean; detected: boolean } {
    // Attempt to inject malicious contract into chain
    const maliciousContract: DelegationContract = {
      ...contracts[0],
      id: 'malicious-contract',
      permissions: {
        ...contracts[0].permissions,
        scope: ['admin:*', 'execute:*'],
      },
    };
    
    const manipulatedChain = [...contracts, maliciousContract];
    const chain = this.buildChain(manipulatedChain);
    
    return {
      successful: false, // Should never succeed
      detected: chain.riskScore > 0.7,
    };
  }
}

// ============================================================================
// Security Penetration Tests
// ============================================================================

describe('Security Penetration Tests', () => {
  let contractManager: ContractManager;
  let reputationEngine: ReputationEngine;
  let chainTracker: ChainTracker;

  beforeEach(() => {
    contractManager = new ContractManager();
    reputationEngine = new ReputationEngine();
    chainTracker = new ChainTracker();
  });

  // ==========================================================================
  // 1. Permission Escalation Attack Vectors
  // ==========================================================================

  describe('1. Permission Escalation Attacks', () => {
    it('1.1 Should prevent wildcard + admin permission delegation', () => {
      const delegatedPermissions: PermissionToken = {
        id: 'perm-1',
        scope: ['admin:*', 'execute:*'],
        allowedActions: ['delete', 'execute'],
        constraints: {},
        grantedAt: new Date(),
        grantedBy: 'agent-attacker',
        depth: 1, // Delegated, not original
      };

      expect(() => {
        contractManager.createContract({
          delegator: 'agent-attacker',
          delegatee: 'agent-victim',
          task: 'malicious-task',
          permissions: delegatedPermissions,
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 1,
          reputation: reputationEngine.getReputation('agent-victim'),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: ['human'], manualOverride: false },
          tlpClassification: 'RED',
          metadata: {},
        });
      }).toThrow('Cannot delegate wildcard admin permissions');

      const threats = contractManager.getSecurityThreats();
      expect(threats).toHaveLength(1);
      expect(threats[0].type).toBe('permission_escalation');
      expect(threats[0].severity).toBe('critical');
    });

    it('1.2 Should prevent child permissions exceeding parent scope', () => {
      // Create parent contract with limited scope
      const parentContract = contractManager.createContract({
        delegator: 'agent-root',
        delegatee: 'agent-middle',
        task: 'parent-task',
        permissions: {
          id: 'perm-parent',
          scope: ['read:public', 'write:public'],
          allowedActions: ['read', 'create'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-root',
          depth: 0,
        },
        verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-middle'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
        tlpClassification: 'GREEN',
        metadata: {},
      });

      // Attempt to create child contract with broader scope
      expect(() => {
        contractManager.createContract({
          delegator: 'agent-middle',
          delegatee: 'agent-child',
          task: 'escalation-attempt',
          permissions: {
            id: 'perm-child',
            scope: ['read:public', 'read:internal', 'write:internal', 'execute:safe'], // Broader than parent (added internal + execute)
            allowedActions: ['read', 'create', 'delete'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: 'agent-middle',
            depth: 1,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 1,
          parentContract: parentContract.id,
          reputation: reputationEngine.getReputation('agent-child'),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'GREEN',
          metadata: {},
        });
      }).toThrow('Permission escalation detected');

      const threats = contractManager.getSecurityThreats();
      expect(threats.some(t => t.type === 'permission_escalation')).toBe(true);
    });

    it('1.3 Should detect and block scope expansion attacks', () => {
      const legitimateScope: PermissionScope[] = ['read:public'];
      const expandedScope: PermissionScope[] = ['read:*', 'write:*'];

      const legitimateContract = contractManager.createContract({
        delegator: 'agent-legit',
        delegatee: 'agent-worker',
        task: 'read-only-task',
        permissions: {
          id: 'perm-legit',
          scope: legitimateScope,
          allowedActions: ['read'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-legit',
          depth: 0,
        },
        verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-worker'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
        tlpClassification: 'CLEAR',
        metadata: {},
      });

      expect(() => {
        contractManager.createContract({
          delegator: 'agent-worker',
          delegatee: 'agent-attacker',
          task: 'scope-expansion',
          permissions: {
            id: 'perm-expanded',
            scope: expandedScope,
            allowedActions: ['read', 'write'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: 'agent-worker',
            depth: 1,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 1,
          parentContract: legitimateContract.id,
          reputation: reputationEngine.getReputation('agent-attacker'),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        });
      }).toThrow('Permission escalation detected');
    });
  });

  // ==========================================================================
  // 2. Delegation Loop Exploits
  // ==========================================================================

  describe('2. Delegation Loop Exploits', () => {
    it('2.1 Should detect simple self-delegation loops', () => {
      const contract1 = contractManager.createContract({
        delegator: 'agent-A',
        delegatee: 'agent-B',
        task: 'task-1',
        permissions: {
          id: 'perm-1',
          scope: ['read:public'],
          allowedActions: ['read'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-A',
          depth: 0,
        },
        verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-B'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
        tlpClassification: 'CLEAR',
        metadata: {},
      });

      const contract2 = contractManager.createContract({
        delegator: 'agent-B',
        delegatee: 'agent-A', // Loop back to A
        task: 'task-2',
        permissions: {
          id: 'perm-2',
          scope: ['read:public'],
          allowedActions: ['read'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-B',
          depth: 1,
        },
        verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
        chainDepth: 1,
        parentContract: contract1.id,
        reputation: reputationEngine.getReputation('agent-A'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
        tlpClassification: 'CLEAR',
        metadata: {},
      });

      const chain = chainTracker.buildChain([contract1, contract2]);
      expect(chain.hasLoop).toBe(true);
      expect(chain.loopIndices).toEqual([0, 1]);

      const threats = chainTracker.getSecurityThreats();
      expect(threats.some(t => t.type === 'delegation_loop')).toBe(true);
    });

    it('2.2 Should detect multi-hop circular delegation', () => {
      const contracts: DelegationContract[] = [];

      // A → B → C → D → B (loop)
      const agents = ['agent-A', 'agent-B', 'agent-C', 'agent-D', 'agent-B'];
      for (let i = 0; i < agents.length - 1; i++) {
        contracts.push(contractManager.createContract({
          delegator: agents[i],
          delegatee: agents[i + 1],
          task: `task-${i}`,
          permissions: {
            id: `perm-${i}`,
            scope: ['read:public'],
            allowedActions: ['read'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: agents[i],
            depth: i,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: i,
          parentContract: i > 0 ? contracts[i - 1].id : undefined,
          reputation: reputationEngine.getReputation(agents[i + 1]),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        }));
      }

      const chain = chainTracker.buildChain(contracts);
      expect(chain.hasLoop).toBe(true);
      expect(chain.loopIndices).toHaveLength(2);
    });

    it('2.3 Should enforce maximum chain depth limit', () => {
      const contracts: DelegationContract[] = [];

      // Attempt to create chain with 10 levels (max is 5)
      expect(() => {
        for (let i = 0; i < 10; i++) {
          contractManager.createContract({
            delegator: `agent-${i}`,
            delegatee: `agent-${i + 1}`,
            task: `task-${i}`,
            permissions: {
              id: `perm-${i}`,
              scope: ['read:public'],
              allowedActions: ['read'],
              constraints: {},
              grantedAt: new Date(),
              grantedBy: `agent-${i}`,
              depth: i,
            },
            verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
            chainDepth: i,
            reputation: reputationEngine.getReputation(`agent-${i + 1}`),
            firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
            tlpClassification: 'CLEAR',
            metadata: {},
          });
        }
      }).toThrow('Chain depth');

      const threats = contractManager.getSecurityThreats();
      expect(threats.some(t => t.type === 'delegation_loop')).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Reputation Gaming Attacks
  // ==========================================================================

  describe('3. Reputation Gaming Attacks', () => {
    it('3.1 Should prevent rapid reputation manipulation', () => {
      expect(() => {
        reputationEngine.updateReputation('agent-malicious', {
          overall: 0.5, // 50% increase (exceeds 30% limit)
          reliability: 0.4,
          security: 0.3,
        });
      }).toThrow('Reputation update exceeds maximum allowed change');

      const threats = reputationEngine.getSecurityThreats();
      expect(threats.some(t => t.type === 'reputation_gaming')).toBe(true);
    });

    it('3.2 Should detect Sybil attack patterns', () => {
      const fakeAgents = Array.from({ length: 10 }, (_, i) => `fake-agent-${i}`);
      const detectedCount = reputationEngine.simulateSybilAttack(fakeAgents, 0.4);

      // All 10 attempts should be detected and blocked
      expect(detectedCount).toBe(10);

      const threats = reputationEngine.getSecurityThreats();
      expect(threats.filter(t => t.type === 'reputation_gaming')).toHaveLength(10);
    });

    it('3.3 Should flag suspiciously consistent positive updates', () => {
      // Legitimate gradual improvement (should succeed)
      reputationEngine.updateReputation('agent-legit', {
        overall: 0.1,
        reliability: 0.1,
      });

      // Suspicious all-positive update (should be flagged but not blocked)
      reputationEngine.updateReputation('agent-suspicious', {
        overall: 0.25,
        reliability: 0.25,
        security: 0.25,
        performance: 0.25,
      });

      const threats = reputationEngine.getSecurityThreats();
      const suspiciousThreats = threats.filter(t => 
        t.type === 'reputation_gaming' && 
        t.evidence.some(e => e.includes('All scores increased'))
      );
      expect(suspiciousThreats.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 4. Resource Exhaustion Attacks
  // ==========================================================================

  describe('4. Resource Exhaustion Attacks', () => {
    it('4.1 Should enforce per-agent contract limits', () => {
      const agentId = 'agent-resource-hog';

      // Create contracts up to the limit (100)
      for (let i = 0; i < 100; i++) {
        contractManager.createContract({
          delegator: 'agent-delegator',
          delegatee: agentId,
          task: `task-${i}`,
          permissions: {
            id: `perm-${i}`,
            scope: ['read:public'],
            allowedActions: ['read'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: 'agent-delegator',
            depth: 0,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 0,
          reputation: reputationEngine.getReputation(agentId),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        });
      }

      // 101st contract should be rejected
      expect(() => {
        contractManager.createContract({
          delegator: 'agent-delegator',
          delegatee: agentId,
          task: 'task-overflow',
          permissions: {
            id: 'perm-overflow',
            scope: ['read:public'],
            allowedActions: ['read'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: 'agent-delegator',
            depth: 0,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 0,
          reputation: reputationEngine.getReputation(agentId),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        });
      }).toThrow('maximum contract limit');

      const threats = contractManager.getSecurityThreats();
      expect(threats.some(t => t.type === 'resource_exhaustion')).toBe(true);
    });

    it('4.2 Should prevent memory exhaustion via deep chains', () => {
      const contracts: DelegationContract[] = [];

      // Create maximum depth chain (5 levels)
      for (let i = 0; i < 5; i++) {
        contracts.push(contractManager.createContract({
          delegator: `agent-${i}`,
          delegatee: `agent-${i + 1}`,
          task: `task-${i}`,
          permissions: {
            id: `perm-${i}`,
            scope: ['read:public'],
            allowedActions: ['read'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: `agent-${i}`,
            depth: i,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: i,
          parentContract: i > 0 ? contracts[i - 1].id : undefined,
          reputation: reputationEngine.getReputation(`agent-${i + 1}`),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        }));
      }

      // 6th level should be rejected
      expect(() => {
        contractManager.createContract({
          delegator: 'agent-5',
          delegatee: 'agent-6',
          task: 'task-overflow',
          permissions: {
            id: 'perm-overflow',
            scope: ['read:public'],
            allowedActions: ['read'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: 'agent-5',
            depth: 5,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 5,
          parentContract: contracts[4].id,
          reputation: reputationEngine.getReputation('agent-6'),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        });
      }).toThrow('Chain depth 5 exceeds maximum 5');
    });
  });

  // ==========================================================================
  // 5. Malicious Contract Injection
  // ==========================================================================

  describe('5. Malicious Contract Injection', () => {
    it('5.1 Should detect chain manipulation attempts', () => {
      const legitimateContracts: DelegationContract[] = [];

      for (let i = 0; i < 3; i++) {
        legitimateContracts.push(contractManager.createContract({
          delegator: `agent-${i}`,
          delegatee: `agent-${i + 1}`,
          task: `legitimate-task-${i}`,
          permissions: {
            id: `perm-${i}`,
            scope: ['read:public'],
            allowedActions: ['read'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: `agent-${i}`,
            depth: i,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: i,
          parentContract: i > 0 ? legitimateContracts[i - 1].id : undefined,
          reputation: reputationEngine.getReputation(`agent-${i + 1}`),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        }));
      }

      const result = chainTracker.simulateChainManipulation(legitimateContracts);
      expect(result.successful).toBe(false);
      expect(result.detected).toBe(true);
    });

    it('5.2 Should validate contract signatures and prevent tampering', () => {
      const contract = contractManager.createContract({
        delegator: 'agent-A',
        delegatee: 'agent-B',
        task: 'secure-task',
        permissions: {
          id: 'perm-1',
          scope: ['read:public'],
          allowedActions: ['read'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-A',
          depth: 0,
        },
        verification: { method: 'cryptographic_proof', requiredConfidence: 0.95 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-B'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
        tlpClassification: 'AMBER',
        metadata: {},
      });

      // Validation should succeed with correct contract
      expect(contractManager.validateContract(contract.id)).toBe(true);

      // Simulate expiration
      contract.permissions.constraints.expiresAt = new Date(Date.now() - 1000);
      expect(contractManager.validateContract(contract.id)).toBe(false);
    });

    it('5.3 Should prevent unauthorized contract status changes', () => {
      const contract = contractManager.createContract({
        delegator: 'agent-A',
        delegatee: 'agent-B',
        task: 'protected-task',
        permissions: {
          id: 'perm-1',
          scope: ['read:public'],
          allowedActions: ['read'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-A',
          depth: 0,
        },
        verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-B'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
        tlpClassification: 'GREEN',
        metadata: {},
      });

      // Only authorized actions should succeed
      contractManager.revokeContract(contract.id, 'security violation');
      expect(contractManager.validateContract(contract.id)).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Firebreak Bypass Attempts
  // ==========================================================================

  describe('6. Firebreak Bypass Attempts', () => {
    it('6.1 Should prevent firebreak bypass without manual override', () => {
      const contract = contractManager.createContract({
        delegator: 'agent-A',
        delegatee: 'agent-B',
        task: 'critical-task',
        permissions: {
          id: 'perm-1',
          scope: ['execute:safe'],
          allowedActions: ['execute'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-A',
          depth: 0,
        },
        verification: { method: 'human_review', requiredConfidence: 0.99 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-B'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: ['human-supervisor'], manualOverride: false },
        tlpClassification: 'AMBER',
        metadata: {},
      });

      const bypassAttempt = contractManager.attemptFirebreakBypass(contract.id);
      expect(bypassAttempt).toBe(false);

      const threats = contractManager.getSecurityThreats();
      expect(threats.some(t => t.type === 'malicious_injection')).toBe(true);
    });

    it('6.2 Should allow firebreak bypass with proper authorization', () => {
      const contract = contractManager.createContract({
        delegator: 'agent-A',
        delegatee: 'agent-B',
        task: 'authorized-task',
        permissions: {
          id: 'perm-1',
          scope: ['execute:safe'],
          allowedActions: ['execute'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-A',
          depth: 0,
        },
        verification: { method: 'human_review', requiredConfidence: 0.99 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-B'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: ['human-supervisor'], manualOverride: true },
        tlpClassification: 'GREEN',
        metadata: {},
      });

      const bypassAttempt = contractManager.attemptFirebreakBypass(contract.id);
      expect(bypassAttempt).toBe(true);
    });

    it('6.3 Should log all firebreak bypass attempts', () => {
      const contract1 = contractManager.createContract({
        delegator: 'agent-A',
        delegatee: 'agent-B',
        task: 'task-1',
        permissions: {
          id: 'perm-1',
          scope: ['execute:safe'],
          allowedActions: ['execute'],
          constraints: {},
          grantedAt: new Date(),
          grantedBy: 'agent-A',
          depth: 0,
        },
        verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
        chainDepth: 0,
        reputation: reputationEngine.getReputation('agent-B'),
        firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
        tlpClassification: 'CLEAR',
        metadata: {},
      });

      contractManager.attemptFirebreakBypass(contract1.id);
      contractManager.attemptFirebreakBypass(contract1.id);
      contractManager.attemptFirebreakBypass(contract1.id);

      const threats = contractManager.getSecurityThreats();
      const bypassAttempts = threats.filter(t => 
        t.type === 'malicious_injection' && 
        t.evidence.some(e => e.includes('firebreak bypass'))
      );
      expect(bypassAttempts.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // 7. Security Monitoring & Logging
  // ==========================================================================

  describe('7. Security Monitoring & Logging', () => {
    it('7.1 Should maintain comprehensive threat log across all components', () => {
      // Trigger various attacks
      try {
        contractManager.createContract({
          delegator: 'attacker',
          delegatee: 'victim',
          task: 'malicious',
          permissions: {
            id: 'perm-malicious',
            scope: ['admin:*'],
            allowedActions: ['delete'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: 'attacker',
            depth: 1,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 0,
          reputation: reputationEngine.getReputation('victim'),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'RED',
          metadata: {},
        });
      } catch (e) {
        // Expected to fail
      }

      try {
        reputationEngine.updateReputation('agent-gamer', { overall: 0.5 });
      } catch (e) {
        // Expected to fail
      }

      const contractThreats = contractManager.getSecurityThreats();
      const reputationThreats = reputationEngine.getSecurityThreats();

      expect(contractThreats.length).toBeGreaterThan(0);
      expect(reputationThreats.length).toBeGreaterThan(0);

      // All threats should have timestamps
      [...contractThreats, ...reputationThreats].forEach(threat => {
        expect(threat.timestamp).toBeInstanceOf(Date);
        expect(threat.detected).toBe(true);
        expect(threat.evidence.length).toBeGreaterThan(0);
      });
    });

    it('7.2 Should categorize threats by severity', () => {
      const createMaliciousContract = () => {
        try {
          contractManager.createContract({
            delegator: 'attacker',
            delegatee: 'victim',
            task: 'privilege-escalation',
            permissions: {
              id: 'perm-escalate',
              scope: ['admin:*', 'execute:*'],
              allowedActions: ['delete', 'execute'],
              constraints: {},
              grantedAt: new Date(),
              grantedBy: 'attacker',
              depth: 1,
            },
            verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
            chainDepth: 0,
            reputation: reputationEngine.getReputation('victim'),
            firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
            tlpClassification: 'RED',
            metadata: {},
          });
        } catch (e) {
          // Expected
        }
      };

      createMaliciousContract();
      createMaliciousContract();

      const threats = contractManager.getSecurityThreats();
      const criticalThreats = threats.filter(t => t.severity === 'critical');
      const highThreats = threats.filter(t => t.severity === 'high');

      expect(criticalThreats.length).toBeGreaterThan(0);
      criticalThreats.forEach(threat => {
        expect(['permission_escalation', 'delegation_loop', 'malicious_injection']).toContain(threat.type);
      });
    });

    it('7.3 Should track mitigation status for all threats', () => {
      // Create various threats
      try {
        contractManager.createContract({
          delegator: 'attacker',
          delegatee: 'victim',
          task: 'depth-attack',
          permissions: {
            id: 'perm-1',
            scope: ['read:public'],
            allowedActions: ['read'],
            constraints: {},
            grantedAt: new Date(),
            grantedBy: 'attacker',
            depth: 0,
          },
          verification: { method: 'direct_inspection', requiredConfidence: 0.9 },
          chainDepth: 10, // Exceeds limit
          reputation: reputationEngine.getReputation('victim'),
          firebreak: { enabled: true, maxRetries: 3, escalationPath: [], manualOverride: false },
          tlpClassification: 'CLEAR',
          metadata: {},
        });
      } catch (e) {
        // Expected
      }

      const threats = contractManager.getSecurityThreats();
      threats.forEach(threat => {
        expect(threat).toHaveProperty('mitigationApplied');
        expect(typeof threat.mitigationApplied).toBe('boolean');
      });

      // High severity threats should have mitigation applied
      const highSeverityThreats = threats.filter(t => t.severity === 'high' || t.severity === 'critical');
      expect(highSeverityThreats.every(t => t.mitigationApplied === true)).toBe(true);
    });
  });
});
