/**
 * @fileoverview Brand voice and agent persona type definitions for DCYFR AI framework
 * @module @dcyfr/ai/personas/types
 * @license MIT
 */

/**
 * Tone profile for different communication scenarios
 */
export type ToneProfile =
  | 'precise'
  | 'conversational'
  | 'technical'
  | 'empathetic'
  | 'collaborative-expert'
  | 'patient'
  | 'diagnostic'
  | 'urgent'
  | 'enthusiastic';

/**
 * Personality trait score (0.0 = none, 1.0 = maximum)
 */
export interface PersonalityTraits {
  warmth: number;
  formality: number;
  humor?: number;
  directness: number;
  technicality: number;
  empathy: number;
}

/**
 * Situational tone adjustment
 */
export interface SituationalTone {
  tone: string;
  warmth: number;
  formality: number;
}

/**
 * Core brand identity
 */
export interface BrandIdentity {
  name: string;
  tagline: string;
  archetype: string;
  description: string;
}

/**
 * Core voice attributes
 */
export interface CoreVoice {
  attributes: string[];
  personality_traits: PersonalityTraits;
  perspective: 'first-person' | 'first-person-plural' | 'second-person' | 'third-person';
  pronouns: string;
}

/**
 * Tone spectrum with default and situational variants
 */
export interface ToneSpectrum {
  default: ToneProfile;
  situational: Record<string, SituationalTone>;
}

/**
 * Workspace-level brand voice (from DCYFR_CONTEXT.json)
 */
export interface BrandVoice {
  version: string;
  identity: BrandIdentity;
  core_voice: CoreVoice;
  tone_spectrum: ToneSpectrum;
}

/**
 * Agent-specific persona configuration
 */
export interface AgentPersona {
  /**
   * Agent identifier (e.g., 'dcyfr-engineer', 'dcyfr-analyst')
   */
  name: string;

  /**
   * Human-readable display title
   */
  title: string;

  /**
   * Agent role description
   */
  role: string;

  /**
   * Primary capabilities
   */
  capabilities: string[];

  /**
   * Voice tone override (null = use brand default)
   */
  voice_tone: ToneProfile | null;

  /**
   * Personality trait overrides (null = use brand defaults)
   */
  personality_overrides?: Partial<PersonalityTraits>;

  /**
   * Context-specific prompt injections
   */
  context_injections?: {
    before_prompt?: string;
    after_prompt?: string;
    system_prefix?: string;
  };

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Voice resolver options
 */
export interface VoiceResolverOptions {
  /**
   * Enable voice resolution (default: true)
   */
  enabled?: boolean;

  /**
   * Override tone (null = use persona default)
   */
  tone?: ToneProfile | null;

  /**
   * Verbosity level (0 = minimal, 5 = maximum)
   */
  verbosity?: number;

  /**
   * Include personality trait scores in output
   */
 includeTraits?: boolean;

  /**
   * Custom brand voice (null = load from DCYFR_CONTEXT)
   */
  brandVoice?: BrandVoice | null;
}

/**
 * Resolved voice output
 */
export interface ResolvedVoice {
  /**
   * System prompt prefix (inject before main prompt)
   */
  systemPrefix: string;

  /**
   * Applied tone profile
   */
  appliedTone: ToneProfile;

  /**
   * Merged personality traits
   */
  personalityTraits: PersonalityTraits;

  /**
   * Agent name
   */
  agentName: string;

  /**
   * Resolution metadata
   */
  metadata: {
    resolvedFrom: 'brand' | 'persona' | 'override';
    timestamp: string;
  };
}

/**
 * Persona loader options
 */
export interface PersonaLoaderOptions {
  /**
   * Base directory for agent profiles (default: 'agents/')
   */
  baseDir?: string;

  /**
   * Allow fallback to default persona (default: true)
   */
  allowFallback?: boolean;

  /**
   * Cache loaded personas (default: true)
   */
  useCache?: boolean;

  /**
   * Validate against AgentPersona schema (default: true)
   */
  validate?: boolean;
}

/**
 * Persona load result
 */
export interface PersonaLoadResult {
  /**
   * Loaded persona
   */
  persona: AgentPersona;

  /**
   * Load source
   */
  source: 'file' | 'cache' | 'fallback';

  /**
   * Load path (if loaded from file)
   */
  path?: string;

  /**
   * Validation errors (if any)
   */
  errors?: string[];
}
