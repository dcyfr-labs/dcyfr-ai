/**
 * DCYFR Memory implementation wrapping mem0 OSS client
 */

import type {
  DCYFRMemory,
  Memory,
  MemorySearchResult,
  MemoryContext,
} from './types.js';
import { getMemoryConfig } from './config.js';
import { getMem0Client, resetMem0Client as resetClient } from './mem0-client.js';

// Default limits for memory queries
const DEFAULTS = {
  USER_MEMORY_LIMIT: 100,
  AGENT_MEMORY_LIMIT: 50,
  SESSION_MEMORY_LIMIT: 30,
  CONSISTENCY_RETRIES: 4,
  CONSISTENCY_RETRY_DELAY_MS: 150,
  GET_ALL_QUERY: '*',
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * DCYFRMemory implementation using mem0 OSS as the backend
 */
export class DCYFRMemoryImpl implements DCYFRMemory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mem0ClientPromise: Promise<any> | null = null;

  /**
   * Lazy initialization of mem0 client
   */
  private async ensureInitialized() {
    if (!this.mem0ClientPromise) {
      const memoryConfig = getMemoryConfig();
      this.mem0ClientPromise = getMem0Client(memoryConfig);
    }
    return this.mem0ClientPromise;
  }

  /**
   * Retry semantic search briefly to smooth over vector index eventual consistency.
   */
  private async searchWithConsistencyRetries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    query: string,
    options: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    let result = await client.search(query, options);

    if (result.results.length > 0) {
      return result;
    }

    for (let attempt = 1; attempt <= DEFAULTS.CONSISTENCY_RETRIES; attempt++) {
      await sleep(DEFAULTS.CONSISTENCY_RETRY_DELAY_MS * attempt);
      result = await client.search(query, options);

      if (result.results.length > 0) {
        return result;
      }
    }

    return result;
  }

  // ============================================================================
  // User Memory Operations
  // ============================================================================

  /**
   * Add memory associated with a specific user
   */
  async addUserMemory(
    userId: string,
    message: string,
    context?: MemoryContext
  ): Promise<string> {
    try {
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

      const directId = result.results[0]?.id;
      if (directId) {
        return directId;
      }

      // Some providers may return empty add results until embeddings are fully indexed.
      try {
        const fallback = await this.searchWithConsistencyRetries(client, message, {
          userId,
          limit: 1,
        });

        return fallback.results[0]?.id || '';
      } catch {
        // Keep legacy behavior when add succeeded but no ID is returned.
        return '';
      }
    } catch (error) {
      throw new Error(`Failed to add user memory: ${(error as Error).message}`);
    }
  }

  /**
   * Search user memories using semantic search
   */
  async searchUserMemories(
    userId: string,
    query: string,
    limit: number = DEFAULTS.USER_MEMORY_LIMIT
  ): Promise<MemorySearchResult[]> {
    try {
      const client = await this.ensureInitialized();

      const result = await this.searchWithConsistencyRetries(client, query, {
        userId,
        limit,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result.results.map((item: any) => ({
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
    } catch (error) {
      throw new Error(`Failed to search user memories: ${(error as Error).message}`);
    }
  }

  /**
   * Get all memories for a user
   */
  async getUserMemories(userId: string, topic?: string): Promise<Memory[]> {
    try {
      const client = await this.ensureInitialized();

      const result = await client.search(DEFAULTS.GET_ALL_QUERY, {
        userId,
        limit: DEFAULTS.USER_MEMORY_LIMIT,
        filters: topic ? { topic } : undefined,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result.results.map((item: any) => ({
        id: item.id,
        content: item.memory,
        owner: userId,
        ownerType: 'user' as const,
        importance: item.metadata?.importance || 0.5,
        topic: item.metadata?.topic,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        metadata: item.metadata,
      }));
    } catch (error) {
      throw new Error(`Failed to get user memories: ${(error as Error).message}`);
    }
  }

  /**
   * Delete all memories for a user
   */
  async deleteUserMemories(userId: string): Promise<void> {
    try {
      const client = await this.ensureInitialized();
      await client.deleteAll({ userId });
    } catch (error) {
      throw new Error(`Failed to delete user memories: ${(error as Error).message}`);
    }
  }

  // ============================================================================
  // Agent Memory Operations
  // ============================================================================

  /**
   * Store agent workflow state
   */
  async addAgentMemory(
    agentId: string,
    sessionId: string,
    state: Record<string, unknown>
  ): Promise<string> {
    try {
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
    } catch (error) {
      throw new Error(`Failed to add agent memory: ${(error as Error).message}`);
    }
  }

  /**
   * Search agent memories
   */
  async searchAgentMemories(
    agentId: string,
    query: string,
    limit: number = DEFAULTS.AGENT_MEMORY_LIMIT
  ): Promise<MemorySearchResult[]> {
    try {
      const client = await this.ensureInitialized();

      const result = await client.search(query, {
        agentId,
        limit,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result.results.map((item: any) => ({
        id: item.id,
        content: item.memory,
        owner: item.metadata?.agentId || agentId,
        ownerType: 'agent' as const,
        relevance: item.score || 0.5,
        agentId: item.metadata?.agentId || agentId,
        sessionId: item.metadata?.sessionId,
        state: item.metadata?.state,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        metadata: item.metadata,
      }));
    } catch (error) {
      throw new Error(`Failed to search agent memories: ${(error as Error).message}`);
    }
  }

  /**
   * Get agent workflow state for a specific session
   */
  async getAgentState(
    agentId: string,
    sessionId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const client = await this.ensureInitialized();

      const result = await client.search(DEFAULTS.GET_ALL_QUERY, {
        agentId,
        runId: sessionId,
        limit: 1,
      });

      if (result.results.length === 0) {
        return null;
      }

      return result.results[0].metadata?.state || null;
    } catch (error) {
      throw new Error(`Failed to get agent state: ${(error as Error).message}`);
    }
  }

  // ============================================================================
  // Session Memory Operations
  // ============================================================================

  /**
   * Add temporary session context with TTL
   */
  async addSessionMemory(
    sessionId: string,
    message: string,
    ttl: number = 3600
  ): Promise<string> {
    try {
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
    } catch (error) {
      throw new Error(`Failed to add session memory: ${(error as Error).message}`);
    }
  }

  /**
   * Get concatenated session context (filters out expired memories)
   */
  async getSessionContext(sessionId: string): Promise<string> {
    try {
      const client = await this.ensureInitialized();

      const result = await client.search(DEFAULTS.GET_ALL_QUERY, {
        runId: sessionId,
        limit: DEFAULTS.SESSION_MEMORY_LIMIT,
      });

      const now = new Date();

      // Filter out expired memories
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const validMemories = result.results.filter((item: any) => {
        const expiresAt = item.metadata?.expiresAt;
        if (!expiresAt) return true; // No expiration = keep
        return new Date(expiresAt) > now;
      });

      // Concatenate all memory content
      return validMemories
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => item.memory)
        .join('\n\n');
    } catch (error) {
      throw new Error(`Failed to get session context: ${(error as Error).message}`);
    }
  }

  /**
   * Delete all memories for a session
   */
  async deleteSessionMemories(sessionId: string): Promise<void> {
    try {
      const client = await this.ensureInitialized();
      await client.deleteAll({ runId: sessionId });
    } catch (error) {
      throw new Error(`Failed to delete session memories: ${(error as Error).message}`);
    }
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let memoryInstance: DCYFRMemoryImpl | null = null;

/**
 * Get singleton DCYFRMemory instance
 */
export function getMemory(): DCYFRMemory {
  if (!memoryInstance) {
    memoryInstance = new DCYFRMemoryImpl();
  }
  return memoryInstance;
}

/**
 * Reset memory instance (for testing)
 */
export function resetMemory(): void {
  memoryInstance = null;
  resetClient();
}
