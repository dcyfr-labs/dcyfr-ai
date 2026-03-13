/**
 * AgentContainerDispatcher Tests
 * TLP:CLEAR
 *
 * Covers:
 *  - dispatchFromIssue() happy path + event emission
 *  - dispatchFromTask() happy path + event emission
 *  - cancel() — teardown + contract update + dispatch_cancelled event
 *  - getActiveDispatches() — tracking and removal after container exit
 *  - Capability detection via issue labels and keyword fallback
 *  - Resource tier estimation (small / medium / large)
 *  - watchContainer — dispatch_completed / dispatch_failed on process exit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentContainerDispatcher,
  type IssueDispatchInput,
  type TaskDispatchInput,
} from '../../src/container/agent-container-dispatcher';
import type {
  ContainerHandle,
  ContainerExecutionResult,
  TeardownResult,
} from '../../src/container/types';

// ---------------------------------------------------------------------------
// Helpers — mock backend + contract manager
// ---------------------------------------------------------------------------

function makeHandle(overrides: Partial<ContainerHandle> = {}): ContainerHandle {
  return {
    containerId: 'container-abc123',
    containerName: 'dcyfr-agent-abc123',
    startedAt: new Date('2026-03-01T00:00:00Z'),
    config: {
      image: 'dcyfr/agent:latest',
      repo: 'dcyfr/workspace',
      taskId: 'task-1',
      taskDescription: 'test task',
      contractId: 'contract-id-1',
      dryRun: false,
    },
    backendType: 'local-docker',
    ...overrides,
  };
}

function makeExecutionResult(success = true): ContainerExecutionResult {
  return {
    success,
    exitCode: success ? 0 : 1,
    timedOut: false,
    executionTimeMs: 1234,
    pullRequestUrl: success ? 'https://github.com/dcyfr/workspace/pull/42' : undefined,
    stdout: 'done',
    stderr: '',
  };
}

function makeMockBackend(options: {
  handle?: ContainerHandle;
  exitResult?: ContainerExecutionResult;
  /** resolve immediately or hold for manual resolution */
  deferExit?: boolean;
  rejectExit?: boolean;
} = {}) {
  const handle = options.handle ?? makeHandle();
  const exitResult = options.exitResult ?? makeExecutionResult(true);

  let resolveExit!: () => void;
  const exitPromise = options.rejectExit
    ? Promise.reject(new Error('watch failed'))
    : options.deferExit
      ? new Promise<ContainerExecutionResult>((resolve) => {
          resolveExit = () => resolve(exitResult);
        })
      : Promise.resolve(exitResult);

  const backend = {
    backendType: 'local-docker' as const,
    healthCheck: vi.fn().mockResolvedValue({ available: true, backendType: 'local-docker' }),
    provision: vi.fn().mockResolvedValue(handle),
    streamLogs: vi.fn(),
    waitForExit: vi.fn().mockReturnValue(exitPromise),
    teardown: vi.fn().mockResolvedValue({ success: true, containerId: handle.containerId } as TeardownResult),
    listActive: vi.fn().mockResolvedValue([]),
  };

  return { backend, handle, resolveExit };
}

function makeMockContractManager(contractId = 'contract-id-1') {
  const contract = {
    contract_id: contractId,
    task_id: 'task-1',
    status: 'active',
    metadata: {
      execution_environment: 'container',
      container_handle: {
        containerId: 'container-abc123',
        containerName: 'dcyfr-agent-abc123',
        startedAt: new Date('2026-03-01T00:00:00Z').toISOString(),
        backendType: 'local-docker',
      },
    },
  };

  const manager = {
    createContract: vi.fn().mockResolvedValue(contract),
    updateContract: vi.fn().mockResolvedValue(undefined),
    dispatchToContainer: vi.fn(),
    getContractById: vi.fn().mockImplementation(() => contract),
  };

  return { manager, contract };
}

