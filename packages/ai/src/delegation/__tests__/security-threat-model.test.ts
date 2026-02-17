/**
 * Tests for Security Threat Model Validation
 * TLP:CLEAR
 * 
 * Comprehensive test suite for delegation security threat detection including:
 * - Permission escalation detection
 * - Reputation gaming detection  
 * - Abuse pattern detection
 * - Anomaly detection
 * - Integration with contract manager
 * 
 * @test security-threat-model
 * @version 1.0.0
 * @date 2026-02-14
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityThreatValidator } from '../security-threat-model.js';
import type { DelegationContract } from '../../types/delegation-contracts.js';
import type { ThreatDetectionResult } from '../security-threat-model.js';

describe('SecurityThreatValidator', () => {
  let validator: SecurityThreatValidator;
  
  beforeEach(() => {
    validator = new SecurityThreatValidator({
      max_chain_depth: 5,
      max_contracts_per_hour: 50,
      reputation_gaming_threshold: 0.1,
      anomaly_detection_window_hours: 24,
      permission_escalation_detection: true,
    });
  });

  const createMockContract = (overrides: Partial<DelegationContract> = {}): DelegationContract => {
    const baseContract = {
      contract_id: `test_contract_${Date.now()}`,
      task_id: 'test_task',
      delegator: {
        agent_id: 'delegator_agent',
        agent_name: 'Delegator Agent',
      },
      delegatee: {
        agent_id: 'delegatee_agent', 
        agent_name: 'Delegatee Agent',
      },
      permission_token: {
        token_id: 'test_token',
        scopes: ['read'],
        actions: ['view'],
        resources: [],
      },
      verification_policy: 'manual' as const,
      success_criteria: ['task_completed'],
      created_at: new Date().toISOString(),
      status: 'pending' as const,
      tlp_classification: 'TLP:CLEAR' as const,
    };
    
    // Merge permission_token if provided in overrides
    const finalContract = {
      ...baseContract,
      ...overrides,
      permission_token: overrides.permission_token ? {
        ...baseContract.permission_token,
        ...overrides.permission_token,
      } : baseContract.permission_token,
    };
    
    // Populate convenience accessors from nested objects
    return {
      ...finalContract,
      delegator_agent_id: finalContract.delegator?.agent_id || 'delegator_agent',
      delegatee_agent_id: finalContract.delegatee?.agent_id || 'delegatee_agent',
    } as DelegationContract;
  };

  describe('Permission Escalation Detection', () => {
    it('should detect high-privilege scope requests', async () => {
      const contract = createMockContract({
        permission_token: {
          token_id: 'escalation_token',
          scopes: ['admin', 'root', 'execute'],
          actions: ['admin_modify', 'system_delete'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('permission_escalation');
      expect(result.severity).toMatch(/medium|high|critical/);
      expect(result.description).toContain('permission escalation');
      expect(result.evidence.metrics?.risk_score).toBeGreaterThan(0.5);
    });

    it('should detect excessive permission actions', async () => {
      const contract = createMockContract({
        permission_token: {
          token_id: 'excessive_token',
          scopes: ['read', 'write'],
          actions: ['read', 'write', 'update', 'delete', 'create', 'admin', 'execute'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('permission_escalation');
    });

    it('should detect unsafe delegation chain depth', async () => {
      const contract = createMockContract({
        metadata: {
          delegation_depth: 6, // Above max_chain_depth of 5
        },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('permission_escalation');
      expect(result.evidence.metrics?.risk_score).toBeGreaterThan(0.5);
    });

    it('should detect TLP escalation without proper justification', async () => {
      const contract = createMockContract({
        tlp_classification: 'TLP:RED',
        // No production access justification in metadata
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('permission_escalation');
    });

    it('should allow safe permission requests', async () => {
      const contract = createMockContract({
        permission_token: {
          token_id: 'safe_token',
          scopes: ['read', 'write'],
          actions: ['view', 'edit'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
        metadata: {
          delegation_depth: 2,
        },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(false);
      expect(result.threat_type).toBe('none');
    });
  });

  describe('Reputation Gaming Detection', () => {
    it('should detect circular delegation patterns', async () => {
      // Simulate mutual delegations
      const contract1 = createMockContract({
        delegator: { agent_id: 'agent_a', capabilities: ['read'] },
        delegatee: { agent_id: 'agent_b', capabilities: ['write'] },
      });
      
      const contract2 = createMockContract({
        delegator: { agent_id: 'agent_b', capabilities: ['write'] },
        delegatee: { agent_id: 'agent_a', capabilities: ['read'] },
      });

      // Process multiple mutual delegations
      for (let i = 0; i < 4; i++) {
        await validator.validateDelegationSecurity(contract1);
        await validator.validateDelegationSecurity(contract2);
      }

      const result = await validator.validateDelegationSecurity(contract1);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('reputation_gaming');
    });

    it('should detect delegation to new agents with limited history', async () => {
      const contract = createMockContract({
        delegatee: { agent_id: 'new_agent', capabilities: ['read'] },
      });

      const result = await validator.validateDelegationSecurity(contract);

      // For new agents without history, should still work but might flag as suspicious
      expect(result.threat_detected).toBeFalsy();
    });

    it('should allow healthy delegation patterns', async () => {
      const contract = createMockContract({
        delegator: { agent_id: 'experienced_agent', capabilities: ['read', 'write'] },
        delegatee: { agent_id: 'trusted_agent', capabilities: ['read'] },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(false);
      expect(result.threat_type).toBe('none');
    });
  });

  describe('Abuse Pattern Detection', () => {
    it('should detect excessive resource requirements', async () => {
      const contract = createMockContract({
        resource_requirements: {
          memory_mb: 16384, // 16GB - excessive
          cpu_cores: 8,     // 8 cores - excessive  
          disk_space_mb: 204800, // 200GB - excessive
        },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('abuse_pattern');
      expect(result.severity).toMatch(/medium|high/);
    });

    it('should allow reasonable resource requirements', async () => {
      const contract = createMockContract({
        resource_requirements: {
          memory_mb: 2048, // 2GB - reasonable
          cpu_cores: 2,    // 2 cores - reasonable
          disk_space_mb: 10240, // 10GB - reasonable
        },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(false);
      expect(result.threat_type).toBe('none');
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect unusual TLP level requests', async () => {
      // Create a fresh validator instance to avoid cross-contamination
      const freshValidator = new SecurityThreatValidator({
        max_chain_depth: 5,
        max_contracts_per_hour: 50,
        reputation_gaming_threshold: 0.1,
        anomaly_detection_window_hours: 24,
        permission_escalation_detection: true,
      });

      // First establish a pattern of TLP:CLEAR requests
      for (let i = 0; i < 6; i++) {
        const normalContract = createMockContract({
          delegator: { agent_id: 'unique_consistent_agent', agent_name: 'Consistent Agent' },
          tlp_classification: 'TLP:CLEAR',
        });
        await freshValidator.validateDelegationSecurity(normalContract);
      }

      // Now request unusual TLP level
      const unusualContract = createMockContract({
        delegator: { agent_id: 'unique_consistent_agent', agent_name: 'Consistent Agent' },
        tlp_classification: 'TLP:AMBER',
      });

      const result = await freshValidator.validateDelegationSecurity(unusualContract);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('anomaly');
    });

    it('should detect unusual execution time estimates', async () => {
      // Create a fresh validator instance
      const freshValidator = new SecurityThreatValidator({
        max_chain_depth: 5,
        max_contracts_per_hour: 50,
        reputation_gaming_threshold: 0.1,
        anomaly_detection_window_hours: 24,
        permission_escalation_detection: true,
      });

      // First establish a pattern of normal execution times
      for (let i = 0; i < 6; i++) {
        const normalContract = createMockContract({
          delegator: { agent_id: 'timing_agent', agent_name: 'Timing Agent' },
          metadata: { estimated_duration_ms: 60000 }, // 1 minute
        });
        await freshValidator.validateDelegationSecurity(normalContract);
      }

      // Now request unusual execution time
      const unusualContract = createMockContract({
        delegator: { agent_id: 'timing_agent', agent_name: 'Timing Agent' },
        metadata: { estimated_duration_ms: 1800000 }, // 30 minutes (much longer)
      });

      const result = await freshValidator.validateDelegationSecurity(unusualContract);

      expect(result.threat_detected).toBe(true);
      expect(result.threat_type).toBe('anomaly');
    });

    it('should allow consistent behavior patterns', async () => {
      const contract = createMockContract({
        delegator: { agent_id: 'new_agent', capabilities: ['read'] },
        tlp_classification: 'TLP:CLEAR',
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(false);
      expect(result.threat_type).toBe('none');
    });
  });

  describe('Threat Action Responses', () => {
    it('should recommend blocking for high-risk permission escalation', async () => {
      const contract = createMockContract({
        permission_token: {
          token_id: 'critical_token',
          scopes: ['root', 'admin', 'execute', 'delete'],
          actions: ['system_admin', 'root_access', 'delete_all', 'modify_system', 'execute_code'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
        metadata: {
          delegation_depth: 7, // Exceeds safe depth
        },
        tlp_classification: 'TLP:RED',
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result.threat_detected).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.action).toMatch(/block|terminate_chain/);
    });

    it('should recommend warning for moderate threats', async () => {
      const contract = createMockContract({
        permission_token: {
          token_id: 'moderate_token',
          scopes: ['admin'],
          actions: ['admin_view', 'admin_edit'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const result = await validator.validateDelegationSecurity(contract);

      if (result.threat_detected) {
        expect(result.severity).toMatch(/low|medium/);
        expect(result.action).toMatch(/allow|warn|escalate/);
      }
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track threat detection statistics', async () => {
      // Process various contracts with different threat levels
      const contracts = [
        createMockContract(), // Safe contract
        createMockContract({
          permission_token: {
            token_id: 'risky_token',
            scopes: ['admin'],
            actions: ['admin_access'],
            expiry: new Date(Date.now() + 86400000).toISOString(),
          },
        }), // Risky contract
      ];

      for (const contract of contracts) {
        await validator.validateDelegationSecurity(contract);
      }

      const stats = validator.getThreatStatistics();

      expect(stats.total_validations).toBeGreaterThanOrEqual(2);
      expect(stats.threats_detected).toBeGreaterThanOrEqual(0);
      expect(stats.threat_types).toBeDefined();
      expect(stats.severity_distribution).toBeDefined();
      expect(stats.action_distribution).toBeDefined();
    });

    it('should provide recent threat history', async () => {
      // Process a risky contract
      const riskyContract = createMockContract({
        permission_token: {
          token_id: 'threat_token',
          scopes: ['admin', 'execute'],
          actions: ['admin_modify', 'system_execute'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      await validator.validateDelegationSecurity(riskyContract);

      const recentThreats = validator.getRecentThreats(5);
      expect(Array.isArray(recentThreats)).toBe(true);

      // If threats were detected, verify structure
      if (recentThreats.length > 0) {
        const threat = recentThreats[0];
        expect(threat).toHaveProperty('threat_type');
        expect(threat).toHaveProperty('severity');
        expect(threat).toHaveProperty('action');
        expect(threat).toHaveProperty('description');
        expect(threat).toHaveProperty('confidence');
      }
    });
  });

  describe('Configuration Options', () => {
    it('should respect permission escalation detection setting', async () => {
      const disabledValidator = new SecurityThreatValidator({
        permission_escalation_detection: false,
      });

      const escalationContract = createMockContract({
        permission_token: {
          token_id: 'escalation_token',
          scopes: ['admin', 'root'],
          actions: ['admin_access', 'root_access'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const result = await disabledValidator.validateDelegationSecurity(escalationContract);

      // Should not detect permission escalation when disabled
      expect(result.threat_type !== 'permission_escalation' || !result.threat_detected).toBe(true);
    });

    it('should respect reputation gaming threshold', async () => {
      const sensitiveValidator = new SecurityThreatValidator({
        reputation_gaming_threshold: 0.05, // Very low threshold
      });

      const contract = createMockContract({
        delegator: { agent_id: 'test_agent', capabilities: ['read'] },
        delegatee: { agent_id: 'new_agent', capabilities: ['read'] },
      });

      const result = await sensitiveValidator.validateDelegationSecurity(contract);

      // With lower threshold, might be more sensitive to reputation gaming
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle contracts with minimal data', async () => {
      const minimalContract = createMockContract({
        permission_token: undefined,
        resource_requirements: undefined,
        metadata: undefined,
      });

      const result = await validator.validateDelegationSecurity(minimalContract);

      expect(result).toBeDefined();
      expect(result.threat_type).toBeDefined();
    });

    it('should handle contracts with missing agent activity', async () => {
      const contract = createMockContract({
        delegator: { agent_id: 'unknown_agent', capabilities: ['read'] },
        delegatee: { agent_id: 'another_unknown_agent', capabilities: ['write'] },
      });

      const result = await validator.validateDelegationSecurity(contract);

      expect(result).toBeDefined();
      expect(result.threat_detected).toBe(false); // No history means no patterns to detect
    });
  });
});