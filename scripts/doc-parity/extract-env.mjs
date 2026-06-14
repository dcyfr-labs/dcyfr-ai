#!/usr/bin/env node
/**
 * Enumerates the environment variables READ by production code across
 * packages/ai, bin, and scripts (excluding tests, dist, generated). A naive
 * `process.env.X` scan undercounts by ~17 vars because packages/ai/memory/config.ts
 * aliases `const env = process.env` then reads `env.X` / `env['X']`. This matcher
 * handles three forms: direct, destructured, and aliased. Fully-dynamic
 * provider-key lookups (`env[providerKeys[...]]`) can't be derived structurally
 * and are carried as allowlist.env.dynamicProviderKeys by the callers.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Scope to the PUBLISHED package surface (packages/ai + the CLI in bin). scripts/
// is build/CI tooling -- its env vars (e.g. DOC_PARITY_*) are not part of the
// package's runtime config surface, and the recon confirmed every real var lives
// under packages/ai.
export const SCAN_ROOTS = ['packages/ai', 'bin'].map((p) => join(repoRoot, p));

const EXCLUDE_DIR = /(^|\/)(node_modules|dist|coverage|\.git|generated|__tests__|__mocks__|fixtures)(\/|$)/;
const EXCLUDE_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const NAME = '([A-Z][A-Z0-9_]*)';

/** Strip block + line comments so env-shaped patterns in prose/comments don't count. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (EXCLUDE_DIR.test(full)) continue;
    if (e.isDirectory()) yield* walk(full);
    else if (CODE_EXT.has(extname(e.name)) && !EXCLUDE_FILE.test(e.name)) yield full;
  }
}

export function extractEnv(roots = SCAN_ROOTS) {
  const found = new Set();
  for (const root of roots) {
    for (const file of walk(root)) {
      let src;
      try {
        src = stripComments(readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      // Form 1: process.env.X and process.env['X']
      for (const m of src.matchAll(new RegExp(`process\\.env\\.${NAME}`, 'g'))) found.add(m[1]);
      for (const m of src.matchAll(new RegExp(`process\\.env\\[['"\`]${NAME}['"\`]\\]`, 'g'))) found.add(m[1]);
      // Form 1b: destructure  const { A, B } = process.env
      for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*process\.env\b/g)) {
        for (const part of m[1].split(',')) {
          const id = part.split(':')[0].split('=')[0].trim();
          if (/^[A-Z][A-Z0-9_]*$/.test(id)) found.add(id);
        }
      }
      // Form 2: aliased  const env = process.env;  then env.X / env['X']
      const aliases = new Set();
      for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\b(?!\s*[.[])/g)) {
        aliases.add(m[1]);
      }
      for (const alias of aliases) {
        const a = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const m of src.matchAll(new RegExp(`\\b${a}\\.${NAME}`, 'g'))) found.add(m[1]);
        for (const m of src.matchAll(new RegExp(`\\b${a}\\[['"\`]${NAME}['"\`]\\]`, 'g'))) found.add(m[1]);
      }
    }
  }
  // No real env var is a single character; drop stray matches defensively.
  return [...found].filter((n) => n.length >= 2).sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const vars = extractEnv();
  if (process.argv.includes('--json')) console.log(JSON.stringify(vars, null, 2));
  else {
    console.log(`env reads found: ${vars.length}`);
    console.log(vars.join('\n'));
  }
}
