/**
 * DCYFR Delegation Manager — Ralph Loop V2
 * TLP:AMBER - Internal Use Only
 *
 * High-level orchestration layer on top of DelegationContractManager.
 * Provides failure analysis (analyzeFailure) to categorise why a contract
 * failed so that the Ralph Loop can rewrite the prompt and retry.
 *
 * @module delegation/delegation-manager
 * @version 1.0.0
 * @date 2026-02-26
 *
 * ## Failure Categories
 *
 * | Category               | Primary Signal                              |
 * |------------------------|---------------------------------------------|
 * | context_overflow       | "token limit" / "truncated" in logs         |
 * | wrong_direction        | file changes outside declared task scope    |
 * | missing_requirements   | "Cannot find name" TypeScript errors        |
 * | stuck_on_complexity    | 0 commits after > 2 hours                   |
 * | unknown                | no other signal detected                    |
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DelegationContract } from '../types/delegation-contracts.js';
import type { DCYFRMemory, MemorySearchResult } from '../memory/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** Maximum retry attempts before human escalation */
const MAX_RETRIES = 3;

/** Default JSONL log path (relative to process.cwd) */
const DEFAULT_REWRITE_LOG_PATH = 'data/rewrite-history.jsonl';

/**
 * Phrases that indicate the model hit a context/token limit.
 * Matched case-insensitively against logs + error_output.
 */
const CONTEXT_OVERFLOW_SIGNALS = [
  'token limit',
  'truncated',
  'context length exceeded',
  'max_tokens',
  'maximum context',
  'context window',
  'too many tokens',
] as const;

/**
 * Phrases that indicate missing TypeScript / module requirements.
 * Matched case-insensitively against logs + error_output.
 */
