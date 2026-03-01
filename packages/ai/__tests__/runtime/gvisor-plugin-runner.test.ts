/**
 * gVisor Plugin Runner Tests
 *
 * Covers:
 *  - isGVisorAvailable() — binary detection via which/runsc (unit, mocked)
 *  - runWithTlp() — TLP-based runtime routing for all four TLP levels (unit, spied)
 *  - GVisorRequiredError — thrown for TLP:RED when gVisor absent
 *  - AMBER fallback — Docker with warning prepended to stderr
 *  - gVisor path — --runtime=runsc injected when gVisor available
 *  - Docker path — useGVisor: false for CLEAR/GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Hoist mocks before any imports ────────────────────────────────────────

const { mockExecFile, mockSpawn } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

// ── Source imports (after vi.mock) ─────────────────────────────────────────

import {
  GVisorPluginRunner,
  GVisorRequiredError,
} from '../../src/plugins/runtime/gvisor-plugin-runner';
import type { SandboxConfig } from '../../src/plugins/runtime/index';
import type { TLPLevel } from '../../src/types/delegation-contracts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Make mockExecFile call its callback with the provided result or error.
 * Uses args.find(typeof fn) to locate the callback regardless of position.
 */
function mockExecFileWith(result: { stdout: string; stderr: string } | Error) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockExecFile as any).mockImplementation((...args: any[]) => {
    const cb = args.find((a: unknown) => typeof a === 'function') as
      | ((err: Error | null, res?: { stdout: string; stderr: string }) => void)
      | undefined;
    if (!cb) return;
    if (result instanceof Error) {
      cb(result);
    } else {
      cb(null, result);
    }
  });
}

/**
 * Build a mock ChildProcess that emits stdout, stderr, and close events.
 */
function createMockProcess(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
} = {}) {
  const proc = new EventEmitter() as ReturnType<typeof mockSpawn>;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  (proc as Record<string, unknown>).stdout = stdoutEmitter;
  (proc as Record<string, unknown>).stderr = stderrEmitter;

  process.nextTick(() => {
    if (opts.stdout) stdoutEmitter.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) stderrEmitter.emit('data', Buffer.from(opts.stderr));
    proc.emit('close', opts.exitCode ?? 0);
  });

  return proc;
}

/** Minimal valid SandboxConfig for testing. */
const BASE_CONFIG: SandboxConfig = {
  image: 'dcyfr-plugin-sandbox:latest',
  command: ['node', 'dist/index.js'],
};

// ---------------------------------------------------------------------------
// isGVisorAvailable
// ---------------------------------------------------------------------------

