/**
 * TLP Classification Enforcement Tests
 * TLP:CLEAR
 * 
 * Tests to validate that delegation contracts respect TLP classification
 * and agent clearance levels as required by Task 6.1.
 * 
 * Key validation: "TLP:AMBER tasks reject delegation to uncleared agents"
 * 
 * @module delegation/__tests__/tlp-enforcement.test.ts
 * @version 1.0.0
 * @date 2026-02-14
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TLPEnforcementEngine, type AgentClearance } from '../tlp-enforcement.js';
import type { DelegationContract, TLPLevel } from '../../types/delegation-contracts.js';

describe('TLP Classification Enforcement', () => {
  let enforcement: TLPEnforcementEngine;
  
  beforeEach(() => {
    // Create fresh enforcement engine for each test
    enforcement = new TLPEnforcementEngine();
  });

  describe('Agent Clearance Management', () => {
    it('should load default agent clearances', () => {
      const stats = enforcement.getClearanceStats();
      expect(stats.total_agents).toBeGreaterThan(0);
      expect(stats.clearance_distribution['TLP:RED']).toBeGreaterThan(0);
      expect(stats.clearance_distribution['TLP:AMBER']).toBeGreaterThan(0);
      expect(stats.clearance_distribution['TLP:GREEN']).toBeGreaterThan(0);
      expect(stats.clearance_distribution['TLP:CLEAR']).toBeGreaterThan(0);
    });

    it('should allow setting custom agent clearances', () => {
      const customClearance: AgentClearance = {
        agent_id: 'test-agent',
        agent_name: 'Test Agent',
        max_tlp_level: 'TLP:GREEN',
        issued_at: '2026-02-14T00:00:00Z',
        issued_by: 'Test Suite',
      };
      
      enforcement.setAgentClearance(customClearance);
      
      const retrieved = enforcement.getAgentClearance('test-agent');
      expect(retrieved).toEqual(customClearance);
    });

    it('should validate TLP hierarchy correctly', () => {
      // TLP:RED agent should have access to all levels
      expect(enforcement.hasRequiredClearance('security-engineer', 'TLP:RED')).toBe(true);
      expect(enforcement.hasRequiredClearance('security-engineer', 'TLP:AMBER')).toBe(true);
      expect(enforcement.hasRequiredClearance('security-engineer', 'TLP:GREEN')).toBe(true);
      expect(enforcement.hasRequiredClearance('security-engineer', 'TLP:CLEAR')).toBe(true);
      
      // TLP:GREEN agent should NOT have access to AMBER or RED
      expect(enforcement.hasRequiredClearance('test-engineer', 'TLP:RED')).toBe(false);
      expect(enforcement.hasRequiredClearance('test-engineer', 'TLP:AMBER')).toBe(false);
      expect(enforcement.hasRequiredClearance('test-engineer', 'TLP:GREEN')).toBe(true);
      expect(enforcement.hasRequiredClearance('test-engineer', 'TLP:CLEAR')).toBe(true);
    });
  });

  describe('TLP:CLEAR Classification', () => {
    it('should allow all agents to access TLP:CLEAR tasks', () => {
      const contract: DelegationContract = {
        contract_id: 'test-001',
        task_id: 'clear-task',
        delegator_agent_id: 'orchestrator',
        delegatee_agent_id: 'any-agent',
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:CLEAR',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      const result = enforcement.enforceTLPClassification(contract);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('TLP:CLEAR');
      expect(result.action).toBe('allow');
      expect(result.required_clearance).toBe('TLP:CLEAR');
    });
  });

  describe('TLP:AMBER Classification Enforcement - KEY VALIDATION', () => {
    it('should REJECT delegation to agents without AMBER clearance', () => {
      const contract: DelegationContract = {
        contract_id: 'test-002',
        task_id: 'amber-task',
        delegator_agent_id: 'security-engineer',
        delegatee_agent_id: 'quick-fix', // This agent only has TLP:CLEAR clearance
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:AMBER',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      const result = enforcement.enforceTLPClassification(contract);
      
      // This is the KEY VALIDATION for Task 6.1
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('insufficient');
      expect(result.reason).toContain('TLP:AMBER');
      expect(result.action).toBe('block');
      expect(result.required_clearance).toBe('TLP:AMBER');
      expect(result.agent_clearance).toBe('TLP:CLEAR');
    });

    it('should ALLOW delegation to agents with sufficient AMBER clearance', () => {
      const contract: DelegationContract = {
        contract_id: 'test-003',
        task_id: 'amber-task',
        delegator_agent_id: 'security-engineer',
        delegatee_agent_id: 'architecture-reviewer', // This agent has TLP:AMBER clearance
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:AMBER',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      const result = enforcement.enforceTLPClassification(contract);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('sufficient clearance');
      expect(result.action).toBe('allow');
      expect(result.required_clearance).toBe('TLP:AMBER');
      expect(result.agent_clearance).toBe('TLP:AMBER');
    });

    it('should ALLOW delegation to agents with higher RED clearance', () => {
      const contract: DelegationContract = {
        contract_id: 'test-004',
        task_id: 'amber-task',
        delegator_agent_id: 'architecture-reviewer',
        delegatee_agent_id: 'DCYFR-WORKSPACE', // This agent has TLP:RED clearance
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:AMBER',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      const result = enforcement.enforceTLPClassification(contract);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('sufficient clearance');
      expect(result.action).toBe('allow');
      expect(result.required_clearance).toBe('TLP:AMBER');
      expect(result.agent_clearance).toBe('TLP:RED');
    });
  });

  describe('TLP:RED Classification Enforcement', () => {
    it('should REJECT delegation to agents without RED clearance', () => {
      const contract: DelegationContract = {
        contract_id: 'test-005',
        task_id: 'red-task',
        delegator_agent_id: 'DCYFR-WORKSPACE',
        delegatee_agent_id: 'architecture-reviewer', // Only has TLP:AMBER clearance
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:RED',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      const result = enforcement.enforceTLPClassification(contract);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('insufficient');
      expect(result.reason).toContain('TLP:RED');
      expect(result.action).toBe('block');
    });

    it('should ALLOW delegation to agents with RED clearance', () => {
      const contract: DelegationContract = {
        contract_id: 'test-006',
        task_id: 'red-task',
        delegator_agent_id: 'DCYFR-WORKSPACE',
        delegatee_agent_id: 'security-engineer', // Has TLP:RED clearance
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:RED',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      const result = enforcement.enforceTLPClassification(contract);
      
      expect(result.allowed).toBe(true);
      expect(result.action).toBe('allow');
      expect(result.agent_clearance).toBe('TLP:RED');
    });
  });

  describe('Unknown Agent Handling', () => {
    it('should REJECT delegation to agents without any clearance', () => {
      const contract: DelegationContract = {
        contract_id: 'test-007',
        task_id: 'green-task',
        delegator_agent_id: 'test-engineer',
        delegatee_agent_id: 'unknown-agent', // No clearance defined
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:GREEN',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      const result = enforcement.enforceTLPClassification(contract);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('no security clearance');
      expect(result.action).toBe('block');
    });
  });

  describe('Contract Validation Integration', () => {
    it('should validate contracts without throwing for allowed delegations', () => {
      const contract: DelegationContract = {
        contract_id: 'test-008',
        task_id: 'green-task',
        delegator_agent_id: 'test-engineer',
        delegatee_agent_id: 'test-engineer', // Same agent, has GREEN clearance
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:GREEN',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      expect(() => enforcement.validateDelegationContract(contract)).not.toThrow();
    });

    it('should throw error for blocked delegations', () => {
      const contract: DelegationContract = {
        contract_id: 'test-009',
        task_id: 'amber-task',
        delegator_agent_id: 'architecture-reviewer',
        delegatee_agent_id: 'quick-fix', // Only has CLEAR clearance, insufficient for AMBER
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:AMBER',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      expect(() => enforcement.validateDelegationContract(contract)).toThrow('TLP Enforcement Violation');
    });
  });

  describe('Audit Logging', () => {
    it('should log access attempts for audit trail', () => {
      const contract: DelegationContract = {
        contract_id: 'test-010',
        task_id: 'audit-test',
        delegator_agent_id: 'test-engineer',
        delegatee_agent_id: 'quick-fix',
        verification_policy: 'direct_inspection',
        tlp_classification: 'TLP:AMBER',
        success_criteria: { required_checks: ['completion'] },
        status: 'pending',
        created_at: '2026-02-14T00:00:00Z',
      };

      enforcement.enforceTLPClassification(contract);
      
      const auditLog = enforcement.getAuditLog({ limit: 1 });
      
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].agent_id).toBe('quick-fix');
      expect(auditLog[0].tlp_level).toBe('TLP:AMBER');
      expect(auditLog[0].decision).toBe('block');
      expect(auditLog[0].contract_id).toBe('test-010');
    });

    it('should provide clearance statistics', () => {
      const stats = enforcement.getClearanceStats();
      
      expect(stats).toHaveProperty('total_agents');
      expect(stats).toHaveProperty('clearance_distribution');
      expect(stats).toHaveProperty('blocked_attempts');
      expect(stats).toHaveProperty('allowed_attempts');
      
      expect(stats.clearance_distribution['TLP:RED']).toBeGreaterThanOrEqual(0);
      expect(stats.clearance_distribution['TLP:AMBER']).toBeGreaterThanOrEqual(0);
      expect(stats.clearance_distribution['TLP:GREEN']).toBeGreaterThanOrEqual(0);
      expect(stats.clearance_distribution['TLP:CLEAR']).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * Integration test specifically for Task 6.1 validation criteria
 */
