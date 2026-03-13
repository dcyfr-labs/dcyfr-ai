/**
 * LocalDockerBackend integration tests
 * TLP:CLEAR
 *
 * Runs only when LOCAL_DOCKER_INTEGRATION=1 and Docker daemon is available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  LocalDockerBackend,
  ContainerConcurrencyLimitError,
  type AgentContainerConfig,
} from '../../src/container/index';

const execFileAsync = promisify(execFile);

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
    return true;
  } catch {
    return false;
  }
}

const runIntegration = process.env['LOCAL_DOCKER_INTEGRATION'] === '1';
const describeIfDocker = runIntegration ? describe : describe.skip;

describeIfDocker('LocalDockerBackend integration', () => {
  let imageTag = '';
  let buildDir = '';

  beforeAll(async () => {
    if (!(await dockerAvailable())) {
      throw new Error('Docker daemon unavailable. Set LOCAL_DOCKER_INTEGRATION=1 only when Docker is running.');
    }

    buildDir = await mkdtemp(join(tmpdir(), 'dcyfr-local-backend-it-'));
    imageTag = `dcyfr/local-backend-it:${Date.now()}`;

    const dockerfile = [
      'FROM alpine:3.20',
      'RUN adduser -D -u 1001 agent',
      'USER 1001',
      'ENTRYPOINT ["sh", "-c", "sleep ${SLEEP_SECONDS:-1}; echo integration-complete"]',
    ].join('\n');

    await writeFile(join(buildDir, 'Dockerfile'), `${dockerfile}\n`, 'utf8');
    await execFileAsync('docker', ['build', '-t', imageTag, buildDir]);
  }, 120_000);

  afterAll(async () => {
    if (imageTag) {
      await execFileAsync('docker', ['rmi', '-f', imageTag]).catch(() => undefined);
    }
    if (buildDir) {
      await rm(buildDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  function baseConfig(overrides: Partial<AgentContainerConfig> = {}): AgentContainerConfig {
    return {
      image: imageTag,
      repo: 'dcyfr/dcyfr-ai',
      taskId: '1.3.integration',
      taskDescription: 'integration test',
      contractId: `local-backend-it-${Date.now()}`,
      githubToken: 'integration-token-placeholder',
      env: {
        SLEEP_SECONDS: '1',
      },
      ...overrides,
    };
  }

  it('provisions, waits, and tears down a container lifecycle', async () => {
    const backend = new LocalDockerBackend();

    const handle = await backend.provision(baseConfig());
    expect(handle.backendType).toBe('local-docker');

    const result = await backend.waitForExit(handle);
    expect(result.success).toBe(true);
    expect(result.timedOut).toBe(false);

    const teardown = await backend.teardown(handle);
    expect(teardown.success).toBe(true);
  }, 120_000);

  it('enforces max concurrent container limit', async () => {
    const backend = new LocalDockerBackend({ maxConcurrent: 1 });

    const first = await backend.provision(baseConfig({ env: { SLEEP_SECONDS: '20' } }));

    await expect(
      backend.provision(baseConfig({
        taskId: '1.3.integration.concurrent',
        contractId: `local-backend-it-concurrent-${Date.now()}`,
        env: { SLEEP_SECONDS: '20' },
      })),
    ).rejects.toThrow(ContainerConcurrencyLimitError);

    await backend.teardown(first);
  }, 120_000);

  it('enforces maxExecutionTimeMs timeout', async () => {
    const backend = new LocalDockerBackend();

    const handle = await backend.provision(
      baseConfig({
        taskId: '1.3.integration.timeout',
        contractId: `local-backend-it-timeout-${Date.now()}`,
        env: { SLEEP_SECONDS: '30' },
        resourceLimits: {
          maxExecutionTimeMs: 500,
        },
      }),
    );

    const result = await backend.waitForExit(handle);
    expect(result.timedOut).toBe(true);

    await backend.teardown(handle);
  }, 120_000);
});
