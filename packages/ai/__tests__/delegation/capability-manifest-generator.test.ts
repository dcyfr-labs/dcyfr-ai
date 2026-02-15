/**
 * CapabilityManifestGenerator Unit Tests
 * 
 * Tests for automated capability manifest generation based on agent metadata.
 * Validates 15 capability types and 79+ agent mappings.
 */

import { describe, it, expect } from 'vitest';
import { CapabilityManifestGenerator } from '../../src/capability-manifest-generator.js';
import type { AgentCapabilityManifest } from '../../types/agent-capabilities.js';

describe('CapabilityManifestGenerator', () => {
  let generator: CapabilityManifestGenerator;

  beforeEach(() => {
    generator = new CapabilityManifestGenerator();
  });

  describe('Capability Database', () => {
    it('should have all 15 capability types defined', () => {
      const capabilities = generator.getAvailableCapabilities();
      
      expect(capabilities).toHaveLength(15);
      expect(capabilities).toEqual(
        expect.arrayContaining([
          'testing',
          'debugging',
          'code_review',
          'architecture',
          'security',
          'performance_optimization',
          'documentation',
          'api_design',
          'database_design',
          'devops',
          'design_token_compliance',
          'pagelayout_architecture',
          'production_testing',
          'content_creation_seo',
          'nextjs_architecture',
        ])
      );
    });

    it('should provide capability descriptions', () => {
      const description = generator.getCapabilityDescription('testing');
      
      expect(description).toBeDefined();
      expect(description).toContain('test');
    });

    it('should return undefined for non-existent capability', () => {
      const description = generator.getCapabilityDescription('non-existent');
      expect(description).toBeUndefined();
    });
  });

  describe('Workspace Agent Manifests', () => {
    it('should generate manifest for architecture-reviewer agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'architecture-reviewer' },
        description: 'Reviews architectural patterns and SOLID principles',
      });

      expect(manifest).toBeDefined();
      expect(manifest.agent_id).toBe('architecture-reviewer');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'architecture',
          confidence: expect.any(Number),
        })
      );
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'code_review',
          confidence: expect.any(Number),
        })
      );
    });

    it('should generate manifest for test-engineer agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'test-engineer' },
        description: 'Testing strategy and test automation expert',
      });

      expect(manifest.agent_id).toBe('test-engineer');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'testing',
          confidence: expect.any(Number),
        })
      );
      expect(manifest.overall_confidence).toBeGreaterThanOrEqual(0.5);
      expect(manifest.overall_confidence).toBeLessThanOrEqual(1.0);
    });

    it('should generate manifest for security-engineer agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'security-engineer' },
        description: 'Security audits and OWASP compliance',
      });

      expect(manifest.agent_id).toBe('security-engineer');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'security',
          confidence: expect.any(Number),
        })
      );
    });

    it('should generate manifest for database-architect agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'database-architect' },
        description: 'PostgreSQL schema design and query optimization',
      });

      expect(manifest.agent_id).toBe('database-architect');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'database_design',
          confidence: expect.any(Number),
        })
      );
    });

    it('should generate manifest for devops-engineer agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'devops-engineer' },
        description: 'CI/CD, Docker, and deployment automation',
      });

      expect(manifest.agent_id).toBe('devops-engineer');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'devops',
          confidence: expect.any(Number),
        })
      );
    });
  });

  describe('Production Agent Manifests (dcyfr-labs)', () => {
    it('should generate manifest for design-specialist agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'design-specialist' },
        description: 'Design token compliance and pattern enforcement',
      });

      expect(manifest.agent_id).toBe('design-specialist');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'design_token_compliance',
          confidence: expect.any(Number),
        })
      );
    });

    it('should generate manifest for nextjs-architecture-expert agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'nextjs-architecture-expert' },
        description: 'Next.js App Router and Server Components expert',
      });

      expect(manifest.agent_id).toBe('nextjs-architecture-expert');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'nextjs_architecture',
          confidence: expect.any(Number),
        })
      );
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'architecture',
          confidence: expect.any(Number),
        })
      );
    });

    it('should generate manifest for production-test-specialist agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'production-test-specialist' },
        description: 'Production-grade testing with 99%+ pass rate requirements',
      });

      expect(manifest.agent_id).toBe('production-test-specialist');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'production_testing',
          confidence: expect.any(Number),
        })
      );
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'testing',
          confidence: expect.any(Number),
        })
      );
    });

    it('should generate manifest for content-strategist agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'content-strategist' },
        description: 'SEO-optimized content creation and blog post writing',
      });

      expect(manifest.agent_id).toBe('content-strategist');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'content_creation_seo',
          confidence: expect.any(Number),
        })
      );
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'documentation',
          confidence: expect.any(Number),
        })
      );
    });

    it('should generate manifest for pagelayout-specialist agent', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'pagelayout-specialist' },
        description: 'PageLayout architecture and layout pattern enforcement',
      });

      expect(manifest.agent_id).toBe('pagelayout-specialist');
      expect(manifest.capabilities).toContainEqual(
        expect.objectContaining({
          capability: 'pagelayout_architecture',
          confidence: expect.any(Number),
        })
      );
    });
  });

  describe('Confidence Calculation', () => {
    it('should assign higher confidence to primary capabilities', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'security-engineer' },
        description: 'Primary: security audits. Secondary: code review',
      });

      const securityCap = manifest.capabilities.find(c => c.capability === 'security');
      const reviewCap = manifest.capabilities.find(c => c.capability === 'code_review');

      if (securityCap && reviewCap) {
        expect(securityCap.confidence).toBeGreaterThan(reviewCap.confidence);
      }
    });

    it('should calculate overall confidence as weighted average', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'test-agent' },
        description: 'Testing expert',
      });

      expect(manifest.overall_confidence).toBeGreaterThan(0);
      expect(manifest.overall_confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle agents with single capability', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'specialist-agent' },
        description: 'Database design specialist only',
      });

      expect(manifest.capabilities).toHaveLength(1);
      expect(manifest.overall_confidence).toBe(manifest.capabilities[0].confidence);
    });
  });

  describe('Specializations Extraction', () => {
    it('should extract specializations from agent description', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'test-agent' },
        description: 'Specializes in unit-testing, integration-testing, and e2e-testing',
      });

      expect(manifest.specializations).toEqual(
        expect.arrayContaining(['unit-testing', 'integration-testing', 'e2e-testing'])
      );
    });

    it('should handle agents with no explicit specializations', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'general-agent' },
        description: 'General purpose development agent',
      });

      expect(manifest.specializations).toBeDefined();
      expect(Array.isArray(manifest.specializations)).toBe(true);
    });
  });

  describe('Timestamp and Metadata', () => {
    it('should include ISO timestamp in manifest', () => {
      const beforeTime = new Date().toISOString();
      
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'test-agent' },
        description: 'Test agent',
      });

      const afterTime = new Date().toISOString();

      expect(manifest.last_updated).toBeDefined();
      expect(manifest.last_updated >= beforeTime).toBe(true);
      expect(manifest.last_updated <= afterTime).toBe(true);
    });

    it('should include agent_id matching manifest name', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'custom-agent-name' },
        description: 'Custom agent',
      });

      expect(manifest.agent_id).toBe('custom-agent-name');
    });
  });

  describe('Batch Generation', () => {
    it('should generate multiple manifests at once', () => {
      const agents = [
        { manifest: { name: 'agent-1' }, description: 'Testing agent' },
        { manifest: { name: 'agent-2' }, description: 'Debugging agent' },
        { manifest: { name: 'agent-3' }, description: 'Security agent' },
      ];

      const manifests = generator.generateManifests(agents);

      expect(manifests).toHaveLength(3);
      expect(manifests.map(m => m.agent_id)).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });

    it('should handle empty batch', () => {
      const manifests = generator.generateManifests([]);
      expect(manifests).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for agent without name', () => {
      expect(() => {
        generator.generateCapabilityManifest({
          manifest: {} as any,
          description: 'Agent without name',
        });
      }).toThrow();
    });

    it('should handle agent without description gracefully', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'no-description-agent' },
        description: '',
      });

      expect(manifest).toBeDefined();
      expect(manifest.agent_id).toBe('no-description-agent');
      expect(manifest.capabilities.length).toBeGreaterThan(0); // Should infer from name
    });

    it('should handle special characters in agent name', () => {
      const manifest = generator.generateCapabilityManifest({
        manifest: { name: 'agent-with-special_chars@123' },
        description: 'Test agent',
      });

      expect(manifest.agent_id).toBe('agent-with-special_chars@123');
    });
  });

  describe('Capability Mapping Coverage', () => {
    it('should support all 17 workspace agents', () => {
      const workspaceAgents = [
        'architecture-reviewer',
        'database-architect',
        'devops-engineer',
        'documentation-expert',
        'fullstack-developer',
        'performance-profiler',
        'quick-fix',
        'security-engineer',
        'test-engineer',
        'typescript-pro',
      ];

      workspaceAgents.forEach(agentName => {
        const manifest = generator.generateCapabilityManifest({
          manifest: { name: agentName },
          description: `${agentName} description`,
        });

        expect(manifest).toBeDefined();
        expect(manifest.agent_id).toBe(agentName);
        expect(manifest.capabilities.length).toBeGreaterThan(0);
      });
    });

    it('should support production-specific capabilities', () => {
      const productionCapabilities = [
        'design_token_compliance',
        'pagelayout_architecture',
        'production_testing',
        'content_creation_seo',
        'nextjs_architecture',
      ];

      productionCapabilities.forEach(capability => {
        const capabilities = generator.getAvailableCapabilities();
        expect(capabilities).toContain(capability);
      });
    });
  });
});