const MISSING_REQUIREMENTS_SIGNALS = [
  'Cannot find name',
  'Cannot find module',
  'has no exported member',
  'Property .* does not exist',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a delegation contract failed.
 *
 * Used by Ralph Loop V2 to select the appropriate prompt-rewrite strategy.
 */
export enum FailureCategory {
  /** Agent ran out of context window / token budget */
  CONTEXT_OVERFLOW = 'context_overflow',
  /** Agent made changes outside the declared task scope */
  WRONG_DIRECTION = 'wrong_direction',
  /** TypeScript / module requirements were not satisfied */
  MISSING_REQUIREMENTS = 'missing_requirements',
  /** Agent made no progress (zero commits) after the 2-hour threshold */
  STUCK_ON_COMPLEXITY = 'stuck_on_complexity',
  /** No specific signal detected — generic failure */
  UNKNOWN = 'unknown',
}

/**
 * Rich result produced by a delegation contract execution.
 *
 * Fields are optional — only provide what is available from the execution
 * environment.  The more fields provided, the higher the analysis confidence.
 */
export interface ContractResult {
  /** The contract that was executed */
  contract: DelegationContract;

  /**
   * Combined stdout/stderr from the agent execution (e.g. tmux capture-pane
   * output, claude.ai session log, or CI run log).
   */
  logs?: string;

  /**
   * Stderr / error channel output only.
   * Checked separately from `logs` so TS errors surfaced here still trigger
   * `missing_requirements` even when they don't appear in general logs.
   */
  error_output?: string;

  /**
   * Repository-relative paths of every file the agent changed.
   * e.g. `['src/auth/login.ts', 'package.json']`
   */
  changed_files?: string[];

  /**
   * Repository-relative path prefixes that are *in scope* for this task.
   * A changed file is considered out-of-scope when it does not start with
   * any of these prefixes.
   * e.g. `['src/auth']`
   */
  task_scope_paths?: string[];

  /**
   * Number of commits the agent produced during execution.
   * A value of `0` combined with a long `elapsed_ms` signals stuck_on_complexity.
   */
  commit_count?: number;

  /**
   * Wall-clock time the agent spent on the task (milliseconds).
   * Used together with `commit_count` to detect stuck_on_complexity.
   */
  elapsed_ms?: number;
}

/**
 * Output of `DelegationManager.analyzeFailure()`.
 *
 * In addition to the primary category, `signals` lists every human-readable
 * reason that contributed so the Ralph Loop rewrite can address all of them.
 */
export interface FailureAnalysis {
  /** Primary failure category (highest confidence match) */
  category: FailureCategory;

  /**
   * Confidence that the identified category is correct (0.0 – 1.0).
   *
   * - 1.0  exact keyword match or deterministic numeric condition
   * - 0.7  partial-signal match
   * - 0.3  heuristic/fallback
   */
  confidence: number;

  /** Human-readable list of every signal detected during analysis */
  signals: string[];

  /** Contract ID for traceability */
  contract_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// rewritePrompt types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input to `DelegationManager.rewritePrompt()`.
 *
 * Contains the original task prompt plus contextual signals gathered during
 * execution (changed files, scope paths) that inform the rewrite strategy.
 */
export interface RewriteTask {
  /** Original prompt / task description sent to the agent */
  originalPrompt: string;

  /** Task identifier (used as memory query namespace) */
  taskId: string;

  /** Repository-relative paths of files the agent changed (if available) */
  changedFiles?: string[];

  /** Repository-relative path prefixes that are in-scope for this task */
  taskScopePaths?: string[];

  /** Agent identifier used for memory namespace lookups */
  agentId?: string;

  /**
   * Override the effective context window size in tokens for this task.
   * Defaults to `DEFAULT_CONTEXT_WINDOW_TOKENS` (128,000).
   * Use a smaller value in tests or when targeting smaller models.
   */
  contextWindowTokens?: number;
}

/**
 * Token accounting produced by every `DelegationManager.rewritePrompt()` call.
 *
 * All token counts are estimates computed with the 1-token-per-4-chars
 * heuristic (`estimateTokens`).  They are useful for monitoring and debugging
 * but should not be treated as exact figures.
 */
export interface TokenBudgetInfo {
  /** Estimated token count of the original, unmodified prompt */
  originalTokens: number;
  /** Estimated token count of context injected by the rewrite strategy */
  addedTokens: number;
  /** Estimated token count of the final prompt sent to the model */
  finalTokens: number;
  /** Maximum tokens allocated to the prompt (80% of context window) */
  budgetTokens: number;
  /** True when the raw rewritten prompt exceeded the budget before trimming */
  overBudget: boolean;
}

/**
 * Output of `DelegationManager.rewritePrompt()`.
 */
export interface RewriteResult {
  /** The rewritten prompt ready to send to the agent */
  rewrittenPrompt: string;

  /**
   * The failure category that drove the rewrite strategy.
   * Matches the `FailureCategory` passed to `rewritePrompt()`.
   */
  strategy: FailureCategory;

  /**
   * Human-readable list of transformations applied (e.g. which memory entries
   * were injected, how the prompt was scoped, the sub-tasks created).
   */
  appliedContext: string[];

  /**
   * Token budget accounting for this rewrite.  Always present on results
   * returned by `rewritePrompt()`; undefined on partially constructed objects
   * inside private strategy helpers.
   */
  tokenBudget?: TokenBudgetInfo;
}

/**
 * Number of memory entries to retrieve per category during rewriting.
 * Kept small to avoid token bloat — the Ralph Loop prioritises precision.
 */
const MEMORY_QUERY_LIMIT = 3;

/**
 * Default context window size in tokens.
 *
 * 128,000 tokens covers GPT-4o, Claude 3.5 Sonnet, and most Gemini variants.
 * Override per-task via `RewriteTask.contextWindowTokens` when targeting a
 * model with a different window.
 */
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;

/**
 * Fraction of the context window reserved for the prompt.
 *
 * The remaining 20% is left for the model's output tokens.  When a rewritten
 * prompt would exceed this budget, older injected context blocks are
 * summarised to a 1-sentence placeholder, while the last 3 blocks are kept
 * verbatim.
 */
const PROMPT_BUDGET_RATIO = 0.8;

/**
 * Maximum number of injected context blocks to keep verbatim when trimming.
 * Older blocks (lower index) are summarised to a 1-sentence placeholder.
 */
const VERBATIM_BLOCK_KEEP_COUNT = 3;

/**
 * Minimum successful retries a pattern must have before it is considered
 * high-confidence and used to short-circuit the standard rewrite strategies.
 */
const HIGH_CONFIDENCE_MIN = 5;

/**
 * Isolated memory namespace for all Ralph Loop V2 prompt patterns.
 * Using a dedicated namespace prevents pattern data from polluting regular
 * agent workflow memories.
 */
const PATTERN_NAMESPACE = 'ralph-loop-v2-patterns';

// ─────────────────────────────────────────────────────────────────────────────
// Pattern learning types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A learned rewrite pattern produced when a Ralph Loop retry succeeds.
 *
 * Patterns are stored in the memory layer against `PATTERN_NAMESPACE` and
 * retrieved by `queryHighConfidencePattern()` before each rewrite attempt.
 * Once a pattern accumulates `HIGH_CONFIDENCE_MIN` (5) successes it
 * short-circuits the standard per-category strategy.
 */
export interface PromptPattern {
  /** Agent capability that was executing when the pattern was learned */
  capability: string;
  /** Failure category the rewrite addressed */
  failureCategory: FailureCategory;
  /** Human-readable description of the context type that was injected */
  contextType: string;
  /** Number of times this pattern has led to a successful retry */
  successCount: number;
  /** ISO-8601 timestamp of the most recent success */
  lastSuccessAt: string;
  /**
   * The effective rewrite transformation text (e.g. the scope restriction
   * header or sub-task decomposition block) that preceded the success.
   */
  effectiveRewrite?: string;
}

/**
 * Options for `DelegationManager.learnPattern()`.
 */
export interface PatternLearningOptions {
  /** Agent/capability identifier that executed the task */
  agentId: string;
  /** Task identifier (used for traceability) */
  taskId: string;
  /** High-level capability name (e.g. `code_generation`, `api_development`) */
  capability: string;
  /** Failure category that the successful rewrite addressed */
  failureCategory: FailureCategory;
  /** Description of the context type injected (e.g. `scope_restriction`) */
  contextType: string;
  /**
   * Number of prior successes to associate with this pattern.
   * Pass `previousPattern.successCount + 1` when updating an existing pattern,
   * or `1` for a brand-new pattern.
   */
  successCount: number;
  /** The rewrite text that preceded the success (for replay) */
  effectiveRewrite?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One attempt record stored in `RetryResult.attempts`.
 */
export interface RetryAttempt {
  /** 1-based attempt number */
  attempt: number;
  /** Prompt sent to the agent for this attempt */
  prompt: string;
  /** Result returned by `executeAttempt` */
  result: ContractResult;
  /** Failure analysis (absent when `isSuccess` returned true) */
  analysis?: FailureAnalysis;
  /** Prompt rewrite applied before the *next* attempt (absent on final attempt) */
  rewrite?: RewriteResult;
}

/**
 * Options for `DelegationManager.runWithRetry()`.
 */
export interface RetryOptions {
  /** Initial prompt to send on attempt 1 */
  initialPrompt: string;
  /**
   * Identifies the task for logging and memory lookups.
   * Separate from the contract so callers can use any stable ID.
   */
  taskId: string;
  /** Memory layer instance forwarded to `rewritePrompt()` */
  memory: DCYFRMemory;
  /** Maximum number of attempts (default: 3) */
  maxRetries?: number;
  /**
   * Execute one attempt with the given prompt.
   * Must return a `ContractResult` regardless of outcome — errors should be
   * captured in `logs` / `error_output` rather than thrown.
   */
  executeAttempt: (prompt: string, attempt: number) => Promise<ContractResult>;
  /**
   * Determines whether an attempt succeeded.
   * Returning `true` short-circuits the retry loop.
   */
  isSuccess: (result: ContractResult) => boolean;
  /** Agent ID used for memory namespace (falls back to `taskId`) */
  agentId?: string;
  /** In-scope path prefixes forwarded to rewrite strategies */
  taskScopePaths?: string[];
  /**
   * Path to the JSONL rewrite-history log (default: `data/rewrite-history.jsonl`
   * relative to `process.cwd()`).
   *
   * Pass `null` to disable logging.
   */
  logPath?: string | null;
}

/**
 * Output of `DelegationManager.runWithRetry()`.
 */
export interface RetryResult {
  /** Whether any attempt succeeded */
  success: boolean;
  /** Ordered list of all attempted executions */
  attempts: RetryAttempt[];
  /** Result from the final attempt (successful or the last failure) */
  finalResult: ContractResult;
  /** Total number of attempts made */
  totalAttempts: number;
  /** Whether a human-escalation notification was sent */
  escalated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DelegationManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-level delegation orchestration.
 *
 * Ralph Loop V2 entry point — wraps `DelegationContractManager` and adds the
 * `analyzeFailure()` method used to categorise failures before prompt rewrite.
 *
 * @example
 * ```typescript
 * import { DelegationManager } from './delegation-manager.js';
 *
 * const dm = new DelegationManager();
 * const analysis = dm.analyzeFailure({
 *   contract: myContract,
 *   logs: contractLogs,
 *   changed_files: ['src/billing/invoice.ts', 'README.md'],
 *   task_scope_paths: ['src/billing'],
 *   commit_count: 0,
 *   elapsed_ms: 3 * 60 * 60 * 1000,
 * });
 *
 * // analysis.category === FailureCategory.STUCK_ON_COMPLEXITY
 * ```
 */
export class DelegationManager {
  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Returns `true` when any phrase in `needles` appears case-insensitively
   * in `haystack`.
   */
  private static containsAny(haystack: string, needles: readonly string[]): boolean {
    const lower = haystack.toLowerCase();
    return needles.some(n => lower.includes(n.toLowerCase()));
  }

  /**
   * Checks whether `file` is outside ALL of `scopePaths`.
   * A file is "in scope" when it starts with at least one scope prefix.
   */
  private static isOutOfScope(file: string, scopePaths: string[]): boolean {
    return !scopePaths.some(prefix => file.startsWith(prefix));
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Analyses why a delegation contract failed and returns a structured
   * `FailureAnalysis` for use by Ralph Loop V2 prompt rewriting.
   *
   * Detection priority (highest confidence first):
   * 1. `context_overflow`  — keyword match in logs/error_output
   * 2. `missing_requirements` — "Cannot find name" / module errors
   * 3. `wrong_direction`   — out-of-scope file changes
   * 4. `stuck_on_complexity` — zero commits > 2 h
   * 5. `unknown`           — no signal found
   *
   * All four checks are run; the category with the highest confidence wins.
   * Every detected signal is included in `analysis.signals` regardless of
   * which category is selected, giving the rewriter a complete picture.
   */
  analyzeFailure(result: ContractResult): FailureAnalysis {
    const signals: string[] = [];

    type Candidate = { category: FailureCategory; confidence: number };
    const candidates: Candidate[] = [];

    const combinedText =
      `${result.logs ?? ''} ${result.error_output ?? ''}`.trim();

    // ── 1. Context overflow ────────────────────────────────────────────────

    const overflowMatches = CONTEXT_OVERFLOW_SIGNALS.filter(phrase =>
      combinedText.toLowerCase().includes(phrase.toLowerCase()),
    );

    if (overflowMatches.length > 0) {
      for (const phrase of overflowMatches) {
        signals.push(`context_overflow signal: "${phrase}" found in logs`);
      }
      candidates.push({ category: FailureCategory.CONTEXT_OVERFLOW, confidence: 1.0 });
    }

    // ── 2. Missing requirements ────────────────────────────────────────────

    const missingMatches = MISSING_REQUIREMENTS_SIGNALS.filter(phrase =>
      DelegationManager.containsAny(combinedText, [phrase]),
    );

    if (missingMatches.length > 0) {
      for (const phrase of missingMatches) {
        signals.push(`missing_requirements signal: "${phrase}" found in output`);
      }
      candidates.push({ category: FailureCategory.MISSING_REQUIREMENTS, confidence: 1.0 });
    }

    // ── 3. Wrong direction ─────────────────────────────────────────────────

    const changedFiles = result.changed_files ?? [];
    const scopePaths = result.task_scope_paths ?? [];

    if (changedFiles.length > 0 && scopePaths.length > 0) {
      const outOfScope = changedFiles.filter(f =>
        DelegationManager.isOutOfScope(f, scopePaths),
      );

      if (outOfScope.length > 0) {
        for (const f of outOfScope) {
          signals.push(`wrong_direction signal: "${f}" is outside task scope (${scopePaths.join(', ')})`);
        }
        const confidence = outOfScope.length / changedFiles.length;
        candidates.push({ category: FailureCategory.WRONG_DIRECTION, confidence });
      }
    }

    // ── 4. Stuck on complexity ────────────────────────────────────────────

    const commitCount = result.commit_count ?? -1;
    const elapsedMs = result.elapsed_ms ?? 0;

    if (commitCount === 0 && elapsedMs > TWO_HOURS_MS) {
      const hoursElapsed = (elapsedMs / (60 * 60 * 1000)).toFixed(1);
      signals.push(
        `stuck_on_complexity signal: 0 commits after ${hoursElapsed}h (threshold: 2h)`,
      );
      candidates.push({ category: FailureCategory.STUCK_ON_COMPLEXITY, confidence: 1.0 });
    }

    // ── 5. Select winner ─────────────────────────────────────────────────

    if (candidates.length === 0) {
      return {
        category: FailureCategory.UNKNOWN,
        confidence: 0.3,
        signals: ['no specific failure signal detected'],
        contract_id: result.contract.contract_id,
      };
    }

    // Sort descending by confidence; stable sort keeps insertion order on ties
    const sorted = candidates.slice().sort((a, b) => b.confidence - a.confidence);
    const winner = sorted[0];

    return {
      category: winner.category,
      confidence: winner.confidence,
      signals,
      contract_id: result.contract.contract_id,
    };
  }

  // ------------------------------------------------------------------
  // rewritePrompt
  // ------------------------------------------------------------------

  /**
   * Rewrites a task prompt based on the failure category detected by
   * `analyzeFailure()`, optionally enriching it with context retrieved
   * from the memory layer.
   *
   * Strategy per category:
   * - `context_overflow`     — scope the prompt to the 3 most relevant files
   * - `wrong_direction`      — prepend customer requirement quotes from memory
   * - `missing_requirements` — append type definitions from memory
   * - `stuck_on_complexity`  — decompose the task into 2–3 sub-tasks
   * - `unknown`              — return the original prompt unchanged
   *
   * @param task            - Task information including the original prompt
   * @param failureCategory - Category identified by `analyzeFailure()`
   * @param memory          - Memory layer instance for context lookups
   * @returns               Rewritten prompt + audit log of applied context
   */
  async rewritePrompt(
    task: RewriteTask,
    failureCategory: FailureCategory,
    memory: DCYFRMemory,
  ): Promise<RewriteResult> {
    let raw: RewriteResult | null = null;

    // ── Pattern shortcut — check for a high-confidence learned pattern first ───
    // Skip pattern lookup for UNKNOWN: no strategy exists so there can be no
    // learned pattern, and the memory round-trip would produce no useful result.
    if (failureCategory !== FailureCategory.UNKNOWN) {
      const pattern = await this.queryHighConfidencePattern(
        task.agentId ?? task.taskId,
        failureCategory,
        memory,
      );

      if (pattern !== null) {
        const rewrittenPrompt = pattern.effectiveRewrite
          ? `HIGH CONFIDENCE PATTERN (${pattern.successCount} prior successes — using learned strategy):\n` +
            `${pattern.effectiveRewrite}\n\n` +
            task.originalPrompt
          : task.originalPrompt;

        raw = {
          rewrittenPrompt,
          strategy: failureCategory,
          appliedContext: [
            `pattern shortcut: using high-confidence pattern for ${failureCategory} ` +
              `(capability=${pattern.capability}, successCount=${pattern.successCount}, ` +
              `lastSuccessAt=${pattern.lastSuccessAt})`,
          ],
        };
      }
    }

    if (raw === null) {
      switch (failureCategory) {
        case FailureCategory.CONTEXT_OVERFLOW:
          raw = await this.rewriteForContextOverflow(task, memory);
          break;
        case FailureCategory.WRONG_DIRECTION:
          raw = await this.rewriteForWrongDirection(task, memory);
          break;
        case FailureCategory.MISSING_REQUIREMENTS:
          raw = await this.rewriteForMissingRequirements(task, memory);
          break;
        case FailureCategory.STUCK_ON_COMPLEXITY:
          raw = await this.rewriteForStuckOnComplexity(task, memory);
          break;
        default:
          raw = {
            rewrittenPrompt: task.originalPrompt,
            strategy: FailureCategory.UNKNOWN,
            appliedContext: ['no rewrite strategy for unknown category — prompt returned unchanged'],
          };
      }
    }

    return this.applyTokenBudget(raw, task);
  }

  // ------------------------------------------------------------------
  // Private rewrite strategies
  // ------------------------------------------------------------------

  /**
   * Trim scope: query memory for the most relevant 3 files to this task
   * and rewrite the prompt to focus only on those files.
   */
  private async rewriteForContextOverflow(
    task: RewriteTask,
    memory: DCYFRMemory,
  ): Promise<RewriteResult> {
    const appliedContext: string[] = [];

    const memResults: MemorySearchResult[] = await memory.searchAgentMemories(
      task.agentId ?? task.taskId,
      `relevant files for ${task.taskId}`,
      MEMORY_QUERY_LIMIT,
    );

    const relevantFiles = memResults.map(r => r.content);
    appliedContext.push(`context_overflow: queried memory for relevant files (found ${relevantFiles.length})`);

    // Also honour explicit changedFiles — intersection with scope paths
    const scopedFiles = (task.changedFiles ?? [])
      .filter(f => (task.taskScopePaths ?? []).some(p => f.startsWith(p)))
      .slice(0, MEMORY_QUERY_LIMIT);

    const allFiles = [...new Set([...relevantFiles, ...scopedFiles])].slice(0, MEMORY_QUERY_LIMIT);

    let rewrittenPrompt: string;

    if (allFiles.length > 0) {
      const fileList = allFiles.map(f => `- ${f}`).join('\n');
      rewrittenPrompt =
        `SCOPE RESTRICTION (context budget exceeded on previous attempt):\n` +
        `Focus ONLY on these ${allFiles.length} file(s):\n${fileList}\n\n` +
        task.originalPrompt;
      appliedContext.push(`context_overflow: scoped prompt to files: ${allFiles.join(', ')}`);
    } else {
      appliedContext.push('context_overflow: no files found in memory — trimming strategy adds scope header only');
      rewrittenPrompt =
        `SCOPE RESTRICTION (context budget exceeded on previous attempt):\n` +
        `Complete only the minimal change needed for this task.\n\n` +
        task.originalPrompt;
    }

    return { rewrittenPrompt, strategy: FailureCategory.CONTEXT_OVERFLOW, appliedContext };
  }

  /**
   * Add customer requirement quotes: query memory for meeting notes / customer
   * quotes relevant to the task and prepend them as alignment context.
   */
  private async rewriteForWrongDirection(
    task: RewriteTask,
    memory: DCYFRMemory,
  ): Promise<RewriteResult> {
    const appliedContext: string[] = [];

    const memResults: MemorySearchResult[] = await memory.searchAgentMemories(
      task.agentId ?? task.taskId,
      `customer requirements meeting notes ${task.taskId}`,
      MEMORY_QUERY_LIMIT,
    );

    appliedContext.push(`wrong_direction: queried memory for customer quotes (found ${memResults.length})`);

    let rewrittenPrompt: string;

    if (memResults.length > 0) {
      const quotes = memResults
        .map((r, i) => `[Requirement ${i + 1}] ${r.content}`)
        .join('\n\n');

      rewrittenPrompt =
        `ALIGNMENT CONTEXT (previous attempt went out of scope):\n` +
        `These are the customer requirements this task must satisfy:\n\n` +
        `${quotes}\n\n` +
        `Stay strictly within the following scope: ${(task.taskScopePaths ?? []).join(', ')}\n\n` +
        task.originalPrompt;

      for (const r of memResults) {
        appliedContext.push(`wrong_direction: injected customer quote (relevance ${r.relevance.toFixed(2)}): "${r.content.slice(0, 80)}..."`);
      }
    } else {
      const scopeNote = (task.taskScopePaths ?? []).length > 0
        ? `Stay strictly within: ${task.taskScopePaths!.join(', ')}`
        : 'Stay strictly within the originally declared task scope.';

      rewrittenPrompt =
        `SCOPE REMINDER (previous attempt went out of scope):\n` +
        `${scopeNote}\n\n` +
        task.originalPrompt;
      appliedContext.push('wrong_direction: no memory quotes found — added scope reminder header');
    }

    return { rewrittenPrompt, strategy: FailureCategory.WRONG_DIRECTION, appliedContext };
  }

  /**
   * Append type definitions: query memory for type definitions relevant to
   * the task and append them as explicit type context.
   */
  private async rewriteForMissingRequirements(
    task: RewriteTask,
    memory: DCYFRMemory,
  ): Promise<RewriteResult> {
    const appliedContext: string[] = [];

    const memResults: MemorySearchResult[] = await memory.searchAgentMemories(
      task.agentId ?? task.taskId,
      `TypeScript type definitions interfaces for ${task.taskId}`,
      MEMORY_QUERY_LIMIT,
    );

    appliedContext.push(`missing_requirements: queried memory for type definitions (found ${memResults.length})`);

    let rewrittenPrompt: string;

    if (memResults.length > 0) {
      const typeDefs = memResults
        .map((r, i) => `// Type Definition ${i + 1}\n${r.content}`)
        .join('\n\n');

      rewrittenPrompt =
        task.originalPrompt +
        `\n\nREQUIRED TYPE DEFINITIONS (use exactly as shown):\n` +
        `\`\`\`typescript\n${typeDefs}\n\`\`\``;

      for (const r of memResults) {
        appliedContext.push(`missing_requirements: appended type def (relevance ${r.relevance.toFixed(2)})`);
      }
    } else {
      rewrittenPrompt =
        task.originalPrompt +
        `\n\nNOTE: Ensure all required TypeScript types and module imports are ` +
        `declared before use. Run \`tsc --noEmit\` and fix all type errors before submitting.`;
      appliedContext.push('missing_requirements: no type defs in memory — added tsc reminder');
    }

    return { rewrittenPrompt, strategy: FailureCategory.MISSING_REQUIREMENTS, appliedContext };
  }

  /**
   * Decompose into sub-tasks: break the original prompt into 2–3 focused
   * sub-tasks so the agent can make incremental forward progress.
   */
  private async rewriteForStuckOnComplexity(
    task: RewriteTask,
    memory: DCYFRMemory,
  ): Promise<RewriteResult> {
    const appliedContext: string[] = [];

    // Query memory for any prior decomposition patterns for this task type
    const memResults: MemorySearchResult[] = await memory.searchAgentMemories(
      task.agentId ?? task.taskId,
      `task decomposition sub-tasks breakdown ${task.taskId}`,
      MEMORY_QUERY_LIMIT,
    );

    appliedContext.push(`stuck_on_complexity: queried memory for decomposition patterns (found ${memResults.length})`);

    let subTaskBlock: string;

    if (memResults.length > 0) {
      // Use memory-sourced decomposition
      subTaskBlock = memResults
        .map((r, i) => `Sub-task ${i + 1}: ${r.content}`)
        .join('\n\n');
      appliedContext.push('stuck_on_complexity: using memory-sourced sub-task decomposition');
    } else {
      // Heuristic decomposition — split the original prompt into 3 phases
      subTaskBlock =
        `Sub-task 1: Write the minimal implementation skeleton (types + function signatures only; no logic yet)\n` +
        `Sub-task 2: Implement the core logic and add unit tests\n` +
        `Sub-task 3: Wire up integration points, fix type errors, and verify with \`npm run test\``;
      appliedContext.push('stuck_on_complexity: heuristic 3-phase decomposition applied');
    }

    const rewrittenPrompt =
      `TASK DECOMPOSITION (agent was stuck — complete one sub-task at a time and commit after each):\n\n` +
      `${subTaskBlock}\n\n` +
      `Original task for reference:\n${task.originalPrompt}`;

    return { rewrittenPrompt, strategy: FailureCategory.STUCK_ON_COMPLEXITY, appliedContext };
  }

  // ------------------------------------------------------------------
  // Pattern learning
  // ------------------------------------------------------------------

  /**
   * Persist a rewrite pattern to the memory layer after a successful retry.
   *
   * Call this from `runWithRetry` callbacks (or from application code) when a
   * rewritten prompt leads to a successful contract execution.  Each stored
   * pattern carries a `successCount`; once a pattern reaches
   * `HIGH_CONFIDENCE_MIN` (5) successes it will be used as a shortcut by
   * `rewritePrompt()`.
   *
   * @param options - Pattern metadata including capability, category, and count
   * @param memory  - Memory layer instance to persist the pattern into
   * @returns The memory ID assigned by the provider
   *
   * @example
   * ```typescript
   * await dm.learnPattern(
   *   {
   *     agentId: 'my-agent',
   *     taskId: 'task-auth',
   *     capability: 'code_generation',
   *     failureCategory: FailureCategory.CONTEXT_OVERFLOW,
   *     contextType: 'scope_restriction',
   *     successCount: existingPattern ? existingPattern.successCount + 1 : 1,
   *     effectiveRewrite: rewriteResult.rewrittenPrompt,
   *   },
   *   memory,
   * );
   * ```
   */
  async learnPattern(
    options: PatternLearningOptions,
    memory: DCYFRMemory,
  ): Promise<string> {
    const pattern: PromptPattern = {
      capability: options.capability,
      failureCategory: options.failureCategory,
      contextType: options.contextType,
      successCount: options.successCount,
      lastSuccessAt: new Date().toISOString(),
      effectiveRewrite: options.effectiveRewrite,
    };

    const sessionId = `${options.capability}__${options.failureCategory}__${options.taskId}`;

    return memory.addAgentMemory(PATTERN_NAMESPACE, sessionId, pattern as unknown as Record<string, unknown>);
  }

  /**
   * Queries the memory layer for a high-confidence pattern matching the given
   * failure category and agent.
   *
   * A pattern is considered high-confidence when `successCount >=
   * HIGH_CONFIDENCE_MIN` (5).  The method returns the best matching
   * high-confidence pattern or `null` if none is found.
   *
   * @param agentId         - Agent namespace for the pattern lookup
   * @param failureCategory - Category to search for
   * @param memory          - Memory layer instance
   * @returns Highest-successCount high-confidence pattern, or `null`
   */
  async queryHighConfidencePattern(
    agentId: string,
    failureCategory: FailureCategory,
    memory: DCYFRMemory,
  ): Promise<PromptPattern | null> {
    let results;

    try {
      results = await memory.searchAgentMemories(
        PATTERN_NAMESPACE,
        `${failureCategory} ${agentId}`,
        HIGH_CONFIDENCE_MIN,
      );
    } catch {
      // Memory lookup failures must never break the rewrite pipeline
      return null;
    }

    const patterns: PromptPattern[] = [];

    for (const r of results) {
      // Primary path: structured data via metadata.state (dcyfr-memory impl)
      const state = r.metadata?.['state'] as PromptPattern | undefined;

      if (state?.failureCategory === failureCategory && typeof state.successCount === 'number') {
        patterns.push(state);
        continue;
      }

      // Fallback: try JSON.parse on content (some providers serialise inline)
      try {
        const parsed = JSON.parse(r.content) as PromptPattern;
        if (parsed?.failureCategory === failureCategory && typeof parsed.successCount === 'number') {
          patterns.push(parsed);
        }
      } catch {
        // Not JSON — skip
      }
    }

    const highConfidence = patterns.filter(p => p.successCount >= HIGH_CONFIDENCE_MIN);

    if (highConfidence.length === 0) return null;

    // Return the pattern with the highest successCount
    return highConfidence.reduce(
      (best, p) => (p.successCount > best.successCount ? p : best),
      highConfidence[0],
    );
  }

  // ------------------------------------------------------------------
  // Token budget management
  // ------------------------------------------------------------------

  /**
   * Estimates the token count of a string using the 1-token ≈ 4-characters
   * heuristic (industry standard for English prose and TypeScript code).
   *
   * The result is intentionally an over-estimate for safety — it is slightly
   * higher than exact tiktoken counts on average, which means the budget cap
   * will trigger a little early rather than too late.
   *
   * @param text - The string to estimate tokens for
   * @returns Estimated token count (always ≥ 1)
   */
  estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /**
   * Summarises older injected context blocks to a 1-sentence placeholder,
   * keeping the `keepVerbatim` most-recent blocks intact.
   *
   * Blocks are delimited by double newlines.  If there are `keepVerbatim` or
   * fewer blocks the section is returned unmodified.
   *
   * @param section      - The injected section text (header or footer)
   * @param keepVerbatim - Number of recent blocks to preserve verbatim
   * @returns The (possibly summarised) section text
   */
  private summarizeInjectedSection(section: string, keepVerbatim: number): string {
    const trimmed = section.trim();
    if (!trimmed) return section;

    const blocks = section.split(/\n\n+/);
    const nonEmpty = blocks.filter(b => b.trim());
    if (nonEmpty.length <= keepVerbatim) return section;

    const olderCount = nonEmpty.length - keepVerbatim;
    const keptBlocks = nonEmpty.slice(olderCount);

    const summary =
      `[${olderCount} earlier context block(s) summarized to save token budget — ` +
      `see rewrite log for full content]`;

    return summary + '\n\n' + keptBlocks.join('\n\n');
  }

  /**
   * Applies the token budget cap to a raw `RewriteResult`.
   *
   * 1. Estimates `originalTokens`, `addedTokens`, and `finalTokens`.
   * 2. If `finalTokens > budgetTokens` (80% of context window), trims the
   *    injected additions by summarising older context blocks while keeping
   *    the last `VERBATIM_BLOCK_KEEP_COUNT` (3) blocks verbatim.
   * 3. The original prompt is always preserved verbatim.
   * 4. Appends token budget telemetry to `appliedContext`.
   *
   * @param result - Raw rewrite result from a strategy or pattern shortcut
   * @param task   - Original task (used for context window override + prompt)
   * @returns Updated result with `tokenBudget` populated
   */
  private applyTokenBudget(result: RewriteResult, task: RewriteTask): RewriteResult {
    const contextWindowTokens = task.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
    const budgetTokens = Math.floor(contextWindowTokens * PROMPT_BUDGET_RATIO);
    const originalTokens = this.estimateTokens(task.originalPrompt);

    let { rewrittenPrompt } = result;
    const rawTokens = this.estimateTokens(rewrittenPrompt);
    const wasOverBudget = rawTokens > budgetTokens;

    if (wasOverBudget) {
      // Locate the original prompt within the rewritten output so we can split
      // it into header (prepended context) and footer (appended context).
      const origIdx = rewrittenPrompt.indexOf(task.originalPrompt);

      if (origIdx !== -1) {
        const header = rewrittenPrompt.slice(0, origIdx);
        const footer = rewrittenPrompt.slice(origIdx + task.originalPrompt.length);

        const trimmedHeader = this.summarizeInjectedSection(header, VERBATIM_BLOCK_KEEP_COUNT);
        const trimmedFooter = this.summarizeInjectedSection(footer, VERBATIM_BLOCK_KEEP_COUNT);

        rewrittenPrompt = trimmedHeader + task.originalPrompt + trimmedFooter;
      }
    }

    const finalTokens = this.estimateTokens(rewrittenPrompt);
    const addedTokens = Math.max(0, finalTokens - originalTokens);

    const tokenBudget: TokenBudgetInfo = {
      originalTokens,
      addedTokens,
      finalTokens,
      budgetTokens,
      overBudget: wasOverBudget,
    };

    const appliedContext = [...result.appliedContext];
    if (wasOverBudget) {
      appliedContext.push(
        `token-budget: over-budget — trimmed injected blocks ` +
          `(raw=${rawTokens}, final=${finalTokens}, budget=${budgetTokens} tokens)`,
      );
    }
    appliedContext.push(
      `token-budget: originalTokens=${originalTokens}, addedTokens=${addedTokens}, ` +
        `finalTokens=${finalTokens}, budgetTokens=${budgetTokens}`,
    );

    return { ...result, rewrittenPrompt, appliedContext, tokenBudget };
  }

  // ------------------------------------------------------------------
  // runWithRetry — Ralph Loop V2 orchestration
  // ------------------------------------------------------------------

  /**
   * Ralph Loop V2 retry orchestration.
   *
   * Runs `executeAttempt` up to `maxRetries` times.  After each failure:
   * 1. Calls `analyzeFailure()` to categorise the problem.
   * 2. Calls `rewritePrompt()` to produce an improved prompt.
   * 3. Logs the rewrite to `data/rewrite-history.jsonl`.
   *
   * If the maximum number of attempts is reached without success, an
   * escalation notification is sent via Telegram (requires
   * `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env vars).
   *
   * @example
   * ```typescript
   * const result = await dm.runWithRetry({
   *   initialPrompt: 'Implement auth module.',
   *   taskId: 'task-auth',
   *   memory,
   *   executeAttempt: async (prompt) => {
   *     // ... run agent, return ContractResult
   *   },
   *   isSuccess: (r) => (r.commit_count ?? 0) > 0 && !r.error_output,
   * });
   * ```
   */
  async runWithRetry(options: RetryOptions): Promise<RetryResult> {
    const maxRetries = options.maxRetries ?? MAX_RETRIES;
    const logPath = options.logPath === null ? null : (options.logPath ?? DEFAULT_REWRITE_LOG_PATH);
    const attempts: RetryAttempt[] = [];
    let currentPrompt = options.initialPrompt;
    let escalated = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await options.executeAttempt(currentPrompt, attempt);

      if (options.isSuccess(result)) {
        attempts.push({ attempt, prompt: currentPrompt, result });
        return {
          success: true,
          attempts,
          finalResult: result,
          totalAttempts: attempt,
          escalated: false,
        };
      }

      const analysis = this.analyzeFailure(result);

      if (attempt === maxRetries) {
        // Final attempt failed — escalate before returning
        attempts.push({ attempt, prompt: currentPrompt, result, analysis });
        escalated = await this.sendTelegramEscalation(options.taskId, maxRetries, analysis);
        break;
      }

      const rewriteTask: RewriteTask = {
        originalPrompt: currentPrompt,
        taskId: options.taskId,
        agentId: options.agentId,
        changedFiles: result.changed_files,
        taskScopePaths: options.taskScopePaths ?? result.task_scope_paths,
      };

      const rewrite = await this.rewritePrompt(rewriteTask, analysis.category, options.memory);

      if (logPath !== null) {
        await this.appendRewriteLog(logPath, {
          taskId: options.taskId,
          contractId: result.contract.contract_id,
          attempt,
          failureCategory: analysis.category,
          confidence: analysis.confidence,
          signals: analysis.signals,
          promptBeforeLength: currentPrompt.length,
          promptAfterLength: rewrite.rewrittenPrompt.length,
          appliedContext: rewrite.appliedContext,
        });
      }

      attempts.push({ attempt, prompt: currentPrompt, result, analysis, rewrite });
      currentPrompt = rewrite.rewrittenPrompt;
    }

    return {
      success: false,
      attempts,
      finalResult: attempts[attempts.length - 1].result,
      totalAttempts: attempts.length,
      escalated,
    };
  }

  // ------------------------------------------------------------------
  // Private helpers — escalation + logging
  // ------------------------------------------------------------------

  /**
   * Sends a Telegram message to notify humans of a triple-failure escalation.
   *
   * Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `process.env`.
   * When either is missing, logs a warning and returns `false` (silent skip).
   *
   * @returns `true` if the message was sent, `false` otherwise.
   */
  private async sendTelegramEscalation(
    taskId: string,
    maxRetries: number,
    analysis: FailureAnalysis,
  ): Promise<boolean> {
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    const chatId = process.env['TELEGRAM_CHAT_ID'];

    if (!token || !chatId) {
      // Not configured — skip silently (warn in case someone is watching)
      process.stderr.write(
        `[DelegationManager] Telegram escalation skipped: ` +
        `TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.\n`,
      );
      return false;
    }

    const message =
      `🚨 *Ralph Loop V2 Escalation*\n` +
      `Task *${taskId}* failed after *${maxRetries}* attempt(s).\n` +
      `Category: \`${analysis.category}\` (confidence: ${(analysis.confidence * 100).toFixed(0)}%)\n` +
      `Signals:\n${analysis.signals.map(s => `• ${s}`).join('\n')}\n` +
      `Contract: \`${analysis.contract_id}\`\n` +
      `Requires human review.`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
      });

      if (!response.ok) {
        const body = await response.text();
        process.stderr.write(
          `[DelegationManager] Telegram API error ${response.status}: ${body}\n`,
        );
        return false;
      }

      return true;
    } catch (err) {
      process.stderr.write(
        `[DelegationManager] Telegram fetch failed: ${String(err)}\n`,
      );
      return false;
    }
  }

  /**
   * Appends one JSONL entry to the rewrite-history log.
   * Creates the parent directory if it doesn't exist.
   */
  private async appendRewriteLog(
    logPath: string,
    entry: {
      taskId: string;
      contractId: string;
      attempt: number;
      failureCategory: FailureCategory;
      confidence: number;
      signals: string[];
      promptBeforeLength: number;
      promptAfterLength: number;
      appliedContext: string[];
    },
  ): Promise<void> {
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    });

    try {
      await mkdir(dirname(logPath), { recursive: true });
      await appendFile(logPath, `${record}\n`, 'utf8');
    } catch (err) {
      // Non-fatal — log errors should never break the retry loop
      process.stderr.write(
        `[DelegationManager] Failed to write rewrite log: ${String(err)}\n`,
      );
    }
  }
}

/**
 * Default singleton — suitable for non-test usage.
 */
export const delegationManager = new DelegationManager();