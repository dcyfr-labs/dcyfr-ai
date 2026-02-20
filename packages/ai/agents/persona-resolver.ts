/**
 * Persona Resolver
 *
 * Merges canonical brand voice defaults with per-agent persona overrides to
 * produce a fully resolved persona for any agent. Agents that declare
 * `inheritsBrandVoice: false` receive only their own declared fields.
 *
 * @module @dcyfr/ai/agents/persona-resolver
 * @version 1.0.0
 */

import type { AgentPersona, PersonalityTraits, SituationalTone } from './types';

/**
 * Brand voice personality traits (from DCYFR_CONTEXT.json brand_voice block)
 */
export interface BrandVoiceTraits {
  warmth?: number;
  formality?: number;
  humor?: number;
  directness?: number;
  technicality?: number;
  empathy?: number;
  [key: string]: number | undefined;
}

/**
 * Minimal brand voice shape needed for persona resolution.
 * Maps to the structure of DCYFR_CONTEXT.json `brand_voice`.
 */
export interface BrandVoice {
  identity?: {
    name?: string;
    tagline?: string;
    archetype?: string;
    description?: string;
  };
  core_voice?: {
    attributes?: string[];
    personality_traits?: BrandVoiceTraits;
    perspective?: string;
  };
  anti_patterns?: string[];
  tone_spectrum?: {
    default?: string;
    situational?: Record<string, { tone: string }>;
  };
}

/**
 * Resolved persona — the merge product of brand voice + agent overrides.
 * All fields are fully concrete (no nullables from inheritance uncertainty).
 */
export interface ResolvedPersona {
  /** Display name for the agent (from agent persona or brand name) */
  displayName?: string;
  /** Identity statement */
  identity?: string;
  /** Voice attributes (merged or agent-only) */
  voiceAttributes: string[];
  /** Resolved personality traits (agent overrides win) */
  personalityTraits: BrandVoiceTraits;
  /** Perspective string */
  perspective?: string;
  /** Situational tones (brand + agent combined) */
  situationalTones: SituationalTone[];
  /** Anti-patterns (brand + agent combined, deduplicated) */
  antiPatterns: string[];
  /** Whether brand voice was inherited */
  inheritsBrandVoice: boolean;
}

/**
 * Resolve an agent's effective persona by merging brand voice defaults with
 * the agent's declared persona overrides.
 *
 * Merge rules:
 * - `personalityTraits`: agent overrides individual trait values; unset traits
 *   fall back to brand defaults.
 * - `voiceAttributes`: brand attributes + agent-specific attributes concatenated.
 * - `antiPatterns`: brand anti-patterns + agent anti-patterns, deduplicated.
 * - `situationalTones`: brand tones + agent-specific tones. Agent tones for the
 *   same `situation` key do NOT replace brand tones — both are surfaced since
 *   they may carry different `traitAdjustments` / `guidance`.
 * - `inheritsBrandVoice: false`: brand merging is skipped entirely; only agent
 *   declared fields are included.
 *
 * @param brandVoice - Brand voice block from DCYFR_CONTEXT.json (may be partial)
 * @param agentPersona - Per-agent persona from manifest (optional)
 * @returns Fully resolved persona ready for instruction template generation
 */
export function resolvePersona(
  brandVoice: BrandVoice | undefined,
  agentPersona?: AgentPersona,
): ResolvedPersona {
  const inherit = agentPersona?.inheritsBrandVoice !== false;

  if (!inherit) {
    // Agent opted out of brand inheritance — use agent-only fields
    return {
      displayName: agentPersona?.identity?.name,
      identity: agentPersona?.identity?.description,
      voiceAttributes: agentPersona?.voice?.attributes ?? [],
      personalityTraits: flattenTraits(agentPersona?.voice?.personalityTraits),
      perspective: agentPersona?.voice?.perspective,
      situationalTones: agentPersona?.situationalTones ?? [],
      antiPatterns: agentPersona?.antiPatterns ?? [],
      inheritsBrandVoice: false,
    };
  }

  // Brand defaults
  const brandTraits = brandVoice?.core_voice?.personality_traits ?? {};
  const brandAttributes = brandVoice?.core_voice?.attributes ?? [];
  const brandAntiPatterns = brandVoice?.anti_patterns ?? [];
  const brandTones = buildBrandTones(brandVoice?.tone_spectrum?.situational);

  // Agent overrides
  const agentTraits = flattenTraits(agentPersona?.voice?.personalityTraits);
  const agentAttributes = agentPersona?.voice?.attributes ?? [];
  const agentAntiPatterns = agentPersona?.antiPatterns ?? [];
  const agentTones = agentPersona?.situationalTones ?? [];

  // Merge
  const mergedTraits: BrandVoiceTraits = { ...brandTraits, ...agentTraits };
  const mergedAttributes = deduplicate([...brandAttributes, ...agentAttributes]);
  const mergedAntiPatterns = deduplicate([...brandAntiPatterns, ...agentAntiPatterns]);
  const mergedTones = mergeTones(brandTones, agentTones);

  return {
    displayName: agentPersona?.identity?.name ?? brandVoice?.identity?.name,
    identity: agentPersona?.identity?.description ?? brandVoice?.identity?.description,
    voiceAttributes: mergedAttributes,
    personalityTraits: mergedTraits,
    perspective: agentPersona?.voice?.perspective ?? brandVoice?.core_voice?.perspective,
    situationalTones: mergedTones,
    antiPatterns: mergedAntiPatterns,
    inheritsBrandVoice: true,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a flat Record<string, number> from the typed PersonalityTraits object
 */
function flattenTraits(traits?: PersonalityTraits): BrandVoiceTraits {
  if (!traits) return {};
  const result: BrandVoiceTraits = {};
  for (const [key, value] of Object.entries(traits)) {
    if (typeof value === 'number') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Convert brand voice situational tone map into SituationalTone[] for merging
 */
function buildBrandTones(
  situational?: Record<string, { tone: string }>,
): SituationalTone[] {
  if (!situational) return [];
  return Object.entries(situational).map(([situation, data]) => ({
    situation,
    traitAdjustments: {},
    guidance: data.tone,
  }));
}

/**
 * Merge brand tones with agent tones. Agent tones for the same situation key
 * override the brand tone entry (agent is more specific).
 */
function mergeTones(
  brandTones: SituationalTone[],
  agentTones: SituationalTone[],
): SituationalTone[] {
  const toneMap = new Map<string, SituationalTone>();
  for (const tone of brandTones) {
    toneMap.set(tone.situation, tone);
  }
  // Agent tones override brand tones for the same situation
  for (const tone of agentTones) {
    toneMap.set(tone.situation, tone);
  }
  return Array.from(toneMap.values());
}

/**
 * Deduplicate an array of strings preserving order
 */
function deduplicate(arr: string[]): string[] {
  return [...new Set(arr)];
}
