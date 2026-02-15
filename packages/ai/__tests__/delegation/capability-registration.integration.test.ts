/**
 * Capability Registration Integration Tests
 * 
 * Tests capability registration with real workspace agent manifests.
 * Validates Task 7.1-7.3 implementation.
 * 
 * @date 2026-02-15
 */

import { describe, it, expect } from 'vitest';
import { CapabilityRegistry } from '../../delegation/capability-registry.js';
import { bootstrapCapabilityManifest, parseAgentDefinition } from '../../delegation/capability-bootstrap.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Capability Registration Integration (Tasks 7.1-7.3)', () => {  describe('Task 7.1: Workspace Agent Manifests', () => {
    it('should load and register workspace agent manifests', () => {
      const registry = new CapabilityRegistry();
      
      // Load a generated manifest
      const manifestPath = join(__dirname, '../../manifests/capabilities/test-engineer.json');
      const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      
      // Register the manifest
      registry.registerManifest(manifestData);
      
      // Verify registration
      const retrieved = registry.getManifest('test-engineer');
      expect(retrieved).toBeDefined();
      expect(retrieved?.agent_name).toBe('test-engineer');
      expect(retrieved?.capabilities.length).toBeGreaterThan(0);
      expect(retrieved?.overall_confidence).toBeGreaterThan(0.70);
    });

    it('should load all 22 workspace agent manifests', () => {
      const registry = new CapabilityRegistry();
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      expect(indexData.total_agents).toBe(22);
      expect(indexData.manifests.length).toBe(22);
      
      // Load and register all manifests
      for (const manifestMeta of indexData.manifests) {
        const manifestPath = join(__dirname, `../../manifests/capabilities/${manifestMeta.agent_id}.json`);
        const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        registry.registerManifest(manifestData);
      }
      
      // Verify all registered
      const stats = registry.getStatistics();
      expect(stats.total_agents).toBe(22);
      expect(stats.avg_confidence).toBeGreaterThan(0.70);
    });

    it('should have valid TLP clearances for all agents', () => {
      const registry = new CapabilityRegistry();
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      for (const manifestMeta of indexData.manifests) {
        const manifestPath = join(__dirname, `../../manifests/capabilities/${manifestMeta.agent_id}.json`);
        const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        
        expect(manifestData.tlp_clearance).toBeDefined();
        expect(Array.isArray(manifestData.tlp_clearance)).toBe(true);
        expect(manifestData.tlp_clearance.length).toBeGreaterThan(0);
        
        // Verify only valid TLP levels
        const validLevels = ['CLEAR', 'GREEN', 'AMBER', 'RED'];
        for (const level of manifestData.tlp_clearance) {
          expect(validLevels).toContain(level);
        }
      }
    });
  });

  describe('Task 7.2: Capability Matching', () => {
    it('should match agents by testing capability', () => {
      const registry = new CapabilityRegistry();
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      // Load all manifests
      for (const manifestMeta of indexData.manifests) {
        const manifestPath = join(__dirname, `../../manifests/capabilities/${manifestMeta.agent_id}.json`);
        const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        registry.registerManifest(manifestData);
      }
      
      // Match agents with testing capability
      const matches = registry.matchAgents({
        required_categories: ['testing'],
        min_confidence: 0.75,
      });
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matched_capabilities.length).toBeGreaterThan(0);
    });

    it('should match security-engineer agent for code review tasks', () => {
      const registry = new CapabilityRegistry();
      const manifestPath = join(__dirname, '../../manifests/capabilities/security-engineer.json');
      const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      registry.registerManifest(manifestData);
      
      const matches = registry.matchAgents({
        required_categories: ['code_review'],
      });
      
      expect(matches.length).toBeGreaterThan(0);
      const match = matches.find(m => m.agent_id === 'security-engineer');
      expect(match).toBeDefined();
    });

    it('should rank agents by match score', () => {
      const registry = new CapabilityRegistry();
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      // Load all manifests
      for (const manifestMeta of indexData.manifests) {
        const manifestPath = join(__dirname, `../../manifests/capabilities/${manifestMeta.agent_id}.json`);
        const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        registry.registerManifest(manifestData);
      }
      
      const matches = registry.matchAgents({
        required_categories: ['code_review'],
        min_confidence: 0.70,
      });
      
      // Verify matches are ranked
      for (let i = 0; i < matches.length; i++) {
        expect(matches[i].rank).toBe(i + 1);
      }
      
      // Verify descending match scores
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].match_score).toBeGreaterThanOrEqual(matches[i].match_score);
      }
    });
  });

  describe('Task 7.3: Bootstrap Process', () => {
    it('should bootstrap capability manifest from agent frontmatter', () => {
      const agentDef = parseAgentDefinition(`
name: test-bootstrap-agent
description: Test agent for bootstrapping capabilities
tools: ['read', 'edit', 'execute']
category: testing
tier: workspace
version: 1.0.0
      `.trim());
      
      const manifest = bootstrapCapabilityManifest(agentDef);
      
      expect(manifest.agent_id).toBe('test-bootstrap-agent');
      expect(manifest.agent_name).toBe('test-bootstrap-agent');
      expect(manifest.capabilities.length).toBeGreaterThan(0);
      expect(manifest.overall_confidence).toBeGreaterThan(0);
      expect(manifest.tlp_clearance).toBeDefined();
    });

    it('should infer capabilities from agent category', () => {
      const agentDef = parseAgentDefinition(`
name: security-test
description: Security testing agent
category: security
tier: workspace
version: 1.0.0
      `.trim());
      
      const manifest = bootstrapCapabilityManifest(agentDef);
      
      // Should have security-related capabilities
      const securityCaps = manifest.capabilities.filter(c => c.category === 'security');
      expect(securityCaps.length).toBeGreaterThan(0);
    });

    it('should infer capabilities from tools', () => {
      const agentDef = parseAgentDefinition(`
name: tool-based-agent
description: Agent with tool-based capabilities
tools: ['read', 'edit', 'execute']
tier: workspace
version: 1.0.0
      `.trim());
      
      const manifest = bootstrapCapabilityManifest(agentDef);
      
      // Should infer capabilities from tools
      const analysisCapability = manifest.capabilities.find(c => c.capability_name === 'Code Analysis');
      const modificationCapability = manifest.capabilities.find(c => c.capability_name === 'Code Modification');
      const testingCapability = manifest.capabilities.find(c => c.capability_name === 'Testing and Validation');
      
      expect(analysisCapability).toBeDefined();
      expect(modificationCapability).toBeDefined();
      expect(testingCapability).toBeDefined();
    });

    it('should set appropriate TLP clearance based on tier', () => {
      const proprietaryAgent = parseAgentDefinition(`
name: proprietary-agent
description: Proprietary agent
tier: proprietary
version: 1.0.0
      `.trim());
      
      const workspaceAgent = parseAgentDefinition(`
name: workspace-agent
description: Workspace agent
tier: workspace
version: 1.0.0
      `.trim());
      
      const propManifest = bootstrapCapabilityManifest(proprietaryAgent);
      const workManifest = bootstrapCapabilityManifest(workspaceAgent);
      
      // Proprietary should have all TLP levels
      expect(propManifest.tlp_clearance).toContain('RED');
      expect(propManifest.tlp_clearance).toContain('AMBER');
      
      // Workspace should have limited TLP levels
      expect(workManifest.tlp_clearance).not.toContain('RED');
      expect(workManifest.tlp_clearance).toContain('GREEN');
    });
  });

  describe('Quality Gates', () => {
    it('should have minimum 70% confidence for all agents', () => {
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      for (const manifestMeta of indexData.manifests) {
        expect(manifestMeta.overall_confidence).toBeGreaterThanOrEqual(0.70);
      }
    });

    it('should have valid resource requirements for all capabilities', () => {
      const manifestPath = join(__dirname, '../../manifests/capabilities/test-engineer.json');
      const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      
      for (const capability of manifestData.capabilities) {
        expect(capability.resource_requirements).toBeDefined();
        expect(Array.isArray(capability.resource_requirements)).toBe(true);
        expect(capability.resource_requirements.length).toBeGreaterThan(0);
        
        // Verify resource types are valid
        const validTypes = ['cpu', 'memory', 'disk', 'network', 'api_tokens', 'time_ms'];
        for (const req of capability.resource_requirements) {
          expect(validTypes).toContain(req.type);
        }
      }
    });

    it('should have calibration metadata for all capabilities', () => {
      const manifestPath = join(__dirname, '../../manifests/capabilities/architecture-reviewer.json');
      const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      
      for (const capability of manifestData.capabilities) {
        expect(capability.calibration).toBeDefined();
        expect(capability.calibration.total_evaluations).toBeDefined();
        expect(capability.calibration.calibration_method).toBe('automated');
      }
    });
  });

  describe('Production Readiness', () => {
    it('should provide all manifests via index', () => {
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      expect(indexData.generated_at).toBeDefined();
      expect(indexData.total_agents).toBe(22);
      expect(indexData.manifests).toBeDefined();
      expect(Array.isArray(indexData.manifests)).toBe(true);
    });

    it('should have consistent agent IDs between index and files', () => {
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      for (const manifestMeta of indexData.manifests) {
        const manifestPath = join(__dirname, `../../manifests/capabilities/${manifestMeta.agent_id}.json`);
        const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        
        expect(manifestData.agent_id).toBe(manifestMeta.agent_id);
      }
    });

    it('should register and query entire workspace capability catalog', () => {
      const registry = new CapabilityRegistry();
      const indexPath = join(__dirname, '../../manifests/capabilities/index.json');
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      // Load all manifests
      for (const manifestMeta of indexData.manifests) {
        const manifestPath = join(__dirname, `../../manifests/capabilities/${manifestMeta.agent_id}.json`);
        const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        registry.registerManifest(manifestData);
      }
      
      // Query capabilities across all agents
      const allCapabilities = registry.queryCapabilities({});
      expect(allCapabilities.length).toBeGreaterThan(50); // Should have many capabilities
      
      // Get statistics
      const stats = registry.getStatistics();
      console.log('\n📊 Workspace Capability Catalog Statistics:');
      console.log(`   Total agents: ${stats.total_agents}`);
      console.log(`   Total capabilities: ${stats.total_capabilities}`);
      console.log(`   Avg capabilities/agent: ${stats.avg_capabilities_per_agent.toFixed(1)}`);
      console.log(`   Avg confidence: ${(stats.avg_confidence * 100).toFixed(1)}%`);
      console.log(`   Available agents: ${stats.available_agents}`);
      
      expect(stats.total_agents).toBe(22);
      expect(stats.avg_confidence).toBeGreaterThan(0.70);
    });
  });
});