function makeDispatcher(
  backend: ReturnType<typeof makeMockBackend>['backend'],
  manager: ReturnType<typeof makeMockContractManager>['manager'],
  opts: { dryRun?: boolean } = {},
) {
  return new AgentContainerDispatcher({
    backend: backend as never,
    contractManager: manager as never,
    githubToken: 'test-token-xyz',
    defaultImage: 'dcyfr/agent:test',
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// dispatchFromIssue
// ---------------------------------------------------------------------------

describe('AgentContainerDispatcher.dispatchFromIssue()', () => {
  let backend: ReturnType<typeof makeMockBackend>['backend'];
  let manager: ReturnType<typeof makeMockContractManager>['manager'];
  let dispatcher: AgentContainerDispatcher;

  beforeEach(() => {
    ({ backend } = makeMockBackend());
    ({ manager } = makeMockContractManager());
    dispatcher = makeDispatcher(backend, manager);
  });

  it('provisions a container and returns a DispatchRecord', async () => {
    const issue: IssueDispatchInput = {
      issueNumber: 7,
      title: 'Fix the authentication bug',
      body: 'Users cannot log in.',
      labels: ['type:bug'],
      repo: 'dcyfr/workspace',
    };

    const record = await dispatcher.dispatchFromIssue(issue);

    expect(record.contractId).toBeDefined();
    expect(record.issueNumber).toBe(7);
    expect(record.repo).toBe('dcyfr/workspace');
    expect(backend.provision).toHaveBeenCalledOnce();
    expect(manager.createContract).toHaveBeenCalledOnce();
    expect(manager.dispatchToContainer).toHaveBeenCalledOnce();
  });

  it('emits a dispatched event', async () => {
    const issue: IssueDispatchInput = {
      issueNumber: 8,
      title: 'Add new API endpoint',
      labels: ['type:feature'],
      repo: 'dcyfr/repo',
    };

    const dispatched = vi.fn();
    dispatcher.on('dispatched', dispatched);

    await dispatcher.dispatchFromIssue(issue);

    expect(dispatched).toHaveBeenCalledOnce();
    expect(dispatched.mock.calls[0][0]).toMatchObject({ issueNumber: 8 });
  });

  it('passes issueNumber into container config', async () => {
    const issue: IssueDispatchInput = {
      issueNumber: 99,
      title: 'Some task',
      labels: [],
      repo: 'dcyfr/repo',
    };

    await dispatcher.dispatchFromIssue(issue);

    const config = (backend.provision as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(config.issueNumber).toBe(99);
    expect(config.githubToken).toBe('test-token-xyz');
  });

  it('includes the dispatch record in getActiveDispatches() immediately after dispatch', async () => {
    const { backend: deferBackend } = makeMockBackend({ deferExit: true });
    const { manager: mgr } = makeMockContractManager('c-defer');
    const deferDispatcher = makeDispatcher(deferBackend, mgr);

    const issue: IssueDispatchInput = {
      issueNumber: 1,
      title: 'Deferred task',
      labels: [],
      repo: 'dcyfr/repo',
    };

    await deferDispatcher.dispatchFromIssue(issue);
    const active = await deferDispatcher.getActiveDispatches();
    expect(active).toHaveLength(1);
  });

  it('uses issue payload backendType override when provided', async () => {
    const local = makeMockBackend();
    const remote = makeMockBackend({
      handle: makeHandle({ backendType: 'remote-docker' }),
    });
    const { manager } = makeMockContractManager();
    const dispatcher = new AgentContainerDispatcher({
      backend: local.backend as never,
      contractManager: manager as never,
      githubToken: 'test-token-xyz',
      defaultImage: 'dcyfr/agent:test',
      backendsByType: {
        'remote-docker': remote.backend as never,
      },
    });

    await dispatcher.dispatchFromIssue({
      issueNumber: 12,
      title: 'run remotely',
      labels: [],
      repo: 'dcyfr/workspace',
      backendType: 'remote-docker',
    });

    expect(remote.backend.provision).toHaveBeenCalledOnce();
    expect(local.backend.provision).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispatchFromTask
// ---------------------------------------------------------------------------

describe('AgentContainerDispatcher.dispatchFromTask()', () => {
  it('provisions a container and returns a DispatchRecord', async () => {
    const { backend } = makeMockBackend();
    const { manager } = makeMockContractManager();
    const dispatcher = makeDispatcher(backend, manager);

    const task: TaskDispatchInput = {
      taskId: '2.3.1',
      description: 'Generate tests for the auth module',
      repo: 'dcyfr/workspace',
    };

    const record = await dispatcher.dispatchFromTask(task);

    expect(record.contractId).toBeDefined();
    expect(record.taskId).toBe('2.3.1');
    expect(record.repo).toBe('dcyfr/workspace');
    expect(record.issueNumber).toBeUndefined();
    expect(backend.provision).toHaveBeenCalledOnce();
  });

  it('emits a dispatched event', async () => {
    const { backend } = makeMockBackend();
    const { manager } = makeMockContractManager();
    const dispatcher = makeDispatcher(backend, manager);
    const dispatched = vi.fn();
    dispatcher.on('dispatched', dispatched);

    await dispatcher.dispatchFromTask({ taskId: 't1', description: 'doc update', repo: 'r' });

    expect(dispatched).toHaveBeenCalledOnce();
  });

  it('uses backendType override when configured', async () => {
    const local = makeMockBackend();
    const remote = makeMockBackend({
      handle: makeHandle({ backendType: 'remote-docker' }),
    });
    const { manager } = makeMockContractManager();
    const dispatcher = new AgentContainerDispatcher({
      backend: local.backend as never,
      contractManager: manager as never,
      githubToken: 'test-token-xyz',
      defaultImage: 'dcyfr/agent:test',
      backendsByType: {
        'remote-docker': remote.backend as never,
      },
    });

    await dispatcher.dispatchFromTask(
      { taskId: 't2', description: 'run remotely', repo: 'dcyfr/workspace' },
      { backendType: 'remote-docker' },
    );

    expect(remote.backend.provision).toHaveBeenCalledOnce();
    expect(local.backend.provision).not.toHaveBeenCalled();
  });

  it('uses task payload backendType override when provided', async () => {
    const local = makeMockBackend();
    const remote = makeMockBackend({
      handle: makeHandle({ backendType: 'remote-docker' }),
    });
    const { manager } = makeMockContractManager();
    const dispatcher = new AgentContainerDispatcher({
      backend: local.backend as never,
      contractManager: manager as never,
      githubToken: 'test-token-xyz',
      defaultImage: 'dcyfr/agent:test',
      backendsByType: {
        'remote-docker': remote.backend as never,
      },
    });

    await dispatcher.dispatchFromTask({
      taskId: 't3',
      description: 'run remotely from task payload',
      repo: 'dcyfr/workspace',
      backendType: 'remote-docker',
    });

    expect(remote.backend.provision).toHaveBeenCalledOnce();
    expect(local.backend.provision).not.toHaveBeenCalled();
  });

  it('prefers explicit options backendType over payload backendType', async () => {
    const local = makeMockBackend();
    const remote = makeMockBackend({
      handle: makeHandle({ backendType: 'remote-docker' }),
    });
    const { manager } = makeMockContractManager();
    const dispatcher = new AgentContainerDispatcher({
      backend: local.backend as never,
      contractManager: manager as never,
      githubToken: 'test-token-xyz',
      defaultImage: 'dcyfr/agent:test',
      backendsByType: {
        'remote-docker': remote.backend as never,
      },
    });

    await dispatcher.dispatchFromTask(
      {
        taskId: 't4',
        description: 'prefer explicit option',
        repo: 'dcyfr/workspace',
        backendType: 'remote-docker',
      },
      { backendType: 'local-docker' },
    );

    expect(local.backend.provision).toHaveBeenCalledOnce();
    expect(remote.backend.provision).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cancel()
// ---------------------------------------------------------------------------

describe('AgentContainerDispatcher.cancel()', () => {
  it('tears down the container and emits dispatch_cancelled', async () => {
    const { backend, resolveExit } = makeMockBackend({ deferExit: true });
    const { manager, contract } = makeMockContractManager('c-cancel');
    const dispatcher = makeDispatcher(backend, manager);
    const cancelled = vi.fn();
    dispatcher.on('dispatch_cancelled', cancelled);

    const issue: IssueDispatchInput = {
      issueNumber: 5,
      title: 'Task to cancel',
      labels: [],
      repo: 'dcyfr/repo',
    };

    await dispatcher.dispatchFromIssue(issue);

    await dispatcher.cancel(contract.contract_id);

    expect(backend.teardown).toHaveBeenCalledOnce();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(cancelled.mock.calls[0][0]).toMatchObject({ contractId: contract.contract_id });

    // Dispatch should be removed from active list
    const active = await dispatcher.getActiveDispatches();
    expect(active).toHaveLength(0);

    resolveExit(); // clean up dangling promise
  });

  it('is a no-op for an unknown contractId', async () => {
    const { backend } = makeMockBackend();
    const { manager } = makeMockContractManager();
    const dispatcher = makeDispatcher(backend, manager);

    // Should not throw
    await expect(dispatcher.cancel('unknown-id')).resolves.toBeUndefined();
    expect(backend.teardown).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// watchContainer — exit reconciliation
// ---------------------------------------------------------------------------

describe('AgentContainerDispatcher watchContainer()', () => {
  it('emits dispatch_completed and removes dispatch on successful exit', async () => {
    const { backend, resolveExit } = makeMockBackend({ deferExit: true });
    const { manager } = makeMockContractManager('c-complete');
    const dispatcher = makeDispatcher(backend, manager);
    const completed = vi.fn();
    dispatcher.on('dispatch_completed', completed);

    await dispatcher.dispatchFromIssue({ issueNumber: 3, title: 'x', labels: [], repo: 'r' });

    // Still active before exit
    expect((await dispatcher.getActiveDispatches())).toHaveLength(1);

    resolveExit();
    // Flush micro-task queue
    await new Promise((r) => setTimeout(r, 10));

    expect(completed).toHaveBeenCalledOnce();
    expect(manager.updateContract).toHaveBeenCalledWith(
      expect.objectContaining({ contract_id: 'c-complete', status: 'completed' }),
    );
    expect((await dispatcher.getActiveDispatches())).toHaveLength(0);
  });

  it('emits dispatch_failed on non-zero exit', async () => {
    const { backend, resolveExit } = makeMockBackend({
      deferExit: true,
      exitResult: makeExecutionResult(false),
    });
    const { manager } = makeMockContractManager('c-fail');
    const dispatcher = makeDispatcher(backend, manager);
    const failed = vi.fn();
    dispatcher.on('dispatch_failed', failed);

    await dispatcher.dispatchFromIssue({ issueNumber: 9, title: 'x', labels: [], repo: 'r' });

    resolveExit();
    await new Promise((r) => setTimeout(r, 10));

    expect(failed).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0][0]).toMatchObject({ contractId: 'c-fail' });
    expect(manager.updateContract).toHaveBeenCalledWith(
      expect.objectContaining({ contract_id: 'c-fail', status: 'failed' }),
    );
  });

  it('marks contract failed when container watcher throws', async () => {
    const { backend } = makeMockBackend({ rejectExit: true });
    const { manager } = makeMockContractManager('c-watch-fail');
    const dispatcher = makeDispatcher(backend, manager);
    const failed = vi.fn();
    dispatcher.on('dispatch_failed', failed);

    await dispatcher.dispatchFromIssue({ issueNumber: 11, title: 'x', labels: [], repo: 'r' });
    await new Promise((r) => setTimeout(r, 10));

    expect(failed).toHaveBeenCalledOnce();
    expect(manager.updateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        contract_id: 'c-watch-fail',
        status: 'failed',
        metadata: expect.objectContaining({ container_watch_error: true }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Capability & resource tier detection (tested via dispatchFromIssue)
// ---------------------------------------------------------------------------

describe('AgentContainerDispatcher capability detection', () => {
  async function detectCapabilityFor(issue: Partial<IssueDispatchInput>) {
    const { backend } = makeMockBackend();
    const { manager } = makeMockContractManager();
    const dispatcher = makeDispatcher(backend, manager);

    const fullIssue: IssueDispatchInput = {
      issueNumber: 1,
      title: issue.title ?? '',
      body: issue.body,
      labels: issue.labels ?? [],
      repo: 'r',
    };

    await dispatcher.dispatchFromIssue(fullIssue);

    // The delegatee is selected based on capability; inspect what was used
    const contractCall = (manager.createContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    return contractCall.delegatee.agent_id as string;
  }

  it('maps type:bug label to security-engineer', async () => {
    const agentId = await detectCapabilityFor({ labels: ['type:bug'] });
    expect(agentId).toBe('security-engineer');
  });

  it('maps type:feature label to fullstack-developer', async () => {
    const agentId = await detectCapabilityFor({ labels: ['type:feature'] });
    expect(agentId).toBe('fullstack-developer');
  });

  it('maps type:test label to test-engineer', async () => {
    const agentId = await detectCapabilityFor({ labels: ['type:test'] });
    expect(agentId).toBe('test-engineer');
  });

  it('falls back to keyword detection when no matching label', async () => {
    const agentId = await detectCapabilityFor({ title: 'generate unit tests for auth', labels: [] });
    expect(agentId).toBe('test-engineer');
  });

  it('defaults to fullstack-developer for unrecognised text', async () => {
    const agentId = await detectCapabilityFor({ title: 'update the README', labels: [] });
    expect(agentId).toBe('fullstack-developer');
  });
});

describe('AgentContainerDispatcher resource tier estimation', () => {
  async function tierFor(title: string): Promise<string> {
    const { backend } = makeMockBackend();
    const { manager } = makeMockContractManager();
    const dispatcher = makeDispatcher(backend, manager);

    await dispatcher.dispatchFromIssue({ issueNumber: 1, title, labels: [], repo: 'r' });

    const config = (backend.provision as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const mem: string = config.resourceLimits.maxMemory;
    if (mem === '512m') return 'small';
    if (mem === '2g') return 'medium';
    if (mem === '4g') return 'large';
    return 'unknown';
  }

  it('uses small tier by default', async () => {
    expect(await tierFor('Fix typo')).toBe('small');
  });

  it('uses medium tier for multi-file keywords', async () => {
    expect(await tierFor('Update multiple files in the auth system')).toBe('medium');
  });

  it('uses large tier for complex refactoring', async () => {
    expect(await tierFor('Complex refactor all authentication flows')).toBe('large');
  });
});
