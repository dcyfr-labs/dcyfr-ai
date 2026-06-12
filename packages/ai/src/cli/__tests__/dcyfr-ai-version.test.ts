/**
 * dcyfr-ai bin — version affordance tests
 *
 * Spawns the real bin/dcyfr-ai.js entry point. `dcyfr-ai version`,
 * `--version`, and `-v` must print the version from the package's own
 * package.json. The version/help paths must also work WITHOUT dist/ being
 * built: version triage is exactly the support flow where the user's
 * install may be broken (issue #253), so it must not depend on dist imports.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const binPath = join(repoRoot, 'bin', 'dcyfr-ai.js');
const pkgVersion: string = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8')
).version;

interface BinResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runBin(args: string[], opts: { bin?: string } = {}): BinResult {
  try {
    const stdout = execFileSync(process.execPath, [opts.bin ?? binPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: unknown; stderr?: unknown };
    return {
      status: e.status ?? 1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    };
  }
}

describe('dcyfr-ai version affordance', () => {
  it.each(['version', '--version', '-v'])(
    'prints the package version for "%s"',
    (arg) => {
      const result = runBin([arg]);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(pkgVersion);
    }
  );

  it('lists the version command and flags in help output', () => {
    const result = runBin(['help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\s+version\s+/m);
    expect(result.stdout).toContain('--version');
  });

  it('still rejects unknown commands with exit code 1', () => {
    const result = runBin(['definitely-not-a-command']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command');
  });
});

describe('dcyfr-ai version without dist/ (broken-install triage)', () => {
  let tmpRoot: string;
  let tmpBin: string;
  const sentinel = '0.0.0-version-test-sentinel';

  beforeAll(() => {
    // Mirror the installed layout (<pkg>/bin/dcyfr-ai.js + <pkg>/package.json)
    // but with no dist/ — the version path must not import from dist.
    tmpRoot = mkdtempSync(join(tmpdir(), 'dcyfr-ai-version-'));
    mkdirSync(join(tmpRoot, 'bin'));
    tmpBin = join(tmpRoot, 'bin', 'dcyfr-ai.js');
    copyFileSync(binPath, tmpBin);
    writeFileSync(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ name: '@dcyfr/ai', version: sentinel, type: 'module' })
    );
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('reads the version from the adjacent package.json, not a hardcoded string', () => {
    const result = runBin(['--version'], { bin: tmpBin });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(sentinel);
  });

  it('prints help without requiring dist/ to exist', () => {
    const result = runBin(['help'], { bin: tmpBin });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('USAGE');
  });
});
