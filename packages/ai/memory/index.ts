/**
 * Memory Layer Module - Barrel Exports
 * 
 * Main entry point for @dcyfr/ai/memory module.
 * Exports all public APIs for memory operations.
 * 
 * @module @dcyfr/ai/memory
 */

// Main API
export { getMemory, resetMemory, DCYFRMemoryImpl } from './dcyfr-memory.js';

// Configuration
export {
  getMemoryConfig,
  loadMemoryConfig,
  validateMemoryConfig,
  DEFAULT_CONFIG,
} from './config.js';

// Types
export type {
  DCYFRMemory,
  Memory,
  MemorySearchResult,
  MemoryContext,
  AgentMemory,
  SessionMemory,
  MemoryProvider,
} from './types.js';

export type {
  VectorDBProvider,
  VectorDBConfig,
  LLMConfig,
  MemoryConfig,
} from './config.js';

// Client utilities (for advanced users)
export {
  createMem0Client,
  getMem0Client,
  resetMem0Client,
} from './mem0-client.js';

export type { Mem0Client } from './mem0-client.js';

// File-first memory (autonomous agent runtime)
export { FileMemoryAdapter } from './file-memory-adapter.js';
export type { FileMemoryAdapterConfig, OwnerType } from './file-memory-adapter.js';

// SQLite hybrid search index
export { SQLiteIndex } from './sqlite-index.js';
export type { SQLiteIndexConfig, ChunkRecord, SearchResult } from './sqlite-index.js';

// Working memory persistence
export { flushWorkingMemory, loadWorkingMemory, listWorkingMemoryFiles } from './working-memory-persistence.js';
export type {
  WorkingMemoryPersistConfig,
  FlushResult,
  WorkingMemoryEntry,
  LoadResult,
} from './working-memory-persistence.js';
