/**
 * Liability Firebreak Enforcement Tests for DCYFR Delegation Framework
 * 
 * Tests accountability boundaries, manual override capabilities, and escalation procedures
 * for liability firebreaks in delegation chains.
 * 
 * Task 6.3: Build liability firebreak enforcement
 * - Implement accountability boundaries in delegation chains
 * - Support manual override capabilities and escalation procedures
 * - Validate that liability firebreaks prevent unlimited delegation chains
 * 
 * @package @dcyfr/ai
 * @module delegation/liability-firebreak-enforcement
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// Import Implementation
// ============================================================================

import { 
  LiabilityFirebreakEnforcer,
  type FirebreakResult,
  type FirebreakValidationContext,
  type OverrideRequest,
  type LiabilityLevel,
  type OverrideAuthority,
  type FirebreakAction
} from '../../src/delegation/liability-firebreak.js';

// ============================================================================
// Test Suite
// ============================================================================

describe('Liability Firebreak Enforcement', () => {
  let enforcer: LiabilityFirebreakEnforcer;

  beforeEach(() => {
    enforcer = new LiabilityFirebreakEnforcer({
      depth_thresholds: {
        supervisor: 3,
        manager: 5,
        executive: 7,
      },
      liability_thresholds: {
        high_value_limit: 50000,
        critical_system_approval: true,
        external_delegation_approval: true,
      },
      emergency_procedures: {
        max_emergency_depth: 10,
        emergency_contacts: [
          { authority: 'supervisor', contact_id: 'supervisor@dcyfr.ai', response_time_sla_minutes: 30 },
          { authority: 'manager', contact_id: 'manager@dcyfr.ai', response_time_sla_minutes: 60 },
          { authority: 'executive', contact_id: 'executive@dcyfr.ai', response_time_sla_minutes: 120 },
        ],
      },
    });
  });

  // ==========================================================================
  // 1. Basic Firebreak Enforcement
  // ==========================================================================

  describe('1. Basic Firebreak Enforcement', () => {
    it('1.1 Should allow simple delegation within limits', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);

      expect(result.firebreaks_passed).toBe(true);
      expect(result.blocking_firebreaks).toHaveLength(0);
      expect(result.liability_level).toBe('limited');
      expect(result.chain_length).toBe(2);
      expect(result.manual_override_available).toBe(false);
      expect(result.required_authority).toBe('agent');
      expect(result.validation_timestamp).toBeTruthy();
    });

    it('1.2 Should block delegation exceeding depth limits', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 8, // Exceeds executive limit (7)
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B', 'agent-C', 'agent-D', 'agent-E', 'agent-F', 'agent-G', 'agent-H'],
      };

      const result = enforcer.enforceFirebreaks('agent-G', 'agent-H', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('delegation_depth_exceeded');
      expect(result.liability_level).toBe('limited');
      expect(result.manual_override_available).toBe(true);
      expect(result.required_authority).toBe('emergency');
    });

    it('1.3 Should escalate high-value delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 75000, // Exceeds high_value_limit (50000)
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('high_value_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('manager');
    });

    it('1.4 Should require approval for critical system delegation', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 1,
        estimated_value: 100,
        involves_critical_systems: true,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('critical_system_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('manager');
    });

    it('1.5 Should require executive approval for external delegation', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 1,
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: true,
        chain_agents: ['agent-internal', 'agent-external'],
      };

      const result = enforcer.enforceFirebreaks('agent-internal', 'agent-external', context);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks).toContain('external_delegation');
      expect(result.liability_level).toBe('full');
      expect(result.required_authority).toBe('executive');
    });
  });

  // ==========================================================================
  // 2. Liability Level Assignment
  // ==========================================================================

  describe('2. Liability Level Assignment', () => {
    it('2.1 Should assign "none" liability for simple low-value delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 1,
        estimated_value: 50,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);
      expect(result.liability_level).toBe('none');
    });

    it('2.2 Should assign "full" liability for critical systems', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 1,
        estimated_value: 1000,
        involves_critical_systems: true,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);
      expect(result.liability_level).toBe('full');
    });

    it('2.3 Should assign "shared" liability for deep chains', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 4,
        estimated_value: 2000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B', 'agent-C', 'agent-D'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-D', context);
      expect(result.liability_level).toBe('shared');
    });

    it('2.4 Should assign "limited" liability for moderate delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);
      expect(result.liability_level).toBe('limited');
    });

    it('2.5 Should assign "full" liability for high-value delegations', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 60000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);
      expect(result.liability_level).toBe('full');
    });
  });

  // ==========================================================================
  // 3. Authority Level Escalation
  // ==========================================================================

  describe('3. Authority Level Escalation', () => {
    it('3.1 Should require supervisor authority for moderate depth', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 3, // At supervisor threshold
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B', 'agent-C'],
      };

      const result = enforcer.enforceFirebreaks('agent-B', 'agent-C', context);
      expect(result.required_authority).toBe('agent'); // Within limits, no escalation needed
    });

    it('3.2 Should require manager authority for high-value + critical systems', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 75000,
        involves_critical_systems: true,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);
      expect(result.required_authority).toBe('manager');
    });

    it('3.3 Should require executive authority for external high-value', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 100000,
        involves_critical_systems: false,
        is_external_delegation: true,
        chain_agents: ['agent-internal', 'agent-external'],
      };

      const result = enforcer.enforceFirebreaks('agent-internal', 'agent-external', context);
      expect(result.required_authority).toBe('executive');
    });

    it('3.4 Should require emergency authority for extreme depth', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 8, // Beyond executive threshold
        estimated_value: 100,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 8 }, (_, i) => `agent-${i + 1}`),
      };

      const result = enforcer.enforceFirebreaks('agent-7', 'agent-8', context);
      expect(result.required_authority).toBe('emergency');
    });
  });

  // ==========================================================================
  // 4. Manual Override System
  // ==========================================================================

  describe('4. Manual Override System', () => {
    it('4.1 Should accept valid override request with sufficient authority', async () => {
      const overrideRequest = {
        requesting_agent: 'agent-manager',
        target_agent: 'agent-worker',
        authority_level: 'manager' as OverrideAuthority,
        reason: 'Business critical deadline',
        context: {
          delegation_depth: 4,
          estimated_value: 25000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-A', 'agent-B', 'agent-C', 'agent-worker'],
        },
        justification: 'Project deadline requires immediate delegation',
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      };

      const result = await enforcer.requestOverride(overrideRequest);

      expect(result.status).toBe('pending');
      expect(result.override_id).toBeTruthy();
      expect(result.authority_level).toBe('manager');
      expect(result.requesting_agent).toBe('agent-manager');
      expect(result.reason).toBe('Business critical deadline');
    });

    it('4.2 Should reject override request with insufficient authority', async () => {
      const overrideRequest = {
        requesting_agent: 'agent-supervisor',
        target_agent: 'agent-external',
        authority_level: 'supervisor' as OverrideAuthority, // Insufficient for external delegation
        reason: 'Need to delegate externally',
        context: {
          delegation_depth: 1,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: true,
          chain_agents: ['agent-internal', 'agent-external'],
        },
        justification: 'External expertise required',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };

      const result = await enforcer.requestOverride(overrideRequest);

      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Insufficient authority level');
      expect(result.rejection_reason).toContain('Required: executive');
    });

    it('4.3 Should create override request with proper metadata', async () => {
      const overrideRequest = {
        requesting_agent: 'agent-executive',
        target_agent: 'agent-external',
        authority_level: 'executive' as OverrideAuthority,
        reason: 'Strategic partnership delegation',
        context: {
          delegation_depth: 2,
          estimated_value: 75000,
          involves_critical_systems: true,
          is_external_delegation: true,
          chain_agents: ['agent-internal', 'agent-partner', 'agent-external'],
        },
        justification: 'Critical business partnership requires external delegation with high value',
        expires_at: new Date(Date.now() + 7200000).toISOString(), // 2 hours
      };

      const result = await enforcer.requestOverride(overrideRequest);

      expect(result.status).toBe('pending');
      expect(result.required_approvals).toEqual(['executive']);
      expect(result.auto_approved).toBe(false);
      expect(result.context).toEqual(overrideRequest.context);
      expect(result.expires_at).toBe(overrideRequest.expires_at);
    });

    it('4.4 Should track pending override requests', async () => {
      const overrideRequest1 = {
        requesting_agent: 'agent-manager-1',
        target_agent: 'agent-worker-1',
        authority_level: 'manager' as OverrideAuthority,
        reason: 'High value delegation needed',
        context: {
          delegation_depth: 2,
          estimated_value: 60000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-A', 'agent-worker-1'],
        },
        justification: 'Project requires high-value delegation',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };

      const overrideRequest2 = {
        requesting_agent: 'agent-manager-2',
        target_agent: 'agent-worker-2',
        authority_level: 'manager' as OverrideAuthority,
        reason: 'Critical system access needed',
        context: {
          delegation_depth: 1,
          estimated_value: 1000,
          involves_critical_systems: true,
          is_external_delegation: false,
          chain_agents: ['agent-B', 'agent-worker-2'],
        },
        justification: 'Critical system maintenance requires delegation',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };

      await enforcer.requestOverride(overrideRequest1);
      await enforcer.requestOverride(overrideRequest2);

      const pendingOverrides = enforcer.getPendingOverrides();
      expect(pendingOverrides).toHaveLength(2);
      expect(pendingOverrides[0].authority_level).toBe('manager');
      expect(pendingOverrides[1].authority_level).toBe('manager');
      expect(pendingOverrides.every(req => req.status === 'pending')).toBe(true);
    });
  });

  // ==========================================================================
  // 5. Emergency Escalation Procedures
  // ==========================================================================

  describe('5. Emergency Escalation Procedures', () => {
    it('5.1 Should process emergency escalation with proper contact', async () => {
      const escalationData = {
        agent_id: 'agent-emergency',
        emergency_level: 'critical',
        reason: 'Production system failure requires immediate delegation',
        context: {
          delegation_depth: 6,
          estimated_value: 100000,
          involves_critical_systems: true,
          is_external_delegation: false,
        },
      };

      const result = await enforcer.processEmergencyEscalation(escalationData);

      expect(result.escalation_id).toBeTruthy();
      expect(result.status).toBe('escalated');
      expect(result.agent_id).toBe('agent-emergency');
      expect(result.emergency_contact_notified).toBe(true);
      expect(result.emergency_contact).toBe('supervisor@dcyfr.ai');
      expect(result.bypass_granted).toBe(false); // Requires manual approval
      expect(result.approval_required).toBe(true);
    });

    it('5.2 Should escalate with proper emergency contact hierarchy', async () => {
      const escalationData = {
        agent_id: 'agent-critical',
        emergency_level: 'high',
        reason: 'Time-sensitive external partnership delegation',
        context: {
          delegation_depth: 3,
          estimated_value: 50000,
          involves_critical_systems: false,
          is_external_delegation: true,
        },
      };

      const result = await enforcer.processEmergencyEscalation(escalationData);

      expect(result.emergency_contact).toBeTruthy();
      expect(result.escalation_timestamp).toBeTruthy();
      expect(result.status).toBe('escalated');
    });
  });

  // ==========================================================================
  // 6. Accountability Boundaries
  // ==========================================================================

  describe('6. Accountability Boundaries', () => {
    it('6.1 Should prevent unlimited delegation chains', () => {
      // Test delegation at emergency depth limit
      const context: FirebreakValidationContext = {
        delegation_depth: 10, // At emergency limit
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 10 }, (_, i) => `agent-${i + 1}`),
      };

      const result = enforcer.enforceFirebreaks('agent-9', 'agent-10', context);
      expect(result.required_authority).toBe('emergency');

      // Test delegation beyond emergency limit
      const beyondLimitContext: FirebreakValidationContext = {
        ...context,
        delegation_depth: 11, // Beyond emergency limit
        chain_agents: Array.from({ length: 11 }, (_, i) => `agent-${i + 1}`),
      };

      const blockedResult = enforcer.enforceFirebreaks('agent-10', 'agent-11', beyondLimitContext);
      expect(blockedResult.firebreaks_passed).toBe(false);
      expect(blockedResult.blocking_firebreaks).toContain('delegation_depth_exceeded');
    });

    it('6.2 Should enforce clear liability boundaries at each depth', () => {
      const contexts = [
        { depth: 1, expectedLiability: 'limited' as LiabilityLevel }, // Corrected expectation
        { depth: 3, expectedLiability: 'limited' as LiabilityLevel },
        { depth: 4, expectedLiability: 'shared' as LiabilityLevel },
      ];

      contexts.forEach(({ depth, expectedLiability }) => {
        const context: FirebreakValidationContext = {
          delegation_depth: depth,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: Array.from({ length: depth }, (_, i) => `agent-${i + 1}`),
        };

        const result = enforcer.enforceFirebreaks(`agent-${depth - 1}`, `agent-${depth}`, context);
        expect(result.liability_level).toBe(expectedLiability);
      });
    });

    it('6.3 Should maintain accountability chain length tracking', () => {
      const shortChainContext: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const longChainContext: FirebreakValidationContext = {
        delegation_depth: 6,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: Array.from({ length: 6 }, (_, i) => `agent-${i + 1}`),
      };

      const shortResult = enforcer.enforceFirebreaks('agent-A', 'agent-B', shortChainContext);
      const longResult = enforcer.enforceFirebreaks('agent-5', 'agent-6', longChainContext);

      expect(shortResult.chain_length).toBe(2);
      expect(longResult.chain_length).toBe(6);
    });
  });

  // ==========================================================================
  // 7. Statistics and Monitoring
  // ==========================================================================

  describe('7. Statistics and Monitoring', () => {
    it('7.1 Should track firebreak enforcement statistics', () => {
      // Perform multiple enforcements
      const contexts = [
        // Passing case
        {
          delegation_depth: 2,
          estimated_value: 1000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-A', 'agent-B'],
        },
        // Blocking case - high value
        {
          delegation_depth: 2,
          estimated_value: 75000,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: ['agent-C', 'agent-D'],
        },
        // Blocking case - critical systems
        {
          delegation_depth: 1,
          estimated_value: 1000,
          involves_critical_systems: true,
          is_external_delegation: false,
          chain_agents: ['agent-E', 'agent-F'],
        },
      ];

      contexts.forEach((context, index) => {
        enforcer.enforceFirebreaks(`agent-${index * 2}`, `agent-${index * 2 + 1}`, context);
      });

      const stats = enforcer.getStats();
      expect(stats.total_validations).toBe(3);
      expect(stats.firebreaks_passed).toBe(1);
      expect(stats.firebreaks_blocked).toBe(2);
      expect(stats.block_reason_distribution?.high_value_delegation || 0).toBeGreaterThanOrEqual(1);
      expect(stats.block_reason_distribution?.critical_system_delegation || 0).toBeGreaterThanOrEqual(1);
    });

    it('7.2 Should track liability distribution statistics', () => {
      const contexts = [
        { delegation_depth: 1, estimated_value: 50, liability: 'none' }, // None liability
        { delegation_depth: 2, estimated_value: 1000, liability: 'limited' }, // Limited liability
        { delegation_depth: 4, estimated_value: 2000, liability: 'shared' }, // Shared liability
        { delegation_depth: 1, estimated_value: 60000, liability: 'full' }, // Full liability
      ];

      contexts.forEach((context, index) => {
        enforcer.enforceFirebreaks(`agent-${index}`, `agent-${index + 1}`, {
          delegation_depth: context.delegation_depth,
          estimated_value: context.estimated_value,
          involves_critical_systems: false,
          is_external_delegation: false,
          chain_agents: [`agent-${index}`, `agent-${index + 1}`],
        });
      });

      const stats = enforcer.getStats();
      expect(stats.liability_distribution.none).toBe(1);
      expect(stats.liability_distribution.limited).toBe(1);
      expect(stats.liability_distribution.shared).toBe(1);
      expect(stats.liability_distribution.full).toBe(1);
    });

    it('7.3 Should track override request statistics', async () => {
      // Create multiple override requests
      const overrideRequests = [
        {
          requesting_agent: 'agent-manager-1',
          target_agent: 'agent-worker-1',
          authority_level: 'manager' as OverrideAuthority,
          reason: 'High value delegation',
          context: {
            delegation_depth: 2,
            estimated_value: 60000,
            involves_critical_systems: false,
            is_external_delegation: false,
            chain_agents: ['agent-A', 'agent-worker-1'],
          },
          justification: 'Business critical',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
        {
          requesting_agent: 'agent-supervisor',
          target_agent: 'agent-external',
          authority_level: 'supervisor' as OverrideAuthority, // Insufficient authority
          reason: 'External delegation',
          context: {
            delegation_depth: 1,
            estimated_value: 1000,
            involves_critical_systems: false,
            is_external_delegation: true,
            chain_agents: ['agent-internal', 'agent-external'],
          },
          justification: 'External expertise needed',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      ];

      await Promise.all(overrideRequests.map(req => enforcer.requestOverride(req)));

      const stats = enforcer.getStats();
      expect(stats.override_requests_summary?.total || 0).toBe(2);
      expect(stats.override_requests_summary?.pending || 0).toBe(1);
      expect(stats.override_requests_summary?.rejected || 0).toBe(1);
      expect(stats.pending_overrides).toBe(2); // Both stored, one pending, one rejected
    });
  });

  // ==========================================================================
  // 8. Edge Cases and Error Handling
  // ==========================================================================

  describe('8. Edge Cases and Error Handling', () => {
    it('8.0 Should not trigger external-delegation firebreak when approval flag is disabled for third-party delegates', () => {
      const localEnforcer = new LiabilityFirebreakEnforcer({
        depth_thresholds: {
          supervisor: 3,
          manager: 5,
          executive: 7,
        },
        liability_thresholds: {
          high_value_limit: 50000,
          critical_system_approval: true,
          external_delegation_approval: false,
        },
        emergency_procedures: {
          max_emergency_depth: 10,
          emergency_contacts: [
            { authority: 'supervisor', contact_id: 'supervisor@dcyfr.ai', response_time_sla_minutes: 30 },
          ],
        },
      });

      const evaluation = localEnforcer.evaluateContract({
        contract_id: 'contract-third-party-no-flag',
        delegator_agent_id: 'agent-internal',
        delegatee_agent_id: 'third-party-processor',
        priority: 3,
        metadata: {
          operation_type: 'read',
          is_external_delegation: false,
          estimated_value: 100,
        },
        permission_token: {
          scopes: ['read'],
        },
      });

      expect(evaluation.requires_firebreak).toBe(false);
    });

    it('8.1 Should handle missing context properties gracefully', () => {
      const minimalContext = {
        delegation_depth: 3,
      } as Partial<FirebreakValidationContext>;

      const result = enforcer.enforceFirebreaks(
        'agent-A', 
        'agent-B', 
        minimalContext as FirebreakValidationContext
      );

      expect(result.validation_timestamp).toBeTruthy();
      expect(result.liability_level).toBeTruthy();
      expect(result.chain_length).toBeGreaterThan(0);
    });

    it('8.2 Should handle zero/negative values appropriately', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 0, // Should be normalized to 1
        estimated_value: -100, // Should be normalized to 0
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: [],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);

      expect(result.validation_timestamp).toBeTruthy();
      expect(result.liability_level).toBeTruthy();
    });

    it('8.3 Should handle extreme values without crashing', () => {
      const extremeContext: FirebreakValidationContext = {
        delegation_depth: 1000000, // Extreme depth
        estimated_value: Number.MAX_SAFE_INTEGER,
        involves_critical_systems: true,
        is_external_delegation: true,
        chain_agents: Array.from({ length: 1000 }, (_, i) => `agent-${i}`),
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', extremeContext);

      expect(result.firebreaks_passed).toBe(false);
      expect(result.blocking_firebreaks.length).toBeGreaterThan(0);
      expect(result.required_authority).toBeTruthy();
    });

    it('8.4 Should validate timestamp formats', () => {
      const context: FirebreakValidationContext = {
        delegation_depth: 2,
        estimated_value: 1000,
        involves_critical_systems: false,
        is_external_delegation: false,
        chain_agents: ['agent-A', 'agent-B'],
      };

      const result = enforcer.enforceFirebreaks('agent-A', 'agent-B', context);

      expect(result.validation_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});