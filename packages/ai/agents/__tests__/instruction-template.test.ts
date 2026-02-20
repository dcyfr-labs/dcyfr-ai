import { describe, it, expect } from 'vitest';
import { generatePersonaInstructions } from '../instruction-template.js';
import type { ResolvedPersona } from '../persona-resolver.js';

describe('Instruction Template Generator (Task 3.5)', () => {
  describe('identity section generation', () => {
    it('should generate identity section with name and description', () => {
      const persona: ResolvedPersona = {
        displayName: 'Security Guardian',
        identity: 'Expert in security auditing and vulnerability detection',
        voiceAttributes: [],
        personalityTraits: {},
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.identity).toBeDefined();
      expect(instructions.identity).toContain('## Agent Identity');
      expect(instructions.identity).toContain('**Name:** Security Guardian');
      expect(instructions.identity).toContain('Expert in security auditing and vulnerability detection');
    });

    it('should generate identity section with name only', () => {
      const persona: ResolvedPersona = {
        displayName: 'Test Agent',
        voiceAttributes: [],
        personalityTraits: {},
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.identity).toBeDefined();
      expect(instructions.identity).toContain('**Name:** Test Agent');
      expect(instructions.identity).not.toContain('Expert in');
    });

    it('should not generate identity section when no name or description', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: ['Helpful'],
        personalityTraits: {},
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.identity).toBeUndefined();
    });
  });

  describe('communication style section generation', () => {
    it('should generate communication section with attributes and traits', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: ['Professional', 'Empathetic', 'Technical'],
        personalityTraits: {
          warmth: 0.7,
          formality: 0.4,
          humor: 0.2,
          directness: 0.9,
          technicality: 0.8,
          empathy: 0.8,
        },
        perspective: 'first-person-singular',
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.communicationStyle).toBeDefined();
      expect(instructions.communicationStyle).toContain('## How You Communicate');
      expect(instructions.communicationStyle).toContain('Your voice is:');
      expect(instructions.communicationStyle).toContain('- Professional');
      expect(instructions.communicationStyle).toContain('- Empathetic');
      expect(instructions.communicationStyle).toContain('- Technical');
      expect(instructions.communicationStyle).toContain('Your personality calibration:');
      expect(instructions.communicationStyle).toContain('**Warmth**: exceptionally warm and supportive (0.7)');
      expect(instructions.communicationStyle).toContain('**Formality**: professionally approachable (0.4)');
      expect(instructions.communicationStyle).toContain('**Humor**: focused and earnest — minimal humor (0.2)');
      expect(instructions.communicationStyle).toContain('**Directness**: extremely direct and concise — front-loads key information (0.9)');
      expect(instructions.communicationStyle).toContain('**Technicality**: highly technical and precise — assumes expert knowledge (0.8)');
      expect(instructions.communicationStyle).toContain('**Empathy**: highly empathetic — always acknowledges emotional context first (0.8)');
      expect(instructions.communicationStyle).toContain('**Perspective:** First-person singular ("I/my")');
    });

    it('should handle trait band classification correctly', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: [],
        personalityTraits: {
          warmth: 0.3, // low band
          directness: 0.5, // mid band
          empathy: 0.9, // high band
        },
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.communicationStyle).toContain('**Warmth**: professional and measured in warmth (0.3)');
      expect(instructions.communicationStyle).toContain('**Directness**: clear and direct (0.5)');
      expect(instructions.communicationStyle).toContain('**Empathy**: highly empathetic — always acknowledges emotional context first (0.9)');
    });

    it('should handle unknown traits gracefully', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: [],
        personalityTraits: {
          creativity: 0.6,
          leadership: 0.8,
        },
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.communicationStyle).toContain('**Creativity**: 0.6');
      expect(instructions.communicationStyle).toContain('**Leadership**: 0.8');
    });

    it('should not generate communication section when no attributes or traits', () => {
      const persona: ResolvedPersona = {
        displayName: 'Test Agent',
        voiceAttributes: [],
        personalityTraits: {},
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.communicationStyle).toBeUndefined();
    });
  });

  describe('situational adaptation section generation', () => {
    it('should generate situational adaptation section', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: [],
        personalityTraits: {},
        situationalTones: [
          {
            situation: 'vulnerability_found',
            traitAdjustments: { directness: '1.0' },
            guidance: 'Immediately highlight the risk severity and provide clear remediation steps',
          },
          {
            situation: 'user_learning',
            traitAdjustments: { patience: '0.9' },
            guidance: 'Be patient and provide step-by-step explanations',
          },
        ],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.situationalAdaptation).toBeDefined();
      expect(instructions.situationalAdaptation).toContain('## Situational Adaptation');
      expect(instructions.situationalAdaptation).toContain('Adjust your approach based on context:');
      expect(instructions.situationalAdaptation).toContain('**Vulnerability Found:** Immediately highlight the risk severity and provide clear remediation steps');
      expect(instructions.situationalAdaptation).toContain('**User Learning:** Be patient and provide step-by-step explanations');
    });

    it('should not generate situational adaptation section when no tones', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: ['Helpful'],
        personalityTraits: { warmth: 0.7 },
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.situationalAdaptation).toBeUndefined();
    });
  });

  describe('anti-patterns section generation', () => {
    it('should generate anti-patterns section', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: [],
        personalityTraits: {},
        situationalTones: [],
        antiPatterns: [
          'Never downplay security risks',
          'Never skip explaining potential impact',
          'Never use technical jargon without context',
        ],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.antiPatterns).toBeDefined();
      expect(instructions.antiPatterns).toContain('## You Never');
      expect(instructions.antiPatterns).toContain('- Never downplay security risks');
      expect(instructions.antiPatterns).toContain('- Never skip explaining potential impact');
      expect(instructions.antiPatterns).toContain('- Never use technical jargon without context');
    });

    it('should not generate anti-patterns section when no patterns', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: ['Helpful'],
        personalityTraits: { warmth: 0.7 },
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.antiPatterns).toBeUndefined();
    });
  });

  describe('combined output', () => {
    it('should combine all sections with proper spacing', () => {
      const persona: ResolvedPersona = {
        displayName: 'Security Guardian',
        identity: 'Expert in security auditing',
        voiceAttributes: ['Security-focused'],
        personalityTraits: { directness: 0.9 },
        situationalTones: [
          {
            situation: 'vulnerability_found',
            traitAdjustments: {},
            guidance: 'Act with urgency',
          },
        ],
        antiPatterns: ['Never ignore security warnings'],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.combined).toContain('## Agent Identity');
      expect(instructions.combined).toContain('## How You Communicate');
      expect(instructions.combined).toContain('## Situational Adaptation');
      expect(instructions.combined).toContain('## You Never');
      
      // Sections should be separated by double newlines
      const sections = instructions.combined.split('\n\n## ');
      expect(sections).toHaveLength(4); // 4 sections
    });

    it('should handle minimal persona with only one section', () => {
      const persona: ResolvedPersona = {
        displayName: 'Simple Agent',
        voiceAttributes: [],
        personalityTraits: {},
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.combined).toContain('## Agent Identity');
      expect(instructions.combined).not.toContain('## How You Communicate');
      expect(instructions.combined).not.toContain('## Situational Adaptation');
      expect(instructions.combined).not.toContain('## You Never');
    });

    it('should handle empty persona gracefully', () => {
      const persona: ResolvedPersona = {
        voiceAttributes: [],
        personalityTraits: {},
        situationalTones: [],
        antiPatterns: [],
        inheritsBrandVoice: true,
      };

      const instructions = generatePersonaInstructions(persona);

      expect(instructions.combined).toBe('');
      expect(instructions.identity).toBeUndefined();
      expect(instructions.communicationStyle).toBeUndefined();
      expect(instructions.situationalAdaptation).toBeUndefined();
      expect(instructions.antiPatterns).toBeUndefined();
    });
  });
});
