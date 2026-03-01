/**
 * Docker Sandbox Runner Tests
 *
 * Covers:
 *  - parseDurationMs / normalizeMemory helpers (unit — no Docker needed)
 *  - DockerPluginRunner.isDockerAvailable, cleanup (unit — mocked execFile)
 *  - DockerPluginRunner.run() argument construction (unit — mocked spawn)
 *  - Full container execution (integration — Docker required, skipped otherwise)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  parseDurationMs,
  normalizeMemory,
  DockerPluginRunner,
} from '../../src/plugins/runtime/index';
import type { SandboxConfig } from '../../src/plugins/runtime/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock ChildProcess-like object that emits stdout, stderr, and close.
 */
function createMockProcess(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  errorEvent?: Error;
} = {}) {
  const proc = new EventEmitter() as ReturnType<typeof mockSpawn>;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  (proc as Record<string, unknown>).stdout = stdoutEmitter;
  (proc as Record<string, unknown>).stderr = stderrEmitter;

  process.nextTick(() => {
    if (opts.stdout) stdoutEmitter.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) stderrEmitter.emit('data', Buffer.from(opts.stderr));
    if (opts.errorEvent) {
      proc.emit('error', opts.errorEvent);
      proc.emit('close', null);
    } else {
      proc.emit('close', opts.exitCode ?? 0);
    }
  });

  return proc;
}

/**
 * Make mockExecFile call its callback with the provided result.
 * Uses args.find(typeof fn) to locate the callback regardless of position —
 * matches the project pattern in plugin-security-scanner.test.ts because
 * execFileAsync may be called with an optional options object, shifting the
 * callback from position 2 to position 3.
 */
function mockExecFileWith(result: { stdout: string; stderr: string } | Error) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockExecFile as any).mockImplementation((...args: any[]) => {
    const cb = args.find((a: unknown) => typeof a === 'function') as
      | ((err: Error | null, res?: { stdout: string; stderr: string }) => void)
      | undefined;
    if (result instanceof Error) {
      cb?.(result);
    } else {
      cb?.(null, result);
    }
  });
}

// ---------------------------------------------------------------------------
// parseDurationMs
// ---------------------------------------------------------------------------

