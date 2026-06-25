#!/usr/bin/env node
/**
 * Export-parity gate over the root barrel (packages/ai/index.ts).
 *
 *  - forward (under-documented): public VALUE exports with no mention in
 *    docs/API.md (or docs/api/*). WARN by default; strict via
 *    DOC_PARITY_EXPORTS=strict. Day-one there is a large legitimate backlog
 *    (~110 undocumented) that Wave 1's generated reference will close, so this
 *    ships as a counted warning, not a hard fail.
 *  - phantom (stale docs): backtick-quoted symbols in API doc headers that are
 *    NOT exported. WARN by default; the 6 known-stale symbols are allowlisted.
 *  - never-exported: HARD FAIL if a workspace-only symbol leaks into the public
 *    surface.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractExports } from './extract-exports.mjs';
import { barrelsFromExports } from './gen-api-reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const allow = JSON.parse(readFileSync(join(here, 'allowlist.json'), 'utf8')).exports;
const MODE = (process.env.DOC_PARITY_EXPORTS || 'warn').toLowerCase();

function readDocs() {
  const files = [join(repoRoot, 'docs', 'API.md')];
  try {
    for (const f of readdirSync(join(repoRoot, 'docs', 'api'))) {
      if (f.endsWith('.md')) files.push(join(repoRoot, 'docs', 'api', f));
    }
  } catch {
    /* docs/api may not exist */
  }
  return files
    .map((f) => {
      try {
        return readFileSync(f, 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

const { values, types } = extractExports();
const docs = readDocs();
const mentioned = (name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(docs);

const intentionally = new Set(allow.intentionallyUndocumented);
const stale = new Set(allow.staleDocsToFix);

// Full public surface = the union of EVERY declared barrel's exports (root +
// subpaths). The generated reference (gen-api-reference.mjs) documents subpath
// barrels too, so the phantom + never-exported checks must recognise subpath
// symbols — otherwise an @dcyfr/ai/mcp export documented in docs/api/mcp.md
// would be mis-flagged as a phantom against the root barrel alone. Source-based
// (no build) — subpath barrels are pure named re-export barrels. The forward
// under-documented check below stays root-only, where regex and the TS compiler
// agree exactly (134 value exports); new subpath exports are instead caught by
// the generator drift check.
const exported = new Set([...values, ...types]);
try {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  for (const b of barrelsFromExports(pkg.exports, { packageName: pkg.name, repoRoot })) {
    if (b.subpath === '.') continue;
    let text;
    try {
      text = readFileSync(b.src, 'utf8');
    } catch {
      continue; // barrel source absent — skip rather than fail the gate
    }
    const ex = extractExports(text);
    for (const name of [...ex.values, ...ex.types]) exported.add(name);
  }
} catch {
  /* package.json unreadable — fall back to the root-barrel surface */
}

const documented = values.filter(mentioned);
const undocumented = values.filter((v) => !mentioned(v) && !intentionally.has(v));

// phantom: backtick-quoted symbols in API doc headers that are not exported.
const headerSyms = new Set();
for (const m of docs.matchAll(/^#{2,4}\s+`([A-Za-z_$][\w$]*)`/gm)) headerSyms.add(m[1]);
const phantom = [...headerSyms].filter((s) => !exported.has(s) && !stale.has(s)).sort();

const failures = [];
for (const ne of allow.neverExported) {
  if (exported.has(ne)) failures.push(`'${ne}' must NOT be exported from the public barrel (it is workspace-specific).`);
}

console.log(
  `check-exports: ${values.length} value exports | ${documented.length} documented | ${undocumented.length} undocumented | ${phantom.length} phantom doc symbols | mode=${MODE}`,
);
if (undocumented.length) {
  console.log(`  undocumented (${undocumented.length}): ${undocumented.slice(0, 15).join(', ')}${undocumented.length > 15 ? ', ...' : ''}`);
}
if (phantom.length) console.log(`  phantom (${phantom.length}): ${phantom.join(', ')}`);

if (MODE === 'strict') {
  if (undocumented.length) failures.push(`${undocumented.length} undocumented public value exports (strict mode).`);
  if (phantom.length) failures.push(`${phantom.length} documented symbols are not exported (strict mode).`);
}

if (failures.length) {
  console.error('check-exports: FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exitCode = 1;
} else {
  console.log(`check-exports: OK${MODE === 'warn' ? ' (forward/phantom are warnings this wave; flip to strict in Wave 1)' : ''}`);
}
