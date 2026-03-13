/**
 * RemoteDockerBackend integration test
 * TLP:CLEAR
 *
 * Runs only when REMOTE_DOCKER_INTEGRATION=1 and DOCKER_HOST is configured.
 */

import { describe, it, expect } from 'vitest';

import {
  RemoteDockerBackend,
  type AgentContainerConfig,
} from '../../src/container/index';

const describeIfRemote =
  process.env['REMOTE_DOCKER_INTEGRATION'] === '1' && Boolean(process.env['DOCKER_HOST'])
    ? describe
    : describe.skip;

describeIfRemote('RemoteDockerBackend integration', () => {
  it('provisions, waits, and tears down on remote Docker host', async () => {
    const backend = new RemoteDockerBackend();

    const health = await backend.healthCheck();
    expect(health.available).toBe(true);

    const config: AgentContainerConfig = {
      image: 'alpine:3.20',
      repo: 'dcyfr/dcyfr-ai',
      taskId: '4.1.5',
      taskDescription: 'Remote integration test',
      contractId: 'integration-remote-backend',
      githubToken: 'integration-token-placeholder',
      env: {
        CI: '1',
      },
    };

    const handle = await backend.provision(config);
    expect(handle.backendType).toBe('remote-docker');

    const result = await backend.waitForExit(handle);
    expect(result.exitCode).not.toBeNull();

    const teardown = await backend.teardown(handle);
    expect(teardown.success).toBe(true);
  }, 120_000);
});
