/**
 * ralph-loop-retry.test.ts
 *
 * End-to-end tests for DelegationManager.runWithRetry() — Ralph Loop V2.
 *
 * node:fs/promises and fetch are fully mocked so no I/O or network calls
 * are made during the test run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DelegationManager, FailureCategory } from '../delegation-manager.js';
import type { ContractResult, RetryOptions } from '../delegation-manager.js';
import type { DCYFRMemory } from '../../memory/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────────────────────────────────────

const { mockAppendFile, mockMkdir } = vi.hoisted(() => ({
  mockAppendFile: vi.fn().mockResolvedValue(undefined),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises', () => ({
  appendFile: mockAppendFile,
  mkdir: mockMkdir,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMemory(): DCYFRMemory {
  return {
    searchAgentMemories: vi.fn().mockResolvedValue([]),
    addUserMemory: vi.fn(),
    searchUserMemories: vi.fn().mockResolvedValue([]),
    getUserMemories: vi.fn().mockResolvedValue([]),
    addAgentMemory: vi.fn(),
    getAgentState: vi.fn().mockResolvedValue(null),
    addSessionMemory: vi.fn(),
    getSessionContext: vi.fn().mockResolvedValue(''),
    deleteUserMemories: vi.fn(),
    deleteSessionMemories: vi.fn(),
  } as unknown as DCYFRMemory;
}

function makeContract(id = 'contract-test'): ContractResult['contract'] {
  return {
    contract_id: id,
    task: { type: 'code_generation', description: 'test' },
    delegator: 'delegator-agent',
    delegatee: 'coder-agent',
    created_at: new Date().toISOString(),
    status: 'failed',
    execution_mode: 'interactive',
  } as unknown as ContractResult['contract'];
}

function makeResult(overrides: Partial<ContractResult> = {}): ContractResult {
  return {
    contract: makeContract(),
    logs: '',
    error_output: 'Cannot find name',
    commit_count: 0,
    elapsed_ms: 3 * 60 * 60 * 1000,
    ...overrides,
  };
}

/** Returns a RetryOptions with executeAttempt controlled per-test */
function makeRetryOptions(
  overrides: Partial<RetryOptions> & { executeAttempt: RetryOptions['executeAttempt'] },
): RetryOptions {
  return {
    initialPrompt: 'Implement the auth module.',
    taskId: 'task-auth',
    memory: makeMemory(),
    isSuccess: () => false, // override per-test
    logPath: null,          // disable file I/O by default
    ...overrides,
  };
}

// Minimal fetch mock — returns the mock fn for assertions
function mockFetchSuccess(): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function mockFetchError(status = 400): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Bad Request',
    text: async () => 'Bad Request',
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function mockFetchThrow(): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockRejectedValue(new Error('Network error'));
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: basic retry flow
// ─────────────────────────────────────────────────────────────────────────────

