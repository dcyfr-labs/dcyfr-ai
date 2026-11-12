#!/usr/bin/env node
/**
 * Generates the capability bullets in README.md from docs/capabilities.json.
 * Each section owns a marker pair:
 *   <!-- capabilities:<section>:start --> ... <!-- capabilities:<section>:end -->
 * Everything between the markers is replaced; hand-written bullets stay outside.
 * Pure text transform (no build needed). Fix drift with `npm run docs:gen`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(here, '..', '..');

export const SECTIONS = ['security-considerations', 'known-limitations'];
const GENERATED_NOTE = '<!-- GENERATED from docs/capabilities.json by scripts/doc-parity/gen-capabilities.mjs. Do not edit by hand; run `npm run docs:gen`. -->';

export const markers = (section) => ({
  start: `<!-- capabilities:${section}:start -->`,
  end: `<!-- capabilities:${section}:end -->`,
});

/** Bullet lines for one README section, in manifest order. */
export function renderSection(manifest, section) {
  return manifest.capabilities
    .filter((c) => c.readme && c.readme.section === section)
    .map((c) => `- ${c.readme.line}`);
}

/** Returns README text with every marker block regenerated. Throws if a marker pair is missing. */
export function applyToReadme(readme, manifest) {
  let out = readme;
  for (const section of SECTIONS) {
    const { start, end } = markers(section);
    const s = out.indexOf(start);
    const e = out.indexOf(end);
    if (s === -1 || e === -1 || e < s) {
      throw new Error(`README.md is missing the ${start} / ${end} marker pair`);
    }
    const body = [GENERATED_NOTE, ...renderSection(manifest, section)].join('\n');
    out = out.slice(0, s + start.length) + '\n' + body + '\n' + out.slice(e);
  }
  return out;
}

export function buildArtifacts(root = defaultRoot) {
  const manifest = JSON.parse(readFileSync(join(root, 'docs/capabilities.json'), 'utf8'));
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  return { readmeMd: applyToReadme(readme, manifest) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { readmeMd } = buildArtifacts();
  writeFileSync(join(defaultRoot, 'README.md'), readmeMd);
  console.log('gen-capabilities: wrote the capability blocks in README.md');
}
