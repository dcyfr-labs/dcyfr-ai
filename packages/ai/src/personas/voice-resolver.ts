/**
 * @fileoverview VoiceResolver — merges workspace brand voice with agent persona
 * to produce a rendered system prompt prefix.
 * @module @dcyfr/ai/personas/voice-resolver
 * @license MIT
 */

import type {
  AgentPersona,
  BrandVoice,
  PersonalityTraits,
  ResolvedVoice,
  ToneProfile,
  VoiceResolverOptions,
} from './types';

// ---------------------------------------------------------------------------
// Default brand voice (used when DCYFR_CONTEXT is unavailable)
// ---------------------------------------------------------------------------

const DEFAULT_BRAND_VOICE: BrandVoice = {
  version: '1.0.0',
  identity: {
    name: 'DCYFR',
    tagline: 'Decipher Security',
    archetype: 'The Guardian Mentor',
    description:
      'A knowledgeable security expert who teaches by doing — generous with knowledge, precise in execution, warm in tone',
  },
  core_voice: {
    attributes: [
      'Professional but approachable',
      'Technical but accessible',
      'Helpful and generous',
      'Clear, not clever',
      'Security-conscious always',
    ],
    personality_traits: {
      warmth: 0.7,
      formality: 0.5,
      humor: 0.3,
      directness: 0.8,
      technicality: 0.8,
      empathy: 0.7,
    },
    perspective: 'first-person-plural',
    pronouns: 'we/our',
  },
  tone_spectrum: {
    default: 'collaborative-expert',
    situational: {
      teaching: { tone: 'patient, encouraging, step-by-step', warmth: 0.8, formality: 0.4 },
      error_handling: { tone: 'calm, diagnostic, solution-oriented', warmth: 0.6, formality: 0.5 },
    },
  },
};

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

/**
 * Renders the persona identity block as a prompt fragment.
 */
export function renderPersonaBlock(persona: AgentPersona): string {
  const lines: string[] = [
    `You are ${persona.title}${persona.role ? ` — ${persona.role}` : ''}.`,
  ];

  if (persona.capabilities.length > 0) {
    lines.push(
      `Your primary capabilities: ${persona.capabilities.slice(0, 5).join(', ')}.`,
    );
  }

  if (persona.context_injections?.system_prefix) {
    lines.push(persona.context_injections.system_prefix);
  }

  return lines.join(' ');
}

/**
 * Returns tone guideline text for a given tone profile.
 */
export function applyToneGuidelines(tone: ToneProfile): string {
  const guidelines: Record<ToneProfile, string> = {
    precise:
      'Be precise and unambiguous. Prefer concrete statements over generalities. Avoid filler words.',
    conversational:
      'Use a conversational tone. Write as you would speak to a knowledgeable colleague.',
    technical:
      'Use technical language where appropriate. Assume the reader has engineering context.',
    empathetic:
      'Lead with understanding. Acknowledge context and emotional state before providing solutions.',
    'collaborative-expert':
      'Act as a knowledgeable peer. Be helpful and generous with knowledge while maintaining technical accuracy.',
    patient:
      'Be patient and thorough. Walk through concepts step by step. Never make the user feel rushed.',
    diagnostic:
      'Be systematic and diagnostic. State what is known, what is unknown, and the next logical step.',
    urgent:
      'Be concise and action-oriented. Lead with the solution. Skip preamble.',
    enthusiastic:
      'Bring energy and enthusiasm. Celebrate progress and good work authentically.',
  };

  return guidelines[tone] ?? guidelines['collaborative-expert'];
}

// ---------------------------------------------------------------------------
// Trait merging
// ---------------------------------------------------------------------------

