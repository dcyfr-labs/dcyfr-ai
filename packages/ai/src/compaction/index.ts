/**
 * Context Compaction Module
 *
 * Provides automatic context window management with LLM-powered
 * pre-flush summarization to preserve critical information.
 *
 * @packageDocumentation
 */

export {
  ContextCompactor,
  type ContextCompactorConfig,
  type ContextMessage,
  type AgentContext,
  type ContextUtilization,
  type PreFlushSummary,
  type CompactionResult,
} from './context-compactor.js';

export {
  MemoryCompaction,
  type MemoryCompactionConfig,
  type MemoryEntry,
  type DeduplicationResult,
  type ConversationSummaryResult,
  type FactArchivalResult,
} from './memory-compaction.js';
