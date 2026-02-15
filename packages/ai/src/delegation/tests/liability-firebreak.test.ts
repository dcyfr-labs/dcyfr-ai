/**
 * Liability Firebreak Enforcement Tests
 * TLP:CLEAR
 * 
 * Test suite for liability firebreak enforcement in delegation contracts
 * 
 * @module delegation/tests/liability-firebreak
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LiabilityFirebreakEnforcer } from '../liability-firebreak.js';
import type { 
  LiabilityFirebreakConfig,
  FirebreakValidationContext,
  OverrideRequest 
} from '../liability-firebreak.js';

describe('LiabilityFirebreakEnforcer', () => {
  let enforcer: LiabilityFirebreakEnforcer;
  let config: LiabilityFirebreakConfig;

  beforeEach(() => {
    config = {
      depth_thresholds: {
        supervisor: 3,
        manager: 5,
        executive: 7,
      },
      liability_thresholds: {
        high_value_limit: 100000,
        critical_system_approval: true,
        external_delegation_approval: true,
      },
      emergency_procedures: {
        max_emergency_depth: 10,
        emergency_contacts: [
          { authority: 'supervisor', contact_id: 'supervisor@dcyfr.ai', response_time_sla_minutes: 30 },
          { authority: 'manager', contact_id: 'manager@dcyfr.ai', response_time_sla_minutes: 60 },
        ],
      },
    };

    enforcer = new LiabilityFirebreakEnforcer(config);
  });

  describe('Basic Firebreak Enforcement', () => {
    it('should allow delegation within depth limits', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-1', 'agent-2'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context);

      expect(result.firebreaks_passed).toBe(true);
      expect(result.blocking_firebreaks).toHaveLength(0);
      expect(result.liability_level).toBe('limited');
      expect(result.chain_length).toBe(2);
    });

    it('should block delegation exceeding depth limits', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 8, // Exceeds executive level (7)
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5', 'agent-6', 'agent-7', 'agent-8'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-8', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('delegation_depth_exceeded');
      expect(result.required_authority).toBe('emergency');
      expect(result.manual_override_available).toBe(true);
    });

    it('should block high-value delegations without approval', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 200000, // Exceeds high_value_limit (100000)
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-1', 'agent-2'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('high_value_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('manager');
      expect(result.manual_override_available).toBe(true);
    });

    it('should block critical system delegations without approval', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: true,
        is_external_delegation: false,
        chain_agents: ['agent-1', 'agent-2'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('critical_system_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('manager');
    });

    it('should block external delegations without approval', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: true,
        chain_agents: ['agent-1', 'external-agent-2'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'external-agent-2', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('external_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('executive');
    });
  });

  describe('Liability Level Assignment', () => {
    it('should assign "none" liability for simple delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 1,
        estimated_value: 10,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-1'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context);
      expect(result.liability_level).toBe('none');
    });

    it('should assign "limited" liability for moderate delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-1', 'agent-2'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context);
      expect(result.liability_level).toBe('limited');
    });

    it('should assign "shared" liability for deeper delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 4,
        estimated_value: 5000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-4', context);
      expect(result.liability_level).toBe('shared');
    });

    it('should assign "full" liability for complex delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 3,
        estimated_value: 50000,
        involves_critical_systems: true,
        is_external_delegation: false,
        chain_agents: ['agent-1', 'agent-2', 'agent-3'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-3', context);
      expect(result.liability_level).toBe('full');
    });
  });

  describe('Manual Override System', () => {
    it('should process override request successfully', async () => {
      const overrideRequest: OverrideRequest = {
        requesting_agent: 'agent-1',
        target_agent: 'agent-2',
        authority_level: 'supervisor',
        reason: 'Critical bug fix required',
        context: {
          delegation_depth: 4,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
        },
        justification: 'Production system down, need immediate fix',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      };

      const result = await enforcer.requestOverride(overrideRequest);

      expect(result.override_id).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.required_approvals).toContain('supervisor');
      expect(result.auto_approved).toBe(false);
    });

    it('should reject override request with insufficient authority', async () => {
      const overrideRequest: OverrideRequest = {
        requesting_agent: 'agent-1',
        target_agent: 'agent-2',
        authority_level: 'agent', // Insufficient for depth 4
        reason: 'Test override',
        context: {
          delegation_depth: 4,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
        },
        justification: 'Testing',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };

      const result = await enforcer.requestOverride(overrideRequest);

      expect(result.override_id).toBeDefined();
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Insufficient authority');
    });

    it('should handle emergency escalation', async () => {
      const escalationData = {
        agent_id: 'agent-1',
        emergency_level: 'critical',
        reason: 'Production system completely down',
        impact: 'All users affected, revenue loss',
        requested_bypass_depth: 8,
        emergency_contact: 'supervisor@dcyfr.ai',
      };

      const result = await enforcer.processEmergencyEscalation(escalationData);

      expect(result.escalation_id).toBeDefined();
      expect(result.status).toBe('escalated');
      expect(result.emergency_contact_notified).toBe(true);
      expect(result.bypass_granted).toBe(false); // Requires manual approval
      expect(result.approval_required).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track firebreak statistics', () => {
      // Create some test scenarios to generate stats
      const contexts = [
        {
          delegation_depth: 2,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-1', 'agent-2'],
        },
        {
          delegation_depth: 6, // Will be blocked
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5', 'agent-6'],
        },
      ];

      contexts.forEach((context, index) => {
        enforcer.enforceFirebreaks(`agent-${index}`, `target-${index}`, context);
      });

      const stats = enforcer.getStats();

      expect(stats.total_validations).toBe(2);
      expect(stats.firebreaks_passed).toBe(1);
      expect(stats.firebreaks_blocked).toBe(1);
      expect(stats.liability_distribution).toBeDefined();
      expect(stats.block_reason_distribution).toBeDefined();
    });

    it('should track pending override requests', async () => {
      const overrideRequest: OverrideRequest = {
        requesting_agent: 'agent-1',
        target_agent: 'agent-2',
        authority_level: 'supervisor',
        reason: 'Test override',
        context: {
          delegation_depth: 4,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
        },
        justification: 'Testing pending overrides',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };

      await enforcer.requestOverride(overrideRequest);

      const pendingOverrides = enforcer.getPendingOverrides();

      expect(pendingOverrides).toHaveLength(1);
      expect(pendingOverrides[0].status).toBe('pending');
      expect(pendingOverrides[0].requesting_agent).toBe('agent-1');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty chain_agents gracefully', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 1,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: [],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context);

      expect(result.firebreaks_passed).toBe(true);
      expect(result.chain_length).toBe(1);
    });

    it('should handle negative values gracefully', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: -1, // Invalid
        estimated_value: -100, // Invalid
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-1'],
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context);

      // Should treat negative values as 0 or minimum
      expect(result.firebreaks_passed).toBe(true);
      expect(result.liability_level).toBe('none');
    });

    it('should handle missing context properties', () => {
      const context: Partial<FirebreakValidationContext> = {
        delegation_depth: 2,
        // Missing other properties
      };

      const result = enforcer.enforceFirebreaks('agent-1', 'agent-2', context as FirebreakValidationContext);

      expect(result.firebreaks_passed).toBe(true); // Should use defaults
    });
  });
});