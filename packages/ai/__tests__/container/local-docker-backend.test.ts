/**
 * Container Execution Module Tests
 * TLP:CLEAR
 *
 * Covers:
 *  - Type exports and constants (unit — no Docker needed)
 *  - LocalDockerBackend.healthCheck() (mocked execFile)
 *  - LocalDockerBackend.provision() argument construction (mocked spawn)
 *  - LocalDockerBackend.teardown() happy path and "already gone" case
 *  - LocalDockerBackend.listActive() accounting
 *  - ContainerConcurrencyLimitError thrown when limit exceeded
 *  - ContainerProvisionError construction
 *  - DelegationContract executionEnvironment field (types only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';

// ── Hoist mocks before any imports ────────────────────────────────────────

const { mockExecFile, mockSpawn } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

// ── Source imports ─────────────────────────────────────────────────────────

import {
  LocalDockerBackend,
  DEFAULT_CONTAINER_RESOURCE_LIMITS,
  ContainerProvisionError,
  ContainerConcurrencyLimitError,
  type AgentContainerConfig,
  type ContainerHandle,
} from '../../src/container/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProcess(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  spawnEvent?: boolean;
} = {}) {
  const proc = new EventEmitter() as ReturnType<typeof mockSpawn>;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  Object.assign(proc, {
    stdout: stdoutEmitter,
    stderr: stderrEmitter,
    pid: 12345,
  });

  // Defer events to next tick so provision() can attach listeners.
  // Only emit close/exit when exitCode is explicitly provided — omitting it
  // models a container that never exits (useful for concurrency tests).
  setTimeout(() => {
    if (opts.spawnEvent !== false) proc.emit('spawn');
    if (opts.stdout) stdoutEmitter.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) stderrEmitter.emit('data', Buffer.from(opts.stderr));
    if ('exitCode' in opts && opts.exitCode !== undefined) {
      proc.emit('close', opts.exitCode);
      proc.emit('exit', opts.exitCode);
    }
  }, 10);

  return proc;
}

const MINIMAL_CONFIG: AgentContainerConfig = {
  image: 'dcyfr/agent:test',
  repo: 'dcyfr/workspace',
  taskId: 'test-1.0.1',
  taskDescription: 'Test task',
  contractId: 'contract-test-001',
  githubToken: 'ghp_secret',
};

// ---------------------------------------------------------------------------
// DEFAULT_CONTAINER_RESOURCE_LIMITS
// ---------------------------------------------------------------------------

describe('DEFAULT_CONTAINER_RESOURCE_LIMITS', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_CONTAINER_RESOURCE_LIMITS.maxMemory).toBe('2g');
    expect(DEFAULT_CONTAINER_RESOURCE_LIMITS.maxCpus).toBe(2);
    expect(DEFAULT_CONTAINER_RESOURCE_LIMITS.maxExecutionTimeMs).toBe(30 * 60 * 1_000);
    expect(DEFAULT_CONTAINER_RESOURCE_LIMITS.maxDiskSpace).toBe('10g');
  });
});

// ---------------------------------------------------------------------------
// ContainerProvisionError
// ---------------------------------------------------------------------------

describe('ContainerProvisionError', () => {
  it('stores backendType and message', () => {
    const err = new ContainerProvisionError('boom', 'local-docker', new Error('cause'));
    expect(err.message).toBe('boom');
    expect(err.backendType).toBe('local-docker');
    expect(err.name).toBe('ContainerProvisionError');
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// ContainerConcurrencyLimitError
// ---------------------------------------------------------------------------

describe('ContainerConcurrencyLimitError', () => {
  it('formats a readable message', () => {
    const err = new ContainerConcurrencyLimitError(3, 3);
    expect(err.message).toMatch(/3\/3/);
    expect(err.limit).toBe(3);
    expect(err.active).toBe(3);
    expect(err.name).toBe('ContainerConcurrencyLimitError');
  });
});

// ---------------------------------------------------------------------------
// LocalDockerBackend — healthCheck
// ---------------------------------------------------------------------------

describe('LocalDockerBackend.healthCheck()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns available=true when docker version succeeds', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (e: null, r: { stdout: string }) => void) => {
      cb(null, { stdout: '27.3.1\n' });
    });

    const backend = new LocalDockerBackend();
    const result = await backend.healthCheck();

    expect(result.available).toBe(true);
    expect(result.backendType).toBe('local-docker');
    expect(result.version).toBe('27.3.1');
  });

  it('returns available=false when docker is not installed', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (e: Error) => void) => {
      cb(new Error('docker: command not found'));
    });

    const backend = new LocalDockerBackend();
    const result = await backend.healthCheck();

    expect(result.available).toBe(false);
    expect(result.error).toContain('command not found');
  });
});

// ---------------------------------------------------------------------------
// LocalDockerBackend — provision
// ---------------------------------------------------------------------------

describe('LocalDockerBackend.provision()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock execFile for docker inspect (resolveContainerId)
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (e: Error) => void) => {
      cb(new Error('No such container')); // Best-effort, doesn't affect provision
    });
  });

  it('spawns docker run with required env vars', async () => {
    const mockProc = createMockProcess({ exitCode: 0 });
    mockSpawn.mockReturnValue(mockProc);

    const backend = new LocalDockerBackend();
    const handle = await backend.provision(MINIMAL_CONFIG);

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('docker');
    expect(args[0]).toBe('run');
    // Container name is generated
    expect(args).toContain('--name');
    // Resource limits
    expect(args).toContain('--memory=2g');
    expect(args).toContain('--cpus=2');
    // Security
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges');
    // Task env vars
    expect(args).toContain(`AGENT_TASK_ID=${MINIMAL_CONFIG.taskId}`);
    expect(args).toContain(`AGENT_TASK_DESC=${MINIMAL_CONFIG.taskDescription}`);
    expect(args).toContain(`AGENT_REPO=${MINIMAL_CONFIG.repo}`);
    expect(args).toContain(`AGENT_CONTRACT_ID=${MINIMAL_CONFIG.contractId}`);
    // Image
    expect(args).toContain(MINIMAL_CONFIG.image);
    // Token is mounted via secret file, never passed as env var
    const mountIndex = args.indexOf('--mount');
    expect(mountIndex).toBeGreaterThanOrEqual(0);
    expect(args[mountIndex + 1]).toContain('target=/run/secrets/github_token');
    expect(args).toContain('GITHUB_TOKEN_FILE=/run/secrets/github_token');
    expect(args.join(' ')).not.toContain('GITHUB_TOKEN=ghp_secret');

    // Handle shape
    expect(handle.containerName).toMatch(/^dcyfr-agent-[a-f0-9]{8}$/);
    expect(handle.backendType).toBe('local-docker');
    expect(handle.startedAt).toBeInstanceOf(Date);
  });

  it('redacts githubToken from stored config', async () => {
    const mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc);

    const backend = new LocalDockerBackend();
    const handle = await backend.provision(MINIMAL_CONFIG);

    // The handle should not expose the token
    expect((handle.config as Partial<AgentContainerConfig>).githubToken).toBeUndefined();
  });

  it('throws ContainerConcurrencyLimitError when limit exceeded', async () => {
    const backend = new LocalDockerBackend({ maxConcurrent: 1 });

    // No exitCode → process never exits → container stays in active map
    mockSpawn.mockReturnValue(createMockProcess());
    await backend.provision(MINIMAL_CONFIG);

    await expect(backend.provision(MINIMAL_CONFIG)).rejects.toThrow(
      ContainerConcurrencyLimitError,
    );
  });

  it('adds dryRun flag when config.dryRun=true', async () => {
    const mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc);

    const backend = new LocalDockerBackend();
    await backend.provision({ ...MINIMAL_CONFIG, dryRun: true });

    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(args).toContain('AGENT_SKIP_PUSH=1');
  });

  it('cleans up mounted token secret file on teardown', async () => {
    const mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc);

    // Provision creates the secret file
    const backend = new LocalDockerBackend();
    const handle = await backend.provision(MINIMAL_CONFIG);

    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    const mountIndex = args.indexOf('--mount');
    const mountSpec = args[mountIndex + 1];
    const sourcePath = mountSpec.match(/source=([^,]+)/)?.[1];
    expect(sourcePath).toBeDefined();
    expect(existsSync(sourcePath!)).toBe(true);

    // Teardown should remove it
    mockExecFile.mockImplementation((_cmd: string, _runArgs: string[], cb: (e: null, r: { stdout: string }) => void) => {
      cb(null, { stdout: '' });
    });

    await backend.teardown(handle);
    expect(existsSync(sourcePath!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LocalDockerBackend — teardown
// ---------------------------------------------------------------------------

describe('LocalDockerBackend.teardown()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls docker rm -f and returns success', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (e: null, r: { stdout: string }) => void) => {
      cb(null, { stdout: '' });
    });

    const backend = new LocalDockerBackend();
    const handle: ContainerHandle = {
      containerId: 'abc123',
      containerName: 'dcyfr-agent-aabbccdd',
      startedAt: new Date(),
      backendType: 'local-docker',
      config: MINIMAL_CONFIG,
    };

    const result = await backend.teardown(handle);
    expect(result.success).toBe(true);
    expect(result.containerId).toBe('abc123');
  });

  it('returns success when container is already removed', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (e: Error) => void) => {
      cb(new Error('No such container: dcyfr-agent-aabbccdd'));
    });

    const backend = new LocalDockerBackend();
    const handle: ContainerHandle = {
      containerId: 'abc123',
      containerName: 'dcyfr-agent-aabbccdd',
      startedAt: new Date(),
      backendType: 'local-docker',
      config: MINIMAL_CONFIG,
    };

    const result = await backend.teardown(handle);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LocalDockerBackend — listActive
// ---------------------------------------------------------------------------

describe('LocalDockerBackend.listActive()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (e: Error) => void) => {
      cb(new Error('No such container'));
    });
  });

  it('starts empty', async () => {
    const backend = new LocalDockerBackend();
    expect(await backend.listActive()).toHaveLength(0);
  });

  it('tracks a provisioned container', async () => {
    // No exitCode → process never exits → container stays in active map
    mockSpawn.mockReturnValue(createMockProcess());

    const backend = new LocalDockerBackend();
    await backend.provision(MINIMAL_CONFIG);

    const active = await backend.listActive();
    expect(active).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// backendType discriminant
// ---------------------------------------------------------------------------

describe('LocalDockerBackend.backendType', () => {
  it('equals "local-docker"', () => {
    const backend = new LocalDockerBackend();
    expect(backend.backendType).toBe('local-docker');
  });
});
