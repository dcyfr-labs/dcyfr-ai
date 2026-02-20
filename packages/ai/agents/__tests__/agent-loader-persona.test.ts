import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoader } from '../agent-loader.js';
import type { DCYFRMemory } from '../../memory/types.js';
import type { TelemetryEngine } from '../../core/telemetry-engine.js';
import * as fs from 'node:fs/promises';

// Mock fs
vi.mock('node:fs/promises');
const mockFs = vi.mocked(fs);

// Mock modules
vi.mock('../../memory/types.js');
vi.mock('../../core/telemetry-engine.js');

describe('AgentLoader Persona Parsing (Task 2.7)', () => {
  let loader: AgentLoader;
  let mockMemory: DCYFRMemory;
  let mockTelemetry: TelemetryEngine;

  beforeEach(() => {
    mockMemory = {
      addAgentMemory: vi.fn().mockResolvedValue('mem-123'),
    } as unknown as DCYFRMemory;

    mockTelemetry = {
      agentLoadEvent: vi.fn(),
    } as unknown as TelemetryEngine;

    loader = new AgentLoader(mockMemory, mockTelemetry);
  });

  describe('parseAgentFromMarkdown with persona frontmatter', () => {
    it('should parse agent with complete persona frontmatter', async () => {
      const markdownContent = `---
name: security-engineer
version: 2.0.0
description: Expert security auditing agent
category: security
tier: private
model: sonnet
permissionMode: acceptEdits
tools: ['security_scan', 'vulnerability_check']
persona:
  identity:
    name: Security Guardian
    archetype: The Protector
    description: Expert in security auditing and vulnerability detection
  voice:
    attributes:
      - Security-focused
      - Thorough
      - Risk-aware
    personalityTraits:
      warmth: 0.6
      formality: 0.8
      directness: 0.9
      technicality: 0.9
    perspective: first-person-singular
  situationalTones:
    - situation: vulnerability_found
      traitAdjustments:
        directness: '1.0'
        urgency: '0.9'
      guidance: Immediately highlight the risk severity and provide clear remediation steps
  antiPatterns:
    - Downplay security risks
    - Skip explaining potential impact
---

# Security Engineer

You are a security expert specializing in vulnerability detection.

## Core Capabilities

- Security auditing
- Vulnerability assessment
- Risk analysis
`;

      mockFs.readFile.mockResolvedValue(markdownContent);

      const agent = await loader['parseAgentFromMarkdown']('/test/security-engineer.agent.md');

      expect(agent.manifest.name).toBe('security-engineer');
      expect(agent.manifest.persona).toBeDefined();
      expect(agent.manifest.persona?.identity?.name).toBe('Security Guardian');
      expect(agent.manifest.persona?.identity?.archetype).toBe('The Protector');
      expect(agent.manifest.persona?.voice?.attributes).toEqual([
        'Security-focused',
        'Thorough', 
        'Risk-aware',
      ]);
      expect(agent.manifest.persona?.voice?.personalityTraits).toEqual({
        warmth: 0.6,
        formality: 0.8,
        directness: 0.9,
        technicality: 0.9,
      });
      expect(agent.manifest.persona?.situationalTones).toHaveLength(1);
      expect(agent.manifest.persona?.situationalTones?.[0]?.situation).toBe('vulnerability_found');
      expect(agent.manifest.persona?.antiPatterns).toEqual([
        'Downplay security risks',
        'Skip explaining potential impact',
      ]);
    });

    it('should parse agent without persona frontmatter', async () => {
      const markdownContent = `---
name: simple-agent
version: 1.0.0
description: Simple agent without persona
category: development
tier: public
model: haiku
permissionMode: readOnly
tools: ['basic_tool']
---

# Simple Agent

A basic agent without persona configuration.
`;

      mockFs.readFile.mockResolvedValue(markdownContent);

      const agent = await loader['parseAgentFromMarkdown']('/test/simple-agent.agent.md');

      expect(agent.manifest.name).toBe('simple-agent');
      expect(agent.manifest.persona).toBeUndefined();
    });

    it('should parse agent with partial persona frontmatter', async () => {
      const markdownContent = `---
name: partial-agent
version: 1.0.0
description: Agent with partial persona
category: development
tier: public
model: claude
permissionMode: readOnly
tools: []
persona:
  identity:
    name: Quick Helper
  voice:
    attributes:
      - Fast
      - Efficient
---

# Partial Agent

Agent with minimal persona configuration.
`;

      mockFs.readFile.mockResolvedValue(markdownContent);

      const agent = await loader['parseAgentFromMarkdown']('/test/partial-agent.agent.md');

      expect(agent.manifest.persona).toBeDefined();
      expect(agent.manifest.persona?.identity?.name).toBe('Quick Helper');
      expect(agent.manifest.persona?.identity?.description).toBeUndefined();
      expect(agent.manifest.persona?.voice?.attributes).toEqual(['Fast', 'Efficient']);
      expect(agent.manifest.persona?.voice?.personalityTraits).toBeUndefined();
      expect(agent.manifest.persona?.situationalTones).toBeUndefined();
    });

    it('should handle malformed persona frontmatter gracefully', async () => {
      const markdownContent = `---
name: malformed-agent
version: 1.0.0
description: Agent with malformed persona
category: development
tier: public
model: claude
permissionMode: readOnly
tools: []
persona:
  identity: "not an object"
  voice:
    personalityTraits:
      warmth: "not a number"
---

# Malformed Agent

Agent with invalid persona structure.
`;

      mockFs.readFile.mockResolvedValue(markdownContent);

      const agent = await loader['parseAgentFromMarkdown']('/test/malformed-agent.agent.md');

      expect(agent.manifest.persona).toBeDefined();
      // The persona should be parsed as-is from YAML, even if invalid
      // Validation happens at the schema level, not during loading
      expect(agent.manifest.persona?.identity).toBe('not an object');
    });

    it('should handle corrupt YAML frontmatter and still parse agent', async () => {
      const markdownContent = `---
name: corrupt-yaml-agent
version: 1.0.0
description: Agent with corrupt YAML
category: development
tier: public
model: claude
permissionMode: readOnly
tools: []
persona:
  identity:
    name: Test # Missing closing quotes or invalid YAML
    archetype: [
---

# Corrupt YAML Agent

Agent where YAML parsing might fail.
`;

      mockFs.readFile.mockResolvedValue(markdownContent);

      // Should not throw, but persona might be undefined or malformed
      const agent = await loader['parseAgentFromMarkdown']('/test/corrupt-yaml.agent.md');

      expect(agent.manifest.name).toBe('corrupt-yaml.agent');
      // Persona parsing failure should be handled gracefully
    });
  });
});
