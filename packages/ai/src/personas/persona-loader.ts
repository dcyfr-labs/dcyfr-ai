/**
 * @fileoverview PersonaLoader — loads and validates agent persona profiles from
 * the filesystem, with fallback to a default persona.
 * @module @dcyfr/ai/personas/persona-loader
 * @license MIT
 */

import type { AgentPersona, PersonaLoadResult, PersonaLoaderOptions, ToneProfile } from './types';

// ---------------------------------------------------------------------------
// Default persona
// ---------------------------------------------------------------------------

const DEFAULT_PERSONA: AgentPersona = {
  name: 'default',
  title: 'DCYFR Agent',
  role: 'General-purpose AI assistant',
  capabilities: ['analysis', 'writing', 'code-review', 'explanation'],
  voice_tone: 'collaborative-expert',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_TONE_PROFILES: Set<string> = new Set<ToneProfile>([
  'precise',
  'conversational',
  'technical',
  'empathetic',
  'collaborative-expert',
  'patient',
  'diagnostic',
  'urgent',
  'enthusiastic',
]);

/**
 * Validates an AgentPersona object and returns a list of validation errors.
 * An empty array indicates a valid persona.
 */
export function validatePersona(persona: unknown): string[] {
  const errors: string[] = [];

  if (!persona || typeof persona !== 'object') {
    return ['Persona must be a non-null object'];
  }

  const p = persona as Record<string, unknown>;

  if (typeof p['name'] !== 'string' || p['name'].trim() === '') {
    errors.push('name must be a non-empty string');
  }
  if (typeof p['title'] !== 'string' || p['title'].trim() === '') {
    errors.push('title must be a non-empty string');
  }
  if (!Array.isArray(p['capabilities'])) {
    errors.push('capabilities must be an array');
  }
  if (p['voice_tone'] !== null && p['voice_tone'] !== undefined) {
    if (typeof p['voice_tone'] !== 'string' || !VALID_TONE_PROFILES.has(p['voice_tone'])) {
      errors.push(
        `voice_tone must be null or one of: ${[...VALID_TONE_PROFILES].join(', ')}`,
      );
    }
  }
  if (p['personality_overrides'] !== undefined) {
    if (typeof p['personality_overrides'] !== 'object' || p['personality_overrides'] === null) {
      errors.push('personality_overrides must be an object if present');
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const _personaCache = new Map<string, AgentPersona>();

/**
 * Clears the persona loader cache (useful in tests).
 */
export function clearPersonaCache(): void {
  _personaCache.clear();
}

// ---------------------------------------------------------------------------
// PersonaLoader
// ---------------------------------------------------------------------------

/**
 * Loads an agent persona by name from the filesystem.
 *
 * Resolution order:
 * 1. Cache (if `useCache: true`)
 * 2. `<baseDir>/<agentName>/agent.json`
 * 3. `<baseDir>/<agentName>.json`
 * 4. Default persona (if `allowFallback: true`)
 *
 * @param agentName - The agent identifier (e.g., 'dcyfr-engineer')
 * @param options - Loader options
 * @returns PersonaLoadResult with loaded persona and metadata
 *
 * @example
 * ```typescript
 * const { persona } = loadPersona('dcyfr-engineer');
 * const voice = resolveVoice(persona);
 * ```
 */
export function loadPersona(
  agentName: string,
  options: PersonaLoaderOptions = {},
): PersonaLoadResult {
  const {
    baseDir = 'agents',
    allowFallback = true,
    useCache = true,
    validate = true,
  } = options;

  const cacheKey = `${baseDir}:${agentName}`;

  if (useCache && _personaCache.has(cacheKey)) {
    return {
      persona: _personaCache.get(cacheKey)!,
      source: 'cache',
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');

    const candidates = [
      path.resolve(process.cwd(), baseDir, agentName, 'agent.json'),
      path.resolve(process.cwd(), baseDir, `${agentName}.json`),
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;

      const raw = fs.readFileSync(candidate, 'utf-8');
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch {
        const errors = [`Failed to parse JSON at ${candidate}`];
        if (!allowFallback) {
          return { persona: DEFAULT_PERSONA, source: 'fallback', path: candidate, errors };
        }
        return { persona: DEFAULT_PERSONA, source: 'fallback', path: candidate, errors };
      }

      const errors = validate ? validatePersona(parsed) : [];

      if (errors.length > 0 && !allowFallback) {
        return { persona: DEFAULT_PERSONA, source: 'fallback', path: candidate, errors };
      }

      const persona = parsed as AgentPersona;

      if (useCache) {
        _personaCache.set(cacheKey, persona);
      }

      return { persona, source: 'file', path: candidate, errors: errors.length > 0 ? errors : undefined };
    }
  } catch {
    // Filesystem unavailable — fall through to default
  }

  if (!allowFallback) {
    // Return default persona but flag it as not found
    return {
      persona: { ...DEFAULT_PERSONA, name: agentName },
      source: 'fallback',
      errors: [`Agent '${agentName}' not found and fallback is disabled`],
    };
  }

  return {
    persona: { ...DEFAULT_PERSONA, name: agentName },
    source: 'fallback',
  };
}

/**
 * Convenience wrapper: loads a persona and returns only the AgentPersona.
 * Throws if the persona cannot be loaded and `allowFallback` is false.
 */
export function getPersona(agentName: string, options?: PersonaLoaderOptions): AgentPersona {
  const result = loadPersona(agentName, options);
  return result.persona;
}
