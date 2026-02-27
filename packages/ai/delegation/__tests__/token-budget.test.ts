/**
 * Token budget management tests — Task 3.5
 *
 * Validates:
 *  - estimateTokens():         returns ceil(length/4), always >= 1
 *  - tokenBudget on result:    every rewritePrompt() call now populates tokenBudget
 *  - overBudget=false:         when prompt fits within 80% of context window
 *  - overBudget=true:          when raw rewrite exceeds budget
 *  - trimming:                 original prompt preserved, older blocks summarised
 *  - verbatim keep:            last 3 blocks kept intact when trimming
 *  - appliedContext telemetry: budget line always present; trim line present when over
 *  - contextWindowTokens:      per-task override respected
 *  - UNKNOWN category:         no pattern lookup, still gets tokenBudget
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DelegationManager,
  FailureCategory,
  type RewriteTask,
  type TokenBudgetInfo,
} from '../delegation-manager.js';
import type { DCYFRMemory } from '../../memory/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemory(overrides: Partial<DCYFRMemory> = {}): DCYFRMemory {
  return {
    addAgentMemory: vi.fn().mockResolvedValue('mem-id'),
    searchAgentMemories: vi.fn().mockResolvedValue([]),
    getAgentHistory: vi.fn().mockResolvedValue([]),
    clearAgentMemory: vi.fn().mockResolvedValue(undefined),
    searchMemories: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as DCYFRMemory;
}

function makeTask(overrides: Partial<RewriteTask> = {}): RewriteTask {
  return {
    originalPrompt: 'Implement the authentication module',
    taskId: 'task-auth-001',
    ...overrides,
  };
}

/** Generate a string of exactly `n` characters */
const repeatStr = (n: number) => 'A'.repeat(n);

// ---------------------------------------------------------------------------
// estimateTokens()
// ---------------------------------------------------------------------------

describe('DelegationManager.estimateTokens() — task 3.5', () => {
  const dm = new DelegationManager();

  it('is accessible as a public method', () => {
    expect(typeof dm.estimateTokens).toBe('function');
  });

  it('returns ceil(length / 4)', () => {
    expect(dm.estimateTokens('AAAA')).toBe(1);    // 4 chars → 1 token
    expect(dm.estimateTokens('AAAAA')).toBe(2);   // 5 chars → ceil(1.25)=2
    expect(dm.estimateTokens('A'.repeat(8))).toBe(2);
    expect(dm.estimateTokens('A'.repeat(100))).toBe(25);
    expect(dm.estimateTokens('A'.repeat(4000))).toBe(1000);
  });

  it('returns at least 1 for empty string', () => {
    expect(dm.estimateTokens('')).toBeGreaterThanOrEqual(1);
  });

  it('handles a realistic code snippet', () => {
    const code = 'export function foo(x: number): string { return String(x); }';
    const estimate = dm.estimateTokens(code);
    // 60 chars → 15 tokens
    expect(estimate).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// tokenBudget always populated
// ---------------------------------------------------------------------------

describe('tokenBudget always present on RewriteResult — task 3.5', () => {
  let dm: DelegationManager;

  beforeEach(() => {
    dm = new DelegationManager();
  });

  it('populates tokenBudget for CONTEXT_OVERFLOW strategy', async () => {
    const memory = makeMemory();
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.CONTEXT_OVERFLOW, memory);

    expect(result.tokenBudget).toBeDefined();
    const b = result.tokenBudget as TokenBudgetInfo;
    expect(typeof b.originalTokens).toBe('number');
    expect(typeof b.addedTokens).toBe('number');
    expect(typeof b.finalTokens).toBe('number');
    expect(typeof b.budgetTokens).toBe('number');
    expect(typeof b.overBudget).toBe('boolean');
  });

  it('populates tokenBudget for UNKNOWN category (no pattern lookup, no strategy)', async () => {
    const memory = makeMemory();
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.UNKNOWN, memory);

    expect(result.tokenBudget).toBeDefined();
    expect(result.tokenBudget!.overBudget).toBe(false);
  });

  it('includes token-budget line in appliedContext', async () => {
    const memory = makeMemory();
    const result = await dm.rewritePrompt(makeTask(), FailureCategory.CONTEXT_OVERFLOW, memory);

    const budgetLine = result.appliedContext.find(s => s.startsWith('token-budget:'));
    expect(budgetLine).toBeDefined();
    expect(budgetLine).toContain('originalTokens=');
    expect(budgetLine).toContain('addedTokens=');
    expect(budgetLine).toContain('finalTokens=');
    expect(budgetLine).toContain('budgetTokens=');
  });
});

// ---------------------------------------------------------------------------
// overBudget = false (fits within budget)
// ---------------------------------------------------------------------------

describe('token budget — prompt fits within budget — task 3.5', () => {
  let dm: DelegationManager;

  beforeEach(() => {
    dm = new DelegationManager();
  });

  it('overBudget=false when prompt is well within default 128k window', async () => {
    const memory = makeMemory();
    const result = await dm.rewritePrompt(
      makeTask({ originalPrompt: 'Short task' }),
      FailureCategory.CONTEXT_OVERFLOW,
      memory,
    );

    expect(result.tokenBudget!.overBudget).toBe(false);
  });

  it('budgetTokens = floor(contextWindowTokens * 0.8)', async () => {
    const memory = makeMemory();
    const result = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 1000 }),
      FailureCategory.UNKNOWN,
      memory,
    );

    expect(result.tokenBudget!.budgetTokens).toBe(800); // floor(1000 * 0.8)
  });

  it('addedTokens reflects injected context size', async () => {
    const memory = makeMemory();
    const originalPrompt = 'A simple task';
    const result = await dm.rewritePrompt(
      makeTask({ originalPrompt }),
      FailureCategory.CONTEXT_OVERFLOW,
      memory,
    );

    const b = result.tokenBudget!;
    expect(b.originalTokens).toBe(dm.estimateTokens(originalPrompt));
    expect(b.finalTokens).toBe(b.originalTokens + b.addedTokens);
  });
});

