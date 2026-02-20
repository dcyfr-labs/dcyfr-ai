/**
 * Agent Persona Validation Schema
 * 
 * Zod schemas for validating AgentPersona and related types.
 * Ensures all personality traits are in 0-1 range and required fields are present.
 * 
 * @module @dcyfr/ai/agents/schema
 * @version 1.0.0
 */

import { z } from 'zod';

/**
 * Personality trait value schema (0-1 range)
 */
export const personalityTraitSchema = z.number().min(0).max(1);

/**
 * Personality traits schema
 */
export const personalityTraitsSchema = z.object({
  warmth: personalityTraitSchema.optional(),
  formality: personalityTraitSchema.optional(),
  humor: personalityTraitSchema.optional(),
  directness: personalityTraitSchema.optional(),
  technicality: personalityTraitSchema.optional(),
  empathy: personalityTraitSchema.optional(),
}).catchall(personalityTraitSchema); // Allow custom traits

/**
 * Situational tone schema
 */
export const situationalToneSchema = z.object({
  situation: z.string().min(1),
  traitAdjustments: z.record(z.string(), z.string()),
  guidance: z.string().min(1),
});

/**
 * Intent signal schema
 */
export const intentSignalSchema = z.object({
  type: z.enum(['learning', 'debugging', 'building', 'reviewing', 'exploring', 'rushing']),
  filePatterns: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  guidance: z.string().min(1),
});

/**
 * Proactive guidance schema
 */
export const proactiveGuidanceSchema = z.object({
  intentSignals: z.array(intentSignalSchema).optional(),
  contextAdaptation: z.string().optional(),
});

/**
 * Agent persona identity schema
 */
export const agentPersonaIdentitySchema = z.object({
  name: z.string().optional(),
  archetype: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Agent persona voice schema
 */
export const agentPersonaVoiceSchema = z.object({
  attributes: z.array(z.string()).optional(),
  personalityTraits: personalityTraitsSchema.optional(),
  perspective: z.enum(['first-person-singular', 'first-person-plural', 'second-person', 'third-person']).optional(),
  pronouns: z.string().optional(),
});

/**
 * Complete agent persona schema
 */
export const agentPersonaSchema = z.object({
  identity: agentPersonaIdentitySchema.optional(),
  voice: agentPersonaVoiceSchema.optional(),
  situationalTones: z.array(situationalToneSchema).optional(),
  antiPatterns: z.array(z.string()).optional(),
  proactiveGuidance: proactiveGuidanceSchema.optional(),
});

/**
 * Validate persona against schema
 * @param persona - AgentPersona object to validate
 * @returns Validated persona or throws ZodError
 */
export function validatePersona(persona: unknown): z.infer<typeof agentPersonaSchema> {
  return agentPersonaSchema.parse(persona);
}

/**
 * Safely validate persona with error handling
 * @param persona - AgentPersona object to validate
 * @returns { success: true, data } or { success: false, error }
 */
export function safeValidatePersona(persona: unknown): 
  | { success: true; data: z.infer<typeof agentPersonaSchema> }
  | { success: false; error: z.ZodError } {
  const result = agentPersonaSchema.safeParse(persona);
  return result;
}
