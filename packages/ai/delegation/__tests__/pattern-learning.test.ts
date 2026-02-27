/**
 * Pattern learning and storage tests — Task 3.4
 *
 * Validates:
 *  - learnPattern():               stores correct structure and returns a memory ID
 *  - queryHighConfidencePattern():  returns null when no patterns exist, null when
 *                                   successCount < 5, returns highest-count pattern
 *                                   when successCount >= 5, handles metadata.state
 *                                   and JSON-fallback paths
 *  - rewritePrompt() integration:   shortcuts to learned pattern when high-confidence
 *                                   pattern is found, falls through to strategy when not
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DelegationManager,
  FailureCategory,
  type RewriteTask,
  type PromptPattern,
  type PatternLearningOptions,
} from '../delegation-manager.js';
import type { DCYFRMemory, MemorySearchResult } from '../../memory/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal passing DCYFRMemory stub */
function makeMemory(overrides: Partial<DCYFRMemory> = {}): DCYFRMemory {
  return {
    addAgentMemory: vi.fn().mockResolvedValue('mem-id-1'),
    searchAgentMemories: vi.fn().mockResolvedValue([]),
    getAgentHistory: vi.fn().mockResolvedValue([]),
    clearAgentMemory: vi.fn().mockResolvedValue(undefined),
    searchMemories: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as DCYFRMemory;
}

/** Build a minimal RewriteTask */
function makeTask(overrides: Partial<RewriteTask> = {}): RewriteTask {
  return {
    originalPrompt: 'Implement the authentication module',
    taskId: 'task-auth-001',
    agentId: 'code-agent',
    ...overrides,
  };
}

/** Build a MemorySearchResult that carries structured pattern data in metadata.state */
function makePatternResult(pattern: Partial<PromptPattern>): MemorySearchResult {
  return {
    id: 'mem-result-1',
    content: 'Agent state: {}',
    metadata: { state: pattern },
    score: 0.9,
  } as unknown as MemorySearchResult;
}

/** Build a MemorySearchResult with JSON in content (fallback path) */
function makeJsonPatternResult(pattern: Partial<PromptPattern>): MemorySearchResult {
  return {
    id: 'mem-result-json',
    content: JSON.stringify(pattern),
    metadata: {},
    score: 0.85,
  } as unknown as MemorySearchResult;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DelegationManager — pattern learning (task 3.4)', () => {
  let dm: DelegationManager;

  beforeEach(() => {
    dm = new DelegationManager();
  });

  // ─── learnPattern() ──────────────────────────────────────────────────────

  describe('learnPattern()', () => {
    it('calls addAgentMemory with PATTERN_NAMESPACE as agentId', async () => {
      const memory = makeMemory();

      await dm.learnPattern(
        {
          agentId: 'code-agent',
          taskId: 'task-1',
          capability: 'code_generation',
          failureCategory: FailureCategory.CONTEXT_OVERFLOW,
          contextType: 'scope_restriction',
          successCount: 1,
        },
        memory,
      );

      expect(memory.addAgentMemory).toHaveBeenCalledOnce();
      const [namespace] = (memory.addAgentMemory as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(namespace).toBe('ralph-loop-v2-patterns');
    });

    it('stores capability, failureCategory, contextType, successCount, lastSuccessAt', async () => {
      const memory = makeMemory();
      const before = new Date();

      await dm.learnPattern(
        {
          agentId: 'code-agent',
          taskId: 'task-1',
          capability: 'code_generation',
          failureCategory: FailureCategory.CONTEXT_OVERFLOW,
          contextType: 'scope_restriction',
          successCount: 3,
          effectiveRewrite: 'Limit scope to src/auth/',
        },
        memory,
      );

      const [, , pattern] = (memory.addAgentMemory as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(pattern.capability).toBe('code_generation');
      expect(pattern.failureCategory).toBe(FailureCategory.CONTEXT_OVERFLOW);
      expect(pattern.contextType).toBe('scope_restriction');
      expect(pattern.successCount).toBe(3);
      expect(pattern.effectiveRewrite).toBe('Limit scope to src/auth/');
      expect(new Date(pattern.lastSuccessAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('returns the memory ID from addAgentMemory', async () => {
      const memory = makeMemory({ addAgentMemory: vi.fn().mockResolvedValue('pattern-mem-42') });
      const id = await dm.learnPattern(
        {
          agentId: 'agent-x',
          taskId: 't1',
          capability: 'api_development',
          failureCategory: FailureCategory.WRONG_DIRECTION,
          contextType: 'prior_feedback',
          successCount: 1,
        },
        memory,
      );
      expect(id).toBe('pattern-mem-42');
    });

    it('works without optional effectiveRewrite', async () => {
      const memory = makeMemory();
      await expect(
        dm.learnPattern(
          {
            agentId: 'agent',
            taskId: 't',
            capability: 'code_review',
            failureCategory: FailureCategory.MISSING_REQUIREMENTS,
            contextType: 'checklist',
            successCount: 2,
          },
          memory,
        ),
      ).resolves.not.toThrow();

      const [, , pattern] = (memory.addAgentMemory as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(pattern.effectiveRewrite).toBeUndefined();
    });
  });

  // ─── queryHighConfidencePattern() ─────────────────────────────────────────

  describe('queryHighConfidencePattern()', () => {
    it('returns null when searchAgentMemories returns empty array', async () => {
      const memory = makeMemory({ searchAgentMemories: vi.fn().mockResolvedValue([]) });
      const result = await dm.queryHighConfidencePattern(
        'agent-1',
        FailureCategory.CONTEXT_OVERFLOW,
        memory,
      );
      expect(result).toBeNull();
    });

    it('returns null when all patterns have successCount < HIGH_CONFIDENCE_MIN (5)', async () => {
      const lowPattern: Partial<PromptPattern> = {
        capability: 'code_generation',
        failureCategory: FailureCategory.CONTEXT_OVERFLOW,
        contextType: 'scope_restriction',
        successCount: 4,
        lastSuccessAt: new Date().toISOString(),
      };
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockResolvedValue([makePatternResult(lowPattern)]),
      });

      const result = await dm.queryHighConfidencePattern(
        'agent-1',
        FailureCategory.CONTEXT_OVERFLOW,
        memory,
      );
      expect(result).toBeNull();
    });

    it('returns a high-confidence pattern when successCount >= 5 (metadata.state path)', async () => {
      const goodPattern: Partial<PromptPattern> = {
        capability: 'code_generation',
        failureCategory: FailureCategory.CONTEXT_OVERFLOW,
        contextType: 'scope_restriction',
        successCount: 7,
        lastSuccessAt: '2026-03-01T00:00:00.000Z',
      };
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockResolvedValue([makePatternResult(goodPattern)]),
      });

      const result = await dm.queryHighConfidencePattern(
        'agent-1',
        FailureCategory.CONTEXT_OVERFLOW,
        memory,
      );
      expect(result).not.toBeNull();
      expect(result!.successCount).toBe(7);
      expect(result!.failureCategory).toBe(FailureCategory.CONTEXT_OVERFLOW);
    });

    it('returns the pattern with the highest successCount when multiple qualify', async () => {
      const category = FailureCategory.WRONG_DIRECTION;
      const p1: Partial<PromptPattern> = {
        capability: 'api_development',
        failureCategory: category,
        contextType: 'prior_feedback',
        successCount: 6,
        lastSuccessAt: '2026-02-01T00:00:00.000Z',
      };
      const p2: Partial<PromptPattern> = {
        capability: 'api_development',
        failureCategory: category,
        contextType: 'prior_feedback',
        successCount: 12,
        lastSuccessAt: '2026-03-01T00:00:00.000Z',
      };
      const p3: Partial<PromptPattern> = {
        capability: 'api_development',
        failureCategory: category,
        contextType: 'full_context',
        successCount: 9,
        lastSuccessAt: '2026-02-15T00:00:00.000Z',
      };
      const memory = makeMemory({
        searchAgentMemories: vi
          .fn()
          .mockResolvedValue([
            makePatternResult(p1),
            makePatternResult(p2),
            makePatternResult(p3),
          ]),
      });

      const result = await dm.queryHighConfidencePattern('agent', category, memory);
      expect(result!.successCount).toBe(12);
    });

    it('filters out patterns whose failureCategory does not match', async () => {
      const wrongCategory: Partial<PromptPattern> = {
        capability: 'code_generation',
        failureCategory: FailureCategory.WRONG_DIRECTION, // ← different
        contextType: 'prior_feedback',
        successCount: 10,
        lastSuccessAt: new Date().toISOString(),
      };
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockResolvedValue([makePatternResult(wrongCategory)]),
      });

      const result = await dm.queryHighConfidencePattern(
        'agent',
        FailureCategory.CONTEXT_OVERFLOW, // ← ask for this
        memory,
      );
      expect(result).toBeNull();
    });

    it('falls back to JSON.parse on content when metadata.state is absent', async () => {
      const category = FailureCategory.MISSING_REQUIREMENTS;
      const jsonPattern: Partial<PromptPattern> = {
        capability: 'test_generation',
        failureCategory: category,
        contextType: 'checklist',
        successCount: 5,
        lastSuccessAt: new Date().toISOString(),
      };
      const memory = makeMemory({
        searchAgentMemories: vi
          .fn()
          .mockResolvedValue([makeJsonPatternResult(jsonPattern)]),
      });

      const result = await dm.queryHighConfidencePattern('agent', category, memory);
      expect(result).not.toBeNull();
      expect(result!.successCount).toBe(5);
    });

    it('returns null (does not throw) when memory search rejects', async () => {
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockRejectedValue(new Error('network error')),
      });

      const result = await dm.queryHighConfidencePattern(
        'agent',
        FailureCategory.CONTEXT_OVERFLOW,
        memory,
      );
      expect(result).toBeNull();
    });
  });

  // ─── rewritePrompt() integration ─────────────────────────────────────────

  describe('rewritePrompt() — pattern shortcut integration', () => {
    it('uses the high-confidence pattern when one is found (with effectiveRewrite)', async () => {
      const category = FailureCategory.CONTEXT_OVERFLOW;
      const pattern: Partial<PromptPattern> = {
        capability: 'code_generation',
        failureCategory: category,
        contextType: 'scope_restriction',
        successCount: 8,
        lastSuccessAt: '2026-03-01T00:00:00.000Z',
        effectiveRewrite: 'Limit scope to src/auth/ only',
      };
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockResolvedValue([makePatternResult(pattern)]),
      });

      const result = await dm.rewritePrompt(makeTask(), category, memory);

      expect(result.rewrittenPrompt).toContain('HIGH CONFIDENCE PATTERN');
      expect(result.rewrittenPrompt).toContain('8 prior successes');
      expect(result.rewrittenPrompt).toContain('Limit scope to src/auth/ only');
      expect(result.appliedContext[0]).toContain('pattern shortcut');
      expect(result.appliedContext[0]).toContain('successCount=8');
    });

    it('falls back to the category strategy when no high-confidence pattern exists', async () => {
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockResolvedValue([]),
      });

      const task = makeTask({ changedFiles: ['src/context.ts', 'src/utils.ts'] });

      // CONTEXT_OVERFLOW strategy produces a "scope restriction" prompt
      const result = await dm.rewritePrompt(task, FailureCategory.CONTEXT_OVERFLOW, memory);

      expect(result.rewrittenPrompt).not.toContain('HIGH CONFIDENCE PATTERN');
      expect(result.strategy).toBe(FailureCategory.CONTEXT_OVERFLOW);
    });

    it('returns strategy=failureCategory even when pattern shortcut fires', async () => {
      const category = FailureCategory.STUCK_ON_COMPLEXITY;
      const pattern: Partial<PromptPattern> = {
        capability: 'architecture',
        failureCategory: category,
        contextType: 'decomposition',
        successCount: 5,
        lastSuccessAt: '2026-03-01T00:00:00.000Z',
      };
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockResolvedValue([makePatternResult(pattern)]),
      });

      const result = await dm.rewritePrompt(makeTask(), category, memory);(
      expect(result.strategy).toBe(category));
    });

    it('pattern shortcut returns originalPrompt verbatim when effectiveRewrite is absent', async () => {
      const category = FailureCategory.WRONG_DIRECTION;
      const pattern: Partial<PromptPattern> = {
        capability: 'api_development',
        failureCategory: category,
        contextType: 'prior_feedback',
        successCount: 6,
        lastSuccessAt: '2026-03-01T00:00:00.000Z',
        // no effectiveRewrite
      };
      const memory = makeMemory({
        searchAgentMemories: vi.fn().mockResolvedValue([makePatternResult(pattern)]),
      });

      const task = makeTask({ originalPrompt: 'The original task text' });
      const result = await dm.rewritePrompt(task, category, memory);

      // Without effectiveRewrite the prompt is passed through unchanged
      expect(result.rewrittenPrompt).toBe('The original task text');
      expect(result.appliedContext[0]).toContain('pattern shortcut');
    });
  });

  // ─── Export validation ────────────────────────────────────────────────────

  describe('exports', () => {
    it('PromptPattern and PatternLearningOptions are exported from delegation-manager', () => {
      // This is a compile-time check enforced by the import at the top of this file.
      // If they are missing the import would fail and this describe block would not run.
      const _typeCheck: PatternLearningOptions = {
        agentId: 'a',
        taskId: 't',
        capability: 'c',
        failureCategory: FailureCategory.UNKNOWN,
        contextType: 'ct',
        successCount: 1,
      };
      expect(_typeCheck.agentId).toBe('a');
    });
  });
});
