/**
 * DCYFR Memory Implementation
 * 
 * Concrete implementation of DCYFRMemory interface using mem0 OSS as backend.
 * Provides user, agent, and session memory with vector search capabilities.
 * 
 * @module @dcyfr/ai/memory/dcyfr-memory
 */

import type {
  DCYFRMemory,
  Memory,
  MemorySearchResult,
  MemoryContext,
} from './types.js';
import type { Mem0Client } from './mem0-client.js';
import { getMem0Client } from './mem0-client.js';
import { getMemoryConfig } from './config.js';

/**
 * Default configuration for memory operations
 */
const DEFAULTS = {
  USER_MEMORY_LIMIT: 3,
  AGENT_MEMORY_LIMIT: 3,
  SESSION_TTL: 3600, // 1 hour in seconds
};

/**
 * DCYFR Memory implementation using mem0 OSS
 * 
 * Wraps mem0 OSS client to provide consistent API for DCYFR applications.
 * Handles user preferences, agent state, and temporary session context.
 */
export class DCYFRMemoryImpl implements DCYFRMemory {
  private client: Mem0Client | null = null;
  private initialized = false;

  constructor() {}

  /**
   * Lazy initialization of mem0 client
   * Called automatically on first operation
   */
  private async ensureInitialized(): Promise<Mem0Client> {
    if (this.client && this.initialized) {
      return this.client;
    }

    const config = getMemoryConfig();
    this.client = await getMem0Client(config);
    this.initialized = true;
    return this.client;
  }

  // ===== User-Level Memories =====

  async addUserMemory(
    userId: string,
    message: string,
    context?: MemoryContext
  ): Promise<string> {
    const client = await this.ensureInitialized();

    const result = await client.add(message, {
      userId,
      metadata: {
        ownerType: 'user',
        topic: context?.topic,
        importance: context?.importance || 0.5,
        ...context?.metadata,
      },
    });

    return result.results[0]?.id || '';
  }

  async searchUserMemories(
    userId: string,
    query: string,
    limit: number = DEFAULTS.USER_MEMORY_LIMIT
  ): Promise<MemorySearchResult[]> {
    const client = await this.ensureInitialized();

    const result = await client.search(query, {
      userId,
      limit,
    });

    return result.results.map(item => ({
      id: item.id,
      content: item.memory,
      owner: userId,
      ownerType: 'user' as const,
      importance: item.metadata?.importance || 0.5,
      topic: item.metadata?.topic,
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      metadata: item.metadata,
      relevance: item.score || 1.0,
    }));
  }

  async getUserMemories(
    userId: string,
    topic?: string
  ): Promise<Memory[]> {
    const client = await this.ensureInitialized();

    // Search with empty query to get all memories
    const result = await client.search('', {
      userId,
      limit: 100,
      filters: topic ? { topic } : undefined,
    });

    return result.results.map(item => ({
      id: item.id,
      content: item.memory,
      owner: userId,
      ownerType: 'user' as const,
      importance: item.metadata?.importance || 0.5,
      topic: item.metadata?.topic,
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      metadata: item.metadata,
    }));
  }

  // ===== Agent-Level Memories =====

  async addAgentMemory(
    agentId: string,
    sessionId: string,
    state: Record<string, any>
  ): Promise<string> {
    const client = await this.ensureInitialized();

    const message = `Agent state: ${JSON.stringify(state)}`;

    const result = await client.add(message, {
      agentId,
      runId: sessionId,
      metadata: {
        ownerType: 'agent',
        agentId,
        sessionId,
        state,
      },
    });

    return result.results[0]?.id || '';
  }

  async searchAgentMemories(
    agentId: string,
    query: string,
    limit: number = DEFAULTS.AGENT_MEMORY_LIMIT
  ): Promise<MemorySearchResult[]> {
    const client = await this.ensureInitialized();

    const result = await client.search(query, {
      agentId,
      limit,
    });

    return result.results.map(item => ({
      id: item.id,
      content: item.memory,
      owner: agentId,
      ownerType: 'agent' as const,
      agentId,
      sessionId: item.metadata?.sessionId || '',
      state: item.metadata?.state,
      importance: item.metadata?.importance || 0.5,
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      metadata: item.metadata,
      relevance: item.score || 1.0,
    })) as MemorySearchResult[];
  }

  async getAgentState(
    agentId: string,
    sessionId: string
  ): Promise<Record<string, any> | null> {
    const client = await this.ensureInitialized();

    const result = await client.search('', {
      agentId,
      runId: sessionId,
      limit: 1,
    });

    if (result.results.length === 0) {
      return null;
    }

    return result.results[0].metadata?.state || null;
  }

  // ===== Session-Level Memories =====

  async addSessionMemory(
    sessionId: string,
    message: string,
    ttl: number = DEFAULTS.SESSION_TTL
  ): Promise<string> {
    const client = await this.ensureInitialized();

    const expiresAt = new Date(Date.now() + ttl * 1000);

    const result = await client.add(message, {
      runId: sessionId,
      metadata: {
        ownerType: 'session',
        sessionId,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return result.results[0]?.id || '';
  }

  async getSessionContext(sessionId: string): Promise<string> {
    const client = await this.ensureInitialized();

    const result = await client.search('', {
      runId: sessionId,
      limit: 50,
    });

    // Filter out expired memories
    const now = new Date();
    const validMemories = result.results.filter(item => {
      if (item.metadata?.expiresAt) {
        const expiresAt = new Date(item.metadata.expiresAt);
        return expiresAt > now;
      }
      return true; // No expiration = keep
    });

    // Concatenate all memory content
    return validMemories
      .map(item => item.memory)
      .join('\n\n');
  }

  // ===== Admin/Utility Methods =====

  async deleteUserMemories(userId: string): Promise<void> {
    const client = await this.ensureInitialized();
    await client.deleteAll({ userId });
  }

  async deleteSessionMemories(sessionId: string): Promise<void> {
    const client = await this.ensureInitialized();
    await client.deleteAll({ runId: sessionId });
  }
}

/**
 * Singleton instance of DCYFRMemory
 */
let memoryInstance: DCYFRMemory | null = null;

/**
 * Get or create DCYFRMemory singleton
 * 
 * @returns DCYFRMemory instance
 */
export function getMemory(): DCYFRMemory {
  if (!memoryInstance) {
    memoryInstance = new DCYFRMemoryImpl();
  }
  return memoryInstance;
}

/**
 * Reset memory singleton (for testing)
 */
export function resetMemory(): void {
  memoryInstance = null;
}
