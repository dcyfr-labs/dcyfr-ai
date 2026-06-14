#!/usr/bin/env node
/**
 * Version-parity gate. Asserts:
 *   1. committed packages/ai/generated/version.ts === gen-version output for the
 *      current package.json version;
 *   2. packages/ai/index.ts re-exports VERSION from './generated/version.js' and
 *      does NOT hardcode `export const VERSION = ...`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageVersion, generatedVersionPath, renderVersionModule } from '../gen-version.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];

let generated = null;
try {
  generated = readFileSync(generatedVersionPath, 'utf8');
} catch {
  failures.push('packages/ai/generated/version.ts is missing -- run `node scripts/gen-version.mjs` (prebuild) and commit it');
}
if (generated !== null && generated !== renderVersionModule(packageVersion)) {
  failures.push(`packages/ai/generated/version.ts is stale -- expected VERSION='${packageVersion}'. Run \`node scripts/gen-version.mjs\` and commit.`);
}

const barrel = readFileSync(join(repoRoot, 'packages', 'ai', 'index.ts'), 'utf8');
if (/export\s+const\s+VERSION\s*=/.test(barrel)) {
  failures.push("packages/ai/index.ts hardcodes `export const VERSION = ...` -- re-export from './generated/version.js' instead.");
}
if (!/export\s*\{\s*VERSION\s*\}\s*from\s*['"]\.\/generated\/version\.js['"]/.test(barrel)) {
  failures.push("packages/ai/index.ts must re-export VERSION from './generated/version.js'.");
}

if (failures.length) {
  console.error('check-version: FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exitCode = 1;
} else {
  console.log(`check-version: OK (VERSION='${packageVersion}', generated + re-exported)`);
}
