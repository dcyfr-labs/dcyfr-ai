#!/usr/bin/env node
/**
 * Env-parity gate. Diffs the code-read env var set (extract-env + dynamic
 * provider keys, minus test-only + platform-provided) against the keys in
 * .env.example.
 *
 *  - gap  (read but undocumented): HARD FAIL -- a live var is missing from the template.
 *  - dead (documented but unread):  HARD FAIL -- the template lists a var nothing reads.
 *
 * Fix either by regenerating: `npm run docs:gen:env`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEnv } from './extract-env.mjs';
import { extractProviderEnvKeys } from './extract-provider-env-keys.mjs';
import { MANIFEST_PATH } from './gen-provider-env-keys.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const allow = JSON.parse(readFileSync(join(here, 'allowlist.json'), 'utf8')).env;

// Provider env keys are read via dynamic env[providerEnvKeys[...]] lookups in
// packages/ai/memory/config.ts -- invisible to extractEnv. Derive them
// structurally from that source (no hand-maintained allowlist), and verify the
// committed provider-env-keys.json manifest is current (regenerate-and-compare).
const providerEnvKeys = extractProviderEnvKeys();
let manifestKeys = null;
try {
  manifestKeys = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).keys;
} catch {
  /* missing/unreadable -> stale below */
}
const manifestStale = JSON.stringify(manifestKeys) !== JSON.stringify(providerEnvKeys);

const exclude = new Set([...allow.testOnly, ...allow.platformProvided]);
const codeRead = new Set([...extractEnv(), ...providerEnvKeys].filter((v) => !exclude.has(v)));

const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');
const documented = new Set([...envExample.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]));

const gap = [...codeRead].filter((v) => !documented.has(v)).sort();
const dead = [...documented].filter((v) => !codeRead.has(v) && !exclude.has(v)).sort();

console.log(`check-env: ${codeRead.size} code-read vars | ${documented.size} documented | gap=${gap.length} | dead=${dead.length}`);

const failures = [];
if (gap.length) failures.push(`${gap.length} code-read vars missing from .env.example: ${gap.join(', ')} (fix: \`npm run docs:gen:env\`)`);
if (dead.length) failures.push(`${dead.length} .env.example vars not read by code: ${dead.join(', ')} (fix: \`npm run docs:gen:env\`)`);
if (manifestStale) failures.push('provider-env-keys.json is stale or missing vs packages/ai/memory/config.ts (fix: `npm run docs:gen:provider-env`)');

if (failures.length) {
  console.error('check-env: FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('check-env: OK');
}
