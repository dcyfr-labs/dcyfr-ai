/**
 * @module compaction/context-compactor
 * @description Context compaction with LLM-powered pre-flush summarization.
 *
 * Implements a three-stage compaction pipeline:
 * 1. Monitor — calculate context utilization
 * 2. Pre-flush — LLM-powered summarization before compaction
 * 3. Compact — remove oldest turns, inject summary
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import type { DCYFRMemory } from '../../memory/types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ContextCompactorConfig {
  /** Context utilization threshold (0-1) to trigger compaction. Default: 0.7 */
  threshold?: number;

  /** Number of recent turns to preserve after compaction. Default: 5 */
  preserveRecentTurns?: number;

  /** Maximum tokens for the summary. Default: 500 */
  maxSummaryTokens?: number;

  /** Token counter function. Default: rough estimate (4 chars = 1 token) */
  tokenCounter?: (text: string) => number;

  /** LLM call function for pre-flush summarization */
  llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;

  /** Memory adapter for persisting pre-flush summaries */
  memory?: DCYFRMemory;

  /** Enable debug logging. Default: false */
  debug?: boolean;
}

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface AgentContext {
  /** System prompt */
  systemPrompt: string;

  /** Injected skills */
  skills?: string;

  /** Retrieved memories */
  memories?: string;

  /** Conversation turns */
  messages: ContextMessage[];

  /** Tool results from current turn */
  toolResults?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ContextUtilization {
  /** Total tokens used */
  totalTokens: number;

  /** Context window size (model maximum) */
  windowSize: number;

  /** Utilization ratio (0-1) */
  utilization: number;

  /** Breakdown by component */
  breakdown: {
    systemPrompt: number;
    skills: number;
    memories: number;
    conversation: number;
    toolResults: number;
  };

  /** Whether compaction is recommended */
  shouldCompact: boolean;

  /** Estimated tokens to free via compaction */
  estimatedSavings: number;
}

export interface PreFlushSummary {
  /** Key facts extracted from conversation */
  facts: string[];

  /** Decisions made during conversation */
  decisions: string[];

  /** Outstanding questions or tasks */
  outstandingQuestions: string[];

  /** Conversation summary for injection */
  summary: string;

  /** Timestamp of pre-flush */
  timestamp: Date;

  /** Original turn count before flush */
  originalTurnCount: number;
}

export interface CompactionResult {
  /** Whether compaction was performed */
  compacted: boolean;

  /** Tokens before compaction */
  tokensBefore: number;

  /** Tokens after compaction */
  tokensAfter: number;

  /** Tokens saved */
  tokensSaved: number;

  /** Pre-flush summary (if performed) */
  preFlushSummary?: PreFlushSummary;

  /** Error if compaction failed */
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_MODEL_CONTEXT_WINDOW = 128000; // Claude 3.5 / GPT-4o default

const PRE_FLUSH_SYSTEM_PROMPT = `You are a context compaction assistant. Your job is to extract key information from a conversation before it is summarized.

Extract the following in JSON format:
{
  "facts": ["fact 1", "fact 2", ...],
  "decisions": ["decision 1", "decision 2", ...],
  "outstandingQuestions": ["question 1", "question 2", ...],
  "summary": "Brief summary of the conversation..."
}

Rules:
- Facts should be concrete, actionable pieces of information learned
- Decisions should be choices or conclusions reached during the conversation
- Outstanding questions should be unresolved queries or pending tasks
- Summary should be 2-3 sentences capturing the essence of the conversation
- Be concise — this output will be injected into future context`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultTokenCounter(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

function countMessageTokens(
  messages: ContextMessage[],
  counter: (text: string) => number,
): number {
  return messages.reduce((sum, msg) => sum + counter(msg.content), 0);
}

function formatConversationForSummary(messages: ContextMessage[]): string {
  return messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 1000)}`)
    .join('\n\n');
}

function parsePreFlushResponse(response: string): Omit<PreFlushSummary, 'timestamp' | 'originalTurnCount'> {
  try {
    // Try to extract JSON from the response
    const jsonMatch = /\{[\s\S]*\}/.exec(response);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        facts: Array.isArray(parsed.facts) ? parsed.facts : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        outstandingQuestions: Array.isArray(parsed.outstandingQuestions) ? parsed.outstandingQuestions : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary available.',
      };
    }
  } catch {
    // Fall through to default
  }

  // Fallback: treat entire response as summary
  return {
    facts: [],
    decisions: [],
    outstandingQuestions: [],
    summary: response.slice(0, 500),
  };
}

function buildSummaryInjection(summary: PreFlushSummary): string {
  const parts: string[] = [
    '<!-- Previous Context Summary -->',
    '',
    `**Summary:** ${summary.summary}`,
  ];

  if (summary.facts.length > 0) {
    parts.push('', '**Key Facts:**');
    summary.facts.forEach((f) => parts.push(`- ${f}`));
  }

  if (summary.decisions.length > 0) {
    parts.push('', '**Decisions Made:**');
    summary.decisions.forEach((d) => parts.push(`- ${d}`));
  }

  if (summary.outstandingQuestions.length > 0) {
    parts.push('', '**Outstanding Questions:**');
    summary.outstandingQuestions.forEach((q) => parts.push(`- ${q}`));
  }

  parts.push('', '<!-- End Previous Context Summary -->', '');

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  ContextCompactor                                                   */
/* ------------------------------------------------------------------ */

export class ContextCompactor {
  private readonly threshold: number;
  private readonly preserveRecentTurns: number;
  private readonly maxSummaryTokens: number;
  private readonly tokenCounter: (text: string) => number;
  private readonly llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;
  private readonly memory?: DCYFRMemory;
  private readonly debug: boolean;
  private readonly contextWindowSize: number;

  private lastPreFlushSummary?: PreFlushSummary;
  private preFlushRetryPending = false;

  constructor(config: ContextCompactorConfig = {}) {
    this.threshold = config.threshold ?? 0.7;
    this.preserveRecentTurns = config.preserveRecentTurns ?? 5;
    this.maxSummaryTokens = config.maxSummaryTokens ?? 500;
    this.tokenCounter = config.tokenCounter ?? defaultTokenCounter;
    this.llmCall = config.llmCall;
    this.memory = config.memory;
    this.debug = config.debug ?? false;
    this.contextWindowSize = DEFAULT_MODEL_CONTEXT_WINDOW;
  }

  /* ---- Stage 1: Monitor ------------------------------------------ */

  /**
   * Calculate context utilization and breakdown by component.
   */
  calculateUtilization(context: AgentContext): ContextUtilization {
    const systemPromptTokens = this.tokenCounter(context.systemPrompt);
    const skillsTokens = context.skills ? this.tokenCounter(context.skills) : 0;
    const memoriesTokens = context.memories ? this.tokenCounter(context.memories) : 0;
    const conversationTokens = countMessageTokens(context.messages, this.tokenCounter);
    const toolResultsTokens = context.toolResults ? this.tokenCounter(context.toolResults) : 0;

    const totalTokens = systemPromptTokens + skillsTokens + memoriesTokens + conversationTokens + toolResultsTokens;
    const utilization = totalTokens / this.contextWindowSize;

    // Estimate savings: remove all but recent turns, add summary
    const recentTurns = context.messages.slice(-this.preserveRecentTurns);
    const recentTokens = countMessageTokens(recentTurns, this.tokenCounter);
    const estimatedSavings = Math.max(0, conversationTokens - recentTokens - this.maxSummaryTokens);

    return {
      totalTokens,
      windowSize: this.contextWindowSize,
      utilization,
      breakdown: {
        systemPrompt: systemPromptTokens,
        skills: skillsTokens,
        memories: memoriesTokens,
        conversation: conversationTokens,
        toolResults: toolResultsTokens,
      },
      shouldCompact: utilization >= this.threshold,
      estimatedSavings,
    };
  }

  /* ---- Stage 2: Pre-Flush ---------------------------------------- */

  /**
   * Generate an LLM-powered summary before compaction.
   * Extracts facts, decisions, and outstanding questions.
   */
  async preFlush(context: AgentContext): Promise<PreFlushSummary | null> {
    if (!this.llmCall) {
      if (this.debug) {
        console.warn('[ContextCompactor] preFlush skipped: no llmCall configured');
      }
      return null;
    }

    const conversationText = formatConversationForSummary(context.messages);
    const prompt = `Analyze this conversation and extract key information:\n\n${conversationText}`;

    try {
      const response = await this.llmCall(prompt, PRE_FLUSH_SYSTEM_PROMPT);
      const parsed = parsePreFlushResponse(response);

      const summary: PreFlushSummary = {
        ...parsed,
        timestamp: new Date(),
        originalTurnCount: context.messages.length,
      };

      // Persist to memory if configured
      if (this.memory) {
        await this.memory.addAgentMemory(
          'context-compactor',
          `preflush-${Date.now()}`,
          { type: 'preFlushSummary', ...summary },
        );
      }

      this.lastPreFlushSummary = summary;
      this.preFlushRetryPending = false;

      if (this.debug) {
        console.log('[ContextCompactor] preFlush completed:', {
          facts: summary.facts.length,
          decisions: summary.decisions.length,
          outstandingQuestions: summary.outstandingQuestions.length,
        });
      }

      return summary;
    } catch (error) {
      if (this.debug) {
        console.error('[ContextCompactor] preFlush failed:', error);
      }

      // Mark for retry on next turn (graceful degradation)
      this.preFlushRetryPending = true;
      return null;
    }
  }

  /* ---- Stage 3: Compact ------------------------------------------ */

  /**
   * Compact the context by removing older turns and injecting a summary.
   */
  async compact(context: AgentContext): Promise<CompactionResult> {
    const utilization = this.calculateUtilization(context);
    const tokensBefore = utilization.totalTokens;

    if (!utilization.shouldCompact) {
      return {
        compacted: false,
        tokensBefore,
        tokensAfter: tokensBefore,
        tokensSaved: 0,
      };
    }

    // Stage 2: Pre-flush if we have an LLM
    let preFlushSummary = await this.preFlush(context);

    // Graceful degradation: if pre-flush failed and we have a pending retry, skip compaction this turn
    if (!preFlushSummary && this.preFlushRetryPending && !this.lastPreFlushSummary) {
      if (this.debug) {
        console.warn('[ContextCompactor] compact deferred: waiting for pre-flush retry');
      }
      return {
        compacted: false,
        tokensBefore,
        tokensAfter: tokensBefore,
        tokensSaved: 0,
        error: 'Pre-flush failed, retrying on next turn',
      };
    }

    // Use last successful summary if current pre-flush failed
    if (!preFlushSummary && this.lastPreFlushSummary) {
      preFlushSummary = this.lastPreFlushSummary;
    }

    // Keep only recent turns
    const recentTurns = context.messages.slice(-this.preserveRecentTurns);

    // Build compacted messages
    const compactedMessages: ContextMessage[] = [];

    // Inject summary as a system-like message if available
    if (preFlushSummary) {
      const summaryContent = buildSummaryInjection(preFlushSummary);
      compactedMessages.push({
        role: 'assistant',
        content: summaryContent,
        timestamp: new Date(),
        metadata: { type: 'context_summary', originalTurnCount: preFlushSummary.originalTurnCount },
      });
    }

    // Add recent turns
    compactedMessages.push(...recentTurns);

    // Update context in place
    context.messages.length = 0;
    context.messages.push(...compactedMessages);

    // Calculate new token count
    const newUtilization = this.calculateUtilization(context);
    const tokensAfter = newUtilization.totalTokens;

    return {
      compacted: true,
      tokensBefore,
      tokensAfter,
      tokensSaved: tokensBefore - tokensAfter,
      preFlushSummary: preFlushSummary ?? undefined,
    };
  }

  /* ---- Hook interface -------------------------------------------- */

  /**
   * Priority for hook registration.
   * Lower numbers execute first.
   * Security hooks: 0
   * Context compaction: 50
   * User hooks: 100
   */
  static readonly HOOK_PRIORITY = 50;

  /**
   * Execute compaction as a beforeExecute hook.
   * Returns the potentially modified context.
   */
  async executeAsHook(context: AgentContext): Promise<AgentContext> {
    const result = await this.compact(context);

    if (this.debug && result.compacted) {
      console.log('[ContextCompactor] hook executed:', {
        tokensSaved: result.tokensSaved,
        newUtilization: this.calculateUtilization(context).utilization,
      });
    }

    return context;
  }

  /* ---- Lifecycle ------------------------------------------------- */

  /**
   * Get the last pre-flush summary (useful for debugging/auditing).
   */
  getLastPreFlushSummary(): PreFlushSummary | undefined {
    return this.lastPreFlushSummary;
  }

  /**
   * Whether a pre-flush retry is pending.
   */
  isPreFlushRetryPending(): boolean {
    return this.preFlushRetryPending;
  }

  /**
   * Clear the pending retry flag (for testing).
   */
  clearPreFlushRetryPending(): void {
    this.preFlushRetryPending = false;
  }
}
