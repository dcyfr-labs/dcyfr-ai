/**
 * Backend factory tests
 * TLP:CLEAR
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AgentContainersConfigSchema,
  createBackend,
  createBackendFromConfig,
  loadBackendFromConfigFile,
  createBackendWithFailover,
  type ContainerExecutionBackend,
  type AgentContainerConfig,
  type ContainerHandle,
  type ContainerLogEntry,
  type ContainerExecutionResult,
  type BackendHealthResult,
  type TeardownResult,
} from '../../src/container/index';

describe('AgentContainersConfigSchema', () => {
  it('accepts valid config shape used by workspace config file', () => {
    const parsed = AgentContainersConfigSchema.parse({
      backend: {
        type: 'local-docker',
        localDocker: { maxConcurrent: 3, defaultImage: 'dcyfr/agent:latest' },
      },
      defaults: {
        baseBranch: 'main',
        agentImage: 'dcyfr/agent:latest',
        resourceLimits: {
          maxMemory: '2g',
          maxCpus: 2,
          maxExecutionTimeMs: 1_800_000,
          maxDiskSpace: '10g',
        },
      },
      telemetry: { enabled: true, logDir: 'logs/agent-containers' },
    });

    expect(parsed.backend?.type).toBe('local-docker');
  });

  it('rejects invalid backend type', () => {
    expect(() =>
      AgentContainersConfigSchema.parse({
        backend: { type: 'totally-unknown' },
      }),
    ).toThrow();
  });
});

function makeFakeBackend(opts: {
  backendType: ContainerExecutionBackend['backendType'];
  available: boolean;
  marker: string;
}): ContainerExecutionBackend & { marker: string } {
  return {
    marker: opts.marker,
    backendType: opts.backendType,
    async healthCheck(): Promise<BackendHealthResult> {
      return { available: opts.available, backendType: opts.backendType };
    },
    async provision(_config: AgentContainerConfig): Promise<ContainerHandle> {
      return {
        containerId: `${opts.marker}-id`,
        containerName: `${opts.marker}-name`,
        startedAt: new Date(),
        backendType: opts.backendType,
        config: {
          image: 'img',
          repo: 'owner/repo',
          taskId: 't',
          taskDescription: 'd',
          contractId: 'c',
        },
      };
    },
    async *streamLogs(_handle: ContainerHandle): AsyncIterable<ContainerLogEntry> {
      return;
    },
    async waitForExit(_handle: ContainerHandle): Promise<ContainerExecutionResult> {
      return {
        success: true,
        exitCode: 0,
        timedOut: false,
        executionTimeMs: 1,
        stdout: '',
        stderr: '',
      };
    },
    async teardown(handle: ContainerHandle): Promise<TeardownResult> {
      return { success: true, containerId: handle.containerId };
    },
    async listActive(): Promise<ContainerHandle[]> {
      return [];
    },
  };
}

describe('createBackend()', () => {
  it('creates local backend by type', () => {
    const backend = createBackend('local-docker');
    expect(backend.backendType).toBe('local-docker');
  });

  it('creates remote backend by type', () => {
    const backend = createBackend('remote-docker');
    expect(backend.backendType).toBe('remote-docker');
  });

  it('creates kubernetes backend by type', () => {
    const backend = createBackend('kubernetes');
    expect(backend.backendType).toBe('kubernetes');
  });
});

describe('createBackendFromConfig()', () => {
  it('uses backend.type when present', () => {
    const backend = createBackendFromConfig({
      backend: {
        type: 'remote-docker',
        remoteDocker: { host: 'ssh://remote-host' },
      },
      defaults: { agentImage: 'dcyfr/agent:v2' },
    });

    expect(backend.backendType).toBe('remote-docker');
  });

  it('supports legacy backend.defaultBackend', () => {
    const backend = createBackendFromConfig({
      backend: {
        defaultBackend: 'local-docker',
      },
    });

    expect(backend.backendType).toBe('local-docker');
  });

  it('falls back to local-docker when missing config', () => {
    const backend = createBackendFromConfig({});
    expect(backend.backendType).toBe('local-docker');
  });
});

describe('loadBackendFromConfigFile()', () => {
  it('loads backend selection from JSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backend-factory-test-'));
    const file = join(dir, 'agent-containers.json');
    writeFileSync(file, JSON.stringify({ backend: { type: 'remote-docker' } }), 'utf8');

    const backend = loadBackendFromConfigFile(file);
    expect(backend.backendType).toBe('remote-docker');
  });

  it('fails fast on invalid config schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backend-factory-test-'));
    const file = join(dir, 'agent-containers.invalid.json');
    writeFileSync(file, JSON.stringify({ backend: { type: 'invalid-backend-type' } }), 'utf8');

    expect(() => loadBackendFromConfigFile(file)).toThrow();
  });
});

describe('createBackendWithFailover()', () => {
  it('uses primary backend when healthy', async () => {
    const primary = makeFakeBackend({ backendType: 'local-docker', available: true, marker: 'primary' });
    const fallback = makeFakeBackend({ backendType: 'remote-docker', available: true, marker: 'fallback' });
    const backend = createBackendWithFailover(primary, fallback);

    const handle = await backend.provision({
      image: 'img',
      repo: 'owner/repo',
      taskId: 't1',
      taskDescription: 'desc',
      contractId: 'c1',
      githubToken: 'secret',
    });

    expect(handle.containerId).toBe('primary-id');
  });

  it('falls back when primary healthCheck is unavailable', async () => {
    const primary = makeFakeBackend({ backendType: 'local-docker', available: false, marker: 'primary' });
    const fallback = makeFakeBackend({ backendType: 'remote-docker', available: true, marker: 'fallback' });
    const backend = createBackendWithFailover(primary, fallback);

    const handle = await backend.provision({
      image: 'img',
      repo: 'owner/repo',
      taskId: 't1',
      taskDescription: 'desc',
      contractId: 'c1',
      githubToken: 'secret',
    });

    expect(handle.containerId).toBe('fallback-id');
  });
});
