/**
 * @fileoverview BeforeLLMCallHook — injects resolved brand voice and agent
 * persona prefix into the system prompt before each LLM call.
 * @module @dcyfr/ai/personas/hooks/before-llm-call
 * @license MIT
 */

import type { AgentPersona, ResolvedVoice, VoiceResolverOptions } from '../types';
import { loadPersona } from '../persona-loader';
import { resolveVoice } from '../voice-resolver';

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

/**
 * Input context passed to a BeforeLLMCallHook.
 */
export interface BeforeLLMCallInput {
  /**
   * Current system prompt (may be empty string)
   */
  systemPrompt: string;

  /**
   * Agent name to resolve persona for (e.g., 'dcyfr-engineer')
   */
  agentName?: string;

  /**
   * Pre-loaded persona (skips persona loading if provided)
   */
  persona?: AgentPersona;

  /**
   * Additional context string (e.g., conversation topic, task type)
   */
  context?: string;
}

/**
 * Output returned by a BeforeLLMCallHook.
 */
export interface BeforeLLMCallOutput {
  /**
   * Modified system prompt with voice prefix injected
   */
  systemPrompt: string;

  /**
   * The voice that was resolved and applied
   */
  resolvedVoice: ResolvedVoice;

  /**
   * Whether the hook was skipped (enabled: false or error)
   */
  skipped: boolean;
}

/**
 * Configuration for the BeforeLLMCallHook
 */
export interface BeforeLLMCallHookConfig {
  /**
   * Enable or disable the hook (default: true)
   */
  enabled?: boolean;

  /**
   * Voice resolver options (tone, verbosity, etc.)
   */
  voiceOptions?: VoiceResolverOptions;

  /**
   * Separator between injected prefix and existing system prompt
   * (default: '\n\n')
   */
  separator?: string;

  /**
   * Placement: prepend (default) or append the voice prefix
   */
  placement?: 'prepend' | 'append';
}

// ---------------------------------------------------------------------------
// Interface (for implementors)
// ---------------------------------------------------------------------------

/**
 * Interface for before-LLM-call hooks.
 * Implement this to create custom pre-call transformations.
 */
export interface BeforeLLMCallHook {
  readonly name: string;
  execute(input: BeforeLLMCallInput): BeforeLLMCallOutput | Promise<BeforeLLMCallOutput>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Brand voice injection hook. Resolves the agent persona and prepends (or
 * appends) the voice system prefix to the system prompt.
 *
 * @example
 * ```typescript
 * const hook = createBrandVoiceHook({ enabled: true, voiceOptions: { verbosity: 2 } });
 * const { systemPrompt } = hook.execute({ agentName: 'dcyfr-engineer', systemPrompt: '' });
 * ```
 */
export class BrandVoiceHook implements BeforeLLMCallHook {
  readonly name = 'brand-voice-inject';

  private readonly config: Required<BeforeLLMCallHookConfig>;

  constructor(config: BeforeLLMCallHookConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      voiceOptions: config.voiceOptions ?? {},
      separator: config.separator ?? '\n\n',
      placement: config.placement ?? 'prepend',
    };
  }

  execute(input: BeforeLLMCallInput): BeforeLLMCallOutput {
    if (!this.config.enabled) {
      const fallbackPersona = input.persona ?? {
        name: input.agentName ?? 'unknown',
        title: 'Agent',
        role: '',
        capabilities: [],
        voice_tone: null,
      };
      return {
        systemPrompt: input.systemPrompt,
        resolvedVoice: resolveVoice(fallbackPersona, { enabled: false }),
        skipped: true,
      };
    }

    // Load or use provided persona
    const persona = input.persona ?? loadPersona(input.agentName ?? 'default').persona;

    // Resolve voice
    const resolvedVoice = resolveVoice(persona, this.config.voiceOptions);

    // Inject prefix
    let systemPrompt: string;
    if (!resolvedVoice.systemPrefix) {
      systemPrompt = input.systemPrompt;
    } else if (this.config.placement === 'append') {
      systemPrompt = [input.systemPrompt, resolvedVoice.systemPrefix]
        .filter(Boolean)
        .join(this.config.separator);
    } else {
      systemPrompt = [resolvedVoice.systemPrefix, input.systemPrompt]
        .filter(Boolean)
        .join(this.config.separator);
    }

    return {
      systemPrompt,
      resolvedVoice,
      skipped: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a BrandVoiceHook with the given configuration.
 */
export function createBrandVoiceHook(config?: BeforeLLMCallHookConfig): BrandVoiceHook {
  return new BrandVoiceHook(config);
}
