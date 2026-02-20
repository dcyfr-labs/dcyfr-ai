import { describe, it, expect } from 'vitest';
import { resolvePersona } from '../persona-resolver.js';
import type { BrandVoice } from '../persona-resolver.js';
import type { AgentPersona } from '../types.js';

describe('Persona Resolver (Task 3.4)', () => {
  const mockBrandVoice: BrandVoice = {
    identity: {
      name: 'DCYFR Labs',
      tagline: 'AI-first development platform',
      archetype: 'The Expert Guide',
      description: 'The knowledgeable technical peer who makes complex things accessible',
    },
    core_voice: {
      attributes: ['Professional', 'Approachable', 'Technical', 'Empathetic'],
      personality_traits: {
        warmth: 0.7,
        formality: 0.4,
        humor: 0.3,
        directness: 0.9,
        technicality: 0.8,
        empathy: 0.75,
      },
      perspective: 'The knowledgeable peer who empowers rather than impresses',
    },
    anti_patterns: [
      'Never talk down to users',
      'Never use corporate buzzwords without explanation',
      'Never be sarcastic about mistakes',
    ],
    tone_spectrum: {
      default: 'Professional, direct, and supportive',
      situational: {
        learning: { tone: 'Patient and encouraging with step-by-step guidance' },
        debugging: { tone: 'Calm and diagnostic, focused on root cause analysis' },
        rushing: { tone: 'Extremely concise, lead with the solution' },
      },
    },
  };

  describe('brand voice inheritance', () => {
    it('should inherit full brand voice when agent has no persona', () => {
      const resolved = resolvePersona(mockBrandVoice);

      expect(resolved.inheritsBrandVoice).toBe(true);
      expect(resolved.displayName).toBe('DCYFR Labs');
      expect(resolved.identity).toBe('The knowledgeable technical peer who makes complex things accessible');
      expect(resolved.voiceAttributes).toEqual(['Professional', 'Approachable', 'Technical', 'Empathetic']);
      expect(resolved.personalityTraits).toEqual({
        warmth: 0.7,
        formality: 0.4,
        humor: 0.3,
        directness: 0.9,
        technicality: 0.8,
        empathy: 0.75,
      });
      expect(resolved.antiPatterns).toEqual([
        'Never talk down to users',
        'Never use corporate buzzwords without explanation',
        'Never be sarcastic about mistakes',
      ]);
      expect(resolved.situationalTones).toHaveLength(3);
      expect(resolved.situationalTones.map(t => t.situation)).toEqual(['learning', 'debugging', 'rushing']);
    });

    it('should merge agent overrides with brand voice defaults', () => {
      const agentPersona: AgentPersona = {
        identity: {
          name: 'Security Guardian',
          description: 'Expert in security auditing and vulnerability detection',
        },
        voice: {
          attributes: ['Security-focused', 'Thorough'],
          personalityTraits: {
            directness: 0.95, // Override brand default
            technicality: 0.95, // Override brand default
          },
        },
        antiPatterns: ['Downplay security risks'],
        situationalTones: [
          {
            situation: 'vulnerability_found',
            traitAdjustments: { urgency: '0.9' },
            guidance: 'Immediately highlight risk severity',
          },
        ],
      };

      const resolved = resolvePersona(mockBrandVoice, agentPersona);

      expect(resolved.inheritsBrandVoice).toBe(true);
      expect(resolved.displayName).toBe('Security Guardian'); // Agent override
      expect(resolved.identity).toBe('Expert in security auditing and vulnerability detection'); // Agent override
      expect(resolved.voiceAttributes).toEqual([
        'Professional', 'Approachable', 'Technical', 'Empathetic', // Brand attributes
        'Security-focused', 'Thorough', // Agent additions
      ]);
      expect(resolved.personalityTraits).toEqual({
        warmth: 0.7, // Brand default
        formality: 0.4, // Brand default
        humor: 0.3, // Brand default
        directness: 0.95, // Agent override
        technicality: 0.95, // Agent override
        empathy: 0.75, // Brand default
      });
      expect(resolved.antiPatterns).toEqual([
        'Never talk down to users', // Brand patterns
        'Never use corporate buzzwords without explanation',
        'Never be sarcastic about mistakes',
        'Downplay security risks', // Agent addition
      ]);
      expect(resolved.situationalTones).toHaveLength(4); // 3 brand + 1 agent
      expect(resolved.situationalTones.find(t => t.situation === 'vulnerability_found')).toEqual({
        situation: 'vulnerability_found',
        traitAdjustments: { urgency: '0.9' },
        guidance: 'Immediately highlight risk severity',
      });
    });
  });

  describe('inheritsBrandVoice: false', () => {
    it('should use only agent fields when inheritsBrandVoice is false', () => {
      const agentPersona: AgentPersona = {
        inheritsBrandVoice: false,
        identity: {
          name: 'Independent Agent',
          description: 'Operates with custom voice only',
        },
        voice: {
          attributes: ['Custom', 'Independent'],
          personalityTraits: {
            warmth: 0.2,
            directness: 1.0,
          },
          perspective: 'third-person',
        },
        antiPatterns: ['Agent-specific pattern'],
      };

      const resolved = resolvePersona(mockBrandVoice, agentPersona);

      expect(resolved.inheritsBrandVoice).toBe(false);
      expect(resolved.displayName).toBe('Independent Agent');
      expect(resolved.voiceAttributes).toEqual(['Custom', 'Independent']); // No brand attributes
      expect(resolved.personalityTraits).toEqual({
        warmth: 0.2,
        directness: 1.0,
      }); // No brand traits
      expect(resolved.antiPatterns).toEqual(['Agent-specific pattern']); // No brand patterns
      expect(resolved.situationalTones).toHaveLength(0); // No brand tones
    });
  });

  describe('array deduplication', () => {
    it('should deduplicate voice attributes', () => {
      const agentPersona: AgentPersona = {
        voice: {
          attributes: ['Professional', 'Technical', 'Custom'], // 'Professional' and 'Technical' duplicate brand
        },
      };

      const resolved = resolvePersona(mockBrandVoice, agentPersona);

      expect(resolved.voiceAttributes).toEqual([
        'Professional', 'Approachable', 'Technical', 'Empathetic', 'Custom',
      ]);
      // Should not have duplicates
      const uniqueAttributes = [...new Set(resolved.voiceAttributes)];
      expect(resolved.voiceAttributes).toEqual(uniqueAttributes);
    });

    it('should deduplicate anti-patterns', () => {
      const agentPersona: AgentPersona = {
        antiPatterns: [
          'Never talk down to users', // Duplicates brand
          'Agent-specific pattern',
        ],
      };

      const resolved = resolvePersona(mockBrandVoice, agentPersona);

      expect(resolved.antiPatterns).toContain('Never talk down to users');
      expect(resolved.antiPatterns).toContain('Agent-specific pattern');
      // Should not have duplicates
      const uniquePatterns = [...new Set(resolved.antiPatterns)];
      expect(resolved.antiPatterns).toEqual(uniquePatterns);
    });
  });

  describe('situational tone merging', () => {
    it('should override brand tones when agent defines same situation', () => {
      const agentPersona: AgentPersona = {
        situationalTones: [
          {
            situation: 'debugging', // Overrides brand 'debugging' tone
            traitAdjustments: { focus: '1.0' },
            guidance: 'Agent-specific debugging approach',
          },
          {
            situation: 'custom_situation',
            traitAdjustments: {},
            guidance: 'Custom guidance',
          },
        ],
      };

      const resolved = resolvePersona(mockBrandVoice, agentPersona);

      const debuggingTone = resolved.situationalTones.find(t => t.situation === 'debugging');
      expect(debuggingTone?.guidance).toBe('Agent-specific debugging approach'); // Agent override
      
      const customTone = resolved.situationalTones.find(t => t.situation === 'custom_situation');
      expect(customTone?.guidance).toBe('Custom guidance'); // Agent addition
      
      // Should still have brand 'learning' and 'rushing' tones
      expect(resolved.situationalTones.find(t => t.situation === 'learning')).toBeDefined();
      expect(resolved.situationalTones.find(t => t.situation === 'rushing')).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined brand voice gracefully', () => {
      const agentPersona: AgentPersona = {
        identity: { name: 'Test Agent' },
        voice: { attributes: ['Test'] },
      };

      const resolved = resolvePersona(undefined, agentPersona);

      expect(resolved.displayName).toBe('Test Agent');
      expect(resolved.voiceAttributes).toEqual(['Test']);
      expect(resolved.personalityTraits).toEqual({});
      expect(resolved.situationalTones).toHaveLength(0);
      expect(resolved.antiPatterns).toHaveLength(0);
    });

    it('should handle empty brand voice gracefully', () => {
      const resolved = resolvePersona({});

      expect(resolved.voiceAttributes).toEqual([]);
      expect(resolved.personalityTraits).toEqual({});
      expect(resolved.situationalTones).toHaveLength(0);
      expect(resolved.antiPatterns).toHaveLength(0);
    });
  });
});