describe('GVisorPluginRunner.isGVisorAvailable()', () => {
  let runner: GVisorPluginRunner;

  beforeEach(() => {
    mockExecFile.mockReset();
    runner = new GVisorPluginRunner();
  });

  it('returns { available: true } when `which runsc` succeeds', async () => {
    // First call = which runsc succeeds
    mockExecFileWith({ stdout: '/usr/local/bin/runsc', stderr: '' });

    const result = await runner.isGVisorAvailable();

    expect(result).toEqual({ available: true });
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect((mockExecFile as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('which');
    expect((mockExecFile as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual(['runsc']);
  });

  it('returns { available: true } when `which runsc` fails but `runsc --version` succeeds', async () => {
    (mockExecFile as ReturnType<typeof vi.fn>)
      // First call: which runsc → fail
      .mockImplementationOnce((...args: unknown[]) => {
        const cb = (args as unknown[]).find((a) => typeof a === 'function') as
          | ((err: Error) => void)
          | undefined;
        cb?.(new Error('which: no runsc in PATH'));
      })
      // Second call: runsc --version → succeed
      .mockImplementationOnce((...args: unknown[]) => {
        const cb = (args as unknown[]).find((a) => typeof a === 'function') as
          | ((err: Error | null, res?: { stdout: string; stderr: string }) => void)
          | undefined;
        cb?.(null, { stdout: 'runsc version release-20240101', stderr: '' });
      });

    const result = await runner.isGVisorAvailable();

    expect(result).toEqual({ available: true });
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect((mockExecFile as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('runsc');
    expect((mockExecFile as ReturnType<typeof vi.fn>).mock.calls[1][1]).toEqual(['--version']);
  });

  it('returns { available: false } when both `which runsc` and `runsc --version` fail', async () => {
    const notFoundError = new Error('which: no runsc in PATH');
    const execError = new Error('spawn runsc ENOENT');

    (mockExecFile as ReturnType<typeof vi.fn>)
      .mockImplementationOnce((...args: unknown[]) => {
        const cb = (args as unknown[]).find((a) => typeof a === 'function') as
          | ((err: Error) => void)
          | undefined;
        cb?.(notFoundError);
      })
      .mockImplementationOnce((...args: unknown[]) => {
        const cb = (args as unknown[]).find((a) => typeof a === 'function') as
          | ((err: Error) => void)
          | undefined;
        cb?.(execError);
      });

    const result = await runner.isGVisorAvailable();

    expect(result.available).toBe(false);
    expect(result.error).toContain('runsc not found in PATH');
    expect(result.error).toContain('spawn runsc ENOENT');
  });

  it('error message includes the underlying error text', async () => {
    const underlying = new Error('permission denied: /usr/sbin/runsc');

    (mockExecFile as ReturnType<typeof vi.fn>)
      .mockImplementationOnce((...args: unknown[]) => {
        const cb = (args as unknown[]).find((a) => typeof a === 'function') as
          | ((err: Error) => void)
          | undefined;
        cb?.(new Error('not found'));
      })
      .mockImplementationOnce((...args: unknown[]) => {
        const cb = (args as unknown[]).find((a) => typeof a === 'function') as
          | ((err: Error) => void)
          | undefined;
        cb?.(underlying);
      });

    const result = await runner.isGVisorAvailable();

    expect(result.available).toBe(false);
    expect(result.error).toContain('permission denied: /usr/sbin/runsc');
  });
});

// ---------------------------------------------------------------------------
// runWithTlp — routing logic (spy-based, no real Docker needed)
// ---------------------------------------------------------------------------

describe('GVisorPluginRunner.runWithTlp()', () => {
  let runner: GVisorPluginRunner;

  beforeEach(() => {
    mockExecFile.mockReset();
    mockSpawn.mockReset();
    runner = new GVisorPluginRunner();
  });

  // Helper: configure spies for a given scenario
  function setupSpies(opts: {
    gvisorAvailable: boolean;
    gvisorError?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  }) {
    vi.spyOn(runner, 'isGVisorAvailable').mockResolvedValue(
      opts.gvisorAvailable
        ? { available: true }
        : { available: false, error: opts.gvisorError ?? 'runsc not found in PATH: not installed' },
    );

    // Mock the `run` method on DockerPluginRunner prototype
    vi.spyOn(runner, 'run').mockResolvedValue({
      exitCode: opts.exitCode ?? 0,
      stdout: opts.stdout ?? 'ok',
      stderr: opts.stderr ?? '',
      timedOut: false,
      containerName: 'dcyfr-plugin-test-abc',
      executionTimeMs: 50,
    });
  }

  // ── TLP:CLEAR ──────────────────────────────────────────────────────────

  it('TLP:CLEAR — uses standard Docker, does not check gVisor availability', async () => {
    setupSpies({ gvisorAvailable: false });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:CLEAR');

    expect(result.runtimeUsed).toBe('docker');
    expect(result.tlpLevel).toBe('TLP:CLEAR');
    expect(runner.isGVisorAvailable).not.toHaveBeenCalled();
    expect(runner.run).toHaveBeenCalledWith({ ...BASE_CONFIG, useGVisor: false });
  });

  it('TLP:CLEAR — runtimeUsed is docker regardless of gVisor presence', async () => {
    setupSpies({ gvisorAvailable: true });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:CLEAR');

    expect(result.runtimeUsed).toBe('docker');
    expect(runner.isGVisorAvailable).not.toHaveBeenCalled();
  });

  // ── TLP:GREEN ──────────────────────────────────────────────────────────

  it('TLP:GREEN — uses standard Docker, does not check gVisor availability', async () => {
    setupSpies({ gvisorAvailable: false });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:GREEN');

    expect(result.runtimeUsed).toBe('docker');
    expect(result.tlpLevel).toBe('TLP:GREEN');
    expect(runner.isGVisorAvailable).not.toHaveBeenCalled();
    expect(runner.run).toHaveBeenCalledWith({ ...BASE_CONFIG, useGVisor: false });
  });

  // ── Default TLP (no argument) ──────────────────────────────────────────

  it('defaults to TLP:CLEAR when tlpLevel is omitted', async () => {
    setupSpies({ gvisorAvailable: false });

    const result = await runner.runWithTlp(BASE_CONFIG);

    expect(result.tlpLevel).toBe('TLP:CLEAR');
    expect(result.runtimeUsed).toBe('docker');
  });

  // ── TLP:AMBER + gVisor available ───────────────────────────────────────

  it('TLP:AMBER + gVisor available — sets useGVisor: true and returns runtimeUsed: gvisor', async () => {
    setupSpies({ gvisorAvailable: true });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:AMBER');

    expect(result.runtimeUsed).toBe('gvisor');
    expect(result.tlpLevel).toBe('TLP:AMBER');
    expect(runner.isGVisorAvailable).toHaveBeenCalledOnce();
    expect(runner.run).toHaveBeenCalledWith({ ...BASE_CONFIG, useGVisor: true });
  });

  it('TLP:AMBER + gVisor available — stdout/stderr/exitCode pass through unchanged', async () => {
    setupSpies({ gvisorAvailable: true, stdout: 'plugin-output', stderr: 'warn', exitCode: 0 });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:AMBER');

    expect(result.stdout).toBe('plugin-output');
    expect(result.stderr).toBe('warn');
    expect(result.exitCode).toBe(0);
  });

  // ── TLP:AMBER + gVisor unavailable ────────────────────────────────────

  it('TLP:AMBER + gVisor unavailable — falls back to Docker (useGVisor: false)', async () => {
    setupSpies({ gvisorAvailable: false });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:AMBER');

    expect(result.runtimeUsed).toBe('docker');
    expect(result.tlpLevel).toBe('TLP:AMBER');
    expect(runner.run).toHaveBeenCalledWith({ ...BASE_CONFIG, useGVisor: false });
  });

  it('TLP:AMBER + gVisor unavailable — prepends DCYFR WARNING to stderr', async () => {
    setupSpies({ gvisorAvailable: false, gvisorError: 'runsc not found', stderr: 'original-err' });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:AMBER');

    expect(result.stderr).toContain('[DCYFR WARNING]');
    expect(result.stderr).toContain('gVisor unavailable');
    expect(result.stderr).toContain('TLP:AMBER plugin running in standard Docker');
    expect(result.stderr).toContain('gvisor.dev');
    expect(result.stderr).toContain('original-err');
  });

  it('TLP:AMBER + gVisor unavailable — warning includes the probe error message', async () => {
    setupSpies({
      gvisorAvailable: false,
      gvisorError: 'runsc not found in PATH: spawn ENOENT',
    });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:AMBER');

    expect(result.stderr).toContain('runsc not found in PATH: spawn ENOENT');
  });

  it('TLP:AMBER + gVisor unavailable — does NOT throw', async () => {
    setupSpies({ gvisorAvailable: false });

    await expect(runner.runWithTlp(BASE_CONFIG, 'TLP:AMBER')).resolves.not.toThrow();
  });

  // ── TLP:RED + gVisor available ─────────────────────────────────────────

  it('TLP:RED + gVisor available — sets useGVisor: true and returns runtimeUsed: gvisor', async () => {
    setupSpies({ gvisorAvailable: true });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:RED');

    expect(result.runtimeUsed).toBe('gvisor');
    expect(result.tlpLevel).toBe('TLP:RED');
    expect(runner.run).toHaveBeenCalledWith({ ...BASE_CONFIG, useGVisor: true });
  });

  it('TLP:RED + gVisor available — stdout/stderr/exitCode pass through unchanged', async () => {
    setupSpies({ gvisorAvailable: true, stdout: 'secret-output', stderr: '', exitCode: 0 });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:RED');

    expect(result.stdout).toBe('secret-output');
    expect(result.stderr).toBe('');
  });

  // ── TLP:RED + gVisor unavailable ──────────────────────────────────────

  it('TLP:RED + gVisor unavailable — throws GVisorRequiredError', async () => {
    setupSpies({ gvisorAvailable: false });

    await expect(runner.runWithTlp(BASE_CONFIG, 'TLP:RED')).rejects.toThrow(GVisorRequiredError);
  });

  it('TLP:RED + gVisor unavailable — does NOT call run()', async () => {
    setupSpies({ gvisorAvailable: false });

    await runner.runWithTlp(BASE_CONFIG, 'TLP:RED').catch(() => undefined);

    expect(runner.run).not.toHaveBeenCalled();
  });

  it('TLP:RED + gVisor unavailable — error message mentions TLP:RED and install URL', async () => {
    setupSpies({ gvisorAvailable: false, gvisorError: 'spawn runsc ENOENT' });

    const error = await runner.runWithTlp(BASE_CONFIG, 'TLP:RED').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GVisorRequiredError);
    const err = error as GVisorRequiredError;
    expect(err.message).toContain('TLP:RED');
    expect(err.message).toContain('gVisor isolation');
    expect(err.message).toContain('gvisor.dev');
    expect(err.message).toContain('spawn runsc ENOENT');
  });

  it('TLP:RED + gVisor unavailable — error has code GVISOR_REQUIRED', async () => {
    setupSpies({ gvisorAvailable: false });

    const error = await runner.runWithTlp(BASE_CONFIG, 'TLP:RED').catch((e: unknown) => e);

    expect((error as GVisorRequiredError).code).toBe('GVISOR_REQUIRED');
  });

  it('TLP:RED + gVisor unavailable — error name is GVisorRequiredError', async () => {
    setupSpies({ gvisorAvailable: false });

    const error = await runner.runWithTlp(BASE_CONFIG, 'TLP:RED').catch((e: unknown) => e);

    expect((error as GVisorRequiredError).name).toBe('GVisorRequiredError');
  });

  // ── Config preservation ────────────────────────────────────────────────

  it('passes through all other SandboxConfig fields unchanged', async () => {
    setupSpies({ gvisorAvailable: true });

    const richConfig: SandboxConfig = {
      image: 'my-image:v2',
      command: ['node', 'server.js'],
      env: { API_KEY: 'abc', LOG_LEVEL: 'debug' },
      networkPermitted: true,
      writePermitted: false,
      resourceLimits: { maxMemory: '256MB', maxCpu: 0.25, maxExecutionTime: '2m', maxDiskSpace: '512MB' },
      workDir: '/app',
    };

    await runner.runWithTlp(richConfig, 'TLP:AMBER');

    expect(runner.run).toHaveBeenCalledWith({
      ...richConfig,
      useGVisor: true,
    });
  });

  it('original config.useGVisor field is overridden by TLP routing', async () => {
    setupSpies({ gvisorAvailable: false });
    const configWithGVisor: SandboxConfig = { ...BASE_CONFIG, useGVisor: true };

    // TLP:CLEAR — should force useGVisor: false even if caller set true
    const result = await runner.runWithTlp(configWithGVisor, 'TLP:CLEAR');

    expect(result.runtimeUsed).toBe('docker');
    expect(runner.run).toHaveBeenCalledWith({ ...configWithGVisor, useGVisor: false });
  });

  // ── Result shape ───────────────────────────────────────────────────────

  it('result includes all standard SandboxResult fields', async () => {
    setupSpies({ gvisorAvailable: true, stdout: 'out', stderr: 'err', exitCode: 0 });

    const result = await runner.runWithTlp(BASE_CONFIG, 'TLP:GREEN');

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: 'out',
      stderr: 'err',
      timedOut: false,
      containerName: expect.any(String),
      executionTimeMs: expect.any(Number),
      runtimeUsed: 'docker',
      tlpLevel: 'TLP:GREEN',
    });
  });

  // ── All TLP levels type-check ──────────────────────────────────────────

  it.each([
    ['TLP:CLEAR', false, 'docker'],
    ['TLP:GREEN', false, 'docker'],
    ['TLP:AMBER', true,  'gvisor'],
    ['TLP:RED',   true,  'gvisor'],
  ] as [TLPLevel, boolean, 'gvisor' | 'docker'][])(
    '%s with gVisor=%s → runtimeUsed=%s',
    async (tlpLevel, gvisorAvail, expectedRuntime) => {
      setupSpies({ gvisorAvailable: gvisorAvail });

      const result = await runner.runWithTlp(BASE_CONFIG, tlpLevel);

      expect(result.runtimeUsed).toBe(expectedRuntime);
    },
  );
});

// ---------------------------------------------------------------------------
// GVisorRequiredError
// ---------------------------------------------------------------------------

describe('GVisorRequiredError', () => {
  it('is an instance of Error', () => {
    const err = new GVisorRequiredError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name GVisorRequiredError', () => {
    const err = new GVisorRequiredError('test');
    expect(err.name).toBe('GVisorRequiredError');
  });

  it('has code GVISOR_REQUIRED', () => {
    const err = new GVisorRequiredError('test');
    expect(err.code).toBe('GVISOR_REQUIRED');
  });

  it('preserves the message', () => {
    const err = new GVisorRequiredError('runsc not found');
    expect(err.message).toBe('runsc not found');
  });

  it('can be caught as GVisorRequiredError specifically', () => {
    const throwIt = () => { throw new GVisorRequiredError('blocked'); };
    expect(throwIt).toThrow(GVisorRequiredError);
  });
});