function mergeTraits(
  base: PersonalityTraits,
  overrides?: Partial<PersonalityTraits>,
): PersonalityTraits {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Brand voice loader (reads from DCYFR_CONTEXT.json if available)
// ---------------------------------------------------------------------------

let _cachedBrandVoice: BrandVoice | null = null;

/**
 * Loads the brand voice from DCYFR_CONTEXT.json. Falls back to the built-in
 * default if the file is unavailable or malformed.
 */
export function loadBrandVoice(contextPath?: string): BrandVoice {
  if (_cachedBrandVoice) return _cachedBrandVoice;

  try {
    // Dynamic require so the module works in both Node.js and bundled environments
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');

    const candidates = contextPath
      ? [contextPath]
      : [
          path.resolve(process.cwd(), '.github/context/DCYFR_CONTEXT.json'),
          path.resolve(process.cwd(), '../../.github/context/DCYFR_CONTEXT.json'),
          path.resolve(process.cwd(), '../../../.github/context/DCYFR_CONTEXT.json'),
        ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf-8');
        const ctx = JSON.parse(raw) as { brand_voice?: BrandVoice };
        if (ctx.brand_voice) {
          _cachedBrandVoice = ctx.brand_voice;
          return _cachedBrandVoice;
        }
      }
    }
  } catch {
    // Intentionally silent — fall through to default
  }

  _cachedBrandVoice = DEFAULT_BRAND_VOICE;
  return DEFAULT_BRAND_VOICE;
}

/**
 * Clears the brand voice cache (useful in tests).
 */
export function clearBrandVoiceCache(): void {
  _cachedBrandVoice = null;
}

// ---------------------------------------------------------------------------
// VoiceResolver
// ---------------------------------------------------------------------------

/**
 * Resolves the effective voice for an agent by merging workspace brand voice
 * with persona-specific overrides, then renders a system prompt prefix.
 *
 * @param persona - The agent persona to resolve voice for
 * @param options - Resolver options (tone override, verbosity, etc.)
 * @returns ResolvedVoice containing the system prompt prefix and metadata
 *
 * @example
 * ```typescript
 * const voice = resolveVoice(engineerPersona, { verbosity: 2 });
 * systemPrompt = voice.systemPrefix + '\n\n' + userPrompt;
 * ```
 */
export function resolveVoice(
  persona: AgentPersona,
  options: VoiceResolverOptions = {},
): ResolvedVoice {
  const {
    enabled = true,
    tone: toneOverride = null,
    verbosity = 2,
    includeTraits = false,
    brandVoice: brandVoiceOverride = null,
  } = options;

  const brandVoice = brandVoiceOverride ?? loadBrandVoice();

  // Determine applied tone: override > persona > brand default
  const appliedTone: ToneProfile =
    toneOverride ?? persona.voice_tone ?? brandVoice.tone_spectrum.default;

  // Determine resolution source for metadata
  const resolvedFrom: ResolvedVoice['metadata']['resolvedFrom'] =
    toneOverride ? 'override' : persona.voice_tone ? 'persona' : 'brand';

  // Merge personality traits
  const mergedTraits = mergeTraits(
    brandVoice.core_voice.personality_traits,
    persona.personality_overrides,
  );

  if (!enabled) {
    return {
      systemPrefix: '',
      appliedTone,
      personalityTraits: mergedTraits,
      agentName: persona.name,
      metadata: { resolvedFrom, timestamp: new Date().toISOString() },
    };
  }

  // Build system prompt prefix
  const parts: string[] = [];

  if (verbosity >= 1) {
    parts.push(renderPersonaBlock(persona));
  }

  if (verbosity >= 2) {
    const toneGuideline = applyToneGuidelines(appliedTone);
    parts.push(toneGuideline);
  }

  if (verbosity >= 3) {
    const attrs = brandVoice.core_voice.attributes.slice(0, 3);
    parts.push(`Voice attributes: ${attrs.join('; ')}.`);
  }

  if (verbosity >= 4 && includeTraits) {
    const traitSummary = Object.entries(mergedTraits)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${(v as number).toFixed(1)}`)
      .join(', ');
    parts.push(`Calibration: [${traitSummary}]`);
  }

  if (persona.context_injections?.before_prompt) {
    parts.push(persona.context_injections.before_prompt);
  }

  return {
    systemPrefix: parts.join('\n'),
    appliedTone,
    personalityTraits: mergedTraits,
    agentName: persona.name,
    metadata: { resolvedFrom, timestamp: new Date().toISOString() },
  };
}