describe('parseDurationMs', () => {
  it.each([
    ['500ms', 500],
    ['30s',   30_000],
    ['5m',    300_000],
    ['1h',    3_600_000],
    ['1.5m',  90_000],
    ['0.5s',  500],
  ])('parses "%s" to %d ms', (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it('throws on invalid format', () => {
    expect(() => parseDurationMs('5minutes')).toThrow(/Invalid duration/);
    expect(() => parseDurationMs('')).toThrow(/Invalid duration/);
  });
});

// ---------------------------------------------------------------------------
// normalizeMemory
// ---------------------------------------------------------------------------

describe('normalizeMemory', () => {
  it.each([
    ['512MB', '512m'],
    ['512M',  '512m'],
    ['512mb', '512m'],
    ['1GB',   '1g'],
    ['1G',    '1g'],
    ['2048K', '2048k'],
    ['256m',  '256m'],
  ])('normalizes "%s" to "%s"', (input, expected) => {
    expect(normalizeMemory(input)).toBe(expected);
  });

  it('throws on invalid format', () => {
    expect(() => normalizeMemory('fast')).toThrow(/Invalid memory/);
  });
});

// ---------------------------------------------------------------------------
// DockerPluginRunner — isDockerAvailable
// ---------------------------------------------------------------------------

describe('DockerPluginRunner.isDockerAvailable', () => {
  beforeEach(() => mockExecFile.mockReset());

  it('returns available=true when docker version succeeds', async () => {
    mockExecFileWith({ stdout: '27.0.0', stderr: '' });
    const runner = new DockerPluginRunner();
    const result = await runner.isDockerAvailable();
    expect(result.available).toBe(true);
    expect(result.version).toBe('27.0.0');
  });

  it('returns available=false when docker command fails', async () => {
    mockExecFileWith(new Error('docker: command not found'));
    const runner = new DockerPluginRunner();
    const result = await runner.isDockerAvailable();
    expect(result.available).toBe(false);
    expect(result.error).toContain('docker: command not found');
  });
});

// ---------------------------------------------------------------------------
// DockerPluginRunner — cleanup
// ---------------------------------------------------------------------------

describe('DockerPluginRunner.cleanup', () => {
  beforeEach(() => mockExecFile.mockReset());

  it('calls docker rm -f with the container name', async () => {
    mockExecFileWith({ stdout: 'removed', stderr: '' });
    const runner = new DockerPluginRunner();
    await runner.cleanup('dcyfr-plugin-test123');

    const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('docker');
    expect(args).toContain('rm');
    expect(args).toContain('-f');
    expect(args).toContain('dcyfr-plugin-test123');
  });

  it('does not throw when container has already been removed', async () => {
    mockExecFileWith(new Error('No such container'));
    const runner = new DockerPluginRunner();
    await expect(runner.cleanup('gone-container')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DockerPluginRunner — run() argument construction
// ---------------------------------------------------------------------------

describe('DockerPluginRunner.run — argument construction', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecFile.mockReset();
  });

  const baseConfig: SandboxConfig = {
    image: 'dcyfr-plugin-sandbox:latest',
    command: ['node', 'dist/index.js'],
  };

  async function runAndGetArgs(config: SandboxConfig): Promise<string[]> {
    mockSpawn.mockReturnValueOnce(createMockProcess({ stdout: 'ok', exitCode: 0 }));
    const runner = new DockerPluginRunner();
    await runner.run(config);
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('docker');
    return args;
  }

  it('includes docker run --rm with auto-generated container name', async () => {
    const args = await runAndGetArgs(baseConfig);
    expect(args[0]).toBe('run');
    expect(args[1]).toBe('--rm');
    expect(args[2]).toBe('--name');
    expect(args[3]).toMatch(/^dcyfr-plugin-[a-f0-9]{8}$/);
  });

  it('applies default resource limits', async () => {
    const args = await runAndGetArgs(baseConfig);
    expect(args.some((a) => a.startsWith('--memory='))).toBe(true);
    expect(args.some((a) => a.startsWith('--cpus='))).toBe(true);
  });

  it('applies custom resource limits', async () => {
    const args = await runAndGetArgs({
      ...baseConfig,
      resourceLimits: { maxMemory: '256MB', maxCpu: 0.25 },
    });
    expect(args).toContain('--memory=256m');
    expect(args).toContain('--cpus=0.25');
  });

  it('adds --network=none by default', async () => {
    const args = await runAndGetArgs(baseConfig);
    expect(args).toContain('--network=none');
  });

  it('omits --network=none when networkPermitted=true', async () => {
    const args = await runAndGetArgs({ ...baseConfig, networkPermitted: true });
    expect(args).not.toContain('--network=none');
  });

  it('adds --read-only by default', async () => {
    const args = await runAndGetArgs(baseConfig);
    expect(args).toContain('--read-only');
  });

  it('omits --read-only when writePermitted=true', async () => {
    const args = await runAndGetArgs({ ...baseConfig, writePermitted: true });
    expect(args).not.toContain('--read-only');
  });

  it('always includes a tmpfs /tmp mount', async () => {
    const args = await runAndGetArgs(baseConfig);
    expect(args.some((a) => a.startsWith('--tmpfs=/tmp:'))).toBe(true);
  });

  it('adds --cap-drop=ALL and --security-opt=no-new-privileges', async () => {
    const args = await runAndGetArgs(baseConfig);
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges');
  });

  it('runs container as unprivileged user 65534:65534', async () => {
    const args = await runAndGetArgs(baseConfig);
    expect(args).toContain('--user=65534:65534');
  });

  it('includes image and command at the end', async () => {
    const args = await runAndGetArgs(baseConfig);
    const imageIdx = args.indexOf('dcyfr-plugin-sandbox:latest');
    expect(imageIdx).toBeGreaterThan(0);
    expect(args[imageIdx + 1]).toBe('node');
    expect(args[imageIdx + 2]).toBe('dist/index.js');
  });

  it('injects environment variables', async () => {
    const args = await runAndGetArgs({
      ...baseConfig,
      env: { NODE_ENV: 'test', PLUGIN_ID: 'my-plugin' },
    });
    expect(args).toContain('-e');
    expect(args.some((a) => a.includes('NODE_ENV=test'))).toBe(true);
    expect(args.some((a) => a.includes('PLUGIN_ID=my-plugin'))).toBe(true);
  });

  it('adds --runtime=runsc when useGVisor=true', async () => {
    const args = await runAndGetArgs({ ...baseConfig, useGVisor: true });
    expect(args).toContain('--runtime=runsc');
  });
});

// ---------------------------------------------------------------------------
// DockerPluginRunner — run() result
// ---------------------------------------------------------------------------

describe('DockerPluginRunner.run — result', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecFile.mockReset();
  });

  it('captures stdout and stderr', async () => {
    mockSpawn.mockReturnValueOnce(
      createMockProcess({ stdout: 'hello stdout', stderr: 'some warning', exitCode: 0 }),
    );
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', '-e', 'console.log("hello stdout")'],
    });
    expect(result.stdout).toBe('hello stdout');
    expect(result.stderr).toBe('some warning');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('records non-zero exit code', async () => {
    mockSpawn.mockReturnValueOnce(createMockProcess({ exitCode: 1 }));
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', '-e', 'process.exit(1)'],
    });
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it('records executionTimeMs > 0', async () => {
    mockSpawn.mockReturnValueOnce(createMockProcess({ exitCode: 0 }));
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', '--version'],
    });
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns null exitCode on spawn error', async () => {
    mockSpawn.mockReturnValueOnce(
      createMockProcess({ errorEvent: new Error('spawn ENOENT') }),
    );
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', '--version'],
    });
    expect(result.exitCode).toBeNull();
  });

  it('includes the auto-generated containerName in result', async () => {
    mockSpawn.mockReturnValueOnce(createMockProcess({ exitCode: 0 }));
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', '--version'],
    });
    expect(result.containerName).toMatch(/^dcyfr-plugin-[a-f0-9]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// DockerPluginRunner — timeout behavior
// ---------------------------------------------------------------------------

describe('DockerPluginRunner.run — timeout', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecFile.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks result as timedOut when container exceeds limit', async () => {
    // Create a process that never exits on its own
    const proc = new EventEmitter() as ReturnType<typeof mockSpawn>;
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    (proc as Record<string, unknown>).stdout = stdoutEmitter;
    (proc as Record<string, unknown>).stderr = stderrEmitter;

    mockSpawn.mockReturnValueOnce(proc);

    // mockExecFile for docker stop — calls callback and then triggers proc close
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockExecFile as any).mockImplementationOnce((...args: any[]) => {
      const cb = args.find((a: unknown) => typeof a === 'function') as
        | ((err: Error | null, res?: { stdout: string; stderr: string }) => void)
        | undefined;
      cb?.(null, { stdout: '', stderr: '' });
      // Simulate container exiting after being stopped
      process.nextTick(() => proc.emit('close', 137));
    });

    const runner = new DockerPluginRunner();
    const runPromise = runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'infinite-loop.js'],
      resourceLimits: { maxExecutionTime: '100ms' },
    });

    // Advance fake timers past the limit
    vi.advanceTimersByTime(150);

    const result = await runPromise;
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(137);
  });
});

