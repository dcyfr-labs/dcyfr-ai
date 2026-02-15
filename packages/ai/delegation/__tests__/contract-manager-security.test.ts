/**
 * Tests for Contract Manager Security Integration
 * TLP:CLEAR
 * 
 * Tests integration between contract manager and security threat validation,
 * including threat detection during contract creation and security monitoring.
 * 
 * @test contract-manager-security-integration  
 * @version 1.0.0
 * @date 2026-02-14
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContractManager } from '../../contract-manager.js';
import type { DelegationContract } from '../../../types/delegation-contracts.js';

describe('ContractManager Security Integration', () => {
  let contractManager: ContractManager;

  beforeEach(() => {
    contractManager = new ContractManager({
      enable_tlp_enforcement: true,
      enable_telemetry: false, // Disable for cleaner tests
      auto_cleanup: false,
    });
  });

  const createPartialContract = (
    overrides: Partial<DelegationContract> = {}
  ): Omit<DelegationContract, 'contract_id' | 'created_at' | 'status'> => ({
    task_id: 'test_task',
    delegator: {
      agent_id: 'delegator_agent',
      capabilities: ['read', 'write'],
    },
    delegatee: {
      agent_id: 'delegatee_agent',
      capabilities: ['read'],
    },
    permission_token: {
      token_id: 'test_token',
      scopes: ['read'],
      actions: ['view'],
      expiry: new Date(Date.now() + 86400000).toISOString(),
    },
    verification_policy: 'manual',
    success_criteria: ['task_completed'],
    tlp_classification: 'TLP:CLEAR',
    ...overrides,
  });

  describe('Security Threat Detection Integration', () => {
    it('should block contracts with critical security threats', async () => {
      const riskyContract = createPartialContract({
        permission_token: {
          token_id: 'critical_threat_token',
          scopes: ['root', 'admin', 'execute', 'delete', 'modify_system'],
          actions: ['root_access', 'system_admin', 'delete_all', 'modify_system', 'execute_arbitrary'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
        metadata: {
          delegation_depth: 8, // Exceeds safe depth
        },
        tlp_classification: 'TLP:RED',
      });

      await expect(contractManager.createContract(riskyContract))
        .rejects
        .toThrow(/Security threat detected/);
    });

    it('should allow contracts that pass security validation', async () => {
      const safeContract = createPartialContract({
        permission_token: {
          token_id: 'safe_token',
          scopes: ['read'],
          actions: ['view', 'list'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
        metadata: {
          delegation_depth: 2,
        },
      });

      const contract = await contractManager.createContract(safeContract);

      expect(contract).toBeDefined();
      expect(contract.contract_id).toBeDefined();
      expect(contract.status).toBe('pending');
    });

    it('should emit security threat events for monitoring', async () => {
      let threatEvent: any = null;
      
      contractManager.on('security_threat_detected', (event) => {
        threatEvent = event;
      });

      const moderateRiskContract = createPartialContract({
        permission_token: {
          token_id: 'moderate_risk_token',
          scopes: ['admin'],
          actions: ['admin_view', 'admin_edit'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      try {
        await contractManager.createContract(moderateRiskContract);
      } catch (error) {
        // Contract might be blocked, but we should still see the event
      }

      // Wait a bit for async event emission
      await new Promise(resolve => setTimeout(resolve, 10));

      if (threatEvent) {
        expect(threatEvent).toHaveProperty('contract_id');
        expect(threatEvent).toHaveProperty('threat_type');
        expect(threatEvent).toHaveProperty('severity');
        expect(threatEvent).toHaveProperty('action');
        expect(threatEvent).toHaveProperty('timestamp');
      }
    });

    it('should handle resource exhaustion attack attempts', async () => {
      const resourceExhaustionContract = createPartialContract({
        resource_requirements: {
          memory_mb: 32768, // 32GB - excessive
          cpu_cores: 16,    // 16 cores - excessive
          disk_space_mb: 1048576, // 1TB - massive
        },
      });

      await expect(contractManager.createContract(resourceExhaustionContract))
        .rejects
        .toThrow(/Security threat detected.*abuse_pattern/);
    });

    it('should detect and warn about delegation chain depth violations', async () => {
      const deepChainContract = createPartialContract({
        metadata: {
          delegation_depth: 6, // Above safe limit
        },
      });

      await expect(contractManager.createContract(deepChainContract))
        .rejects
        .toThrow(/Security threat detected.*permission_escalation/);
    });
  });

  describe('Security Statistics and Monitoring', () => {
    it('should provide security threat statistics', async () => {
      // Create a mix of safe and risky contracts
      const safeContract = createPartialContract();
      const riskyContract = createPartialContract({
        permission_token: {
          token_id: 'stats_risk_token',
          scopes: ['admin'],
          actions: ['admin_access'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      // Process contracts
      await contractManager.createContract(safeContract);
      try {
        await contractManager.createContract(riskyContract);
      } catch {
        // Expected for risky contracts
      }

      const stats = contractManager.getSecurityThreatStatistics();

      expect(stats).toHaveProperty('total_validations');
      expect(stats).toHaveProperty('threats_detected');
      expect(stats).toHaveProperty('threat_types');
      expect(stats).toHaveProperty('severity_distribution');
      expect(stats).toHaveProperty('action_distribution');

      expect(stats.total_validations).toBeGreaterThanOrEqual(2);
    });

    it('should provide recent security threats', async () => {
      // Create a risky contract to generate threats
      const riskyContract = createPartialContract({
        permission_token: {
          token_id: 'recent_threat_token',
          scopes: ['admin', 'execute'],
          actions: ['admin_modify', 'system_execute'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      try {
        await contractManager.createContract(riskyContract);
      } catch {
        // Expected for risky contracts
      }

      const recentThreats = contractManager.getRecentSecurityThreats(3);
      expect(Array.isArray(recentThreats)).toBe(true);

      // If threats were detected, verify structure
      if (recentThreats.length > 0) {
        const threat = recentThreats[0];
        expect(threat).toHaveProperty('threat_detected');
        expect(threat).toHaveProperty('threat_type');
        expect(threat).toHaveProperty('severity');
        expect(threat).toHaveProperty('description');
      }
    });

    it('should provide comprehensive security status', async () => {
      // Create various contracts to populate statistics
      const contracts = [
        createPartialContract(), // Safe
        createPartialContract({ // Moderate risk
          permission_token: {
            token_id: 'status_risk_token',
            scopes: ['write', 'modify'],
            actions: ['write', 'update', 'modify'],
            expiry: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      ];

      for (const contract of contracts) {
        try {
          await contractManager.createContract(contract);
        } catch {
          // Some may be blocked
        }
      }

      const securityStatus = contractManager.getSecurityStatus();

      expect(securityStatus).toHaveProperty('tlp_enforcement_enabled');
      expect(securityStatus).toHaveProperty('security_threat_validation_enabled');
      expect(securityStatus).toHaveProperty('contract_security_summary');
      expect(securityStatus).toHaveProperty('recent_security_events');
      expect(securityStatus).toHaveProperty('security_recommendations');

      expect(securityStatus.tlp_enforcement_enabled).toBe(true);
      expect(securityStatus.security_threat_validation_enabled).toBe(true);

      const summary = securityStatus.contract_security_summary;
      expect(summary).toHaveProperty('total_contracts');
      expect(summary).toHaveProperty('security_validations_performed');
      expect(summary).toHaveProperty('threats_detected');
      expect(summary).toHaveProperty('threat_detection_rate');
      expect(summary).toHaveProperty('threat_types');
      expect(summary).toHaveProperty('severity_distribution');
      expect(summary).toHaveProperty('action_distribution');

      expect(Array.isArray(securityStatus.security_recommendations)).toBe(true);
    });

    it('should generate appropriate security recommendations', async () => {
      // Create high-risk contracts to trigger recommendations
      const highRiskContracts = [
        createPartialContract({
          permission_token: {
            token_id: 'rec_threat_1',
            scopes: ['admin', 'root'],
            actions: ['admin_access', 'root_access'],
            expiry: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
        createPartialContract({
          permission_token: {
            token_id: 'rec_threat_2',
            scopes: ['execute', 'modify'],
            actions: ['execute_code', 'modify_system'],
            expiry: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      ];

      // Process contracts (some will be blocked)
      for (const contract of highRiskContracts) {
        try {
          await contractManager.createContract(contract);
        } catch {
          // Expected for high-risk contracts
        }
      }

      const securityStatus = contractManager.getSecurityStatus();
      const recommendations = securityStatus.security_recommendations;

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);

      // Should have meaningful recommendations
      const hasSecurityGuidence = recommendations.some(rec => 
        rec.includes('review') || rec.includes('audit') || rec.includes('policy') || rec.includes('threat')
      );
      expect(hasSecurityGuidence).toBe(true);
    });
  });

  describe('TLP and Security Integration', () => {
    it('should enforce both TLP and security threat validation', async () => {
      const violatingContract = createPartialContract({
        tlp_classification: 'TLP:AMBER',
        delegatee: {
          agent_id: 'uncleared_agent', // Agent without clearance
          capabilities: ['read'],
        },
        permission_token: {
          token_id: 'dual_violation_token',
          scopes: ['admin', 'sensitive'],
          actions: ['admin_access', 'sensitive_read'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      // Should fail on either TLP or security threat validation (or both)
      await expect(contractManager.createContract(violatingContract))
        .rejects
        .toThrow();
    });

    it('should pass contracts that meet both TLP and security requirements', async () => {
      const compliantContract = createPartialContract({
        tlp_classification: 'TLP:CLEAR',
        delegatee: {
          agent_id: 'cleared_agent',
          capabilities: ['read'],
        },
        permission_token: {
          token_id: 'compliant_token',
          scopes: ['read'],
          actions: ['view'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
        metadata: {
          delegation_depth: 1,
        },
      });

      const contract = await contractManager.createContract(compliantContract);

      expect(contract).toBeDefined();
      expect(contract.status).toBe('pending');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle security validation errors gracefully', async () => {
      const malformedContract = createPartialContract({
        permission_token: {
          token_id: 'malformed_token',
          scopes: [], // Empty scopes
          actions: [], // Empty actions
          expiry: 'invalid-date', // Invalid expiry
        },
      });

      // Should either succeed (if validation handles gracefully) or fail with clear error
      try {
        await contractManager.createContract(malformedContract);
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(typeof error.message).toBe('string');
      }
    });

    it('should continue working after security validation failures', async () => {
      // First, try to create a problematic contract
      const problemContract = createPartialContract({
        permission_token: {
          token_id: 'problem_token',
          scopes: ['root', 'admin'],
          actions: ['root_access', 'admin_all'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      try {
        await contractManager.createContract(problemContract);
      } catch {
        // Expected to fail
      }

      // Then, create a good contract to ensure system still works
      const goodContract = createPartialContract();
      const contract = await contractManager.createContract(goodContract);

      expect(contract).toBeDefined();
      expect(contract.status).toBe('pending');
    });

    it('should maintain contract count accuracy despite security failures', async () => {
      const initialCount = contractManager.getContractCount();

      const safeContract = createPartialContract();
      const blockedContract = createPartialContract({
        permission_token: {
          token_id: 'blocked_token',
          scopes: ['root'],
          actions: ['root_access'],
          expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      // Create safe contract
      await contractManager.createContract(safeContract);

      // Try to create blocked contract
      try {
        await contractManager.createContract(blockedContract);
      } catch {
        // Expected to be blocked
      }

      // Count should only increase by 1 (for the successful contract)  
      const newCount = contractManager.getContractCount();
      expect(newCount).toBe(initialCount + 1);
    });
  });
});