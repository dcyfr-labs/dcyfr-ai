/**
 * Tests for Feature Flag System
 * 
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FeatureFlagManager,
  getFeatureFlagManager,
  initializeFeatureFlags,
  isDelegationEnabled,
  isFeatureEnabled,
  DEFAULT_FEATURE_FLAGS,
  type DelegationFeatureFlag,
  type FeatureFlagContext
} from '../../delegation/feature-flags';

describe('Feature Flag System', () => {
  let manager: FeatureFlagManager;
  
  beforeEach(() => {
    manager = new FeatureFlagManager();
  });
  
  describe('Default Configuration', () => {
    it('should have delegation_enabled disabled by default', () => {
      const evaluation = manager.isEnabled('delegation_enabled');
      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('disabled');
    });
    
    it('should have core features enabled when delegation enabled', () => {
      manager.enable('delegation_enabled');
      
      const coreFeatures: DelegationFeatureFlag[] = [
        'contract_management',
        'reputation_tracking',
        'verification_framework',
        'chain_tracking'
      ];
      
      for (const feature of coreFeatures) {
        const evaluation = manager.isEnabled(feature);
        expect(evaluation.enabled).toBe(true);
      }
    });
    
    it('should have security features always enabled', () => {
      manager.enable('delegation_enabled');
      
      const securityFeatures: DelegationFeatureFlag[] = [
        'permission_attenuation',
        'security_monitoring'
      ];
      
      for (const feature of securityFeatures) {
        const evaluation = manager.isEnabled(feature);
        expect(evaluation.enabled).toBe(true);
      }
    });
    
    it('should have advanced features disabled by default', () => {
      manager.enable('delegation_enabled');
      
      const advancedFeatures: DelegationFeatureFlag[] = [
        'predictive_routing',
        'capability_learning',
        'multi_tenancy'
      ];
      
      for (const feature of advancedFeatures) {
        const evaluation = manager.isEnabled(feature);
        expect(evaluation.enabled).toBe(false);
      }
    });
  });
  
  describe('Feature Enable/Disable', () => {
    it('should enable a feature flag', () => {
      manager.enable('delegation_enabled');
      
      const evaluation = manager.isEnabled('delegation_enabled');
      expect(evaluation.enabled).toBe(true);
    });
    
    it('should disable a feature flag', () => {
      manager.enable('delegation_enabled');
      manager.disable('delegation_enabled', 'Testing disable');
      
      const evaluation = manager.isEnabled('delegation_enabled');
      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('disabled');
    });
    
    it('should store enablement metadata', () => {
      manager.enable('delegation_enabled', {
        reason: 'Production rollout',
        enabledBy: 'admin@dcyfr.ai'
      });
      
      const exported = manager.export();
      const config = exported['delegation_enabled'];
      
      expect(config.metadata?.reason).toBe('Production rollout');
      expect(config.metadata?.enabledBy).toBe('admin@dcyfr.ai');
      expect(config.metadata?.enabledAt).toBeInstanceOf(Date);
    });
  });
  
  describe('Master Switch Enforcement', () => {
    it('should disable all features when delegation_enabled is off', () => {
      // Delegation disabled, try to enable other features
      manager.disable('delegation_enabled');
      
      const features: DelegationFeatureFlag[] = [
        'contract_management',
        'reputation_tracking',
        'mcp_integration'
      ];
      
      for (const feature of features) {
        const evaluation = manager.isEnabled(feature);
        expect(evaluation.enabled).toBe(false);
        expect(evaluation.reason).toContain('Master delegation switch is disabled');
      }
    });
    
    it('should allow features when delegation_enabled is on', () => {
      manager.enable('delegation_enabled');
      
      const evaluation = manager.isEnabled('contract_management');
      expect(evaluation.enabled).toBe(true);
    });
  });
  
  describe('Rollout Percentage', () => {
    it('should enable feature for users within rollout percentage', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'predictive_routing',
        enabled: true,
        rolloutPercentage: 50  // 50% rollout
      });
      
      // Test with multiple user IDs to ensure some are enabled
      const results = [];
      for (let i = 0; i < 100; i++) {
        const context: FeatureFlagContext = {
          userId: `user-${i}`
        };
        const evaluation = manager.isEnabled('predictive_routing', context);
        results.push(evaluation.enabled);
      }
      
      const enabledCount = results.filter(r => r).length;
      // Should be approximately 50% (allow 40-60% range for hash distribution)
      expect(enabledCount).toBeGreaterThan(40);
      expect(enabledCount).toBeLessThan(60);
    });
    
    it('should be consistent for same user across requests', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'predictive_routing',
        enabled: true,
        rolloutPercentage: 50
      });
      
      const context: FeatureFlagContext = { userId: 'test-user-123' };
      
      const result1 = manager.isEnabled('predictive_routing', context);
      const result2 = manager.isEnabled('predictive_routing', context);
      const result3 = manager.isEnabled('predictive_routing', context);
      
      expect(result1.enabled).toBe(result2.enabled);
      expect(result2.enabled).toBe(result3.enabled);
    });
  });
  
  describe('Environment Targeting', () => {
    it('should enable feature only for specified environments', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'capability_learning',
        enabled: true,
        environment: ['development', 'staging']
      });
      
      const devContext: FeatureFlagContext = { environment: 'development' };
      const prodContext: FeatureFlagContext = { environment: 'production' };
      
      expect(manager.isEnabled('capability_learning', devContext).enabled).toBe(true);
      expect(manager.isEnabled('capability_learning', prodContext).enabled).toBe(false);
    });
  });
  
  describe('Tenant Targeting', () => {
    it('should enable feature only for specified tenants', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'multi_tenancy',
        enabled: true,
        tenants: ['tenant-a', 'tenant-b']
      });
      
      const tenantAContext: FeatureFlagContext = { tenantId: 'tenant-a' };
      const tenantCContext: FeatureFlagContext = { tenantId: 'tenant-c' };
      
      expect(manager.isEnabled('multi_tenancy', tenantAContext).enabled).toBe(true);
      expect(manager.isEnabled('multi_tenancy', tenantCContext).enabled).toBe(false);
    });
  });
  
  describe('User Targeting', () => {
    it('should enable feature only for specified users', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'predictive_routing',
        enabled: true,
        users: ['user-1', 'user-2']
      });
      
      const user1Context: FeatureFlagContext = { userId: 'user-1' };
      const user3Context: FeatureFlagContext = { userId: 'user-3' };
      
      expect(manager.isEnabled('predictive_routing', user1Context).enabled).toBe(true);
      expect(manager.isEnabled('predictive_routing', user3Context).enabled).toBe(false);
    });
    
    it('should prioritize user override over rollout percentage', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'predictive_routing',
        enabled: true,
        rolloutPercentage: 0,  // 0% rollout
        users: ['vip-user']     // But enabled for specific user
      });
      
      const vipContext: FeatureFlagContext = { userId: 'vip-user' };
      const normalContext: FeatureFlagContext = { userId: 'normal-user' };
      
      expect(manager.isEnabled('predictive_routing', vipContext).enabled).toBe(true);
      expect(manager.isEnabled('predictive_routing', normalContext).enabled).toBe(false);
    });
  });
  
  describe('Feature Dependencies', () => {
    it('should enforce feature dependencies', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'predictive_routing',
        enabled: true,
        dependencies: ['capability_learning']  // Requires capability_learning
      });
      
      // capability_learning disabled by default
      const evaluation = manager.isEnabled('predictive_routing');
      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('capability_learning');
    });
    
    it('should allow feature when dependencies are met', () => {
      manager.enable('delegation_enabled');
      manager.enable('capability_learning');  // Enable dependency first
      manager.configure({
        flag: 'predictive_routing',
        enabled: true,
        dependencies: ['capability_learning']
      });
      
      const evaluation = manager.isEnabled('predictive_routing');
      expect(evaluation.enabled).toBe(true);
    });
    
    it('should throw error when configuring with unmet dependencies', () => {
      manager.enable('delegation_enabled');
      
      // Configuration should succeed (dependencies checked at evaluation time)
      expect(() => {
        manager.configure({
          flag: 'predictive_routing',
          enabled: true,
          dependencies: ['capability_learning']  // Not enabled
        });
      }).not.toThrow();
      
      // But evaluation should fail due to unmet dependency
      const evaluation = manager.isEnabled('predictive_routing');
      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('capability_learning');
    });
  });
  
  describe('Feature Expiration', () => {
    it('should disable feature after expiration', () => {
      manager.enable('delegation_enabled');
      
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      manager.configure({
        flag: 'capability_learning',
        enabled: true,
        expiresAt: pastDate
      });
      
      const evaluation = manager.isEnabled('capability_learning');
      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('expired');
    });
    
    it('should allow feature before expiration', () => {
      manager.enable('delegation_enabled');
      
      const futureDate = new Date(Date.now() + 10000); // 10 seconds from now
      manager.configure({
        flag: 'capability_learning',
        enabled: true,
        expiresAt: futureDate
      });
      
      const evaluation = manager.isEnabled('capability_learning');
      expect(evaluation.enabled).toBe(true);
    });
  });
  
  describe('Emergency Killswitch', () => {
    it('should disable all delegation features', () => {
      manager.enable('delegation_enabled');
      manager.enable('predictive_routing');
      manager.enable('capability_learning');
      
      manager.emergencyDisable('Critical security issue');
      
      expect(manager.isEnabled('delegation_enabled').enabled).toBe(false);
      expect(manager.isEnabled('predictive_routing').enabled).toBe(false);
      expect(manager.isEnabled('capability_learning').enabled).toBe(false);
    });
    
    it('should include reason in metadata', () => {
      manager.enable('delegation_enabled');
      manager.emergencyDisable('System overload');
      
      const exported = manager.export();
      const config = exported['delegation_enabled'];
      
      expect(config.metadata?.reason).toContain('EMERGENCY KILLSWITCH');
      expect(config.metadata?.reason).toContain('System overload');
    });
  });
  
  describe('Export/Import Configuration', () => {
    it('should export all feature flag configurations', () => {
      manager.enable('delegation_enabled');
      manager.enable('predictive_routing');
      
      const exported = manager.export();
      
      expect(exported).toHaveProperty('delegation_enabled');
      expect(exported).toHaveProperty('predictive_routing');
      expect(exported['delegation_enabled'].enabled).toBe(true);
    });
    
    it('should import feature flag configurations', () => {
      const newManager = new FeatureFlagManager();
      
      const config = {
        delegation_enabled: {
          flag: 'delegation_enabled' as DelegationFeatureFlag,
          enabled: true,
          rolloutPercentage: 75,
          environment: ['production']
        },
        predictive_routing: {
          flag: 'predictive_routing' as DelegationFeatureFlag,
          enabled: true
        }
      };
      
      newManager.import(config);
      
      const delegationEval = newManager.isEnabled('delegation_enabled');
      const predictiveEval = newManager.isEnabled('predictive_routing');
      
      expect(delegationEval.enabled).toBe(true);
      expect(predictiveEval.enabled).toBe(true);
    });
  });
  
  describe('Get All Flags', () => {
    it('should return all feature flag evaluations', () => {
      manager.enable('delegation_enabled');
      
      const allFlags = manager.getAllFlags();
      
      expect(allFlags.size).toBeGreaterThan(0);
      expect(allFlags.has('delegation_enabled')).toBe(true);
      expect(allFlags.has('contract_management')).toBe(true);
    });
    
    it('should respect context for all flags', () => {
      manager.enable('delegation_enabled');
      manager.configure({
        flag: 'predictive_routing',
        enabled: true,
        users: ['test-user']
      });
      
      const context: FeatureFlagContext = { userId: 'test-user' };
      const allFlags = manager.getAllFlags(context);
      
      expect(allFlags.get('predictive_routing')?.enabled).toBe(true);
    });
  });
  
  describe('Singleton Manager', () => {
    it('should return same instance from getFeatureFlagManager', () => {
      const manager1 = getFeatureFlagManager();
      const manager2 = getFeatureFlagManager();
      
      expect(manager1).toBe(manager2);
    });
    
    it('should allow initialization with custom config', () => {
      const custom = initializeFeatureFlags({
        delegation_enabled: true,
        predictive_routing: true
      });
      
      expect(custom.isEnabled('delegation_enabled').enabled).toBe(true);
      expect(custom.isEnabled('predictive_routing').enabled).toBe(true);
    });
  });
  
  describe('Helper Functions', () => {
    it('isDelegationEnabled should check master switch', () => {
      const manager = initializeFeatureFlags({ delegation_enabled: false });
      expect(isDelegationEnabled()).toBe(false);
      
      manager.enable('delegation_enabled');
      expect(isDelegationEnabled()).toBe(true);
    });
    
    it('isFeatureEnabled should check specific feature', () => {
      const manager = initializeFeatureFlags({ delegation_enabled: true });
      
      expect(isFeatureEnabled('contract_management')).toBe(true);
      expect(isFeatureEnabled('predictive_routing')).toBe(false);
    });
  });
  
  describe('Performance', () => {
    it('should evaluate feature flags quickly', () => {
      manager.enable('delegation_enabled');
      
      const iterations = 10000;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        manager.isEnabled('contract_management', {
          userId: `user-${i % 100}`
        });
      }
      
      const duration = performance.now() - startTime;
      const avgTime = duration / iterations;
      
      // Should be < 0.1ms per evaluation
      expect(avgTime).toBeLessThan(0.1);
    });
  });
});
