/**
 * prompt-rewriting.test.ts
 *
 * Tests for DelegationManager.rewritePrompt() — Ralph Loop V2 prompt rewriting.
 *
 * DCYFRMemory is fully mocked so no network/mem0 calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationManager, FailureCategory } from '../delegation-manager.js';
import type { RewriteTask } from '../delegation-manager.js';
import type { DCYFRMemory, MemorySearchResult } from '../../memory/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMemory(searchResults: MemorySearchResult[] = []): DCYFRMemory {
  return {
    searchAgentMemories: vi.fn().mockResolvedValue(searchResults),
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

function makeSearchResult(content: string, relevance = 0.9): MemorySearchResult {
  return {
    id: crypto.randomUUID(),
    content,
    owner: 'test-agent',
    ownerType: 'agent',
    relevance,
    createdAt: new Date(),
  };
}

function makeTask(overrides: Partial<RewriteTask> = {}): RewriteTask {
  return {
    originalPrompt: 'Implement the auth module.',
    taskId: 'task-auth',
    agentId: 'agent-coder',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// context_overflow strategy
// ─────────────────────────────────────────────────────────────────────────────

describe('rewritePrompt — context_overflow', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('prefixes prompt with scope restriction header', async () => {
    const memory = makeMemory([makeSearchResult('src/auth/login.ts')]);
    const task = makeTask();
    const result = await dm.rewritePrompt(task, FailureCategory.CONTEXT_OVERFLOW, memory);

    expect(result.strategy).toBe(FailureCategory.CONTEXT_OVERFLOW);
    expect(result.rewrittenPrompt).toContain('SCOPE RESTRICTION');
    expect(result.rewrittenPrompt).toContain('src/auth/login.ts');
    expect(result.rewrittenPrompt).toContain(task.originalPrompt);
  });

  it('calls searchAgentMemories with agentId when provided', async () => {
    const memory = makeMemory();
    const task = makeTask({ agentId: 'my-agent' });
    await dm.rewritePrompt(task, FailureCategory.CONTEXT_OVERFLOW, memory);

    expect(memory.searchAgentMemories).toHaveBeenCalledWith(
      'my-agent',
      expect.stringContaining('task-auth'),
      3,
    );
  });

  it('falls back to taskId when agentId is absent', async () => {
    const memory = makeMemory();
    const task = makeTask({ agentId: undefined });
    await dm.rewritePrompt(task, FailureCategory.CONTEXT_OVERFLOW, memory);

    expect(memory.searchAgentMemories).toHaveBeenCalledWith(
      'task-auth',
      expect.any(String),
      3,
    );
  });

  it('merges memory files with in-scope changed files (deduplicates, max 3)', async () => {
    const memory = makeMemory([
      makeSearchResult('src/auth/token.ts'),
      makeSearchResult('src/auth/login.ts'),
    ]);
    const task = makeTask({
      changedFiles: ['src/auth/login.ts', 'src/auth/logout.ts'],
      taskScopePaths: ['src/auth'],
    });
    const result = await dm.rewritePrompt(task, FailureCategory.CONTEXT_OVERFLOW, memory);

    // login.ts appears in both sources — should not be duplicated
    const occurrences = (result.rewrittenPrompt.match(/login\.ts/g) ?? []).length;
    expect(occurrences).toBe(1);
    // Capped at 3 files
    const fileLines = result.rewrittenPrompt.match(/^- /gm) ?? [];
    expect(fileLines.length).toBeLessThanOrEqual(3);
  });

  it('adds minimal scope header when no files found in memory or scope', async () => {
    const memory = makeMemory([]); // no results
    const task = makeTask({ changedFiles: [], taskScopePaths: [] });
    const result = await dm.rewritePrompt(task, FailureCategory.CONTEXT_OVERFLOW, memory);

    expect(result.rewrittenPrompt).toContain('minimal change needed');
    expect(result.appliedContext.some(s => s.includes('scope header only'))).toBe(true);
  });

  it('records applied context entries', async () => {
    const memory = makeMemory([makeSearchResult('src/auth/login.ts')]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.CONTEXT_OVERFLOW, memory);
    expect(result.appliedContext.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// wrong_direction strategy
// ─────────────────────────────────────────────────────────────────────────────

describe('rewritePrompt — wrong_direction', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('prepends alignment context with customer quotes from memory', async () => {
    const memory = makeMemory([
      makeSearchResult('Users must log in with email + password only.', 0.95),
    ]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.WRONG_DIRECTION, memory);

    expect(result.strategy).toBe(FailureCategory.WRONG_DIRECTION);
    expect(result.rewrittenPrompt).toContain('ALIGNMENT CONTEXT');
    expect(result.rewrittenPrompt).toContain('Users must log in with email + password only.');
  });

  it('includes Requirement N labels for each quote', async () => {
    const memory = makeMemory([
      makeSearchResult('Req A'),
      makeSearchResult('Req B'),
    ]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.WRONG_DIRECTION, memory);

    expect(result.rewrittenPrompt).toContain('[Requirement 1]');
    expect(result.rewrittenPrompt).toContain('[Requirement 2]');
  });

  it('includes scope paths in the rewritten prompt when provided', async () => {
    const memory = makeMemory([makeSearchResult('Some requirement')]);
    const task = makeTask({ taskScopePaths: ['src/auth', 'src/user'] });
    const result = await dm.rewritePrompt(task, FailureCategory.WRONG_DIRECTION, memory);

    expect(result.rewrittenPrompt).toContain('src/auth');
    expect(result.rewrittenPrompt).toContain('src/user');
  });

  it('adds scope reminder header when no memory quotes found', async () => {
    const memory = makeMemory([]);
    const task = makeTask({ taskScopePaths: ['src/auth'] });
    const result = await dm.rewritePrompt(task, FailureCategory.WRONG_DIRECTION, memory);

    expect(result.rewrittenPrompt).toContain('SCOPE REMINDER');
    expect(result.rewrittenPrompt).toContain('src/auth');
    expect(result.appliedContext.some(s => s.includes('no memory quotes'))).toBe(true);
  });

  it('logs relevance scores in appliedContext', async () => {
    const memory = makeMemory([makeSearchResult('Quote', 0.88)]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.WRONG_DIRECTION, memory);
    expect(result.appliedContext.some(s => s.includes('0.88'))).toBe(true);
  });

  it('preserves original prompt at the end', async () => {
    const memory = makeMemory([makeSearchResult('Req A')]);
    const task = makeTask({ originalPrompt: 'Implement auth module.' });
    const result = await dm.rewritePrompt(task, FailureCategory.WRONG_DIRECTION, memory);
    expect(result.rewrittenPrompt).toContain('Implement auth module.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// missing_requirements strategy
// ─────────────────────────────────────────────────────────────────────────────

describe('rewritePrompt — missing_requirements', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('appends type definitions from memory after the original prompt', async () => {
    const memory = makeMemory([makeSearchResult('export interface UserService { login(): void }')]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.MISSING_REQUIREMENTS, memory);

    expect(result.strategy).toBe(FailureCategory.MISSING_REQUIREMENTS);
    expect(result.rewrittenPrompt).toContain('REQUIRED TYPE DEFINITIONS');
    expect(result.rewrittenPrompt).toContain('export interface UserService');
    // Type defs come AFTER the original prompt
    const origIdx = result.rewrittenPrompt.indexOf('Implement the auth module.');
    const typeIdx = result.rewrittenPrompt.indexOf('REQUIRED TYPE DEFINITIONS');
    expect(typeIdx).toBeGreaterThan(origIdx);
  });

  it('labels each type definition block', async () => {
    const memory = makeMemory([
      makeSearchResult('interface A {}'),
      makeSearchResult('interface B {}'),
    ]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.MISSING_REQUIREMENTS, memory);
    expect(result.rewrittenPrompt).toContain('// Type Definition 1');
    expect(result.rewrittenPrompt).toContain('// Type Definition 2');
  });

  it('wraps type defs in typescript code block', async () => {
    const memory = makeMemory([makeSearchResult('type Foo = string;')]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.MISSING_REQUIREMENTS, memory);
    expect(result.rewrittenPrompt).toContain('```typescript');
  });

  it('adds tsc reminder when no type defs found in memory', async () => {
    const memory = makeMemory([]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.MISSING_REQUIREMENTS, memory);
    expect(result.rewrittenPrompt).toContain('tsc --noEmit');
    expect(result.appliedContext.some(s => s.includes('tsc reminder'))).toBe(true);
  });

  it('logs relevance score in appliedContext', async () => {
    const memory = makeMemory([makeSearchResult('type X = number;', 0.77)]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.MISSING_REQUIREMENTS, memory);
    expect(result.appliedContext.some(s => s.includes('0.77'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stuck_on_complexity strategy
// ─────────────────────────────────────────────────────────────────────────────

describe('rewritePrompt — stuck_on_complexity', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('decomposes task into sub-tasks from memory', async () => {
    const memory = makeMemory([
      makeSearchResult('Create service skeleton with types'),
      makeSearchResult('Implement business logic + tests'),
    ]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.STUCK_ON_COMPLEXITY, memory);

    expect(result.strategy).toBe(FailureCategory.STUCK_ON_COMPLEXITY);
    expect(result.rewrittenPrompt).toContain('TASK DECOMPOSITION');
    expect(result.rewrittenPrompt).toContain('Sub-task 1');
    expect(result.rewrittenPrompt).toContain('Create service skeleton');
  });

  it('falls back to heuristic 3-phase decomposition when no memory patterns', async () => {
    const memory = makeMemory([]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.STUCK_ON_COMPLEXITY, memory);

    expect(result.rewrittenPrompt).toContain('Sub-task 1');
    expect(result.rewrittenPrompt).toContain('Sub-task 2');
    expect(result.rewrittenPrompt).toContain('Sub-task 3');
    expect(result.appliedContext.some(s => s.includes('heuristic'))).toBe(true);
  });

  it('includes original prompt at the end as reference', async () => {
    const memory = makeMemory([]);
    const task = makeTask({ originalPrompt: 'Refactor the billing service.' });
    const result = await dm.rewritePrompt(task, FailureCategory.STUCK_ON_COMPLEXITY, memory);
    expect(result.rewrittenPrompt).toContain('Refactor the billing service.');
  });

  it('instructs agent to commit after each sub-task', async () => {
    const memory = makeMemory([]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.STUCK_ON_COMPLEXITY, memory);
    expect(result.rewrittenPrompt).toContain('commit after each');
  });

  it('records decomposition source in appliedContext', async () => {
    const memory = makeMemory([makeSearchResult('Phase A')]);
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.STUCK_ON_COMPLEXITY, memory);
    expect(result.appliedContext.some(s => s.includes('memory-sourced'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// unknown strategy
// ─────────────────────────────────────────────────────────────────────────────

describe('rewritePrompt — unknown', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('returns original prompt unchanged', async () => {
    const memory = makeMemory();
    const task = makeTask({ originalPrompt: 'Do something.' });
    const result = await dm.rewritePrompt(task, FailureCategory.UNKNOWN, memory);

    expect(result.strategy).toBe(FailureCategory.UNKNOWN);
    expect(result.rewrittenPrompt).toBe('Do something.');
  });

  it('does not call searchAgentMemories', async () => {
    const memory = makeMemory();
    await dm.rewritePrompt(makeTask(), FailureCategory.UNKNOWN, memory);
    expect(memory.searchAgentMemories).not.toHaveBeenCalled();
  });

  it('explains why no rewrite was performed', async () => {
    const memory = makeMemory();
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.UNKNOWN, memory);
    expect(result.appliedContext[0]).toContain('unknown category');
  });
});
