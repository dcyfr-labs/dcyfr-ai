/**
 * RemoteDockerBackend tests
 * TLP:CLEAR
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const { mockExecFile, mockSpawn } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

import {
  RemoteDockerBackend,
  ContainerConcurrencyLimitError,
  type AgentContainerConfig,
  type ContainerHandle,
} from '../../src/container/index';

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
  taskId: 'test-4.1.4',
  taskDescription: 'Test remote task',
  contractId: 'contract-remote-001',
  githubToken: 'ghp_secret',
};

describe('RemoteDockerBackend.healthCheck()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns available=true and version when docker version succeeds', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (e: null, r: { stdout: string }) => void) => {
      cb(null, { stdout: '27.3.1\n' });
    });

    const backend = new RemoteDockerBackend({ host: 'ssh://builder@remote-host' });
    const result = await backend.healthCheck();

    expect(result.available).toBe(true);
    expect(result.backendType).toBe('remote-docker');
    expect(result.version).toBe('27.3.1');

    const call = mockExecFile.mock.calls[0] as [string, string[]];
    expect(call[0]).toBe('docker');
    expect(call[1]).toContain('--host');
    expect(call[1]).toContain('ssh://builder@remote-host');
  });

  it('returns available=false when docker call fails', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error) => void) => {
      cb(new Error('cannot connect to docker daemon'));
    });

    const backend = new RemoteDockerBackend({ host: 'tcp://10.0.0.2:2376' });
    const result = await backend.healthCheck();

    expect(result.available).toBe(false);
    expect(result.error).toContain('cannot connect');
  });
});

describe('RemoteDockerBackend.provision()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (e: null, r: { stdout: string; stderr?: string }) => void) => {
      cb(null, { stdout: '', stderr: '' });
    });
  });

  it('spawns docker run with host override, limits, and task env vars', async () => {
    const mockProc = createMockProcess({ exitCode: 0 });
    mockSpawn.mockReturnValue(mockProc);

    const backend = new RemoteDockerBackend({ host: 'ssh://builder@remote-host' });
    const handle = await backend.provision(MINIMAL_CONFIG);

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('docker');
    expect(args).toContain('--host');
    expect(args).toContain('ssh://builder@remote-host');
    expect(args).toContain('run');
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges');
    expect(args).toContain('AGENT_TASK_ID=test-4.1.4');
    expect(args).toContain('AGENT_REPO=dcyfr/workspace');
    expect(args.join(' ')).toContain('GITHUB_TOKEN=ghp_secret');

    expect(mockExecFile).toHaveBeenCalled();
    const pullCall = mockExecFile.mock.calls[0] as [string, string[]];
    expect(pullCall[0]).toBe('docker');
    expect(pullCall[1]).toContain('--host');
    expect(pullCall[1]).toContain('ssh://builder@remote-host');
    expect(pullCall[1]).toContain('pull');
    expect(pullCall[1]).toContain('dcyfr/agent:test');

    expect(handle.containerName).toMatch(/^dcyfr-agent-[a-f0-9]{8}$/);
    expect(handle.backendType).toBe('remote-docker');
    expect((handle.config as Partial<AgentContainerConfig>).githubToken).toBeUndefined();
  });

  it('throws ContainerConcurrencyLimitError when maxConcurrent reached', async () => {
    const backend = new RemoteDockerBackend({ maxConcurrent: 1 });

    mockSpawn.mockReturnValue(createMockProcess());
    await backend.provision(MINIMAL_CONFIG);

    await expect(backend.provision(MINIMAL_CONFIG)).rejects.toThrow(ContainerConcurrencyLimitError);
  });
});

describe('RemoteDockerBackend teardown/listActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when container is removed', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        optsOrCb: unknown,
        maybeCb?: (e: null, r: { stdout: string }) => void,
      ) => {
        const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
        cb?.(null, { stdout: '' });
      },
    );

    const backend = new RemoteDockerBackend();
    const handle: ContainerHandle = {
      containerId: 'abc123',
      containerName: 'dcyfr-agent-aabbccdd',
      startedAt: new Date(),
      backendType: 'remote-docker',
      config: {
        image: 'dcyfr/agent:test',
        repo: 'dcyfr/workspace',
        taskId: 't1',
        taskDescription: 'x',
        contractId: 'c1',
      },
    };

    const result = await backend.teardown(handle);
    expect(result.success).toBe(true);
    expect(result.containerId).toBe('abc123');
  });

  it('tracks active containers', async () => {
    mockSpawn.mockReturnValue(createMockProcess());

    const backend = new RemoteDockerBackend();
    await backend.provision(MINIMAL_CONFIG);

    const active = await backend.listActive();
    expect(active).toHaveLength(1);
  });
});