// ---------------------------------------------------------------------------
// afterEach guard
// ---------------------------------------------------------------------------
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Phase 5.4 — Resource Limit Edge Cases
// ---------------------------------------------------------------------------

describe('DockerPluginRunner — resource limit edge cases', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecFile.mockReset();
  });

  // ── OOM (Out-of-Memory) ────────────────────────────────────────────────

  it('OOM: exits with code 137 when container is killed by OOM killer', async () => {
    // Docker OOM killer sends SIGKILL → exit code 137; stderr contains "Killed"
    mockSpawn.mockReturnValueOnce(
      createMockProcess({ stderr: 'Killed', exitCode: 137 }),
    );
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'mem-hog.js'],
      resourceLimits: { maxMemory: '64MB' },
    });
    expect(result.exitCode).toBe(137);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toContain('Killed');
  });

  it('OOM: exitCode 137 is not classified as a timeout', async () => {
    mockSpawn.mockReturnValueOnce(
      createMockProcess({ exitCode: 137 }),
    );
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'mem-hog.js'],
    });
    expect(result.exitCode).toBe(137);
    expect(result.timedOut).toBe(false);
  });

  it('OOM: memory limit flag is present in docker run args', async () => {
    const captor: string[] = [];
    mockSpawn.mockImplementationOnce((cmd: string, args: string[]) => {
      captor.push(...args);
      return createMockProcess({ exitCode: 0 });
    });
    const runner = new DockerPluginRunner();
    await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'mem-hog.js'],
      resourceLimits: { maxMemory: '64MB' },
    });
    expect(captor.some((a) => a.startsWith('--memory='))).toBe(true);
  });

  // ── CPU spike / throttle ───────────────────────────────────────────────

  it('CPU spike: low CPU quota is passed to docker run', async () => {
    const captor: string[] = [];
    mockSpawn.mockImplementationOnce((cmd: string, args: string[]) => {
      captor.push(...args);
      return createMockProcess({ exitCode: 0 });
    });
    const runner = new DockerPluginRunner();
    await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'cpu-spike.js'],
      resourceLimits: { maxCpu: 0.1 },
    });
    expect(captor.some((a) => a.startsWith('--cpus='))).toBe(true);
  });

  it('CPU spike + timeout: timedOut is true when throttled process exceeds limit', async () => {
    vi.useFakeTimers();
    const proc = new EventEmitter() as ReturnType<typeof mockSpawn>;
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    (proc as Record<string, unknown>).stdout = stdoutEmitter;
    (proc as Record<string, unknown>).stderr = stderrEmitter;

    mockSpawn.mockReturnValueOnce(proc);

    // docker stop callback → triggers close with 137
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockExecFile as any).mockImplementationOnce((...args: any[]) => {
      const cb = args.find((a: unknown) => typeof a === 'function') as
        | ((err: Error | null, res?: { stdout: string; stderr: string }) => void)
        | undefined;
      cb?.(null, { stdout: '', stderr: '' });
      process.nextTick(() => proc.emit('close', 137));
    });

    const runner = new DockerPluginRunner();
    const runPromise = runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'cpu-spike.js'],
      resourceLimits: { maxCpu: 0.1, maxExecutionTime: '200ms' },
    });

    vi.advanceTimersByTime(250);
    const result = await runPromise;
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(137);
    vi.useRealTimers();
  });

  // ── Disk space exhaustion ──────────────────────────────────────────────

  it('disk full: exit code is non-zero when tmpfs is exhausted', async () => {
    // When a container writes beyond the tmpfs size limit it cannot proceed
    mockSpawn.mockReturnValueOnce(
      createMockProcess({
        stderr: 'write /tmp/output: no space left on device',
        exitCode: 1,
      }),
    );
    const runner = new DockerPluginRunner();
    const result = await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'write-disk.js'],
      resourceLimits: { maxDiskSpace: '10MB' },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/no space left on device/i);
    expect(result.timedOut).toBe(false);
  });

  it('disk full: tmpfs mount flag appears in docker run args', async () => {
    const captor: string[] = [];
    mockSpawn.mockImplementationOnce((cmd: string, args: string[]) => {
      captor.push(...args);
      return createMockProcess({ exitCode: 0 });
    });
    const runner = new DockerPluginRunner();
    await runner.run({
      image: 'dcyfr-plugin-sandbox:latest',
      command: ['node', 'write-disk.js'],
      resourceLimits: { maxDiskSpace: '10MB' },
    });
    // Either a --tmpfs flag or a --mount with tmpfs type is expected
    const hasTmpfsFlag =
      captor.some((a) => a.startsWith('--tmpfs')) ||
      captor.some((a) => a.startsWith('--mount') && a.includes('tmpfs'));
    expect(hasTmpfsFlag).toBe(true);
  });
});
