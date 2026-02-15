/**
 * CapabilityBootstrap Unit Tests
 * 
 * Tests for automated agent onboarding with capability detection,
 * confidence initialization, and multi-format agent parsing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentAnalyzer,
  CapabilityDetector,
  ConfidenceInitializer,
  CapabilityBootstrap,
} from '../../src/capability-bootstrap.js';
import type { AgentSource, CapabilityDetectionConfig, ConfidenceInitConfig } from '../../types/agent-capabilities.js';

describe('AgentAnalyzer', () => {
  let analyzer: AgentAnalyzer;

  beforeEach(() => {
    analyzer = new AgentAnalyzer();
  });

  describe('Markdown Analysis (.agent.md)', () => {
    it('should analyze frontmatter and content', async () => {
      const markdown = `---
name: test-agent
description: A test agent for unit testing
tools: ['read', 'edit', 'execute']
model: sonnet
---

# Test Agent

This agent specializes in testing and debugging.
`;

      const result = await analyzer.analyze({
        type: 'markdown',
        content: markdown,
      });

      expect(result.name).toBe('test-agent');
      expect(result.description).toContain('test agent');
      expect(result.content).toContain('specializes in testing and debugging');
    });

    it('should handle markdown without frontmatter', async () => {
      const markdown = `# Agent Documentation

This agent handles security audits.
`;

      const result = await analyzer.analyze({
        type: 'markdown',
        content: markdown,
      });

      expect(result.content).toContain('security audits');
      expect(result.name).toBeDefined(); // Should extract from path or default
    });

    it('should extract description from content', async () => {
      const markdown = `# Security Engineer

Expert in security scanning and OWASP compliance.
`;

      const result = await analyzer.analyze({
        type: 'markdown',
        content: markdown,
      });

      expect(result.description).toBeDefined();
      expect(result.description.length).toBeGreaterThan(0);
    });

    it('should handle invalid YAML frontmatter gracefully', async () => {
      const markdown = `---
invalid yaml: [unclosed bracket
---

Content here.
`;

      const result = await analyzer.analyze({
        type: 'markdown',
        content: markdown,
      });

      expect(result).toBeDefined();
      expect(result.content).toContain('Content here');
    });
  });

  describe('TypeScript Analysis', () => {
    it('should extract agent metadata from TypeScript object', async () => {
      const agentObject = {
        name: 'test-agent',
        description: 'Expert in unit and integration testing',
        capabilities: ['testing', 'debugging'],
      };

      const result = await analyzer.analyze({
        type: 'typescript',
        agentObject,
      });

      expect(result.name).toBe('test-agent');
      expect(result.description).toContain('unit and integration testing');
    });

    it('should handle agent object with minimal metadata', async () => {
      const agentObject = {
        name: 'minimal-agent',
      };

      const result = await analyzer.analyze({
        type: 'typescript',
        agentObject,
      });

      expect(result.name).toBe('minimal-agent');
      expect(result).toBeDefined();
    });

    it('should extract id as name fallback', async () => {
      const agentObject = {
        id: 'agent-with-id',
        description: 'Agent using id instead of name',
      };

      const result = await analyzer.analyze({
        type: 'typescript',
        agentObject,
      });

      expect(result.name).toBe('agent-with-id');
    });
  });

  describe('JSON Analysis', () => {
    it('should analyze agent configuration JSON', async () => {
      const json = {
        name: 'test-agent',
        description: 'Testing specialist',
        capabilities: ['testing', 'debugging'],
        specializations: ['unit-testing'],
      };

      const result = await analyzer.analyze({
        type: 'json',
        definition: json,
      });

      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('Testing specialist');
      expect(result.content).toContain('testing');
      expect(result.content).toContain('debugging');
    });

    it('should handle nested JSON structures', async () => {
      const json = {
        name: 'nested-agent',
        metadata: {
          description: 'Nested configuration',
        },
      };

      const result = await analyzer.analyze({
        type: 'json',
        definition: json,
      });

      expect(result.name).toBe('nested-agent');
      expect(result.metadata).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle empty markdown content', async () => {
      const result = await analyzer.analyze({
        type: 'markdown',
        content: '',
      });

      expect(result).toBeDefined();
      expect(result.name).toBeDefined();
    });

    it('should handle agent object with no name or id', async () => {
      const result = await analyzer.analyze({
        type: 'typescript',
        agentObject: { description: 'No name' },
      });

      expect(result.name).toBe('unknown-agent');
    });

    it('should throw error for unsupported source types', async () => {
      const source: AgentSource = {
        type: 'unknown' as any,
      } as any;

      await expect(analyzer.analyze(source)).rejects.toThrow();
    });
  });
});

describe('CapabilityDetector', () => {
  let detector: CapabilityDetector;

  beforeEach(() => {
    detector = new CapabilityDetector();
  });

  describe('Keyword-Based Detection', () => {
    it('should detect testing capability from keywords', () => {
      const content = 'This agent specializes in unit testing and test automation';
      
      const capabilities = detector.detect(content, 'test-agent');

      expect(capabilities).toContainEqual(
        expect.objectContaining({
          capabilityId: expect.stringContaining('test'),
        })
      );
    });

    it('should detect security capability', () => {
      const content = 'Security audit specialist with OWASP expertise';
      
      const capabilities = detector.detect(content, 'security-agent');

      expect(capabilities).toContainEqual(
        expect.objectContaining({
          capabilityId: expect.stringContaining('security'),
        })
      );
    });

    it('should detect multiple capabilities', () => {
      const content = `
        This agent handles testing, security audits, and performance optimization.
        Expert in code generation and pattern enforcement.
      `;
      
      const capabilities = detector.detect(content, 'multi-agent');

      expect(capabilities.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign confidence scores based on keyword matches', () => {
      const content = `
        Testing expert. Unit testing, integration testing, e2e testing.
        Test automation and test driven development specialist.
      `;
      
      const capabilities = detector.detect(content, 'test-expert');

      capabilities.forEach(cap => {
        expect(cap.detectionConfidence).toBeGreaterThanOrEqual(0);
        expect(cap.detectionConfidence).toBeLessThanOrEqual(1.0);
      });
    });

    it('should score based on keyword density', () => {
      const highDensity = 'testing testing testing unit-testing test-automation test coverage';
      const lowDensity = 'occasional testing work';

      const highCaps = detector.detect(highDensity, 'high-test-agent');
      const lowCaps = detector.detect(lowDensity, 'low-test-agent');

      // High density should have more matched keywords
      const highTestCap = highCaps.find(c => c.capabilityId.includes('test'));
      const lowTestCap = lowCaps.find(c => c.capabilityId.includes('test'));

      if (highTestCap && lowTestCap) {
        expect(highTestCap.matchedKeywords.length).toBeGreaterThan(lowTestCap.matchedKeywords.length);
      }
    });
  });

  describe('Production-Specific Capabilities', () => {
    it('should detect design_token_compliance', () => {
      const content = 'Design token enforcement and pattern compliance specialist with SPACING and TYPOGRAPHY expertise';
      
      const capabilities = detector.detect(content, 'design-specialist');

      expect(capabilities).toContainEqual(
        expect.objectContaining({
          capabilityId: 'design_token_compliance',
        })
      );
    });

    it('should detect pagelayout_architecture', () => {
      const content = 'PageLayout architecture and layout pattern expert with ArchiveLayout specialization';
      
      const capabilities = detector.detect(content, 'layout-specialist');

      expect(capabilities).toContainEqual(
        expect.objectContaining({
          capabilityId: 'pagelayout_architecture',
        })
      );
    });

    it('should detect nextjs_architecture', () => {
      const content = 'Next.js App Router and Server Components specialist';
      
      const capabilities = detector.detect(content, 'nextjs-expert');

      expect(capabilities).toContainEqual(
        expect.objectContaining({
          capabilityId: 'nextjs_architecture',
        })
      );
    });
  });

  describe('Mandatory Capabilities', () => {
    it('should include mandatory capabilities by default', () => {
      const content = 'Random agent content';
      
      const capabilities = detector.detect(content, 'random-agent');

      // pattern_enforcement is mandatory by default
      expect(capabilities).toContainEqual(
        expect.objectContaining({
          capabilityId: 'pattern_enforcement',
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const capabilities = detector.detect('', 'empty-agent');
      
      // Should at least have mandatory capabilities
      expect(capabilities.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle content with no matching keywords (except mandatory)', () => {
      const capabilities = detector.detect('Lorem ipsum dolor sit amet', 'lorem-agent');
      
      // Should only have mandatory capabilities
      expect(capabilities.every(c => c.matchedKeywords.includes('mandatory'))).toBe(true);
    });

    it('should handle very long content efficiently', () => {
      const longContent = 'testing performance optimization security '.repeat(1000);
      
      const start = Date.now();
      const capabilities = detector.detect(longContent, 'long-content-agent');
      const duration = Date.now() - start;

      expect(capabilities).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should complete in <1s
    });
  });
});

describe('ConfidenceInitializer', () => {
  let initializer: ConfidenceInitializer;

  beforeEach(() => {
    initializer = new ConfidenceInitializer();
  });

  describe('Initial Confidence Assignment', () => {
    it('should assign default initial confidence of 0.50 for unvalidated agents', () => {
      const confidence = initializer.initializeConfidence(0.75, false, 0);

      // New agent with no validation should get baseline confidence
      expect(confidence).toBeGreaterThanOrEqual(0.40);
      expect(confidence).toBeLessThanOrEqual(0.60);
    });

    it('should support custom initial confidence values', () => {
      const customInitializer = new ConfidenceInitializer({
        initialConfidence: 0.60,
      });

      const confidence = customInitializer.initializeConfidence(0.75, false, 0);

      expect(confidence).toBeGreaterThanOrEqual(0.50);
      expect(confidence).toBeLessThanOrEqual(0.70);
    });

    it('should blend detection confidence with baseline', () => {
      const highDetectionConf = initializer.initializeConfidence(0.90, false, 0);
      const lowDetectionConf = initializer.initializeConfidence(0.20, false, 0);

      expect(highDetectionConf).toBeGreaterThan(lowDetectionConf);
    });
  });

  describe('Gradual Validation Support', () => {
    it('should progress through validation tiers: initial -> validated -> proven', () => {
      const tier1 = initializer.initializeConfidence(0.75, false, 0); // Initial
      const tier2 = initializer.initializeConfidence(0.75, true, 0); // After validation
      const tier3 = initializer.initializeConfidence(0.75, true, 10); // After 10 completions

      expect(tier1).toBeLessThan(tier2);
      expect(tier2).toBeLessThanOrEqual(tier3);
      expect(tier3).toBeGreaterThanOrEqual(0.85);
    });

    it('should support custom validation tiers', () => {
      const customInitializer = new ConfidenceInitializer({
        initialConfidence: 0.40,
        validatedConfidence: 0.75,
        provenConfidence: 0.95,
        completionsForProvenStatus: 5,
      });

      const initial = customInitializer.initializeConfidence(0.75, false, 0);
      const validated = customInitializer.initializeConfidence(0.75, true, 0);
      const proven = customInitializer.initializeConfidence(0.75, true, 5);

      expect(validated).toBe(0.75);
      expect(proven).toBe(0.95);
    });

    it('should increase confidence gradually with successful completions', () => {
      const conf1 = initializer.initializeConfidence(0.75, true, 1);
      const conf5 = initializer.initializeConfidence(0.75, true, 5);
      const conf10 = initializer.initializeConfidence(0.75, true, 10);

      expect(conf5).toBeGreaterThan(conf1);
      expect(conf10).toBeGreaterThanOrEqual(conf5);
    });
  });

  describe('Validation Recommendations', () => {
    it('should provide recommendations for improving confidence', () => {
      const recommendations = initializer.getValidationRecommendations(0.50, 0);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.includes('validation'))).toBe(true);
    });

    it('should recommend completing tasks for proven status', () => {
      const recommendations = initializer.getValidationRecommendations(0.85, 5);

      expect(recommendations.some(r => r.includes('remaining') || r.includes('more'))).toBe(true);
    });

    it('should not recommend further improvements when proven', () => {
      const recommendations = initializer.getValidationRecommendations(0.92, 10);

      // Should have minimal or no critical recommendations
      expect(recommendations.length).toBeLessThan(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle detection confidence of 0', () => {
      const confidence = initializer.initializeConfidence(0, false, 0);

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle detection confidence of 1', () => {
      const confidence = initializer.initializeConfidence(1.0, false, 0);

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should cap confidence at 1.0', () => {
      const confidence = initializer.initializeConfidence(1.0, true, 100);

      expect(confidence).toBeLessThanOrEqual(1.0);
    });
  });
});

describe('CapabilityBootstrap', () => {
  let bootstrap: CapabilityBootstrap;

  beforeEach(() => {
    bootstrap = new CapabilityBootstrap();
  });

  describe('Single Agent Bootstrap', () => {
    it('should bootstrap agent from markdown source', async () => {
      const source: AgentSource = {
        type: 'markdown',
        content: `---
name: test-agent
description: Testing specialist
---

# Test Agent

Expert in unit testing and test automation.
`,
      };

      const result = await bootstrap.bootstrap(source);

      expect(result.agentId).toBe('test-agent');
      expect(result.manifest).toBeDefined();
      expect(result.manifest.agent_id).toBe('test-agent');
      expect(result.manifest.capabilities.length).toBeGreaterThan(0);
    });

    it('should detect capabilities automatically', async () => {
      const source: AgentSource = {
        type: 'markdown',
        content: `---
name: security-agent
description: Security specialist
---

Security audit specialist with OWASP compliance expertise.
`,
      };

      const result = await bootstrap.bootstrap(source);

      expect(result.detectedCapabilities.length).toBeGreaterThan(0);
      expect(result.detectedCapabilities.some(c => c.capabilityId.includes('security'))).toBe(true);
    });

    it('should assign initial confidence values', async () => {
      const source: AgentSource = {
        type: 'markdown',
        content: `---
name: new-agent
description: New agent for testing
---

New agent for testing.
`,
      };

      const result = await bootstrap.bootstrap(source);

      result.manifest.capabilities.forEach(cap => {
        expect(cap.confidence_level).toBeGreaterThanOrEqual(0.0);
        expect(cap.confidence_level).toBeLessThanOrEqual(1.0);
      });
    });

    it('should generate warnings for agents with no detected capabilities', async () => {
      const source: AgentSource = {
        type: 'markdown',
        content: `---
name: minimal-agent
---

Minimal content with no clear capabilities.
`,
      };

      const result = await bootstrap.bootstrap(source);

      // Should have at least mandatory capabilities
      expect(result.manifest.capabilities.length).toBeGreaterThanOrEqual(1);
    });

    it('should provide suggestions for improving manifests', async () => {
      const source: AgentSource = {
        type: 'markdown',
        content: `---
name: suggestion-test-agent
description: Test agent
---

Basic agent description.
`,
      };

      const result = await bootstrap.bootstrap(source);

      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('Batch Bootstrap', () => {
    it('should bootstrap multiple agents', async () => {
      const sources: AgentSource[] = [
        {
          type: 'markdown',
          content: '---\nname: agent-1\ndescription: Testing agent\n---\nTesting agent',
        },
        {
          type: 'markdown',
          content: '---\nname: agent-2\ndescription: Debugging agent\n---\nDebugging agent',
        },
      ];

      const results = await bootstrap.bootstrapBatch(sources);

      expect(results).toHaveLength(2);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[1].agentId).toBe('agent-2');
    });

    it('should continue processing after individual failures', async () => {
      const sources: AgentSource[] = [
        { type: 'markdown', content: '---\nname: valid-1\n---\nValid content' },
        { type: 'typescript' as any, agentObject: null }, // Will fail
        { type: 'markdown', content: '---\nname: valid-2\n---\nValid content' },
      ];

      const results = await bootstrap.bootstrapBatch(sources);

      // Should have successful results even with failures
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.agentId === 'valid-1' || r.agentId === 'valid-2')).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should produce valid manifest ready for registry', async () => {
      const source: AgentSource = {
        type: 'markdown',
        content: `---
name: integration-test-agent
description: Integration testing
---

Specialist in integration testing and API testing.
`,
      };

      const result = await bootstrap.bootstrap(source);

      // Validate manifest structure
      expect(result.manifest).toMatchObject({
        agent_id: expect.any(String),
        capabilities: expect.any(Array),
        overall_confidence: expect.any(Number),
        specializations: expect.any(Array),
        last_updated: expect.any(String),
      });

      // Validate capability structure
      result.manifest.capabilities.forEach(cap => {
        expect(cap).toMatchObject({
          capability: expect.any(String),
          confidence_level: expect.any(Number),
        });
      });
    });

    it('should calculate overall confidence as average', async () => {
      const source: AgentSource = {
        type: 'markdown',
        content: `---
name: conf-test-agent
description: Confidence calculation test
---

Security and testing expert with performance optimization skills.
`,
      };

      const result = await bootstrap.bootstrap(source);

      const avgConfidence = result.manifest.capabilities.reduce((sum, c) => sum + c.confidence_level, 0) /
                          result.manifest.capabilities.length;

      expect(result.manifest.overall_confidence).toBeCloseTo(avgConfidence, 2);
    });
  });
});
