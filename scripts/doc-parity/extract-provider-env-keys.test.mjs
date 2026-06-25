import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  extractProviderEnvKeysFromSource,
  extractProviderEnvKeys,
  CONFIG_SOURCE,
} from './extract-provider-env-keys.mjs';
import { buildManifest, MANIFEST_PATH } from './gen-provider-env-keys.mjs';

// A representative source mirroring packages/ai/memory/config.ts's two tables.
const FIXTURE = `
  const llmProvider = (env.LLM_PROVIDER || 'openai') as LLMProvider;

  const providerEnvKeys: Partial<Record<LLMProvider, string>> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    google: 'GOOGLE_API_KEY',
    gemini: 'GOOGLE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    azure_openai: 'AZURE_OPENAI_API_KEY',
  };

  const providerBaseEnvKeys: Partial<Record<LLMProvider, string>> = {
    openai: 'OPENAI_API_BASE',
    anthropic: 'ANTHROPIC_API_BASE',
  };

  const llmApiKey = env.LLM_API_KEY || env[providerEnvKeys[llmProvider]];
`;

describe('extractProviderEnvKeysFromSource', () => {
  test('extracts the union of both provider tables, sorted and deduped', () => {
    expect(extractProviderEnvKeysFromSource(FIXTURE)).toEqual([
      'ANTHROPIC_API_BASE',
      'ANTHROPIC_API_KEY',
      'AZURE_OPENAI_API_KEY',
      'GOOGLE_API_KEY', // google + gemini both map here -> one entry
      'GROQ_API_KEY',
      'MISTRAL_API_KEY',
      'OPENAI_API_BASE',
      'OPENAI_API_KEY',
    ]);
  });

  test('structurally catches a newly-added provider (the whole point)', () => {
    const withCohere = FIXTURE.replace(
      "mistral: 'MISTRAL_API_KEY',",
      "mistral: 'MISTRAL_API_KEY',\n    cohere: 'COHERE_API_KEY',",
    );
    expect(extractProviderEnvKeysFromSource(withCohere)).toContain('COHERE_API_KEY');
  });

  test('ignores commented-out provider lines', () => {
    const withComment = FIXTURE.replace(
      "groq: 'GROQ_API_KEY',",
      "// groq: 'GROQ_API_KEY',\n    /* perplexity: 'PERPLEXITY_API_KEY', */",
    );
    const keys = extractProviderEnvKeysFromSource(withComment);
    expect(keys).not.toContain('GROQ_API_KEY');
    expect(keys).not.toContain('PERPLEXITY_API_KEY');
  });

  test('throws loudly if a provider table is missing (refactor guard)', () => {
    const broken = FIXTURE.replace('providerBaseEnvKeys', 'somethingElse');
    expect(() => extractProviderEnvKeysFromSource(broken)).toThrow(/providerBaseEnvKeys/);
  });

  test('throws if a provider table has no env-key entries', () => {
    const empty = `
      const providerEnvKeys: Partial<Record<LLMProvider, string>> = {};
      const providerBaseEnvKeys: Partial<Record<LLMProvider, string>> = {};
    `;
    expect(() => extractProviderEnvKeysFromSource(empty)).toThrow();
  });
});

describe('extractProviderEnvKeys against the real config source', () => {
  test('returns exactly the keys read dynamically by packages/ai/memory/config.ts', () => {
    expect(extractProviderEnvKeys()).toEqual([
      'ANTHROPIC_API_BASE',
      'ANTHROPIC_API_KEY',
      'AZURE_OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'GROQ_API_KEY',
      'MISTRAL_API_KEY',
      'OPENAI_API_BASE',
      'OPENAI_API_KEY',
    ]);
  });
});

describe('gen-provider-env-keys manifest', () => {
  test('manifest keys equal the live extraction and name the source file', () => {
    const m = buildManifest();
    expect(m.keys).toEqual(extractProviderEnvKeys());
    expect(m._source).toBe('packages/ai/memory/config.ts');
  });

  test('committed provider-env-keys.json is current (regenerate-and-compare)', () => {
    const committed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    expect(committed.keys).toEqual(buildManifest().keys);
  });
});
