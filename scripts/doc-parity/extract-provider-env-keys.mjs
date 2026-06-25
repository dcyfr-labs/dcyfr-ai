#!/usr/bin/env node
/**
 * Derives the LLM-provider environment variable keys STRUCTURALLY from the
 * single source of truth -- the `providerEnvKeys` + `providerBaseEnvKeys`
 * tables in packages/ai/memory/config.ts.
 *
 * Those keys are read at runtime via dynamic lookups (`env[providerEnvKeys[
 * llmProvider]]`), which the static env extractor (extract-env.mjs) cannot see.
 * Before Wave 1 they were carried in a hand-maintained `allowlist.env.
 * dynamicProviderKeys` list that silently drifted whenever a provider was
 * added. This module reads them straight from the source instead, so adding a
 * provider row is caught structurally by the env-parity gate + the committed
 * provider-env-keys.json manifest (see gen-provider-env-keys.mjs).
 *
 * Pure-function core (extractProviderEnvKeysFromSource) so it unit-tests with a
 * fixture string and no filesystem.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The single source of truth for provider->env-key mappings. */
export const CONFIG_SOURCE = join(repoRoot, 'packages', 'ai', 'memory', 'config.ts');

/** The object-literal tables in CONFIG_SOURCE whose VALUES are env keys. */
export const PROVIDER_KEY_TABLES = ['providerEnvKeys', 'providerBaseEnvKeys'];

/** Strip block + line comments so commented-out provider rows don't count. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Extract the sorted, de-duplicated union of env-key string literals from the
 * provider tables in a config-source string. Throws loudly if a table is
 * missing or empty -- a config.ts refactor that moves/renames the tables must
 * fail the gate, never silently yield an empty set.
 *
 * @param {string} src - contents of a config.ts-shaped source file
 * @returns {string[]}
 */
export function extractProviderEnvKeysFromSource(src) {
  const clean = stripComments(src);
  const keys = new Set();
  for (const table of PROVIDER_KEY_TABLES) {
    // Flat object literals (no nested braces): match from the declaration's
    // `= {` up to the first `}`. `[^=]*` skips the `: Partial<Record<...>>`
    // type annotation (which contains no `=`).
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${table}\\b[^=]*=\\s*\\{([^}]*)\\}`);
    const m = clean.match(decl);
    if (!m) {
      throw new Error(
        `extract-provider-env-keys: table '${table}' not found in ${CONFIG_SOURCE}. ` +
          'If the provider env-key tables moved or were renamed, update PROVIDER_KEY_TABLES.',
      );
    }
    let count = 0;
    // key: 'ENV_KEY' entries -- capture the string-literal VALUE.
    for (const v of m[1].matchAll(/:\s*['"`]([A-Z][A-Z0-9_]*)['"`]/g)) {
      keys.add(v[1]);
      count++;
    }
    if (count === 0) {
      throw new Error(
        `extract-provider-env-keys: table '${table}' in ${CONFIG_SOURCE} has no env-key entries.`,
      );
    }
  }
  return [...keys].sort();
}

/**
 * Read CONFIG_SOURCE (or an override path) and extract its provider env keys.
 * @param {string} [sourcePath]
 * @returns {string[]}
 */
export function extractProviderEnvKeys(sourcePath = CONFIG_SOURCE) {
  return extractProviderEnvKeysFromSource(readFileSync(sourcePath, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const k of extractProviderEnvKeys()) console.log(k);
}