describe('runWithRetry — success cases', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });
  afterEach(() => { vi.unstubAllGlobals(); mockAppendFile.mockClear(); mockMkdir.mockClear(); });

  it('returns success on first attempt without retrying', async () => {
    const successResult = makeResult({ error_output: undefined, commit_count: 1 });
    const executeAttempt = vi.fn().mockResolvedValue(successResult);
    const result = await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: r => (r.commit_count ?? 0) > 0,
    }));

    expect(result.success).toBe(true);
    expect(result.totalAttempts).toBe(1);
    expect(result.escalated).toBe(false);
    expect(executeAttempt).toHaveBeenCalledOnce();
    expect(executeAttempt).toHaveBeenCalledWith('Implement the auth module.', 1);
  });

  it('returns success on second attempt', async () => {
    // Use a real failure signal (context_overflow) so the prompt is actually rewritten
    const failResult = makeResult({ logs: 'token limit exceeded', commit_count: 0, error_output: undefined });
    const successResult = makeResult({ error_output: undefined, commit_count: 1 });
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce(failResult)
      .mockResolvedValueOnce(successResult);

    const result = await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: r => (r.commit_count ?? 0) > 0,
    }));

    expect(result.success).toBe(true);
    expect(result.totalAttempts).toBe(2);
    expect(result.attempts).toHaveLength(2);
    // Second attempt should use a rewritten prompt
    expect(executeAttempt.mock.calls[1][0]).not.toBe('Implement the auth module.');
    expect(result.attempts[0].rewrite).toBeDefined();
  });

  it('passes attempt number to executeAttempt correctly', async () => {
    const fail = makeResult();
    const success = makeResult({ commit_count: 1, error_output: undefined });
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(success);

    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: r => (r.commit_count ?? 0) > 0,
    }));

    expect(executeAttempt.mock.calls[0][1]).toBe(1);
    expect(executeAttempt.mock.calls[1][1]).toBe(2);
  });

  it('no analysis on successful first attempt', async () => {
    const ok = makeResult({ commit_count: 1, error_output: undefined });
    const result = await dm.runWithRetry(makeRetryOptions({
      executeAttempt: vi.fn().mockResolvedValue(ok),
      isSuccess: () => true,
    }));

    expect(result.attempts[0].analysis).toBeUndefined();
    expect(result.attempts[0].rewrite).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: all attempts fail
// ─────────────────────────────────────────────────────────────────────────────

describe('runWithRetry — all attempts fail', () => {
  let dm: DelegationManager;
  beforeEach(() => {
    dm = new DelegationManager();
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_CHAT_ID'];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockAppendFile.mockClear();
    mockMkdir.mockClear();
  });

  it('runs exactly maxRetries attempts', async () => {
    const fail = makeResult();
    const executeAttempt = vi.fn().mockResolvedValue(fail);

    const result = await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      maxRetries: 3,
    }));

    expect(result.success).toBe(false);
    expect(result.totalAttempts).toBe(3);
    expect(executeAttempt).toHaveBeenCalledTimes(3);
  });

  it('respects custom maxRetries: 2', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    const result = await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      maxRetries: 2,
    }));

    expect(result.totalAttempts).toBe(2);
    expect(executeAttempt).toHaveBeenCalledTimes(2);
  });

  it('includes analysis on all failed attempts', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(makeResult({ error_output: 'Cannot find name' }));
    const result = await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));

    for (const a of result.attempts) {
      expect(a.analysis).toBeDefined();
    }
  });

  it('has rewrite on all attempts except the last', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    const result = await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));

    const n = result.attempts.length;
    for (let i = 0; i < n - 1; i++) {
      expect(result.attempts[i].rewrite).toBeDefined();
    }
    // Last attempt has no rewrite (nothing to retry into)
    expect(result.attempts[n - 1].rewrite).toBeUndefined();
  });

  it('escalated=false when Telegram env vars are absent', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    const result = await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));
    expect(result.escalated).toBe(false);
  });

  it('escalated=true when Telegram is configured and returns 200', async () => {
    process.env['TELEGRAM_BOT_TOKEN'] = 'test-bot-token';
    process.env['TELEGRAM_CHAT_ID'] = 'chat-123';
    mockFetchSuccess();

    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    const result = await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));

    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_CHAT_ID'];

    expect(result.escalated).toBe(true);
  });

  it('returns finalResult = last attempt result', async () => {
    const fail1 = makeResult({ logs: 'attempt-1' });
    const fail2 = makeResult({ logs: 'attempt-2' });
    const fail3 = makeResult({ logs: 'attempt-3' });
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce(fail1)
      .mockResolvedValueOnce(fail2)
      .mockResolvedValueOnce(fail3);

    const result = await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));
    expect(result.finalResult.logs).toBe('attempt-3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Telegram escalation
// ─────────────────────────────────────────────────────────────────────────────

describe('runWithRetry — Telegram escalation', () => {
  let dm: DelegationManager;
  beforeEach(() => {
    dm = new DelegationManager();
    process.env['TELEGRAM_BOT_TOKEN'] = 'bot-abc';
    process.env['TELEGRAM_CHAT_ID'] = 'chat-xyz';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_CHAT_ID'];
  });

  it('calls Telegram API with correct URL', async () => {
    const mockFetch = mockFetchSuccess();
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('bot-abc/sendMessage');
    expect(url).toContain('api.telegram.org');
  });

  it('includes task id and failure category in the message body', async () => {
    const mockFetch = mockFetchSuccess();
    const executeAttempt = vi.fn().mockResolvedValue(
      makeResult({ error_output: 'Cannot find name Foo' }),
    );
    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      taskId: 'task-billing',
    }));

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string) as Record<string, unknown>;
    expect(body['chat_id']).toBe('chat-xyz');
    expect(String(body['text'])).toContain('task-billing');
    expect(String(body['text'])).toContain('missing_requirements');
  });

  it('escalated=false when Telegram returns non-200', async () => {
    mockFetchError(401);
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    const result = await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));
    expect(result.escalated).toBe(false);
  });

  it('escalated=false and no throw when fetch rejects', async () => {
    mockFetchThrow();
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    const result = await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false }));
    expect(result.escalated).toBe(false);
    expect(result.success).toBe(false);
  });

  it('only calls Telegram once on the final failure', async () => {
    const mockFetch = mockFetchSuccess();
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    await dm.runWithRetry(makeRetryOptions({ executeAttempt, isSuccess: () => false, maxRetries: 3 }));

    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: JSONL logging
// ─────────────────────────────────────────────────────────────────────────────

describe('runWithRetry — JSONL rewrite log', () => {
  let dm: DelegationManager;
  beforeEach(() => {
    dm = new DelegationManager();
    mockAppendFile.mockClear();
    mockMkdir.mockClear();
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_CHAT_ID'];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('writes one log entry per failed+rewritten attempt', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      maxRetries: 3,
      logPath: '/tmp/test-rewrite-history.jsonl',
    }));

    // 3 attempts: 2 are retried (attempts 1 and 2), attempt 3 has no next retry
    // appendFile is called for attempt 1 and attempt 2 (before attempt 3)
    expect(mockAppendFile).toHaveBeenCalledTimes(2);
  });

  it('does not write log when logPath is null', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      logPath: null,
    }));

    expect(mockAppendFile).not.toHaveBeenCalled();
  });

  it('writes valid JSONL (each line is parseable JSON)', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(
      makeResult({ error_output: 'Cannot find name Foo', logs: 'build log' }),
    );
    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      maxRetries: 2,
      logPath: '/tmp/test-rewrite-history.jsonl',
    }));

    expect(mockAppendFile).toHaveBeenCalledOnce();
    const written = mockAppendFile.mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim()) as Record<string, unknown>;

    expect(entry['timestamp']).toBeDefined();
    expect(entry['taskId']).toBe('task-auth');
    expect(entry['attempt']).toBe(1);
    expect(entry['failureCategory']).toBe(FailureCategory.MISSING_REQUIREMENTS);
    expect(entry['confidence']).toBeGreaterThan(0);
    expect(Array.isArray(entry['signals'])).toBe(true);
    expect(typeof entry['promptBeforeLength']).toBe('number');
    expect(typeof entry['promptAfterLength']).toBe('number');
  });

  it('creates parent directory before writing', async () => {
    const executeAttempt = vi.fn().mockResolvedValue(makeResult());
    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      maxRetries: 2,
      logPath: '/tmp/some/deep/path.jsonl',
    }));

    expect(mockMkdir).toHaveBeenCalledWith('/tmp/some/deep', { recursive: true });
  });

  it('continues retry loop even if appendFile throws', async () => {
    mockAppendFile.mockRejectedValueOnce(new Error('disk full'));
    const fail = makeResult();
    const success = makeResult({ commit_count: 1, error_output: undefined });
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(success);

    const result = await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: r => (r.commit_count ?? 0) > 0,
      logPath: '/tmp/test.jsonl',
    }));

    // Should still succeed despite logging error
    expect(result.success).toBe(true);
    expect(result.totalAttempts).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: prompt rewriting integration in retry
