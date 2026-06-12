import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORWARD_SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'forward.js',
);

// Stand-in for the real bin/dcyfr-ai.js: echoes its argv as JSON and exits
// with the code following an optional --exit flag.
const FAKE_CLI = `
const args = process.argv.slice(2);
console.log(JSON.stringify({ argv: args }));
const exitFlag = args.indexOf('--exit');
process.exit(exitFlag === -1 ? 0 : Number(args[exitFlag + 1]));
`;

const fixtures = [];
afterAll(() => {
  for (const root of fixtures) {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Builds the on-disk layout npm produces when the launcher is installed:
 *   <root>/node_modules/dcyfr-ai/bin/forward.js   (the launcher under test)
 *   <root>/node_modules/@dcyfr/ai/...             (the target package)
 * forward.js resolves @dcyfr/ai relative to its own location, so it must be
 * copied into the tree rather than run from the repo.
 */
function makeFixture({ binPath = 'bin/dcyfr-ai.js', binField, includeTarget = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dcyfr-ai-launcher-'));
  fixtures.push(root);

  const launcherDir = join(root, 'node_modules', 'dcyfr-ai');
  mkdirSync(join(launcherDir, 'bin'), { recursive: true });
  writeFileSync(
    join(launcherDir, 'package.json'),
    JSON.stringify({ name: 'dcyfr-ai', version: '0.0.0-test' }),
  );
  copyFileSync(FORWARD_SRC, join(launcherDir, 'bin', 'forward.js'));

  if (includeTarget) {
    const targetDir = join(root, 'node_modules', '@dcyfr', 'ai');
    mkdirSync(join(targetDir, dirname(binPath)), { recursive: true });
    writeFileSync(
      join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@dcyfr/ai',
        version: '9.9.9-test',
        bin: binField ?? { 'dcyfr-ai': binPath },
        // Mirror the real package: an exports map that exposes neither
        // ./bin/* nor ./package.json.
        exports: { '.': './index.js' },
      }),
    );
    writeFileSync(join(targetDir, binPath), FAKE_CLI);
  }

  return root;
}

function runForwarder(root, args = []) {
  return spawnSync(
    process.execPath,
    [join(root, 'node_modules', 'dcyfr-ai', 'bin', 'forward.js'), ...args],
    { encoding: 'utf8' },
  );
}

describe('dcyfr-ai launcher (launcher/bin/forward.js)', () => {
  it('forwards argv verbatim to the @dcyfr/ai bin and exits 0', () => {
    const root = makeFixture();
    const args = ['config:init', '--flag', 'value with spaces', '--json'];

    const result = runForwarder(root, args);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ argv: args });
  });

  it('propagates the target CLI exit code', () => {
    const root = makeFixture();

    const result = runForwarder(root, ['--exit', '7']);

    expect(result.status).toBe(7);
  });

  it('resolves the bin through the manifest bin map, not a hardcoded path', () => {
    const root = makeFixture({ binPath: 'dist/cli/relocated-entry.js' });

    const result = runForwarder(root, ['status']);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ argv: ['status'] });
  });

  it('fails loud when @dcyfr/ai is not installed', () => {
    const root = makeFixture({ includeTarget: false });

    const result = runForwarder(root, ['config:init']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot find the @dcyfr/ai package');
    expect(result.stderr).toContain('npm install @dcyfr/ai');
  });

  it('fails loud when @dcyfr/ai stops declaring the dcyfr-ai bin', () => {
    const root = makeFixture({ binField: { 'some-other-tool': 'bin/dcyfr-ai.js' } });

    const result = runForwarder(root, []);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/does not declare a "dcyfr-ai" bin/);
  });
});
