#!/usr/bin/env node
/**
 * Packaging smoke test for the @dcyfr/ai CLI binaries.
 *
 * Builds + packs the package, installs the resulting tarball into a throwaway
 * consumer project (exactly as a user would), then asserts that every declared
 * `bin` is actually linked by npm and runs `--help` with exit code 0 — including
 * the `telemetry` and `validate-runtime` subcommands now folded into `dcyfr-ai` —
 * and that `version` / `--version` / `-v` print the packaged version.
 *
 * This guards the bin-layout regressions shipped in 3.2.1:
 *   - a bin whose target file is missing from the tarball never gets linked
 *     (the old `dcyfr` -> dist/ai/cli/telemetry-dashboard.js path)
 *   - a bin that imports a non-existent dist file crashes at startup
 *     (bin/tui.js importing dist/ai/validation/framework.js)
 *   - the removed `dcyfr` bin (which collided with @dcyfr/ai-cli) must stay gone
 *
 * Run: npm run smoke:bins
 */

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const NODE = process.execPath;
const pkgVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;

const EXPECTED_BINS = ['dcyfr-ai', 'dcyfr-ai-tui'];
const REMOVED_BINS = ['dcyfr'];
const HELP_CHECKS = [
  { argv: ['dcyfr-ai', '--help'], contains: 'dcyfr-ai' },
  { argv: ['dcyfr-ai-tui', '--help'], contains: 'TUI' },
  { argv: ['dcyfr-ai', 'telemetry', '--help'], contains: 'telemetry' },
  { argv: ['dcyfr-ai', 'validate-runtime', '--help'], contains: 'Validate' },
  { argv: ['dcyfr-ai', 'version'], contains: pkgVersion },
  { argv: ['dcyfr-ai', '--version'], contains: pkgVersion },
  { argv: ['dcyfr-ai', '-v'], contains: pkgVersion },
];

const failures = [];
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function bad(msg) {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
}
function run(file, args, opts = {}) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

const workdir = mkdtempSync(join(tmpdir(), 'dcyfr-ai-smoke-'));
try {
  console.log('• Building (tsc + fix-esm-imports)…');
  run('npm', ['run', 'build'], { cwd: repoRoot });
  ok('built');

  // Pack with --ignore-scripts so the build above isn't re-run; locate the
  // tarball by reading the (otherwise empty) pack destination rather than
  // parsing npm's stdout, which lifecycle output can pollute.
  console.log('• Packing the tarball…');
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', workdir], { cwd: repoRoot });
  const tgz = readdirSync(workdir).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('npm pack produced no .tgz in the pack destination');
  const tarball = join(workdir, tgz);
  ok(`packed ${tgz}`);

  const proj = join(workdir, 'consumer');
  mkdirSync(proj, { recursive: true });
  writeFileSync(
    join(proj, 'package.json'),
    JSON.stringify({ name: 'smoke-consumer', version: '0.0.0', private: true }, null, 2)
  );

  console.log('• Installing the tarball into a throwaway consumer project…');
  run('npm', ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {
    cwd: proj,
  });
  ok('installed');

  const installedPkg = JSON.parse(
    readFileSync(join(proj, 'node_modules', '@dcyfr', 'ai', 'package.json'), 'utf8')
  );
  const declaredBins = Object.keys(installedPkg.bin || {});
  const binDir = join(proj, 'node_modules', '.bin');

  console.log('• Asserting declared bins are linked…');
  for (const name of EXPECTED_BINS) {
    if (declaredBins.includes(name)) ok(`package.json declares "${name}"`);
    else bad(`package.json is missing bin "${name}"`);
    if (existsSync(join(binDir, name))) ok(`npm linked .bin/${name}`);
    else bad(`npm did not link .bin/${name}`);
  }
  for (const name of REMOVED_BINS) {
    if (!declaredBins.includes(name) && !existsSync(join(binDir, name))) {
      ok(`removed bin "${name}" is absent (no collision with @dcyfr/ai-cli)`);
    } else {
      bad(`removed bin "${name}" is still present`);
    }
  }

  console.log('• Running --help / version checks on each bin / subcommand…');
  for (const { argv, contains } of HELP_CHECKS) {
    const [name, ...rest] = argv;
    try {
      const out = run(NODE, [join(binDir, name), ...rest]);
      if (out.includes(contains)) ok(`${argv.join(' ')} → exit 0, output OK`);
      else bad(`${argv.join(' ')} → exit 0 but output missing "${contains}"`);
    } catch (err) {
      const first = String(err.stderr || err.message).split('\n')[0];
      bad(`${argv.join(' ')} → exited ${err.status ?? '?'}: ${first}`);
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n❌ Packaging smoke test FAILED (${failures.length} issue(s)).`);
  process.exit(1);
}
console.log('\n✅ Packaging smoke test passed — all declared bins resolve and run.');
