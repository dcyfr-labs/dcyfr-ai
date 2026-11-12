#!/usr/bin/env node
/**
 * Capabilities gate: docs/capabilities.json must be true to the code, and the
 * README capability bullets must match what gen-capabilities produces from it.
 *
 * Tiers (a static import graph over non-test TypeScript under packages/):
 *   shipped      module exists; usedBy is a non-test file reachable from a
 *                package export entry and reaches module via runtime `import`
 *                edges (re-exports and `import type` do not count).
 *   library-only module exists and is reachable from a package export entry
 *                (imports or re-exports) but no reachable file imports it.
 *   planned      no reachability requirement; `module`, if given, must exist.
 * The gate fails both when the declared tier is higher than the graph proves
 * and when the code already qualifies for a higher tier (stale manifest).
 * Fix: edit docs/capabilities.json, then `npm run docs:gen` and commit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, entryPoints, importPath, reachableFrom } from './lib/import-graph.mjs';
import { applyToReadme } from './gen-capabilities.mjs';
import { equalNormalized, lineDiff } from './lib/diff.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(here, '..', '..');

export const STATUSES = ['shipped', 'library-only', 'planned'];
export const CLAIM_TERMS = ['sandbox', 'isolation', 'signed', 'verified', 'hardened', 'scanned'];
const README_SECTIONS = ['security-considerations', 'known-limitations'];
const RANK = { planned: 0, 'library-only': 1, shipped: 2 };

/**
 * Evaluate every capability against the graph.
 * Returns { failures: string[], rows: [{ id, status, proven, proof }] }.
 */
export function evaluateCapabilities(root, manifest) {
  const failures = [];
  const rows = [];
  if (manifest.version !== 1) failures.push(`manifest.version must be 1 (got ${JSON.stringify(manifest.version)})`);
  if (!Array.isArray(manifest.capabilities)) {
    failures.push('manifest.capabilities must be an array');
    return { failures, rows };
  }

  const graph = buildGraph(root);
  const entries = entryPoints(root, graph);
  const reachable = reachableFrom(graph, entries);
  if (entries.length === 0) failures.push('no package export entry resolved to a source file under packages/');

  const seen = new Set();
  for (const cap of manifest.capabilities) {
    const id = cap.id ?? '<missing id>';
    const fail = (msg) => failures.push(`${id}: ${msg}`);
    if (!cap.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cap.id)) fail('id must be kebab-case');
    if (seen.has(cap.id)) fail('duplicate id');
    seen.add(cap.id);
    if (!cap.name) fail('name is required');
    if (!cap.summary) fail('summary is required');
    if (!STATUSES.includes(cap.status)) {
      fail(`status must be one of ${STATUSES.join(', ')} (got ${JSON.stringify(cap.status)})`);
      continue;
    }
    if (!Array.isArray(cap.claimTerms) || cap.claimTerms.some((t) => !CLAIM_TERMS.includes(t))) {
      fail(`claimTerms must be an array drawn from ${CLAIM_TERMS.join(', ')}`);
    }
    if (cap.readme) {
      if (!README_SECTIONS.includes(cap.readme.section)) fail(`readme.section must be one of ${README_SECTIONS.join(', ')}`);
      if (!cap.readme.line || /^\s*-\s/.test(cap.readme.line)) fail('readme.line is required and must not include the leading "- "');
    }
    if (cap.status !== 'shipped' && cap.usedBy) fail('usedBy is only valid for status "shipped"');

    // Module existence.
    const moduleExists = cap.module ? existsSync(join(root, cap.module)) : false;
    if (cap.status !== 'planned' && !cap.module) fail(`status "${cap.status}" requires a module`);
    if (cap.module && !moduleExists) fail(`module ${cap.module} does not exist`);
    const inGraph = cap.module ? graph.files.has(cap.module) : false;
    if (cap.module && moduleExists && !inGraph) fail(`module ${cap.module} is not a non-test TypeScript source under packages/`);

    // Proven tier from the graph alone (independent of the declared usedBy).
    let proven = 'planned';
    let proof = 'module not reachable from any package export entry';
    if (inGraph && reachable.has(cap.module)) {
      proven = 'library-only';
      proof = 'reachable from a package export entry, no reachable file imports it';
      const importer = [...reachable].sort().find((f) => f !== cap.module && graph.imports.get(f)?.has(cap.module));
      if (importer) {
        proven = 'shipped';
        proof = `imported at runtime by ${importer}`;
      }
    }

    // Declared-shipped needs its own usedBy proof.
    if (cap.status === 'shipped') {
      if (!cap.usedBy) fail('status "shipped" requires usedBy');
      else if (!existsSync(join(root, cap.usedBy))) fail(`usedBy ${cap.usedBy} does not exist`);
      else if (!graph.files.has(cap.usedBy)) fail(`usedBy ${cap.usedBy} is a test, fixture or non-TypeScript file; only non-test source counts`);
      else if (!reachable.has(cap.usedBy)) fail(`usedBy ${cap.usedBy} is not reachable from any package export entry`);
      else if (inGraph) {
        const path = importPath(graph, cap.usedBy, cap.module);
        if (!path) fail(`usedBy ${cap.usedBy} does not reach ${cap.module} through runtime import edges (a re-export or type-only import does not count)`);
        else proof = path.join(' -> ');
      }
    }

    const higherThanProven = RANK[cap.status] > RANK[proven];
    const lowerThanProven = RANK[cap.status] < RANK[proven];
    if (cap.status === 'shipped' && higherThanProven && !failures.some((f) => f.startsWith(`${id}: usedBy`))) {
      fail(`declared shipped but the graph proves only ${proven} (${proof})`);
    } else if (cap.status !== 'shipped' && higherThanProven) {
      fail(`declared ${cap.status} but the graph proves only ${proven} (${proof})`);
    }
    if (lowerThanProven) {
      fail(`declared ${cap.status} but the code already qualifies as ${proven} (${proof}); update docs/capabilities.json`);
    }
    rows.push({ id: cap.id, status: cap.status, proven, proof });
  }
  return { failures, rows };
}

/** README must equal what gen-capabilities builds from the manifest. */
export function checkReadme(root, manifest) {
  const failures = [];
  const committed = readFileSync(join(root, 'README.md'), 'utf8');
  let generated;
  try {
    generated = applyToReadme(committed, manifest);
  } catch (e) {
    return [`README.md: ${e.message} -- run \`npm run docs:gen\` and commit`];
  }
  if (!equalNormalized(generated, committed)) {
    failures.push('README.md: capability lines are out of date -- run `npm run docs:gen` and commit\n' + lineDiff(committed, generated));
  }
  return failures;
}

function main() {
  const manifest = JSON.parse(readFileSync(join(defaultRoot, 'docs/capabilities.json'), 'utf8'));
  const { failures, rows } = evaluateCapabilities(defaultRoot, manifest);
  failures.push(...checkReadme(defaultRoot, manifest));
  if (failures.length) {
    console.error('check-capabilities: FAIL');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }
  const count = (s) => rows.filter((r) => r.status === s).length;
  console.log(`check-capabilities: OK (${rows.length} capabilities: ${count('shipped')} shipped, ${count('library-only')} library-only, ${count('planned')} planned; README current)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
