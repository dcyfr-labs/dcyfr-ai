#!/usr/bin/env node
'use strict';

/*
 * dcyfr-ai — official launcher for the @dcyfr/ai CLI.
 *
 * This package exists for two reasons:
 *
 *  1. UX: the harness package is @dcyfr/ai but its command is `dcyfr-ai`,
 *     so `npx dcyfr-ai <command>` only works without a local install if a
 *     registry package named `dcyfr-ai` exists (dcyfr-labs/dcyfr-ai#253).
 *  2. Security: the unscoped `dcyfr-ai` name was published and unpublished
 *     by a third party on 2026-01-27, leaving it claimable by anyone.
 *     Holding it keeps `npx dcyfr-ai` resolving to DCYFR-owned code.
 *
 * It does exactly one thing: resolve the `dcyfr-ai` bin of the @dcyfr/ai
 * dependency this package shipped with, and re-exec it under the current
 * Node with the original arguments, stdio, and exit status.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TARGET_PACKAGE = '@dcyfr/ai';
const TARGET_BIN = 'dcyfr-ai';

function fail(message) {
  process.stderr.write(`dcyfr-ai launcher: ${message}\n`);
  process.exit(1);
}

// @dcyfr/ai declares an `exports` map that exposes neither ./bin/* nor
// ./package.json, so require.resolve('@dcyfr/ai/bin/dcyfr-ai.js') throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. Walk the resolver's search paths and find
// the installed package directory by hand instead — `exports` does not
// constrain plain filesystem lookups — and read the bin path from the
// manifest so the launcher keeps working if the bin file moves in a
// future release.
function findTargetBin() {
  for (const base of require.resolve.paths(TARGET_PACKAGE) || []) {
    const packageDir = path.join(base, TARGET_PACKAGE);
    const manifestPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }

    const bin = manifest.bin;
    const binRelative = typeof bin === 'string' ? bin : bin && bin[TARGET_BIN];
    if (!binRelative) {
      fail(
        `${TARGET_PACKAGE}@${manifest.version || '?'} at ${packageDir} ` +
          `does not declare a "${TARGET_BIN}" bin`,
      );
    }

    const binPath = path.resolve(packageDir, binRelative);
    if (!fs.existsSync(binPath)) {
      fail(`${TARGET_PACKAGE} bin target is missing: ${binPath}`);
    }
    return binPath;
  }
  return null;
}

const binPath = findTargetBin();
if (!binPath) {
  fail(
    `cannot find the ${TARGET_PACKAGE} package this launcher forwards to.\n` +
      `Re-run via "npx dcyfr-ai@latest <command>" or install the harness ` +
      `directly: npm install ${TARGET_PACKAGE}`,
  );
}

const child = spawn(process.execPath, [binPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

// Terminal-delivered signals (Ctrl-C, hangup) already reach the child through
// the shared process group; stay alive until it exits so its status is
// mirrored. SIGTERM is usually process-targeted, so pass it along explicitly.
process.on('SIGINT', () => {});
process.on('SIGHUP', () => {});
process.on('SIGTERM', () => child.kill('SIGTERM'));

child.on('error', (error) => {
  fail(`failed to start ${binPath}: ${error.message}`);
});

child.on('exit', (code, signal) => {
  if (signal) {
    // Re-raise the child's fatal signal so our exit status matches it.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code === null ? 1 : code);
});