describe('Task 6.1 Validation: TLP:AMBER tasks reject delegation to uncleared agents', () => {
  it('CRITICAL TEST: TLP:AMBER task must be blocked for TLP:CLEAR agent', () => {
    const enforcement = new TLPEnforcementEngine();
    
    const amberTask: DelegationContract = {
      contract_id: 'validation-001',
      task_id: 'critical-amber-task',
      delegator_agent_id: 'security-engineer', // RED clearance
      delegatee_agent_id: 'quick-fix',          // CLEAR clearance only
      verification_policy: 'third_party_audit',
      tlp_classification: 'TLP:AMBER',          // Requires AMBER+ clearance
      success_criteria: { required_checks: ['security_review', 'compliance_check'] },
      status: 'pending',
      created_at: '2026-02-14T00:00:00Z',
    };

    const result = enforcement.enforceTLPClassification(amberTask);
    
    // MUST BE FALSE - this is the core requirement for Task 6.1
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.reason).toMatch(/insufficient.*for.*TLP:AMBER/i);
    expect(result.required_clearance).toBe('TLP:AMBER');
    expect(result.agent_clearance).toBe('TLP:CLEAR');
    
    // Validate audit trail
    const auditLog = enforcement.getAuditLog({ 
      agentId: 'quick-fix', 
      tlpLevel: 'TLP:AMBER',
      decision: 'block',
      limit: 1 
    });
    
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].reason).toMatch(/Insufficient clearance.*TLP:CLEAR.*TLP:AMBER/i);
  });

  it('VALIDATION: TLP:AMBER task must be allowed for TLP:AMBER+ agents', () => {
    const enforcement = new TLPEnforcementEngine();
    
    const amberTask: DelegationContract = {
      contract_id: 'validation-002',
      task_id: 'allowed-amber-task',
      delegator_agent_id: 'security-engineer',
      delegatee_agent_id: 'architecture-reviewer', // AMBER clearance
      verification_policy: 'third_party_audit',
      tlp_classification: 'TLP:AMBER',
      success_criteria: { required_checks: ['security_review'] },
      status: 'pending',
      created_at: '2026-02-14T00:00:00Z',
    };

    const result = enforcement.enforceTLPClassification(amberTask);
    
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('allow');
    expect(result.agent_clearance).toBe('TLP:AMBER');
  });
});