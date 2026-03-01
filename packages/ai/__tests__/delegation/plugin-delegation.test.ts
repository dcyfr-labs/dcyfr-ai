import { describe, it, expect } from 'vitest';
import type { PluginSecurityMetadata } from '../../src/types/delegation-contracts';
import type { ReputationTaskOutcome } from '../../reputation/reputation-engine';
import { PLUGIN_PERMISSION_SCOPES, PLUGIN_SCOPE_HIERARCHY } from '../../types/permission-tokens';

describe('Plugin Delegation Integration', () => {
  describe('PluginSecurityMetadata', () => {
    it('should define complete plugin security metadata', () => {
      const metadata: PluginSecurityMetadata = {
        plugin_id: 'dcyfr/secret-detector',
        plugin_version: '1.2.0',
        trust_score: 98,
        scan_result: 'pass',
        sandbox_type: 'docker',
        sbom_hash: 'sha256:abc123def456',
        certification_tier: 'gold',
        tlp_classification: 'CLEAR',
        last_audit_date: '2026-02-10',
        required_permissions: ['plugin.execute', 'plugin.network'],
      };

      expect(metadata.plugin_id).toBe('dcyfr/secret-detector');
      expect(metadata.plugin_version).toBe('1.2.0');
      expect(metadata.trust_score).toBe(98);
      expect(metadata.scan_result).toBe('pass');
      expect(metadata.sandbox_type).toBe('docker');
      expect(metadata.certification_tier).toBe('gold');
      expect(metadata.tlp_classification).toBe('CLEAR');
    });

    it('should allow minimal plugin security metadata', () => {
      const metadata: PluginSecurityMetadata = {
        plugin_id: 'community/linter',
        plugin_version: '0.1.0',
        trust_score: 42,
        scan_result: 'pending',
        sandbox_type: 'none',
        tlp_classification: 'GREEN',
      };

      expect(metadata.plugin_id).toBe('community/linter');
      expect(metadata.sbom_hash).toBeUndefined();
      expect(metadata.certification_tier).toBeUndefined();
      expect(metadata.last_audit_date).toBeUndefined();
      expect(metadata.required_permissions).toBeUndefined();
    });

    it('should support all scan result types', () => {
      const results: Array<PluginSecurityMetadata['scan_result']> = ['pass', 'fail', 'warning', 'pending'];
      
      results.forEach((result) => {
        const metadata: PluginSecurityMetadata = {
          plugin_id: 'test/plugin',
          plugin_version: '1.0.0',
          trust_score: 50,
          scan_result: result,
          sandbox_type: 'docker',
          tlp_classification: 'CLEAR',
        };
        expect(metadata.scan_result).toBe(result);
      });
    });

    it('should support all sandbox types', () => {
      const sandboxTypes: Array<PluginSecurityMetadata['sandbox_type']> = ['docker', 'gvisor', 'wasm', 'none'];
      
      sandboxTypes.forEach((type) => {
        const metadata: PluginSecurityMetadata = {
          plugin_id: 'test/plugin',
          plugin_version: '1.0.0',
          trust_score: 75,
          scan_result: 'pass',
          sandbox_type: type,
          tlp_classification: 'CLEAR',
        };
        expect(metadata.sandbox_type).toBe(type);
      });
    });

    it('should support all certification tiers', () => {
      const tiers: Array<NonNullable<PluginSecurityMetadata['certification_tier']>> = ['bronze', 'silver', 'gold'];
      
      tiers.forEach((tier) => {
        const metadata: PluginSecurityMetadata = {
          plugin_id: 'test/plugin',
          plugin_version: '1.0.0',
          trust_score: 90,
          scan_result: 'pass',
          sandbox_type: 'docker',
          tlp_classification: 'CLEAR',
          certification_tier: tier,
        };
        expect(metadata.certification_tier).toBe(tier);
      });
    });

    it('should support all TLP classifications', () => {
      const tlpLevels: Array<PluginSecurityMetadata['tlp_classification']> = ['CLEAR', 'GREEN', 'AMBER', 'RED'];
      
      tlpLevels.forEach((level) => {
        const metadata: PluginSecurityMetadata = {
          plugin_id: 'test/plugin',
          plugin_version: '1.0.0',
          trust_score: 80,
          scan_result: 'pass',
          sandbox_type: 'docker',
          tlp_classification: level,
        };
        expect(metadata.tlp_classification).toBe(level);
      });
    });
  });

  describe('Plugin Permission Scopes', () => {
    it('should define all plugin permission scope constants', () => {
      expect(PLUGIN_PERMISSION_SCOPES.INSTALL).toBe('plugin.install');
      expect(PLUGIN_PERMISSION_SCOPES.EXECUTE).toBe('plugin.execute');
      expect(PLUGIN_PERMISSION_SCOPES.NETWORK).toBe('plugin.network');
      expect(PLUGIN_PERMISSION_SCOPES.FILESYSTEM).toBe('plugin.filesystem');
      expect(PLUGIN_PERMISSION_SCOPES.MANAGE).toBe('plugin.manage');
      expect(PLUGIN_PERMISSION_SCOPES.ALL).toBe('plugin');
    });

    it('should define plugin scope hierarchy', () => {
      expect(PLUGIN_SCOPE_HIERARCHY).toBeDefined();
      expect(PLUGIN_SCOPE_HIERARCHY.length).toBe(6);
    });

    it('should have parent scope that encompasses all child scopes', () => {
      const parentScope = PLUGIN_SCOPE_HIERARCHY.find(
        (h) => h.scope === PLUGIN_PERMISSION_SCOPES.ALL
      );
      
      expect(parentScope).toBeDefined();
      expect(parentScope?.children).toContain(PLUGIN_PERMISSION_SCOPES.INSTALL);
      expect(parentScope?.children).toContain(PLUGIN_PERMISSION_SCOPES.EXECUTE);
      expect(parentScope?.children).toContain(PLUGIN_PERMISSION_SCOPES.NETWORK);
      expect(parentScope?.children).toContain(PLUGIN_PERMISSION_SCOPES.FILESYSTEM);
      expect(parentScope?.children).toContain(PLUGIN_PERMISSION_SCOPES.MANAGE);
    });

    it('should define child scopes with parent reference', () => {
      const childScopes = PLUGIN_SCOPE_HIERARCHY.filter(
        (h) => h.parent === PLUGIN_PERMISSION_SCOPES.ALL
      );
      
      expect(childScopes.length).toBe(5);
      
      const childScopeNames = childScopes.map((s) => s.scope);
      expect(childScopeNames).toContain(PLUGIN_PERMISSION_SCOPES.INSTALL);
      expect(childScopeNames).toContain(PLUGIN_PERMISSION_SCOPES.EXECUTE);
      expect(childScopeNames).toContain(PLUGIN_PERMISSION_SCOPES.NETWORK);
      expect(childScopeNames).toContain(PLUGIN_PERMISSION_SCOPES.FILESYSTEM);
      expect(childScopeNames).toContain(PLUGIN_PERMISSION_SCOPES.MANAGE);
    });

    it('should have descriptions for all scopes', () => {
      PLUGIN_SCOPE_HIERARCHY.forEach((entry) => {
        expect(entry.description).toBeDefined();
        expect(entry.description!.length).toBeGreaterThan(0);
      });
    });

    it('should validate plugin.install requires read+write actions', () => {
      const installScope = PLUGIN_SCOPE_HIERARCHY.find(
        (h) => h.scope === PLUGIN_PERMISSION_SCOPES.INSTALL
      );
      
      expect(installScope?.implied_actions).toContain('read');
      expect(installScope?.implied_actions).toContain('write');
    });

    it('should validate plugin.execute requires execute action', () => {
      const executeScope = PLUGIN_SCOPE_HIERARCHY.find(
        (h) => h.scope === PLUGIN_PERMISSION_SCOPES.EXECUTE
      );
      
      expect(executeScope?.implied_actions).toContain('execute');
    });

    it('should validate plugin.manage requires read+write+delete actions', () => {
      const manageScope = PLUGIN_SCOPE_HIERARCHY.find(
        (h) => h.scope === PLUGIN_PERMISSION_SCOPES.MANAGE
      );
      
      expect(manageScope?.implied_actions).toContain('read');
      expect(manageScope?.implied_actions).toContain('write');
      expect(manageScope?.implied_actions).toContain('delete');
    });
  });

  describe('ReputationTaskOutcome with Plugin Fields', () => {
    it('should include plugin_security_score in task outcome', () => {
      const outcome: ReputationTaskOutcome = {
        contract_id: 'contract-001',
        agent_id: 'agent-001',
        agent_name: 'Plugin Installer',
        task_id: 'task-001',
        success: true,
        completion_time_ms: 5000,
        quality_score: 0.95,
        plugin_security_score: 0.98,
        plugin_id: 'dcyfr/secret-detector',
      };

      expect(outcome.plugin_security_score).toBe(0.98);
      expect(outcome.plugin_id).toBe('dcyfr/secret-detector');
    });

    it('should allow task outcome without plugin fields', () => {
      const outcome: ReputationTaskOutcome = {
        contract_id: 'contract-002',
        agent_id: 'agent-002',
        agent_name: 'Code Reviewer',
        task_id: 'task-002',
        success: true,
        completion_time_ms: 3000,
      };

      expect(outcome.plugin_security_score).toBeUndefined();
      expect(outcome.plugin_id).toBeUndefined();
    });

    it('should handle failed plugin installation outcome', () => {
      const outcome: ReputationTaskOutcome = {
        contract_id: 'contract-003',
        agent_id: 'agent-003',
        agent_name: 'Plugin Installer',
        task_id: 'task-003',
        success: false,
        completion_time_ms: 15000,
        security_violations: 2,
        plugin_security_score: 0.3,
        plugin_id: 'untrusted/malware-plugin',
      };

      expect(outcome.success).toBe(false);
      expect(outcome.security_violations).toBe(2);
      expect(outcome.plugin_security_score).toBe(0.3);
    });
  });

  describe('Plugin Delegation Contract Integration', () => {
    it('should construct a complete plugin installation delegation contract', () => {
      const securityMetadata: PluginSecurityMetadata = {
        plugin_id: 'dcyfr/vulnerability-scanner',
        plugin_version: '2.1.4',
        trust_score: 96,
        scan_result: 'pass',
        sandbox_type: 'gvisor',
        sbom_hash: 'sha256:deadbeef',
        certification_tier: 'gold',
        tlp_classification: 'CLEAR',
        last_audit_date: '2026-02-10',
        required_permissions: ['plugin.execute', 'plugin.network', 'plugin.filesystem'],
      };

      // Verify all required fields are present
      expect(securityMetadata.plugin_id).toBe('dcyfr/vulnerability-scanner');
      expect(securityMetadata.trust_score).toBeGreaterThanOrEqual(90);
      expect(securityMetadata.certification_tier).toBe('gold');

      // Verify permissions are defined
      expect(securityMetadata.required_permissions).toHaveLength(3);
      expect(securityMetadata.required_permissions).toContain('plugin.execute');
    });

    it('should enforce trust score range 0-100', () => {
      const lowTrust: PluginSecurityMetadata = {
        plugin_id: 'community/new-plugin',
        plugin_version: '0.0.1',
        trust_score: 0,
        scan_result: 'pending',
        sandbox_type: 'docker',
        tlp_classification: 'AMBER',
      };

      const highTrust: PluginSecurityMetadata = {
        plugin_id: 'dcyfr/core',
        plugin_version: '1.0.0',
        trust_score: 100,
        scan_result: 'pass',
        sandbox_type: 'wasm',
        tlp_classification: 'CLEAR',
      };

      expect(lowTrust.trust_score).toBe(0);
      expect(highTrust.trust_score).toBe(100);
    });

    it('should track plugin security across delegation chain', () => {
      const parentPlugin: PluginSecurityMetadata = {
        plugin_id: 'dcyfr/orchestrator',
        plugin_version: '1.0.0',
        trust_score: 99,
        scan_result: 'pass',
        sandbox_type: 'gvisor',
        tlp_classification: 'GREEN',
        required_permissions: ['plugin.execute', 'plugin.manage'],
      };

      const childPlugin: PluginSecurityMetadata = {
        plugin_id: 'dcyfr/linter-plugin',
        plugin_version: '1.0.0',
        trust_score: 85,
        scan_result: 'pass',
        sandbox_type: 'wasm',
        tlp_classification: 'CLEAR',
        required_permissions: ['plugin.execute'],
      };

      // Child should not request more permissions than parent
      const parentPerms = new Set(parentPlugin.required_permissions);
      const childPerms = childPlugin.required_permissions ?? [];
      
      const isAttenuated = childPerms.every((perm) => parentPerms.has(perm));
      expect(isAttenuated).toBe(true);
    });
  });
});
