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

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const allow = JSON.parse(readFileSync(join(here, 'allowlist.json'), 'utf8')).env;

const exclude = new Set([...allow.testOnly, ...allow.platformProvided]);
const codeRead = new Set([...extractEnv(), ...allow.dynamicProviderKeys].filter((v) => !exclude.has(v)));

const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');
const documented = new Set([...envExample.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]));

const gap = [...codeRead].filter((v) => !documented.has(v)).sort();
const dead = [...documented].filter((v) => !codeRead.has(v) && !exclude.has(v)).sort();

console.log(`check-env: ${codeRead.size} code-read vars | ${documented.size} documented | gap=${gap.length} | dead=${dead.length}`);

const failures = [];
if (gap.length) failures.push(`${gap.length} code-read vars missing from .env.example: ${gap.join(', ')}`);
if (dead.length) failures.push(`${dead.length} .env.example vars not read by code: ${dead.join(', ')}`);

if (failures.length) {
  console.error('check-env: FAIL');
  for (const f of failures) console.error('  - ' + f);
  console.error('  Fix: `npm run docs:gen:env` then commit .env.example');
  process.exitCode = 1;
} else {
  console.log('check-env: OK');
}
