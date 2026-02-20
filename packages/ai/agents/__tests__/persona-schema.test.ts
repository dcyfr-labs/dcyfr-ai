import { describe, it, expect } from 'vitest';
import {
  validatePersona,
  safeValidatePersona,
  personalityTraitSchema,
  personalityTraitsSchema,
} from '../schema.js';

describe('AgentPersona Schema Validation (Task 2.6)', () => {
  describe('personalityTraitSchema', () => {
    it('should accept valid trait values (0-1 range)', () => {
      expect(personalityTraitSchema.parse(0)).toBe(0);
      expect(personalityTraitSchema.parse(0.5)).toBe(0.5);
      expect(personalityTraitSchema.parse(1)).toBe(1);
      expect(personalityTraitSchema.parse(0.7)).toBe(0.7);
    });

    it('should reject trait values outside 0-1 range', () => {
      expect(() => personalityTraitSchema.parse(-0.1)).toThrow();
      expect(() => personalityTraitSchema.parse(1.1)).toThrow();
      expect(() => personalityTraitSchema.parse(-1)).toThrow();
      expect(() => personalityTraitSchema.parse(2)).toThrow();
    });

    it('should reject non-numeric values', () => {
      expect(() => personalityTraitSchema.parse('0.5')).toThrow();
      expect(() => personalityTraitSchema.parse(null)).toThrow();
      expect(() => personalityTraitSchema.parse(undefined)).toThrow();
      expect(() => personalityTraitSchema.parse({})).toThrow();
    });
  });

  describe('personalityTraitsSchema', () => {
    it('should accept valid trait objects with standard traits', () => {
      const traits = {
        warmth: 0.7,
        formality: 0.4,
        humor: 0.3,
        directness: 0.9,
        technicality: 0.8,
        empathy: 0.75,
      };
      const result = personalityTraitsSchema.parse(traits);
      expect(result).toEqual(traits);
    });

    it('should accept partial trait objects', () => {
      const traits = { warmth: 0.7, directness: 0.9 };
      const result = personalityTraitsSchema.parse(traits);
      expect(result).toEqual(traits);
    });

    it('should accept empty trait objects', () => {
      const result = personalityTraitsSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept custom traits (catchall)', () => {
      const traits = { creativity: 0.6, leadership: 0.8 };
      const result = personalityTraitsSchema.parse(traits);
      expect(result).toEqual(traits);
    });

    it('should reject trait objects with invalid values', () => {
      expect(() => 
        personalityTraitsSchema.parse({ warmth: 1.5 })
      ).toThrow();
      expect(() => 
        personalityTraitsSchema.parse({ formality: -0.1 })
      ).toThrow();
      expect(() => 
        personalityTraitsSchema.parse({ humor: 'high' })
      ).toThrow();
    });
  });

  describe('validatePersona', () => {
    it('should validate a complete valid persona', () => {
      const persona = {
        identity: {
          name: 'Security Guardian',
          archetype: 'The Protector',
          description: 'Expert in security auditing and vulnerability detection',
        },
        voice: {
          attributes: ['Security-focused', 'Thorough', 'Risk-aware'],
          personalityTraits: {
            warmth: 0.6,
            formality: 0.8,
            directness: 0.9,
            technicality: 0.9,
          },
          perspective: 'first-person-singular' as const,
        },
        situationalTones: [
          {
            situation: 'vulnerability_found',
            traitAdjustments: { directness: '1.0', urgency: '0.9' },
            guidance: 'Immediately highlight the risk severity and provide clear remediation steps',
          },
        ],
        antiPatterns: ['Downplay security risks', 'Skip explaining potential impact'],
      };
      const result = validatePersona(persona);
      expect(result).toEqual(persona);
    });

    it('should validate minimal persona with optional fields', () => {
      const persona = { identity: { name: 'Test Agent' } };
      const result = validatePersona(persona);
      expect(result).toEqual(persona);
    });

    it('should validate empty persona', () => {
      const result = validatePersona({});
      expect(result).toEqual({});
    });

    it('should reject persona with invalid trait ranges', () => {
      const persona = {
        voice: {
          personalityTraits: { warmth: 2.0 }, // Invalid: > 1
        },
      };
      expect(() => validatePersona(persona)).toThrow();
    });

    it('should reject persona with invalid situational tone structure', () => {
      const persona = {
        situationalTones: [
          { situation: '', guidance: 'test' }, // Invalid: empty situation
        ],
      };
      expect(() => validatePersona(persona)).toThrow();
    });
  });

  describe('safeValidatePersona', () => {
    it('should return success for valid persona', () => {
      const persona = {
        identity: { name: 'Test Agent' },
        voice: { attributes: ['Helpful'] },
      };
      const result = safeValidatePersona(persona);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(persona);
      }
    });

    it('should return error for invalid persona', () => {
      const persona = {
        voice: {
          personalityTraits: { warmth: 'invalid' }, // Invalid: not a number
        },
      };
      const result = safeValidatePersona(persona);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.issues?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it('should return error for missing required fields in situational tones', () => {
      const persona = {
        situationalTones: [
          { guidance: 'test' }, // Missing required 'situation' field
        ],
      };
      const result = safeValidatePersona(persona);
      expect(result.success).toBe(false);
    });
  });
});
