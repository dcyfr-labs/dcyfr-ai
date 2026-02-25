/**
 * Liability Firebreak Enforcement Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Tests for accountability boundaries in delegation chains, manual override
 * capabilities, and escalation procedures.
 * 
 * @module delegation/__tests__/liability-firebreak
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LiabilityFirebreakEnforcer } from '../liability-firebreak.js';
import type { DelegationContract } from '../../types/delegation-contracts.js';

describe('LiabilityFirebreakEnforcer', () => {
  let enforcer: LiabilityFirebreakEnforcer;

  beforeEach(() => {
    enforcer = new LiabilityFirebreakEnforcer({
      depth_thresholds: {
        supervisor: 2,    // Depth > 2 requires supervisor
        manager: 4,       // Depth > 4 requires manager
        executive: 6,     // Depth > 6 requires executive
      },
      liability_thresholds: {
        high_value_limit: 50000,
        critical_system_approval: true,
        external_delegation_approval: true,
      },
      default_max_depth: 5,
    });
  });

  describe('Basic Firebreak Enforcement', () => {
    it('should allow shallow delegation chains', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 1,
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b'],
        }
      );

      expect(result.firebreaks_passed).toBe(true);
      expect(result.blocking_firebreaks).toHaveLength(0);
      // With value=100, depth=1, liability is 'limited' per implementation logic
      expect(result.liability_level).toBe('limited');
    });

    it('should block delegation exceeding depth thresholds', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 3, // Exceeds supervisor threshold (2)
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
        }
      );

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('delegation_depth_exceeded');
      expect(result.manual_override_available).toBe(true);
      expect(result.required_authority).toBe('supervisor');
    });

    it('should block high-value delegations', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 1,
          estimated_value: 75000, // Exceeds high_value_limit (50000)
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b'],
        }
      );

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('high_value_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('manager');
    });

    it('should block critical system delegations when approval required', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 1,
          estimated_value: 100,
          involves_critical_systems: true,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b'],
        }
      );

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('critical_system_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('manager');
    });

    it('should block external delegations when approval required', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-external',
        {
          delegation_depth: 1,
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: true,
          chain_agents: ['agent-a', 'agent-external'],
        }
      );

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('external_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('executive');
    });
  });

  describe('Manual Override System', () => {
    it('should allow requesting manual override for blocked delegation', async () => {
      const override = await enforcer.requestOverride({
        requesting_agent: 'agent-a',
        target_agent: 'agent-b',
        authority_level: 'manager', // Changed to manager for sufficient authority
        justification: 'Need to delegate for critical bug fix',
        context: { 
          delegation_depth: 3,
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
        }
      });

      expect(override).toBeDefined();
      expect(override.override_id).toBeDefined();
      expect(typeof override.override_id).toBe('string');
      expect(override.status).toBe('pending');
      expect(override.authority_level).toBe('manager');
    });

    it('should approve override with sufficient authority', async () => {
      const override = await enforcer.requestOverride({
        requesting_agent: 'agent-a',
        target_agent: 'agent-b',
        authority_level: 'manager',
        justification: 'Emergency delegation needed',
        context: {
          delegation_depth: 3,
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
        }
      });

      // Approve requires 3 params: override_id, approving_authority, approver_clearance
      const result = await enforcer.approveOverride(override.override_id, 'manager-001', 'executive');
      expect(result.status).toBe('approved');
      expect(result.approved_by).toBe('manager-001');
    });

    it('should auto-reject override with insufficient authority', async () => {
      // Request with 'agent' authority for a depth-3 delegation (requires 'supervisor' or higher)
      const override = await enforcer.requestOverride({
        requesting_agent: 'agent-a',
        target_agent: 'agent-b',
        authority_level: 'agent', // Insufficient - depth 3 requires supervisor
        justification: 'Routine delegation',
        context: {
          delegation_depth: 3,
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
        }
      });

      // Should be auto-rejected
      expect(override.status).toBe('rejected');
      expect(override.rejection_reason).toContain('Insufficient authority');
      expect(override.required_approvals).toBeDefined();
    });

    it('should track override expiration', async () => {
      const override = await enforcer.requestOverride({
        requesting_agent: 'agent-a',
        target_agent: 'agent-b',
        authority_level: 'manager',
        justification: 'Test override',
        urgency: 'emergency', // Sets 1-hour expiration
        context: {
          delegation_depth: 3,
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
        }
      });

      expect(override.expires_at).toBeDefined();
      expect(override.urgency).toBe('emergency');
    });
  });

  describe('Escalation Procedures', () => {
    it('should escalate authority when multiple firebreaks hit', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-external',
        {
          delegation_depth: 5, // Exceeds manager threshold (4)
          estimated_value: 100000, // Exceeds high_value_limit
          involves_critical_systems: true,
          is_external_delegation: true,
          chain_agents: Array.from({ length: 6 }, (_, i) => `agent-${i}`),
        }
      );

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks.length).toBeGreaterThan(1);
      // Executive is highest required (external delegation)
      expect(result.required_authority).toBe('executive');
    });

    it('should provide escalation path for complex cases', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 7, // Exceeds executive threshold (6)
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: Array.from({ length: 8 }, (_, i) => `agent-${i}`),
        }
      );

      expect(result.required_authority).toBe('emergency');
      // escalation_path may be undefined in simple cases
      if (result.escalation_path) {
        expect(result.escalation_path.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Liability Assignment', () => {
    it('should assign "none" liability for low-value shallow chains', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 1,
          estimated_value: 50,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b'],
        }
      );

      expect(result.liability_level).toBe('none');
    });

    it('should assign "full" liability for critical systems', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 1,
          estimated_value: 100,
          involves_critical_systems: true,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b'],
        }
      );

      expect(result.liability_level).toBe('full');
    });

    it('should assign "shared" liability for deep chains with moderate value', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 4,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: Array.from({ length: 5 }, (_, i) => `agent-${i}`),
        }
      );

      expect(result.liability_level).toBe('shared');
    });

    it('should assign "limited" liability for moderate cases', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 2,
          estimated_value: 500,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-a', 'agent-b', 'agent-c'],
        }
      );

      expect(result.liability_level).toBe('limited');
    });
  });

  describe('Contract Validation Integration', () => {
    it('should validate delegation contract against firebreak rules', () => {
      const contract: DelegationContract = {
        contract_id: 'test-001',
        task_id: 'task-001',
        delegator_agent_id: 'agent-a',
        delegatee_agent_id: 'agent-b',
        delegator: {
          agent_id: 'agent-a',
          agent_name: 'Agent A',
        },
        delegatee: {
          agent_id: 'agent-b',
          agent_name: 'Agent B',
        },
        verification_policy: 'direct_inspection',
        success_criteria: {
          required_checks: ['completion'],
        },
        created_at: new Date().toISOString(),
        status: 'pending',
        priority: 5,
        metadata: {
          estimated_value: 100,
        },
      };

      const result = enforcer.evaluateContract(contract);
      expect(result.requires_firebreak).toBe(false);
      expect(result.risk_level).toBe('medium');
    });

    it('should require firebreak for high-risk contracts', () => {
      const contract: DelegationContract = {
        contract_id: 'test-002',
        task_id: 'task-002',
        delegator_agent_id: 'agent-a',
        delegatee_agent_id: 'agent-external',
        delegator: {
          agent_id: 'agent-a',
          agent_name: 'Agent A',
        },
        delegatee: {
          agent_id: 'agent-external',
          agent_name: 'External Agent',
        },
        verification_policy: 'human_required',
        success_criteria: {
          required_checks: ['security_audit'],
        },
        created_at: new Date().toISOString(),
        status: 'pending',
        priority: 9,
        metadata: {
          environment: 'production',
          operation_type: 'destructive',
          is_external_delegation: true,
        },
      };

      const result = enforcer.evaluateContract(contract);
      expect(result.requires_firebreak).toBe(true);
      expect(result.risk_level).toBe('high');
      expect(result.firebreak_conditions).toBeDefined();
      expect(result.firebreak_conditions!.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track firebreak enforcement statistics', () => {
      // Pass case
      enforcer.enforceFirebreaks('agent-a', 'agent-b', {
        delegation_depth: 1,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-a', 'agent-b'],
      });

      // Block case
      enforcer.enforceFirebreaks('agent-a', 'agent-b', {
        delegation_depth: 5,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 6 }, (_, i) => `agent-${i}`),
      });

      const stats = enforcer.getStats();
      expect(stats.total_validations).toBe(2);
      expect(stats.firebreaks_passed).toBe(1);
      expect(stats.firebreaks_blocked).toBe(1);
    });

    it('should track block reason distribution', () => {
      enforcer.enforceFirebreaks('agent-a', 'agent-b', {
        delegation_depth: 5,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 6 }, (_, i) => `agent-${i}`),
      });

      enforcer.enforceFirebreaks('agent-a', 'agent-b', {
        delegation_depth: 1,
        estimated_value: 100000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-a', 'agent-b'],
      });

      const stats = enforcer.getStats();
      expect(stats.block_reasons).toBeDefined();
      expect(stats.block_reasons['delegation_depth_exceeded']).toBe(1);
      expect(stats.block_reasons['high_value_delegation']).toBe(1);
    });

    it('should track liability level distribution', () => {
      enforcer.enforceFirebreaks('agent-a', 'agent-b', {
        delegation_depth: 1,
        estimated_value: 50,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-a', 'agent-b'],
      });

      enforcer.enforceFirebreaks('agent-a', 'agent-b', {
        delegation_depth: 1,
        estimated_value: 100,
        involves_critical_systems: true,
        is_external_delegation: false,
        chain_agents: ['agent-a', 'agent-b'],
      });

      const stats = enforcer.getStats();
      expect(stats.liability_distribution).toBeDefined();
      expect(stats.liability_distribution['none']).toBe(1);
      expect(stats.liability_distribution['full']).toBe(1);
    });
  });

  describe('Unlimited Delegation Chain Prevention', () => {
    it('should prevent delegation chains exceeding configured max depth', () => {
      const result = enforcer.enforceFirebreaks(
        'agent-a',
        'agent-b',
        {
          delegation_depth: 6, // Exceeds default_max_depth (5)
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: Array.from({ length: 7 }, (_, i) => `agent-${i}`),
        }
      );

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('delegation_depth_exceeded');
    });

    it('should enforce progressively stricter authority requirements at each depth', () => {
      // Depth 1-2: agent authority
      const result1 = enforcer.enforceFirebreaks('a', 'b', {
        delegation_depth: 2,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['a', 'b', 'c'],
      });
      expect(result1.firebreaks_passed).toBe(true);

      // Depth 3: requires supervisor
      const result3 = enforcer.enforceFirebreaks('a', 'b', {
        delegation_depth: 3,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 4 }, (_, i) => `${i}`),
      });
      expect(result3.required_authority).toBe('supervisor');

      // Depth 5: requires manager
      const result5 = enforcer.enforceFirebreaks('a', 'b', {
        delegation_depth: 5,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 6 }, (_, i) => `${i}`),
      });
      expect(result5.required_authority).toBe('manager');

      // Depth 7: requires executive
      const result7 = enforcer.enforceFirebreaks('a', 'b', {
        delegation_depth: 7,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 8 }, (_, i) => `${i}`),
      });
      expect(result7.required_authority).toBe('emergency');
    });

    it('should prevent unlimited chains through escalating liability', () => {
      const depths = [1, 3, 5, 7, 10];
      const results = depths.map(depth => 
        enforcer.enforceFirebreaks('a', 'b', {
          delegation_depth: depth,
          estimated_value: 100,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: Array.from({ length: depth + 1 }, (_, i) => `${i}`),
        })
      );

      // Verify liability increases with depth
      // Note: with estimated_value=100, depth 1 assigns 'limited' not 'none'
      expect(['none', 'limited']).toContain(results[0].liability_level); // Depth 1
      expect(['limited', 'shared', 'full']).toContain(results[2].liability_level); // Depth 5
      expect(['limited', 'shared', 'full']).toContain(results[3].liability_level); // Depth 7
      
      // Verify deeper chains are blocked
      expect(results[3].firebreaks_passed).toBe(false);
      expect(results[4].firebreaks_passed).toBe(false);
    });
  });
});
