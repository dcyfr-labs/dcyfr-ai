#!/usr/bin/env node
/**
 * Enumerates the public export surface of the root barrel
 * (packages/ai/index.ts === the package.json "." entry) WITHOUT needing a build,
 * by parsing the source. The barrel is a pure re-export barrel with no
 * `export *`, so static parsing is exact (cross-checked against the TS compiler
 * API: 134 value / 195 type exports at the time of writing).
 *
 * Distinguishes VALUE exports (class/function/const/enum) from TYPE-only exports
 * (interface/type) so the export-parity gate only requires value exports to be
 * documented.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BARREL = join(repoRoot, 'packages', 'ai', 'index.ts');

function stripComments(src) {
  // Block comments first, then line comments (guard against `://` in URLs).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function memberName(raw) {
  let m = raw.trim();
  if (!m) return null;
  let typeOnly = false;
  if (m.startsWith('type ')) {
    typeOnly = true;
    m = m.slice(5).trim();
  }
  const asMatch = m.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/);
  if (asMatch) m = asMatch[1];
  if (!/^[A-Za-z_$][\w$]*$/.test(m)) return null;
  return { name: m, typeOnly };
}

export function extractExports(src) {
  const text = src ?? readFileSync(BARREL, 'utf8');
  const clean = stripComments(text);
  // Guard the one blind spot: `export *` re-exports cannot be enumerated
  // statically. The barrel has none today; warn loudly if that ever changes so
  // the export count is not silently incomplete.
  if (/export\s*\*/.test(clean)) {
    console.warn('extract-exports: WARNING -- `export *` detected in the barrel; star re-exports are NOT enumerated and the export count is incomplete.');
  }
  const values = new Set();
  const types = new Set();

  // `export type { ... }` -- whole block is type-only.
  for (const mm of clean.matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
    for (const part of mm[1].split(',')) {
      const p = memberName(part.replace(/^type\s+/, ''));
      if (p) types.add(p.name);
    }
  }
  // `export { ... }` -- per-member `type` modifier marks type-only.
  // (Does not match `export type {` because `\s*\{` requires `{` right after.)
  for (const mm of clean.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of mm[1].split(',')) {
      const p = memberName(part);
      if (!p) continue;
      if (p.typeOnly) types.add(p.name);
      else values.add(p.name);
    }
  }
  // Inline value declarations.
  for (const mm of clean.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function|class|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    values.add(mm[1]);
  }
  // Inline type declarations.
  for (const mm of clean.matchAll(/export\s+(?:declare\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
    types.add(mm[1]);
  }
  // A symbol exported as both value and type is a value export.
  for (const v of values) types.delete(v);

  return { values: [...values].sort(), types: [...types].sort() };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values, types } = extractExports();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ valueCount: values.length, typeCount: types.length, values, types }, null, 2));
  } else {
    console.log(`value exports: ${values.length}`);
    console.log(`type exports:  ${types.length}`);
  }
}