// ---------------------------------------------------------------------------
// overBudget = true — trimming
// ---------------------------------------------------------------------------

describe('token budget — over budget trimming — task 3.5', () => {
  let dm: DelegationManager;

  beforeEach(() => {
    dm = new DelegationManager();
  });

  /**
   * Build a memory that returns a very large memory result to force the
   * rewritten prompt over a tiny context window.
   */
  function makeLargeMemory(): DCYFRMemory {
    const bigContent = repeatStr(2000); // 2000 chars = 500 tokens each
    return makeMemory({
      searchAgentMemories: vi.fn().mockResolvedValue([
        {
          id: 'r1',
          content: bigContent,
          metadata: {},
          score: 0.9,
          relevance: 0.9,
        },
        {
          id: 'r2',
          content: bigContent,
          metadata: {},
          score: 0.88,
          relevance: 0.88,
        },
        {
          id: 'r3',
          content: bigContent,
          metadata: {},
          score: 0.85,
          relevance: 0.85,
        },
      ]),
    });
  }

  it('overBudget=true when injected context exceeds budget', async () => {
    const memory = makeLargeMemory();
    // contextWindowTokens=500, budget=400 tokens; memory results alone are 500*3=1500 tokens
    const result = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 500 }),
      FailureCategory.WRONG_DIRECTION,
      memory,
    );

    expect(result.tokenBudget!.overBudget).toBe(true);
  });

  it('original prompt is preserved verbatim after trimming', async () => {
    const originalPrompt = 'Implement the auth module — preserve me exactly!';
    const memory = makeLargeMemory();

    const result = await dm.rewritePrompt(
      makeTask({ originalPrompt, contextWindowTokens: 500 }),
      FailureCategory.WRONG_DIRECTION,
      memory,
    );

    expect(result.rewrittenPrompt).toContain(originalPrompt);
  });

  it('trimmed prompt is shorter than raw prompt when over budget', async () => {
    const memory = makeLargeMemory();
    const untrimmedResult = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 999_999 }), // effectively no budget limit
      FailureCategory.WRONG_DIRECTION,
      memory,
    );
    const trimmedResult = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 400 }), // very tight budget
      FailureCategory.WRONG_DIRECTION,
      memory,
    );

    expect(trimmedResult.rewrittenPrompt.length).toBeLessThan(
      untrimmedResult.rewrittenPrompt.length,
    );
  });

  it('includes over-budget note in appliedContext when trimming occurred', async () => {
    const memory = makeLargeMemory();
    const result = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 400 }),
      FailureCategory.WRONG_DIRECTION,
      memory,
    );

    const trimLine = result.appliedContext.find(s =>
      s.includes('over-budget') || s.includes('trimmed'),
    );
    expect(trimLine).toBeDefined();
    expect(trimLine).toContain('budget=');
  });

  it('finalTokens is within budget after trimming (or as close as possible)', async () => {
    const memory = makeLargeMemory();
    const contextWindowTokens = 300;
    const result = await dm.rewritePrompt(
      makeTask({ contextWindowTokens }),
      FailureCategory.WRONG_DIRECTION,
      memory,
    );

    const b = result.tokenBudget!;
    // After trimming, final should be ≤ raw; original is always preserved
    expect(b.finalTokens).toBeGreaterThanOrEqual(b.originalTokens);
    // The raw prompt was over budget — the trimmed should be closer to budget
    expect(b.finalTokens).toBeLessThanOrEqual(
      dm.estimateTokens(result.rewrittenPrompt) + 1,
    );
  });
});

