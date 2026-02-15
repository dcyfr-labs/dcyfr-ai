/**
 * AgentCapabilityRegistry Unit Tests
 * 
 * Tests for the capability registry system that manages agent capability manifests,
 * enables capability-based agent discovery, and tracks agent workload/confidence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from '../../src/capability-registry.js';
import type { AgentCapabilityManifest } from '../../src/types/agent-capabilities.js';

describe('AgentCapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe('Manifest Registration', () => {
    it('should register a valid manifest', () => {
      const manifest: AgentCapabilityManifest = {
        agent_id: 'test-agent',
        capabilities: [
          { capability: 'testing', confidence: 0.85 }
        ],
        overall_confidence: 0.85,
        specializations: ['unit-testing'],
        last_updated: new Date().toISOString(),
      };

      registry.registerManifest(manifest);
      const retrieved = registry.getManifest('test-agent');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.agent_id).toBe('test-agent');
      expect(retrieved?.capabilities).toHaveLength(1);
      expect(retrieved?.capabilities[0].capability).toBe('testing');
    });

    it('should update existing manifest when registering duplicate agent_id', () => {
      const manifest1: AgentCapabilityManifest = {
        agent_id: 'test-agent',
        agent_name: 'Test Agent',
        capabilities: [{ capability: 'testing', confidence: 0.80 }],
        overall_confidence: 0.80,
        specializations: [],
        last_updated: new Date().toISOString(),
      };

      const manifest2: AgentCapabilityManifest = {
        agent_id: 'test-agent',
        agent_name: 'Test Agent',
        capabilities: [{ capability: 'testing', confidence: 0.90 }],
        overall_confidence: 0.90,
        specializations: ['advanced-testing'],
        last_updated: new Date().toISOString(),
      };

      registry.registerManifest(manifest1);
      registry.registerManifest(manifest2);

      const retrieved = registry.getManifest('test-agent');
      expect(retrieved?.overall_confidence).toBe(0.90);
      expect(retrieved?.specializations).toContain('advanced-testing');
    });

    it('should reject manifest with invalid confidence values', () => {
      const invalidManifest = {
        agent_id: 'invalid-agent',
        agent_name: 'Invalid Agent',
        capabilities: [{ capability: 'testing', confidence: 1.5 }], // > 1.0
        overall_confidence: 1.5,
        specializations: [],
        last_updated: new Date().toISOString(),
      } as AgentCapabilityManifest;

      expect(() => registry.registerManifest(invalidManifest)).toThrow();
    });

    it('should handle manifests with multiple capabilities', () => {
      const manifest: AgentCapabilityManifest = {
        agent_id: 'multi-capability-agent',
        agent_name: 'Multi-Capability Agent',
        capabilities: [
          { capability: 'testing', confidence: 0.85 },
          { capability: 'debugging', confidence: 0.90 },
          { capability: 'code_review', confidence: 0.75 },
        ],
        overall_confidence: 0.83,
        specializations: ['testing', 'debugging'],
        last_updated: new Date().toISOString(),
      };

      registry.registerManifest(manifest);
      const retrieved = registry.getManifest('multi-capability-agent');

      expect(retrieved?.capabilities).toHaveLength(3);
      expect(retrieved?.capabilities.map(c => c.capability)).toEqual(
        expect.arrayContaining(['testing', 'debugging', 'code_review'])
      );
    });
  });

  describe('Manifest Retrieval', () => {
    beforeEach(() => {
      // Register sample manifests
      registry.registerManifest({
        agent_id: 'agent-1',
        agent_name: 'Test Agent 1',
        capabilities: [{ capability: 'testing', confidence: 0.85 }],
        overall_confidence: 0.85,
        specializations: ['unit-testing'],
        last_updated: new Date().toISOString(),
      });

      registry.registerManifest({
        agent_id: 'agent-2',
        agent_name: 'Test Agent 2',
        capabilities: [{ capability: 'debugging', confidence: 0.90 }],
        overall_confidence: 0.90,
        specializations: ['performance-debugging'],
        last_updated: new Date().toISOString(),
      });
    });

    it('should retrieve existing manifest by agent_id', () => {
      const manifest = registry.getManifest('agent-1');
      expect(manifest).toBeDefined();
      expect(manifest?.agent_id).toBe('agent-1');
    });

    it('should return undefined for non-existent agent', () => {
      const manifest = registry.getManifest('non-existent');
      expect(manifest).toBeUndefined();
    });

    it('should list all registered manifests', () => {
      const manifests = registry.listManifests();
      expect(manifests).toHaveLength(2);
      expect(manifests.map(m => m.agent_id)).toEqual(
        expect.arrayContaining(['agent-1', 'agent-2'])
      );
    });
  });

  describe('Capability-Based Querying', () => {
    beforeEach(() => {
      // Register diverse agents
      registry.registerManifest({
        agent_id: 'tester-expert',
        agent_name: 'Expert Tester Agent',
        capabilities: [
          { capability: 'testing', confidence: 0.95 },
          { capability: 'code_review', confidence: 0.80 },
        ],
        overall_confidence: 0.88,
        specializations: ['unit-testing', 'integration-testing'],
        last_updated: new Date().toISOString(),
      });

      registry.registerManifest({
        agent_id: 'tester-intermediate',
        agent_name: 'Intermediate Tester Agent',
        capabilities: [
          { capability: 'testing', confidence: 0.70 },
        ],
        overall_confidence: 0.70,
        specializations: ['basic-testing'],
        last_updated: new Date().toISOString(),
      });

      registry.registerManifest({
        agent_id: 'debugger-expert',
        agent_name: 'Expert Debugger Agent',
        capabilities: [
          { capability: 'debugging', confidence: 0.92 },
          { capability: 'performance_optimization', confidence: 0.85 },
        ],
        overall_confidence: 0.89,
        specializations: ['performance-debugging'],
        last_updated: new Date().toISOString(),
      });
    });

    it('should find agents by single capability', () => {
      const agents = registry.findByCapability('testing');
      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.agent_id)).toEqual(
        expect.arrayContaining(['tester-expert', 'tester-intermediate'])
      );
    });

    it('should filter by minimum confidence threshold', () => {
      const agents = registry.findByCapability('testing', { minConfidence: 0.80 });
      expect(agents).toHaveLength(1);
      expect(agents[0].agent_id).toBe('tester-expert');
    });

    it('should find agents with multiple capabilities', () => {
      const agents = registry.findByCapabilities(['debugging', 'performance_optimization']);
      expect(agents).toHaveLength(1);
      expect(agents[0].agent_id).toBe('debugger-expert');
    });

    it('should return empty array when no agents match capability', () => {
      const agents = registry.findByCapability('non-existent-capability');
      expect(agents).toHaveLength(0);
    });

    it('should match agents by specialization', () => {
      const agents = registry.findBySpecialization('integration-testing');
      expect(agents).toHaveLength(1);
      expect(agents[0].agent_id).toBe('tester-expert');
    });
  });

  describe('Match Scoring', () => {
    beforeEach(() => {
      registry.registerManifest({
        agent_id: 'generalist',
        capabilities: [
          { capability: 'testing', confidence: 0.70 },
          { capability: 'debugging', confidence: 0.65 },
          { capability: 'code_review', confidence: 0.75 },
        ],
        overall_confidence: 0.70,
        specializations: [],
        last_updated: new Date().toISOString(),
      });

      registry.registerManifest({
        agent_id: 'specialist',
        capabilities: [
          { capability: 'testing', confidence: 0.95 },
        ],
        overall_confidence: 0.95,
        specializations: ['unit-testing', 'e2e-testing'],
        last_updated: new Date().toISOString(),
      });
    });

    it('should calculate match score for required capabilities', () => {
      const score1 = registry.calculateMatchScore('generalist', ['testing']);
      const score2 = registry.calculateMatchScore('specialist', ['testing']);

      expect(score2).toBeGreaterThan(score1); // Specialist should score higher
    });

    it('should rank agents by match score', () => {
      const ranked = registry.rankAgents(['testing', 'code_review']);
      
      expect(ranked).toHaveLength(2);
      expect(ranked[0].agent_id).toBe('generalist'); // Has both capabilities
      expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });

    it('should return empty array when ranking with no matching agents', () => {
      const ranked = registry.rankAgents(['non-existent-capability']);
      expect(ranked).toHaveLength(0);
    });

    it('should handle ranking with confidence weighting', () => {
      const ranked = registry.rankAgents(['testing'], { confidenceWeight: 0.8 });
      
      expect(ranked[0].agent_id).toBe('specialist'); // Higher confidence
      expect(ranked[0].score).toBeGreaterThan(0.9);
    });
  });

  describe('Workload Tracking', () => {
    beforeEach(() => {
      registry.registerManifest({
        agent_id: 'worker-agent',
        capabilities: [{ capability: 'testing', confidence: 0.85 }],
        overall_confidence: 0.85,
        specializations: [],
        last_updated: new Date().toISOString(),
      });
    });

    it('should initialize workload to zero', () => {
      const workload = registry.getWorkload('worker-agent');
      expect(workload).toBe(0);
    });

    it('should increment workload when task assigned', () => {
      registry.incrementWorkload('worker-agent');
      const workload = registry.getWorkload('worker-agent');
      expect(workload).toBe(1);
    });

    it('should decrement workload when task completed', () => {
      registry.incrementWorkload('worker-agent');
      registry.incrementWorkload('worker-agent');
      registry.decrementWorkload('worker-agent');

      const workload = registry.getWorkload('worker-agent');
      expect(workload).toBe(1);
    });

    it('should not allow negative workload', () => {
      registry.decrementWorkload('worker-agent'); // No tasks assigned
      const workload = registry.getWorkload('worker-agent');
      expect(workload).toBe(0);
    });

    it('should consider workload in agent ranking', () => {
      registry.registerManifest({
        agent_id: 'busy-agent',
        capabilities: [{ capability: 'testing', confidence: 0.85 }],
        overall_confidence: 0.85,
        specializations: [],
        last_updated: new Date().toISOString(),
      });

      // Make one agent busy
      registry.incrementWorkload('busy-agent');
      registry.incrementWorkload('busy-agent');
      registry.incrementWorkload('busy-agent');

      const ranked = registry.rankAgents(['testing'], { considerWorkload: true });
      
      // Less busy agent should rank higher
      expect(ranked[0].agent_id).toBe('worker-agent');
    });
  });

  describe('Confidence Updates', () => {
    beforeEach(() => {
      registry.registerManifest({
        agent_id: 'learning-agent',
        capabilities: [{ capability: 'testing', confidence: 0.50 }],
        overall_confidence: 0.50,
        specializations: [],
        last_updated: new Date().toISOString(),
      });
    });

    it('should update capability confidence', () => {
      registry.updateConfidence('learning-agent', 'testing', 0.75);
      
      const manifest = registry.getManifest('learning-agent');
      expect(manifest?.capabilities[0].confidence).toBe(0.75);
    });

    it('should update overall confidence', () => {
      registry.updateOverallConfidence('learning-agent', 0.80);
      
      const manifest = registry.getManifest('learning-agent');
      expect(manifest?.overall_confidence).toBe(0.80);
    });

    it('should reject invalid confidence values', () => {
      expect(() => registry.updateConfidence('learning-agent', 'testing', 1.5)).toThrow();
      expect(() => registry.updateConfidence('learning-agent', 'testing', -0.1)).toThrow();
    });

    it('should handle confidence update for non-existent capability', () => {
      const result = registry.updateConfidence('learning-agent', 'non-existent', 0.75);
      expect(result).toBe(false);
    });
  });

  describe('Bulk Operations', () => {
    it('should register multiple manifests at once', () => {
      const manifests: AgentCapabilityManifest[] = [
        {
          agent_id: 'agent-1',
          capabilities: [{ capability: 'testing', confidence: 0.85 }],
          overall_confidence: 0.85,
          specializations: [],
          last_updated: new Date().toISOString(),
        },
        {
          agent_id: 'agent-2',
          capabilities: [{ capability: 'debugging', confidence: 0.90 }],
          overall_confidence: 0.90,
          specializations: [],
          last_updated: new Date().toISOString(),
        },
      ];

      registry.registerManifests(manifests);
      
      expect(registry.listManifests()).toHaveLength(2);
    });

    it('should clear all manifests', () => {
      registry.registerManifest({
        agent_id: 'test-agent',
        capabilities: [{ capability: 'testing', confidence: 0.85 }],
        overall_confidence: 0.85,
        specializations: [],
        last_updated: new Date().toISOString(),
      });

      registry.clear();
      
      expect(registry.listManifests()).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty capability array', () => {
      const manifest: AgentCapabilityManifest = {
        agent_id: 'no-capabilities',
        capabilities: [],
        overall_confidence: 0.0,
        specializations: [],
        last_updated: new Date().toISOString(),
      };

      registry.registerManifest(manifest);
      const retrieved = registry.getManifest('no-capabilities');
      
      expect(retrieved?.capabilities).toHaveLength(0);
    });

    it('should handle agent_id with special characters', () => {
      const manifest: AgentCapabilityManifest = {
        agent_id: 'agent-with-special_chars@123',
        capabilities: [{ capability: 'testing', confidence: 0.85 }],
        overall_confidence: 0.85,
        specializations: [],
        last_updated: new Date().toISOString(),
      };

      registry.registerManifest(manifest);
      const retrieved = registry.getManifest('agent-with-special_chars@123');
      
      expect(retrieved).toBeDefined();
    });

    it('should handle very long agent_id', () => {
      const longId = 'a'.repeat(1000);
      const manifest: AgentCapabilityManifest = {
        agent_id: longId,
        capabilities: [{ capability: 'testing', confidence: 0.85 }],
        overall_confidence: 0.85,
        specializations: [],
        last_updated: new Date().toISOString(),
      };

      registry.registerManifest(manifest);
      const retrieved = registry.getManifest(longId);
      
      expect(retrieved?.agent_id).toBe(longId);
    });
  });
});
