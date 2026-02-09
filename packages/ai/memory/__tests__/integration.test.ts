/**
 * Integration tests for memory module
 * Tests the full flow with mocked mem0 client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mockClient at module level so it can be shared
const mockClient = {
  add: vi.fn(),
  search: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteAll: vi.fn(),
};

// Mock the entire mem0-client module
vi.mock('../mem0-client.js', () => ({
  getMem0Client: vi.fn(() => Promise.resolve(mockClient)),
  resetMem0Client: vi.fn(),
  createMem0Client: vi.fn(() => Promise.resolve(mockClient)),
}));

// Mock config module
vi.mock('../config.js', () => ({
  getMemoryConfig: vi.fn(() => ({
    vectorDB: {
      provider: 'qdrant',
      url: 'http://localhost:6333',
      index: 'test_memories',
    },
    llm: {
      provider: 'openai',
      apiKey: 'sk-test-key',
      model: 'gpt-4',
      embeddingModel: 'text-embedding-3-small',
    },
  })),
}));

// Import after mocks are set up
const { getMemory, resetMemory } = await import('../dcyfr-memory.js');

describe('Memory Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.add.mockClear();
    mockClient.search.mockClear();
    mockClient.deleteAll.mockClear();
    resetMemory();
  });

  describe('User Memory Flow', () => {
    it('adds, searches, and retrieves user memories', async () => {
      const memory = getMemory();

      // Mock add response
      mockClient.add.mockResolvedValue({
        results: [{
          id: 'mem-123',
          memory: 'I prefer TypeScript',
          createdAt: new Date().toISOString(),
          metadata: { ownerType: 'user', topic: 'preferences' },
        }],
      });

      // Add memory
      const memoryId = await memory.addUserMemory(
        'user123',
        'I prefer TypeScript',
        { topic: 'preferences', importance: 0.8 }
      );

      expect(memoryId).toBe('mem-123');
      expect(mockClient.add).toHaveBeenCalledWith('I prefer TypeScript', {
        userId: 'user123',
        metadata: expect.objectContaining({
          ownerType: 'user',
          topic: 'preferences',
          importance: 0.8,
        }),
      });

      // Mock search response
      mockClient.search.mockResolvedValue({
        results: [{
          id: 'mem-123',
          memory: 'I prefer TypeScript',
          score: 0.95,
          createdAt: new Date().toISOString(),
          metadata: { ownerType: 'user', topic: 'preferences' },
        }],
      });

      // Search memories
      const results = await memory.searchUserMemories('user123', 'programming');

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('I prefer TypeScript');
      expect(results[0].relevance).toBe(0.95);
    });

    it('deletes user memories successfully', async () => {
      const memory = getMemory();

      mockClient.deleteAll.mockResolvedValue({ message: 'Deleted' });

      await memory.deleteUserMemories('user123');

      expect(mockClient.deleteAll).toHaveBeenCalledWith({ userId: 'user123' });
    });
  });

  describe('Agent Memory Flow', () => {
    it('stores and retrieves agent workflow state', async () => {
      const memory = getMemory();

      // Mock add response
      mockClient.add.mockResolvedValue({
        results: [{
          id: 'agent-mem-1',
          memory: 'Agent state: {...}',
          createdAt: new Date().toISOString(),
          metadata: {
            ownerType: 'agent',
            agentId: 'code-reviewer',
            sessionId: 'session-123',
            state: { currentFile: 'app.ts', progress: 0.5 },
          },
        }],
      });

      // Add agent memory
      const memoryId = await memory.addAgentMemory(
        'code-reviewer',
        'session-123',
        { currentFile: 'app.ts', progress: 0.5 }
      );

      expect(memoryId).toBe('agent-mem-1');

      // Mock search for getAgentState
      mockClient.search.mockResolvedValue({
        results: [{
          id: 'agent-mem-1',
          memory: 'State',
          metadata: {
            state: { currentFile: 'app.ts', progress: 0.5 },
          },
        }],
      });

      // Retrieve agent state
      const state = await memory.getAgentState('code-reviewer', 'session-123');

      expect(state).toEqual({ currentFile: 'app.ts', progress: 0.5 });
    });
  });

  describe('Session Memory Flow', () => {
    it('manages session context with TTL', async () => {
      const memory = getMemory();

      const futureTime = new Date(Date.now() + 3600000).toISOString();

      // Mock add response
      mockClient.add.mockResolvedValue({
        results: [{
          id: 'session-mem-1',
          memory: 'Current debug context',
          metadata: {
            ownerType: 'session',
            sessionId: 'session-123',
            expiresAt: futureTime,
          },
        }],
      });

      // Add session memory
      await memory.addSessionMemory('session-123', 'Current debug context', 3600);

      // Mock search response
      mockClient.search.mockResolvedValue({
        results: [
          {
            id: 'session-1',
            memory: 'Context 1',
            metadata: { expiresAt: futureTime },
          },
          {
            id: 'session-2',
            memory: 'Context 2',
            metadata: { expiresAt: futureTime },
          },
        ],
      });

      // Get session context
      const context = await memory.getSessionContext('session-123');

      expect(context).toBe('Context 1\n\nContext 2');
    });

    it('filters out expired session memories', async () => {
      const memory = getMemory();

      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const futureTime = new Date(Date.now() + 3600000).toISOString();

      mockClient.search.mockResolvedValue({
        results: [
          {
            id: 'session-1',
            memory: 'Valid context',
            metadata: { expiresAt: futureTime },
          },
          {
            id: 'session-2',
            memory: 'Expired context',
            metadata: { expiresAt: pastTime },
          },
        ],
      });

      const context = await memory.getSessionContext('session-123');

      expect(context).toBe('Valid context');
      expect(context).not.toContain('Expired');
    });
  });

  describe('Error Handling', () => {
    it('throws error on add failure', async () => {
      const memory = getMemory();

      mockClient.add.mockRejectedValue(new Error('API timeout'));

      await expect(
        memory.addUserMemory('user123', 'test')
      ).rejects.toThrow('Failed to add user memory');
    });

    it('throws error on search failure', async () => {
      const memory = getMemory();

      mockClient.search.mockRejectedValue(new Error('Search failed'));

      await expect(
        memory.searchUserMemories('user123', 'test')
      ).rejects.toThrow('Failed to search user memories');
    });

    it('throws error on delete failure', async () => {
      const memory = getMemory();

      mockClient.deleteAll.mockRejectedValue(new Error('Delete failed'));

      await expect(
        memory.deleteUserMemories('user123')
      ).rejects.toThrow('Failed to delete user memories');
    });
  });

  describe('Singleton Pattern', () => {
    it('returns same instance on repeated calls', () => {
      const instance1 = getMemory();
      const instance2 = getMemory();

      expect(instance1).toBe(instance2);
    });

    it('resets singleton correctly', () => {
      const instance1 = getMemory();
      resetMemory();
      const instance2 = getMemory();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Edge Cases', () => {
    it('handles missing memory ID in add result', async () => {
      const memory = getMemory();

      mockClient.add.mockResolvedValue({ results: [] });

      const memoryId = await memory.addUserMemory('user123', 'test');

      expect(memoryId).toBe('');
    });

    it('returns empty array when no memories found', async () => {
      const memory = getMemory();

      mockClient.search.mockResolvedValue({ results: [] });

      const results = await memory.searchUserMemories('user123', 'test');

      expect(results).toHaveLength(0);
    });

    it('returns null when agent state not found', async () => {
      const memory = getMemory();

      mockClient.search.mockResolvedValue({ results: [] });

      const state = await memory.getAgentState('agent123', 'session123');

      expect(state).toBeNull();
    });

    it('handles memories without metadata gracefully', async () => {
      const memory = getMemory();

      mockClient.search.mockResolvedValue({
        results: [{
          id: 'mem-1',
          memory: 'Test memory',
          score: 0.9,
        }],
      });

      const results = await memory.searchUserMemories('user123', 'test');

      expect(results[0].importance).toBe(0.5); // Default value
      expect(results[0].relevance).toBe(0.9);
    });

    it('getUserMemories with topic filter', async () => {
      const memory = getMemory();

      mockClient.search.mockResolvedValue({
        results: [{
          id: 'mem-1',
          memory: 'TypeScript memory',
          metadata: { topic: 'coding' },
        }],
      });

      const memories = await memory.getUserMemories('user123', 'coding');

      expect(memories).toHaveLength(1);
      expect(mockClient.search).toHaveBeenCalledWith('', {
        userId: 'user123',
        limit: 100,
        filters: { topic: 'coding' },
      });
    });

    it('searchAgentMemories returns correct structure', async () => {
      const memory = getMemory();

      mockClient.search.mockResolvedValue({
        results: [{
          id: 'agent-mem-1',
          memory: 'Agent memory',
          metadata: {
            agentId: 'test-agent',
            sessionId: 'sess-1',
            state: { step: 1 },
          },
        }],
      });

      const results = await memory.searchAgentMemories('test-agent', 'query');

      expect(results).toHaveLength(1);
      expect(results[0].agentId).toBe('test-agent');
      expect(results[0].sessionId).toBe('sess-1');
      expect(results[0].state).toEqual({ step: 1 });
    });

    it('deleteSessionMemories calls correct API', async () => {
      const memory = getMemory();

      mockClient.deleteAll.mockResolvedValue({ message: 'Deleted' });

      await memory.deleteSessionMemories('session-123');

      expect(mockClient.deleteAll).toHaveBeenCalledWith({ runId: 'session-123' });
    });

    it('getUserMemories without filter', async () => {
      const memory = getMemory();

      mockClient.search.mockResolvedValue({
        results: [
          {
            id: 'mem-1',
            memory: 'Memory 1',
            metadata: { topic: 'coding' },
          },
          {
            id: 'mem-2',
            memory: 'Memory 2',
            metadata: { topic: 'design' },
          },
        ],
      });

      const memories = await memory.getUserMemories('user123');

      expect(memories).toHaveLength(2);
      expect(mockClient.search).toHaveBeenCalledWith('', {
        userId: 'user123',
        limit: 100,
        filters: undefined,
      });
    });

    it('throws error on agent state retrieval failure', async () => {
      const memory = getMemory();

      mockClient.search.mockRejectedValue(new Error('Network error'));

      await expect(
        memory.getAgentState('agent123', 'session123')
      ).rejects.toThrow('Failed to get agent state');
    });

    it('throws error on add agent memory failure', async () => {
      const memory = getMemory();

      mockClient.add.mockRejectedValue(new Error('API Error'));

      await expect(
        memory.addAgentMemory('agent123', 'session123', { state: 1 })
      ).rejects.toThrow('Failed to add agent memory');
    });

    it('throws error on search agent memories failure', async () => {
      const memory = getMemory();

      mockClient.search.mockRejectedValue(new Error('Search error'));

      await expect(
        memory.searchAgentMemories('agent123', 'query')
      ).rejects.toThrow('Failed to search agent memories');
    });

    it('throws error on add session memory failure', async () => {
      const memory = getMemory();

      mockClient.add.mockRejectedValue(new Error('Add failed'));

      await expect(
        memory.addSessionMemory('session123', 'context')
      ).rejects.toThrow('Failed to add session memory');
    });

    it('throws error on get session context failure', async () => {
      const memory = getMemory();

      mockClient.search.mockRejectedValue(new Error('Context error'));

      await expect(
        memory.getSessionContext('session123')
      ).rejects.toThrow('Failed to get session context');
    });

    it('throws error on getUserMemories failure', async () => {
      const memory = getMemory();

      mockClient.search.mockRejectedValue(new Error('Get failed'));

      await expect(
        memory.getUserMemories('user123')
      ).rejects.toThrow('Failed to get user memories');
    });

    it('getAgentState returns null for missing metadata state', async () => {
      const memory = getMemory();

      mockClient.search.mockResolvedValue({
        results: [{
          id: 'agent-mem-1',
          memory: 'Agent memory without state',
          metadata: {},
        }],
      });

      const state = await memory.getAgentState('agent123', 'session123');

      expect(state).toBeNull();
    });
  });
});
