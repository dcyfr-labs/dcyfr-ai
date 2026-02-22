/**
 * @fileoverview Unit tests for personas module: VoiceResolver, PersonaLoader,
 * BrandVoiceHook.
 * TLP:CLEAR
 * @module dcyfr-ai/tests/personas.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AgentPersona, BrandVoice } from '../personas/types.js';
import {
  resolveVoice,
  renderPersonaBlock,
  applyToneGuidelines,
  loadBrandVoice,
  clearBrandVoiceCache,
} from '../personas/voice-resolver.js';
import {
  loadPersona,
  getPersona,
  validatePersona,
  clearPersonaCache,
} from '../personas/persona-loader.js';
import { BrandVoiceHook, createBrandVoiceHook } from '../personas/hooks/before-llm-call.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_PERSONA: AgentPersona = {
  name: 'test-agent',
  title: 'Test Engineer',
  role: 'Testing and validation',
  capabilities: ['testing', 'analysis', 'code-review'],
  voice_tone: 'technical',
};

const MOCK_BRAND_VOICE: BrandVoice = {
  version: '1.0.0',
  identity: {
    name: 'Test Brand',
    tagline: 'Test tagline',
    archetype: 'Test archetype',
    description: 'Test description',
  },
  core_voice: {
    attributes: ['Attribute 1', 'Attribute 2', 'Attribute 3'],
    personality_traits: {
      warmth: 0.6,
      formality: 0.5,
      directness: 0.8,
      technicality: 0.9,
      empathy: 0.6,
    },
    perspective: 'first-person-plural',
    pronouns: 'we/our',
  },
  tone_spectrum: {
    default: 'precise',
    situational: {
      teaching: { tone: 'patient', warmth: 0.8, formality: 0.4 },
    },
  },
};

// ---------------------------------------------------------------------------
// VoiceResolver tests
// ---------------------------------------------------------------------------

describe('VoiceResolver', () => {
  beforeEach(() => {
    clearBrandVoiceCache();
  });

  it('resolves voice with default options', () => {
    const result = resolveVoice(MOCK_PERSONA, { brandVoice: MOCK_BRAND_VOICE });

    expect(result.agentName).toBe('test-agent');
    expect(result.systemPrefix).toBeTruthy();
    expect(result.appliedTone).toBe('technical'); // persona overrides brand default
    expect(result.metadata.resolvedFrom).toBe('persona');
  });

  it('uses brand default tone when persona has no tone override', () => {
    const personaNoTone: AgentPersona = { ...MOCK_PERSONA, voice_tone: null };
    const result = resolveVoice(personaNoTone, { brandVoice: MOCK_BRAND_VOICE });

    expect(result.appliedTone).toBe('precise'); // brand default
    expect(result.metadata.resolvedFrom).toBe('brand');
  });

  it('tone override takes highest priority', () => {
    const result = resolveVoice(MOCK_PERSONA, {
      brandVoice: MOCK_BRAND_VOICE,
      tone: 'urgent',
    });

    expect(result.appliedTone).toBe('urgent');
    expect(result.metadata.resolvedFrom).toBe('override');
  });

  it('returns empty systemPrefix when disabled', () => {
    const result = resolveVoice(MOCK_PERSONA, {
      brandVoice: MOCK_BRAND_VOICE,
      enabled: false,
    });

    expect(result.systemPrefix).toBe('');
    expect(result.appliedTone).toBe('technical');
  });

  it('merges personality trait overrides', () => {
    const persona: AgentPersona = {
      ...MOCK_PERSONA,
      personality_overrides: { warmth: 0.9, formality: 0.2 },
    };
    const result = resolveVoice(persona, { brandVoice: MOCK_BRAND_VOICE });

    expect(result.personalityTraits.warmth).toBe(0.9);
    expect(result.personalityTraits.formality).toBe(0.2);
    expect(result.personalityTraits.directness).toBe(0.8); // unchanged from brand
  });

  it('includes persona block at verbosity ≥ 1', () => {
    const result = resolveVoice(MOCK_PERSONA, {
      brandVoice: MOCK_BRAND_VOICE,
      verbosity: 1,
    });

    expect(result.systemPrefix).toContain('Test Engineer');
  });

  it('includes tone guidelines at verbosity ≥ 2', () => {
    const result = resolveVoice(MOCK_PERSONA, {
      brandVoice: MOCK_BRAND_VOICE,
      verbosity: 2,
    });

    expect(result.systemPrefix).toContain('technical language');
  });

  it('includes voice attributes at verbosity ≥ 3', () => {
    const result = resolveVoice(MOCK_PERSONA, {
      brandVoice: MOCK_BRAND_VOICE,
      verbosity: 3,
    });

    expect(result.systemPrefix).toContain('Attribute 1');
  });

  it('injects before_prompt context injection', () => {
    const persona: AgentPersona = {
      ...MOCK_PERSONA,
      context_injections: { before_prompt: 'INJECTED_BEFORE' },
    };
    const result = resolveVoice(persona, { brandVoice: MOCK_BRAND_VOICE });

    expect(result.systemPrefix).toContain('INJECTED_BEFORE');
  });

  it('includes timestamp in metadata', () => {
    const result = resolveVoice(MOCK_PERSONA, { brandVoice: MOCK_BRAND_VOICE });
    expect(result.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// renderPersonaBlock tests
// ---------------------------------------------------------------------------

describe('renderPersonaBlock', () => {
  it('includes title and role', () => {
    const block = renderPersonaBlock(MOCK_PERSONA);
    expect(block).toContain('Test Engineer');
    expect(block).toContain('Testing and validation');
  });

  it('limits capabilities to first 5', () => {
    const persona: AgentPersona = {
      ...MOCK_PERSONA,
      capabilities: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    };
    const block = renderPersonaBlock(persona);
    expect(block).toContain('a, b, c, d, e');
    expect(block).not.toContain('f');
  });

  it('includes system_prefix from context_injections', () => {
    const persona: AgentPersona = {
      ...MOCK_PERSONA,
      context_injections: { system_prefix: 'SYSTEM_INJECTION' },
    };
    expect(renderPersonaBlock(persona)).toContain('SYSTEM_INJECTION');
  });

  it('handles persona with no role', () => {
    const persona: AgentPersona = { ...MOCK_PERSONA, role: '' };
    const block = renderPersonaBlock(persona);
    expect(block).toContain('Test Engineer');
    expect(block).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------
// applyToneGuidelines tests
// ---------------------------------------------------------------------------

describe('applyToneGuidelines', () => {
  it('returns guidelines for every valid tone', () => {
    const tones = [
      'precise',
      'conversational',
      'technical',
      'empathetic',
      'collaborative-expert',
      'patient',
      'diagnostic',
      'urgent',
      'enthusiastic',
    ] as const;

    for (const tone of tones) {
      const guideline = applyToneGuidelines(tone);
      expect(guideline).toBeTruthy();
      expect(guideline.length).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// validatePersona tests
// ---------------------------------------------------------------------------

describe('validatePersona', () => {
  it('returns empty array for valid persona', () => {
    const errors = validatePersona(MOCK_PERSONA);
    expect(errors).toHaveLength(0);
  });

  it('returns error for missing name', () => {
    const errors = validatePersona({ ...MOCK_PERSONA, name: '' });
    expect(errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('returns error for missing title', () => {
    const errors = validatePersona({ ...MOCK_PERSONA, title: '' });
    expect(errors.some((e) => e.includes('title'))).toBe(true);
  });

  it('returns error for invalid capabilities type', () => {
    const errors = validatePersona({ ...MOCK_PERSONA, capabilities: 'not-array' });
    expect(errors.some((e) => e.includes('capabilities'))).toBe(true);
  });

  it('returns error for invalid voice_tone', () => {
    const errors = validatePersona({ ...MOCK_PERSONA, voice_tone: 'not-a-tone' });
    expect(errors.some((e) => e.includes('voice_tone'))).toBe(true);
  });

  it('accepts null voice_tone', () => {
    const errors = validatePersona({ ...MOCK_PERSONA, voice_tone: null });
    expect(errors).toHaveLength(0);
  });

  it('returns error for non-object input', () => {
    expect(validatePersona(null)).toHaveLength(1);
    expect(validatePersona('string')).toHaveLength(1);
    expect(validatePersona(42)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PersonaLoader tests
// ---------------------------------------------------------------------------

describe('PersonaLoader', () => {
  beforeEach(() => {
    clearPersonaCache();
  });

  it('returns default persona for unknown agent name', () => {
    const result = loadPersona('non-existent-agent-xyz', {
      baseDir: '/tmp/does-not-exist',
    });

    expect(result.source).toBe('fallback');
    expect(result.persona.name).toBe('non-existent-agent-xyz');
  });

  it('getPersona returns AgentPersona directly', () => {
    const persona = getPersona('any-agent', { baseDir: '/tmp/does-not-exist' });
    expect(persona).toHaveProperty('name');
    expect(persona).toHaveProperty('capabilities');
  });

  it('returns error when allowFallback is false and agent not found', () => {
    const result = loadPersona('missing', {
      baseDir: '/tmp/no-such-dir',
      allowFallback: false,
    });
    // With allowFallback:false and not found, still returns default but logs error
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('loads from valid agent.json on disk', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(join(tmpdir(), 'dcyfr-persona-test-'));
    const agentDir = join(dir, 'my-agent');
    mkdirSync(agentDir, { recursive: true });

    const agentData: AgentPersona = {
      name: 'my-agent',
      title: 'My Test Agent',
      role: 'Testing',
      capabilities: ['test'],
      voice_tone: 'precise',
    };
    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(agentData));

    clearPersonaCache();
    const result = loadPersona('my-agent', { baseDir: dir });

    expect(result.source).toBe('file');
    expect(result.persona.title).toBe('My Test Agent');
    expect(result.persona.voice_tone).toBe('precise');
  });

  it('returns fallback with errors on malformed JSON', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(join(tmpdir(), 'dcyfr-persona-bad-'));
    const agentDir = join(dir, 'broken-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'agent.json'), '{ this is not valid json }');

    clearPersonaCache();
    const result = loadPersona('broken-agent', { baseDir: dir });

    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.source).toBe('fallback');
  });

  it('returns cached result on second call', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(join(tmpdir(), 'dcyfr-persona-cache-'));
    const agentDir = join(dir, 'cached-agent');
    mkdirSync(agentDir, { recursive: true });

    const agentData: AgentPersona = {
      name: 'cached-agent',
      title: 'Cached Agent',
      role: '',
      capabilities: [],
      voice_tone: null,
    };
    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(agentData));

    clearPersonaCache();
    const first = loadPersona('cached-agent', { baseDir: dir });
    const second = loadPersona('cached-agent', { baseDir: dir });

    expect(first.source).toBe('file');
    expect(second.source).toBe('cache');
  });
});

// ---------------------------------------------------------------------------
// BrandVoiceHook tests
// ---------------------------------------------------------------------------

describe('BrandVoiceHook', () => {
  it('prepends voice prefix to system prompt', () => {
    const hook = createBrandVoiceHook({
      voiceOptions: { brandVoice: MOCK_BRAND_VOICE, verbosity: 1 },
    });

    const { systemPrompt, skipped } = hook.execute({
      persona: MOCK_PERSONA,
      systemPrompt: 'You are helpful.',
    });

    expect(skipped).toBe(false);
    expect(systemPrompt).toContain('Test Engineer');
    expect(systemPrompt).toContain('You are helpful.');
    // Prefix comes before existing prompt
    expect(systemPrompt.indexOf('Test Engineer')).toBeLessThan(
      systemPrompt.indexOf('You are helpful.'),
    );
  });

  it('appends when placement is append', () => {
    const hook = createBrandVoiceHook({
      placement: 'append',
      voiceOptions: { brandVoice: MOCK_BRAND_VOICE, verbosity: 1 },
    });

    const { systemPrompt } = hook.execute({
      persona: MOCK_PERSONA,
      systemPrompt: 'Original prompt.',
    });

    expect(systemPrompt.indexOf('Original prompt.')).toBeLessThan(
      systemPrompt.indexOf('Test Engineer'),
    );
  });

  it('skips injection when disabled', () => {
    const hook = createBrandVoiceHook({ enabled: false });

    const { systemPrompt, skipped } = hook.execute({
      persona: MOCK_PERSONA,
      systemPrompt: 'Original.',
    });

    expect(skipped).toBe(true);
    expect(systemPrompt).toBe('Original.');
  });

  it('resolves persona by agentName when persona is not provided', () => {
    const hook = createBrandVoiceHook({
      voiceOptions: { brandVoice: MOCK_BRAND_VOICE, verbosity: 1 },
    });

    const { systemPrompt } = hook.execute({
      agentName: 'some-agent',
      systemPrompt: '',
    });

    // Should produce some system prompt (falls back to default persona)
    expect(typeof systemPrompt).toBe('string');
  });

  it('returns resolved voice in output', () => {
    const hook = createBrandVoiceHook({
      voiceOptions: { brandVoice: MOCK_BRAND_VOICE },
    });

    const { resolvedVoice } = hook.execute({
      persona: MOCK_PERSONA,
      systemPrompt: '',
    });

    expect(resolvedVoice.agentName).toBe('test-agent');
    expect(resolvedVoice.appliedTone).toBe('technical');
  });
});

describe('createBrandVoiceHook', () => {
  it('creates a BrandVoiceHook instance', () => {
    const hook = createBrandVoiceHook();
    expect(hook).toBeInstanceOf(BrandVoiceHook);
    expect(hook.name).toBe('brand-voice-inject');
  });
});