// ─────────────────────────────────────────────────────────────────────────────

describe('runWithRetry — prompt rewriting integration', () => {
  let dm: DelegationManager;
  beforeEach(() => {
    dm = new DelegationManager();
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_CHAT_ID'];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('second attempt uses a different (rewritten) prompt', async () => {
    const fail = makeResult({ logs: 'token limit exceeded' });
    const success = makeResult({ commit_count: 1, error_output: undefined });
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(success);

    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: r => (r.commit_count ?? 0) > 0,
    }));

    const firstPrompt: string = executeAttempt.mock.calls[0][0];
    const secondPrompt: string = executeAttempt.mock.calls[1][0];
    expect(secondPrompt).not.toBe(firstPrompt);
    expect(secondPrompt).toContain('SCOPE RESTRICTION'); // context_overflow strategy
  });

  it('forwards taskScopePaths to the rewrite task', async () => {
    const fail = makeResult({ logs: 'wrong direction', changed_files: ['src/other/file.ts'] });
    const fail2 = makeResult();
    const fail3 = makeResult();
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(fail2)
      .mockResolvedValueOnce(fail3);

    await dm.runWithRetry(makeRetryOptions({
      executeAttempt,
      isSuccess: () => false,
      taskScopePaths: ['src/auth'],
    }));

    // Scope paths should appear in the second attempt's prompt (wrong_direction or context_overflow)
    const secondPrompt: string = executeAttempt.mock.calls[1][0];
    expect(secondPrompt.length).toBeGreaterThan('Implement the auth module.'.length);
  });

  it('uses agentId as memory namespace', async () => {
    const memory = makeMemory();
    const fail = makeResult({ logs: 'token limit exceeded' });
    const success = makeResult({ commit_count: 1, error_output: undefined });
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(success);

    await dm.runWithRetry({
      initialPrompt: 'Build feature.',
      taskId: 'task-123',
      agentId: 'my-special-agent',
      memory,
      executeAttempt,
      isSuccess: r => (r.commit_count ?? 0) > 0,
      logPath: null,
    });

    // The memory search should use agentId, not taskId
    expect(memory.searchAgentMemories).toHaveBeenCalledWith(
      'my-special-agent',
      expect.any(String),
      3,
    );
  });
});
