/**
 * Tests for DelegationFeatureFlagsManager
 * 
 * @module delegation/__tests__/feature-flags.test.ts
 * @version 1.0.0
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DelegationFeatureFlagsManager,
  FEATURE_FLAG_PRESETS,
  getFeatureFlagsManager,
  setFeatureFlagsManager,
  resetFeatureFlagsManager,
  type DelegationFeatureFlags,
  type FeatureFlagOverride,
} from '../feature-flags';

describe('Delegation Feature Flags', () => {
  describe('DelegationFeatureFlagsManager', () => {
    let manager: DelegationFeatureFlagsManager;
    
    beforeEach(() => {
      manager = new DelegationFeatureFlagsManager();
    });
    
    describe('Initialization', () => {
      it('should initialize with all features disabled by default', () => {
        const flags = manager.getAllFlags();
        
        expect(flags.delegation_contracts_enabled).toBe(false);
        expect(flags.reputation_tracking_enabled).toBe(false);
        expect(flags.permission_attenuation_enabled).toBe(false);
        expect(flags.tlp_enforcement_enabled).toBe(false);
        expect(flags.firebreak_enforcement_enabled).toBe(false);
        expect(flags.threat_model_enabled).toBe(false);
        expect(flags.delegation_rollout_percentage).toBe(0);
        expect(flags.telemetry_enabled).toBe(true);  // Always enabled
        expect(flags.fallback_to_manual_enabled).toBe(true);  // Safety
      });
      
      it('should accept initial flag overrides', () => {
        const customManager = new DelegationFeatureFlagsManager({
          delegation_contracts_enabled: true,
          reputation_tracking_enabled: true,
        });
        
        const flags = customManager.getAllFlags();
        expect(flags.delegation_contracts_enabled).toBe(true);
        expect(flags.reputation_tracking_enabled).toBe(true);
        expect(flags.permission_attenuation_enabled).toBe(false);  // Still default
      });
    });
    
    describe('Flag Updates', () => {
      it('should update individual flags', () => {
        manager.updateFlag('delegation_contracts_enabled', true, 'admin', 'Enable delegation');
        
        const flags = manager.getAllFlags();
        expect(flags.delegation_contracts_enabled).toBe(true);
      });
      
      it('should create audit log entries for flag updates', () => {
        manager.updateFlag('reputation_tracking_enabled', true, 'system', 'Auto-enable');
        
        const auditLog = manager.getAuditLog();
        expect(auditLog.length).toBeGreaterThan(0);
        
        const latestEvent = auditLog[0];  // Most recent first
        expect(latestEvent.type).toBe('flag_enabled');
        expect(latestEvent.flag_name).toBe('reputation_tracking_enabled');
        expect(latestEvent.new_value).toBe(true);
        expect(latestEvent.changed_by).toBe('system');
      });
      
      it('should track previous value in audit log', () => {
        manager.updateFlag('delegation_rollout_percentage', 10, 'admin', 'Pilot rollout');
        manager.updateFlag('delegation_rollout_percentage', 50, 'admin', 'Broaden rollout');
        
        const auditLog = manager.getAuditLog();
        const latestEvent = auditLog[0];
        
        expect(latestEvent.previous_value).toBe(10);
        expect(latestEvent.new_value).toBe(50);
      });
    });
    
    describe('Overrides', () => {
      it('should apply agent-specific overrides', () => {
        const override: FeatureFlagOverride = {
          agent_id: 'test-agent',
          overrides: {
            delegation_contracts_enabled: true,
            reputation_tracking_enabled: true,
          },
          priority: 100,
          reason: 'Testing delegation with specific agent',
        };
        
        manager.addOverride('test-override', override);
        
        const flagsForAgent = manager.getFlags('test-agent');
        expect(flagsForAgent.delegation_contracts_enabled).toBe(true);
        expect(flagsForAgent.reputation_tracking_enabled).toBe(true);
        
        const flagsForOtherAgent = manager.getFlags('other-agent');
        expect(flagsForOtherAgent.delegation_contracts_enabled).toBe(false);
      });
      
      it('should apply context pattern overrides', () => {
        const override: FeatureFlagOverride = {
          context_pattern: 'openspec:.*',
          overrides: {
            delegation_contracts_enabled: true,
          },
          priority: 100,
          reason: 'Enable delegation for OpenSpec tasks',
        };
        
        manager.addOverride('openspec-override', override);
        
        const flagsForOpenSpec = manager.getFlags(undefined, 'openspec:task-123');
        expect(flagsForOpenSpec.delegation_contracts_enabled).toBe(true);
        
        const flagsForMCP = manager.getFlags(undefined, 'mcp:tool-456');
        expect(flagsForMCP.delegation_contracts_enabled).toBe(false);
      });
      
      it('should respect override priority', () => {
        const lowPriorityOverride: FeatureFlagOverride = {
          context_pattern: '.*',
          overrides: {
            delegation_rollout_percentage: 10,
          },
          priority: 10,
          reason: 'Low priority override',
        };
        
        const highPriorityOverride: FeatureFlagOverride = {
          context_pattern: '.*',
          overrides: {
            delegation_rollout_percentage: 90,
          },
          priority: 100,
          reason: 'High priority override',
        };
        
        manager.addOverride('low-priority', lowPriorityOverride);
        manager.addOverride('high-priority', highPriorityOverride);
        
        const flags = manager.getFlags(undefined, 'test-context');
        expect(flags.delegation_rollout_percentage).toBe(90);  // Higher priority wins
      });
      
      it('should ignore expired overrides', () => {
        const expiredOverride: FeatureFlagOverride = {
          agent_id: 'test-agent',
          overrides: {
            delegation_contracts_enabled: true,
          },
          priority: 100,
          expires_at: new Date(Date.now() - 1000),  // Expired 1 second ago
          reason: 'Expired test override',
        };
        
        manager.addOverride('expired', expiredOverride);
        
        const flags = manager.getFlags('test-agent');
        expect(flags.delegation_contracts_enabled).toBe(false);  // Override ignored
      });
      
      it('should remove overrides', () => {
        const override: FeatureFlagOverride = {
          agent_id: 'test-agent',
          overrides: {
            delegation_contracts_enabled: true,
          },
          priority: 100,
          reason: 'Test override',
        };
        
        manager.addOverride('test', override);
        expect(manager.getFlags('test-agent').delegation_contracts_enabled).toBe(true);
        
        const removed = manager.removeOverride('test');
        expect(removed).toBe(true);
        expect(manager.getFlags('test-agent').delegation_contracts_enabled).toBe(false);
      });
      
      it('should cleanup expired overrides', () => {
        const validOverride: FeatureFlagOverride = {
          agent_id: 'agent-1',
          overrides: { delegation_contracts_enabled: true },
          priority: 100,
          expires_at: new Date(Date.now() + 10000),  // Valid for 10 seconds
          reason: 'Valid override',
        };
        
        const expiredOverride: FeatureFlagOverride = {
          agent_id: 'agent-2',
          overrides: { delegation_contracts_enabled: true },
          priority: 100,
          expires_at: new Date(Date.now() - 1000),  // Expired
          reason: 'Expired override',
        };
        
        manager.addOverride('valid', validOverride);
        manager.addOverride('expired', expiredOverride);
        
        const cleaned = manager.cleanupExpiredOverrides();
        expect(cleaned).toBe(1);
        expect(manager.getOverrides().length).toBe(1);
      });
    });
    
    describe('Rollout Percentage', () => {
      beforeEach(() => {
        manager.updateFlag('delegation_contracts_enabled', true, 'system', 'Enable for testing');
      });
      
      it('should include agents within rollout percentage', () => {
        manager.updateFlag('delegation_rollout_percentage', 100, 'system', 'Full rollout');
        
        // All agents should be in rollout
        expect(manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-1')).toBe(true);
        expect(manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-2')).toBe(true);
        expect(manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-3')).toBe(true);
      });
      
      it('should exclude agents outside rollout percentage', () => {
        manager.updateFlag('delegation_rollout_percentage', 0, 'system', 'No rollout');
        
        // No agents should be in rollout (except possibly due to hash collision)
        const agent1Enabled = manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-1');
        const agent2Enabled = manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-2');
        const agent3Enabled = manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-3');
        
        // At 0%, all should be false
        expect(agent1Enabled).toBe(false);
        expect(agent2Enabled).toBe(false);
        expect(agent3Enabled).toBe(false);
      });
      
      it('should provide consistent bucketing for same agent', () => {
        manager.updateFlag('delegation_rollout_percentage', 50, 'system', 'Half rollout');
        
        const agent1FirstCheck = manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-1');
        const agent1SecondCheck = manager.isFeatureEnabled('delegation_contracts_enabled', 'agent-1');
        
        expect(agent1FirstCheck).toBe(agent1SecondCheck);  // Consistent
      });
    });
    
    describe('A/B Testing', () => {
      it('should assign A/B variants', () => {
        const assignment = manager.assignABVariant('user-1');
        
        expect(assignment.variant).toMatch(/^(control|treatment)$/);
        expect(assignment.id).toBe('user-1');
        expect(assignment.is_sticky).toBe(true);
      });
      
      it('should maintain sticky assignments', () => {
        const firstAssignment = manager.assignABVariant('user-1');
        const secondAssignment = manager.assignABVariant('user-1');
        
        expect(secondAssignment.variant).toBe(firstAssignment.variant);
      });
      
      it('should allow non-sticky assignments to change', () => {
        // Non-sticky assignment
        const firstAssignment = manager.assignABVariant('user-1', undefined, false);
        
        // Force different variant
        const secondAssignment = manager.assignABVariant('user-1', 
          firstAssignment.variant === 'control' ? 'treatment' : 'control', 
          false
        );
        
        expect(secondAssignment.variant).not.toBe(firstAssignment.variant);
      });
      
      it('should include A/B variant in flags', () => {
        manager.assignABVariant('user-1', 'treatment');
        
        const flags = manager.getFlags('user-1');
        expect(flags.ab_testing_variant).toBe('treatment');
      });
      
      it('should balanced distribution for A/B assignment', () => {
        const assignments: Array<'control' | 'treatment'> = [];
        
        for (let i = 0; i < 100; i++) {
          const assignment = manager.assignABVariant(`user-${i}`);
          assignments.push(assignment.variant);
        }
        
        const controlCount = assignments.filter(v => v === 'control').length;
        const treatmentCount = assignments.filter(v => v === 'treatment').length;
        
        // Should be roughly 50/50 (allow some variance)
        expect(controlCount).toBeGreaterThan(30);  // At least 30% control
        expect(controlCount).toBeLessThan(70);     // At most 70% control
        expect(treatmentCount).toBeGreaterThan(30);
        expect(treatmentCount).toBeLessThan(70);
      });
    });
    
    describe('Statistics', () => {
      it('should provide statistics', () => {
        manager.updateFlag('delegation_contracts_enabled', true, 'system', 'Enable');
        manager.updateFlag('reputation_tracking_enabled', true, 'system', 'Enable');
        manager.addOverride('test-override', {
          agent_id: 'test-agent',
          overrides: { permission_attenuation_enabled: true },
          priority: 100,
          reason: 'Test',
        });
        manager.assignABVariant('user-1');
        
        const stats = manager.getStatistics();
        
        expect(stats.total_flags).toBeGreaterThan(0);
        expect(stats.enabled_flags).toBeGreaterThanOrEqual(2);
        expect(stats.active_overrides).toBe(1);
        expect(stats.ab_assignments).toBe(1);
        expect(stats.audit_events).toBeGreaterThan(0);
      });
    });
    
    describe('Export/Import', () => {
      it('should export configuration', () => {
        manager.updateFlag('delegation_contracts_enabled', true, 'system', 'Enable');
        manager.addOverride('test', {
          agent_id: 'test-agent',
          overrides: { reputation_tracking_enabled: true },
          priority: 100,
          reason: 'Test',
        });
        manager.assignABVariant('user-1', 'treatment');
        
        const exported = manager.exportConfig();
        
        expect(exported.flags.delegation_contracts_enabled).toBe(true);
        expect(exported.overrides).toHaveLength(1);
        expect(exported.ab_assignments).toHaveLength(1);
      });
      
      it('should import configuration', () => {
        const exportedConfig = {
          flags: {
            delegation_contracts_enabled: true,
            reputation_tracking_enabled: true,
          },
          overrides: [
            ['test-override', {
              agent_id: 'test-agent',
              overrides: { permission_attenuation_enabled: true },
              priority: 100,
              reason: 'Imported',
            }] as [string, FeatureFlagOverride],
          ],
          ab_assignments: [
            ['user-1', {
              id: 'user-1',
              variant: 'treatment' as const,
              assigned_at: new Date(),
              is_sticky: true,
            }] as [string, { id: string; variant: 'treatment'; assigned_at: Date; is_sticky: boolean }],
          ],
        };
        
        manager.importConfig(exportedConfig);
        
        const flags = manager.getAllFlags();
        expect(flags.delegation_contracts_enabled).toBe(true);
        expect(flags.reputation_tracking_enabled).toBe(true);
        
        const overrides = manager.getOverrides();
        expect(overrides).toHaveLength(1);
        
        const variant = manager.getABVariant('user-1');
        expect(variant).toBe('treatment');
      });
    });
    
    describe('Audit Log', () => {
      it('should maintain audit log', () => {
        manager.updateFlag('delegation_contracts_enabled', true, 'admin', 'Enable delegation');
        manager.updateFlag('reputation_tracking_enabled', true, 'admin', 'Enable reputation');
        
        const log = manager.getAuditLog();
        
        expect(log.length).toBeGreaterThanOrEqual(2);
        expect(log[0].type).toBe('flag_enabled');  // Most recent first
      });
      
      it('should limit audit log size', () => {
        // Add 1100 events (exceeds limit of 1000)
        for (let i = 0; i < 1100; i++) {
          manager.updateFlag('delegation_rollout_percentage', i, 'system', `Update ${i}`);
        }
        
        const log = manager.getAuditLog();
        expect(log.length).toBeLessThanOrEqual(1000);
      });
      
      it('should support audit log limiting', () => {
        manager.updateFlag('delegation_contracts_enabled', true, 'system', 'Event 1');
        manager.updateFlag('reputation_tracking_enabled', true, 'system', 'Event 2');
        manager.updateFlag('permission_attenuation_enabled', true, 'system', 'Event 3');
        
        const limitedLog = manager.getAuditLog(2);
        expect(limitedLog.length).toBe(2);
        expect(limitedLog[0].reason).toBe('Event 3');  // Most recent
      });
    });
  });
  
  describe('Global Feature Flags Manager', () => {
    it('should provide global singleton', () => {
      const manager1 = getFeatureFlagsManager();
      const manager2 = getFeatureFlagsManager();
      
      expect(manager1).toBe(manager2);  // Same instance
    });
    
    it('should allow setting custom manager', () => {
      const customManager = new DelegationFeatureFlagsManager({
        delegation_contracts_enabled: true,
      });
      
      setFeatureFlagsManager(customManager);
      
      const retrieved = getFeatureFlagsManager();
      expect(retrieved.getAllFlags().delegation_contracts_enabled).toBe(true);
      
      // Cleanup
      resetFeatureFlagsManager();
    });
    
    it('should reset global manager', () => {
      const manager1 = getFeatureFlagsManager();
      manager1.updateFlag('delegation_contracts_enabled', true, 'test', 'Test');
      
      resetFeatureFlagsManager();
      
      const manager2 = getFeatureFlagsManager();
      expect(manager2.getAllFlags().delegation_contracts_enabled).toBe(false);  // Reset
    });
  });
  
  describe('Feature Flag Presets', () => {
    it('should provide DISABLED preset', () => {
      const manager = new DelegationFeatureFlagsManager(FEATURE_FLAG_PRESETS.DISABLED);
      const flags = manager.getAllFlags();
      
      expect(flags.delegation_contracts_enabled).toBe(false);
      expect(flags.delegation_rollout_percentage).toBe(0);
      expect(flags.telemetry_enabled).toBe(true);  // Always enabled
      expect(flags.fallback_to_manual_enabled).toBe(true);  // Safety
    });
    
    it('should provide PILOT preset', () => {
      const manager = new DelegationFeatureFlagsManager(FEATURE_FLAG_PRESETS.PILOT);
      const flags = manager.getAllFlags();
      
      expect(flags.delegation_contracts_enabled).toBe(true);
      expect(flags.reputation_tracking_enabled).toBe(true);
      expect(flags.tlp_enforcement_enabled).toBe(true);
      expect(flags.firebreak_enforcement_enabled).toBe(true);
      expect(flags.delegation_rollout_percentage).toBe(10);
    });
    
    it('should provide BROAD_ROLLOUT preset', () => {
      const manager = new DelegationFeatureFlagsManager(FEATURE_FLAG_PRESETS.BROAD_ROLLOUT);
      const flags = manager.getAllFlags();
      
      expect(flags.delegation_rollout_percentage).toBe(50);
    });
    
    it('should provide PRODUCTION preset', () => {
      const manager = new DelegationFeatureFlagsManager(FEATURE_FLAG_PRESETS.PRODUCTION);
      const flags = manager.getAllFlags();
      
      expect(flags.delegation_contracts_enabled).toBe(true);
      expect(flags.delegation_rollout_percentage).toBe(100);
      expect(flags.verification_enabled).toBe(true);
    });
    
    it('should provide AB_TESTING preset', () => {
      const manager = new DelegationFeatureFlagsManager(FEATURE_FLAG_PRESETS.AB_TESTING);
      const flags = manager.getAllFlags();
      
      expect(flags.ab_testing_variant).toBe('treatment');
      expect(flags.delegation_rollout_percentage).toBe(100);
    });
  });
});
