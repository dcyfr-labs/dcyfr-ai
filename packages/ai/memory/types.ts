/**
 * Memory Layer Type Definitions
 * 
 * Core interfaces for DCYFR memory abstraction layer.
 * Provides type safety for user, agent, and session memory operations.
 * 
 * @module @dcyfr/ai/memory/types
 */

/**
 * Base memory object
 */
export interface Memory {
  /** Unique memory identifier */
  id: string;
  
  /** Memory content (text) */
  content: string;
  
  /** Owner (userId or agentId) */
  owner: string;
  
  /** Owner type */
  ownerType: 'user' | 'agent' | 'session';
  
  /** Importance score (0-1, higher = more important) */
  importance?: number;
  
  /** Topic/category for filtering */
  topic?: string;
  
  /** Timestamp when memory was created */
  createdAt: Date;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Agent-specific memory (extends base Memory)
 */
export interface AgentMemory extends Memory {
  ownerType: 'agent';
  
  /** Agent identifier */
  agentId: string;
  
  /** Session identifier */
  sessionId: string;
  
  /** Agent workflow state */
  state?: Record<string, any>;
}

/**
 * Session-specific memory (temporary context)
 */
export interface SessionMemory extends Memory {
  ownerType: 'session';
  
  /** Session identifier */
  sessionId: string;
  
  /** Expiration timestamp (auto-delete after) */
  expiresAt?: Date;
}

/**
 * Memory search result (includes relevance score)
 */
export interface MemorySearchResult extends Memory {
  /** Relevance score from vector search (0-1) */
  relevance: number;
}

/**
 * Memory addition context (optional metadata)
 */
export interface MemoryContext {
  /** Topic/category for filtering */
  topic?: string;
  
  /** Importance score (0-1) */
  importance?: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * DCYFRMemory interface - main API for memory operations
 * 
 * This abstraction layer wraps mem0 (or other memory providers)
 * to provide a consistent API for DCYFR applications.
 */
export interface DCYFRMemory {
  // ===== User-Level Memories =====
  
  /**
   * Add a user-level memory (persistent across sessions)
   * 
   * @param userId - Unique user identifier
   * @param message - Memory content
   * @param context - Optional metadata (topic, importance)
   * @returns Memory ID
   */
  addUserMemory(
    userId: string,
    message: string,
    context?: MemoryContext
  ): Promise<string>;

  /**
   * Search user memories by semantic query
   * 
   * @param userId - Unique user identifier
   * @param query - Search query (natural language)
   * @param limit - Max results to return (default: 3)
   * @returns Array of relevant memories
   */
  searchUserMemories(
    userId: string,
    query: string,
    limit?: number
  ): Promise<MemorySearchResult[]>;

  /**
   * Get all memories for a user (optionally filtered by topic)
   * 
   * @param userId - Unique user identifier
   * @param topic - Optional topic filter
   * @returns Array of user memories
   */
  getUserMemories(
    userId: string,
    topic?: string
  ): Promise<Memory[]>;

  // ===== Agent-Level Memories =====
  
  /**
   * Add agent workflow state (for multi-step tasks)
   * 
   * @param agentId - Unique agent identifier
   * @param sessionId - Current session ID
   * @param state - Workflow state to persist
   * @returns Memory ID
   */
  addAgentMemory(
    agentId: string,
    sessionId: string,
    state: Record<string, any>
  ): Promise<string>;

  /**
   * Search agent memories (retrieve workflow state)
   * 
   * @param agentId - Unique agent identifier
   * @param query - Search query
   * @param limit - Max results to return (default: 3)
   * @returns Array of agent memories
   */
  searchAgentMemories(
    agentId: string,
    query: string,
    limit?: number
  ): Promise<MemorySearchResult[]>;

  /**
   * Get full agent state for a session
   * 
   * @param agentId - Unique agent identifier
   * @param sessionId - Session identifier
   * @returns Agent workflow state
   */
  getAgentState(
    agentId: string,
    sessionId: string
  ): Promise<Record<string, any> | null>;

  // ===== Session-Level Memories =====
  
  /**
   * Add temporary session context (auto-expires)
   * 
   * @param sessionId - Unique session identifier
   * @param message - Context message
   * @param ttl - Time-to-live in seconds (default: 3600)
   * @returns Memory ID
   */
  addSessionMemory(
    sessionId: string,
    message: string,
    ttl?: number
  ): Promise<string>;

  /**
   * Get full session context (for prompt injection)
   * 
   * @param sessionId - Unique session identifier
   * @returns Concatenated session context string
   */
  getSessionContext(
    sessionId: string
  ): Promise<string>;

  // ===== Admin/Utility Methods =====
  
  /**
   * Delete all memories for a user (GDPR compliance)
   * 
   * @param userId - Unique user identifier
   */
  deleteUserMemories(userId: string): Promise<void>;

  /**
   * Delete all session memories (cleanup)
   * 
   * @param sessionId - Session identifier
   */
  deleteSessionMemories(sessionId: string): Promise<void>;
}

/**
 * Memory provider interface (for swapping backends)
 */
export interface MemoryProvider {
  /** Provider name (e.g., 'mem0', 'llamaindex') */
  name: string;
  
  /** Initialize provider with configuration */
  initialize(config: any): Promise<void>;
  
  /** Store a memory */
  store(memory: Omit<Memory, 'id' | 'createdAt'>): Promise<string>;
  
  /** Search memories */
  search(owner: string, query: string, limit: number): Promise<MemorySearchResult[]>;
  
  /** Retrieve memories */
  retrieve(owner: string, filters?: Record<string, any>): Promise<Memory[]>;
  
  /** Delete memories */
  delete(owner: string): Promise<void>;
}
