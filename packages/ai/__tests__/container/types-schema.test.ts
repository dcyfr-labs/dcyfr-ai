/**
 * Container type schema validation tests.
 * TLP:CLEAR
 */

import { describe, expect, it } from 'vitest';

import {
  AgentContainerConfigSchema,
  ContainerHandleSchema,
  ContainerResourceLimitsSchema,
} from '../../src/container/index';

describe('ContainerResourceLimitsSchema', () => {
  it('accepts valid resource limits', () => {
    const parsed = ContainerResourceLimitsSchema.parse({
      maxMemory: '2g',
      maxCpus: 2,
      maxExecutionTimeMs: 1_800_000,
      maxDiskSpace: '10g',
    });

    expect(parsed.maxMemory).toBe('2g');
    expect(parsed.maxCpus).toBe(2);
  });

  it('rejects invalid memory format', () => {
    expect(() =>
      ContainerResourceLimitsSchema.parse({
        maxMemory: '2048',
        maxCpus: 2,
        maxExecutionTimeMs: 1_800_000,
      }),
    ).toThrow();
  });
});

describe('AgentContainerConfigSchema', () => {
  it('accepts a minimal valid config', () => {
    const parsed = AgentContainerConfigSchema.parse({
      image: 'dcyfr/agent:test',
      repo: 'dcyfr/dcyfr-workspace',
      taskId: '1.2.5',
      taskDescription: 'validate schemas',
      contractId: 'contract-123',
      githubToken: 'ghp_test',
    });

    expect(parsed.repo).toBe('dcyfr/dcyfr-workspace');
    expect(parsed.taskId).toBe('1.2.5');
  });

  it('supports partial resource limits', () => {
    const parsed = AgentContainerConfigSchema.parse({
      image: 'dcyfr/agent:test',
      repo: 'dcyfr/dcyfr-workspace',
      taskId: '1.2.5',
      taskDescription: 'validate schemas',
      contractId: 'contract-123',
      githubToken: 'ghp_test',
      resourceLimits: {
        maxMemory: '512m',
      },
    });

    expect(parsed.resourceLimits?.maxMemory).toBe('512m');
  });

  it('rejects missing githubToken', () => {
    expect(() =>
      AgentContainerConfigSchema.parse({
        image: 'dcyfr/agent:test',
        repo: 'dcyfr/dcyfr-workspace',
        taskId: '1.2.5',
        taskDescription: 'validate schemas',
        contractId: 'contract-123',
      }),
    ).toThrow();
  });
});

describe('ContainerHandleSchema', () => {
  it('accepts handles with redacted config', () => {
    const parsed = ContainerHandleSchema.parse({
      containerId: 'abc123',
      containerName: 'dcyfr-agent-abc12345',
      startedAt: new Date(),
      backendType: 'local-docker',
      config: {
        image: 'dcyfr/agent:test',
        repo: 'dcyfr/dcyfr-workspace',
        taskId: '1.2.5',
        taskDescription: 'validate schemas',
        contractId: 'contract-123',
      },
    });

    expect(parsed.backendType).toBe('local-docker');
  });

  it('rejects handles that include githubToken in config', () => {
    expect(() =>
      ContainerHandleSchema.parse({
        containerId: 'abc123',
        containerName: 'dcyfr-agent-abc12345',
        startedAt: new Date(),
        backendType: 'local-docker',
        config: {
          image: 'dcyfr/agent:test',
          repo: 'dcyfr/dcyfr-workspace',
          taskId: '1.2.5',
          taskDescription: 'validate schemas',
          contractId: 'contract-123',
          githubToken: 'should-not-be-here',
        },
      }),
    ).toThrow();
  });
});
