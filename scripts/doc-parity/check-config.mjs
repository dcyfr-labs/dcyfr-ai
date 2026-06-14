#!/usr/bin/env node
/**
 * Config-parity gate.
 *   - config/schema.json and docs/CONFIG_REFERENCE.md must be byte-identical to
 *     what gen-config produces from the Zod schema (hard fail otherwise).
 *   - coverage: every schema-default top-level key must be present in both
 *     config/default.json and config/default.yaml (the curated templates are not
 *     overwritten, only checked for coverage).
 * Fix: `npm run build && npm run docs:gen:config` then commit.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifacts } from './gen-config.mjs';
import { equalNormalized, lineDiff } from './lib/diff.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const { schemaJson, configReferenceMd, defaultKeys } = buildArtifacts();
const failures = [];

function cmp(label, generated, relPath) {
  let committed;
  try {
    committed = readFileSync(join(repoRoot, relPath), 'utf8');
  } catch {
    failures.push(`${label}: ${relPath} is missing -- run \`npm run docs:gen:config\` and commit`);
    return;
  }
  if (!equalNormalized(generated, committed)) {
    failures.push(`${label}: ${relPath} is out of date -- run \`npm run docs:gen:config\` and commit\n` + lineDiff(committed, generated));
  }
}

cmp('schema.json', schemaJson, 'config/schema.json');
cmp('CONFIG_REFERENCE.md', configReferenceMd, 'docs/CONFIG_REFERENCE.md');

// Coverage of the curated templates (not regenerated, only checked).
let jsonKeys = new Set();
try {
  jsonKeys = new Set(Object.keys(JSON.parse(readFileSync(join(repoRoot, 'config/default.json'), 'utf8'))));
} catch (e) {
  failures.push(`coverage: cannot read config/default.json: ${e.message}`);
}
let yamlKeys = new Set();
try {
  const yamlText = readFileSync(join(repoRoot, 'config/default.yaml'), 'utf8');
  yamlKeys = new Set([...yamlText.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]));
} catch (e) {
  failures.push(`coverage: cannot read config/default.yaml: ${e.message}`);
}

for (const k of defaultKeys) {
  if (k === '$schema') continue;
  if (!jsonKeys.has(k)) failures.push(`config/default.json missing top-level key '${k}' (present in schema defaults)`);
  if (!yamlKeys.has(k)) failures.push(`config/default.yaml missing top-level key '${k}' (present in schema defaults)`);
}

if (failures.length) {
  console.error('check-config: FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exitCode = 1;
} else {
  console.log(`check-config: OK (schema.json + CONFIG_REFERENCE.md current; ${defaultKeys.length} default keys covered)`);
}