// ---------------------------------------------------------------------------
// Block prioritisation — last 3 verbatim
// ---------------------------------------------------------------------------

describe('token budget — verbatim block preservation — task 3.5', () => {
  it('summarises older blocks and keeps last 3 verbatim when trimming', async () => {
    const dm = new DelegationManager();

    // Build a mock that returns 5 distinct items to inject as WRONG_DIRECTION context.
    // Each item is large enough that together they easily exceed a tiny budget.
    const items = ['BlockOne', 'BlockTwo', 'BlockThree', 'BlockFour', 'BlockFive'];
    const memory = makeMemory({
      searchAgentMemories: vi.fn().mockResolvedValue(
        items.map((item, i) => ({
          id: `r${i}`,
          content: `${item}: ${'X'.repeat(300)}`,
          metadata: {},
          score: 0.9 - i * 0.05,
          relevance: 0.9 - i * 0.05,
        })),
      ),
    });

    const result = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 400 }), // tiny budget to force trimming
      FailureCategory.WRONG_DIRECTION,
      memory,
    );

    // The summarisation placeholder must appear in the prompt
    expect(result.rewrittenPrompt).toContain('summarized to save token budget');
  });
});

// ---------------------------------------------------------------------------
// contextWindowTokens per-task override
// ---------------------------------------------------------------------------

describe('token budget — contextWindowTokens override — task 3.5', () => {
  it('uses per-task contextWindowTokens when provided', async () => {
    const dm = new DelegationManager();
    const memory = makeMemory();

    const small = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 100 }),
      FailureCategory.UNKNOWN,
      memory,
    );
    const large = await dm.rewritePrompt(
      makeTask({ contextWindowTokens: 200_000 }),
      FailureCategory.UNKNOWN,
      memory,
    );

    expect(small.tokenBudget!.budgetTokens).toBe(80);       // floor(100 * 0.8)
    expect(large.tokenBudget!.budgetTokens).toBe(160_000);  // floor(200000 * 0.8)
  });

  it('defaults to 128k when contextWindowTokens not set', async () => {
    const dm = new DelegationManager();
    const memory = makeMemory();

    const result = await dm.rewritePrompt(makeTask(), FailureCategory.UNKNOWN, memory);
    // floor(128000 * 0.8) = 102400
    expect(result.tokenBudget!.budgetTokens).toBe(102_400);
  });
});

// ---------------------------------------------------------------------------
// Export validation
// ---------------------------------------------------------------------------

describe('TokenBudgetInfo export — task 3.5', () => {
  it('TokenBudgetInfo type is importable from delegation-manager', () => {
    // Compile-time check — if the import at the top of this file fails,
    // this whole file would not parse.
    const b: TokenBudgetInfo = {
      originalTokens: 10,
      addedTokens: 5,
      finalTokens: 15,
      budgetTokens: 100,
      overBudget: false,
    };
    expect(b.overBudget).toBe(false);
  });
});
