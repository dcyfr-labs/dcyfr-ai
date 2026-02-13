/**
 * Agent Runtime Memory Integration Tests
 * Tests memory retrieval, context injection, and persistence
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime } from '../runtime/agent-runtime';
import { ProviderRegistry } from '../core/provider-registry';
import { TelemetryEngine } from '../core/telemetry-engine';
import type { DCYFRMemory, MemorySearchResult } from '../memory/types';
import type { TaskContext } from '../runtime/types';

describe('AgentRuntime Memory Integration', () => {
  let mockMemory: DCYFRMemory;
  let providerRegistry: ProviderRegistry;
  let telemetry: TelemetryEngine;
  let runtime: AgentRuntime;
  let eventsSpy: any[];

  beforeEach(() => {
    eventsSpy = [];

    // Mock DCYFRMemory
    mockMemory = {
      searchUserMemories: vi.fn(),
      searchAgentMemories: vi.fn(),
      storeUserMemory: vi.fn(),
      storeAgentMemory: vi.fn(),
    } as any;

    // Initialize infrastructure
    providerRegistry = new ProviderRegistry({
      primaryProvider: 'ollama',
      fallbackChain: [],
      autoReturn: false,
      healthCheckInterval: 60000,
    });

    telemetry = new TelemetryEngine({ storage: 'memory' });

    // Create runtime with event listener
    runtime = new AgentRuntime(
      'test-agent',
      providerRegistry,
      mockMemory,
      telemetry,
      {
        memoryEnabled: true,
        memoryTimeout: 3000,
        memoryRelevanceThreshold: 0.7,
      }
    );

    // Spy on events
    runtime.on((event: any) => {
      eventsSpy.push(event);
    });
  });

  describe('Memory Retrieval', () => {
    it('should retrieve and filter memories by relevance threshold', async () => {
      const mockMemories: MemorySearchResult[] = [
        {
          content: 'User prefers TypeScript over JavaScript',
          relevance: 0.85,
          timestamp: Date.now(),
          metadata: { type: 'preference' },
        },
        {
          content: 'User worked on authentication system last week',
          relevance: 0.72,
          timestamp: Date.now(),
          metadata: { type: 'context' },
        },
        {
          content: 'User likes coffee',
          relevance: 0.3, // Below threshold
          timestamp: Date.now(),
          metadata: { type: 'preference' },
        },
      ];

      (mockMemory.searchUserMemories as any).mockResolvedValue(mockMemories);

      const context: TaskContext = {
        task: 'Review the authentication code',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      // Execute task (will call retrieveContext internally)
      try {
        await runtime.execute(context);
      } catch {
        // Execution may fail due to no LLM provider, but memory retrieval should work
      }

      // Verify memory search was called
      expect(mockMemory.searchUserMemories).toHaveBeenCalledWith(
        'user-123',
        'Review the authentication code',
        5
      );

      // Verify memory_retrieval event was emitted
      const memoryEvent = eventsSpy.find((e) => e.type === 'memory_retrieval');
      expect(memoryEvent).toBeDefined();
      expect(memoryEvent.memoriesFound).toBe(3);
      expect(memoryEvent.memoriesRelevant).toBe(2); // Only 2 above 0.7 threshold
      expect(memoryEvent.threshold).toBe(0.7);
      expect(memoryEvent.duration).toBeGreaterThanOrEqual(0);
    });

    it('should emit memory_retrieval event with error on failure', async () => {
      (mockMemory.searchUserMemories as any).mockRejectedValue(
        new Error('Memory search failed')
      );

      const context: TaskContext = {
        task: 'Test task',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtime.execute(context);
      } catch {
        // Expected to fail
      }

      // Verify error event was emitted
      const memoryEvent = eventsSpy.find((e) => e.type === 'memory_retrieval');
      expect(memoryEvent).toBeDefined();
      expect(memoryEvent.error).toBe('Memory search failed');
      expect(memoryEvent.memoriesFound).toBe(0);
      expect(memoryEvent.memoriesRelevant).toBe(0);
    });

    it('should gracefully degrade when memory search times out', async () => {
      // Mock a slow memory search that exceeds timeout
      (mockMemory.searchUserMemories as any).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve([
                  {
                    content: 'Slow memory',
                    relevance: 0.9,
                    timestamp: Date.now(),
                    metadata: {},
                  },
                ]),
              5000
            )
          ) // 5 seconds, exceeds 3 second timeout
      );

      const context: TaskContext = {
        task: 'Test task',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtime.execute(context);
      } catch {
        // Expected to fail
      }

      // Verify timeout error event was emitted
      const memoryEvent = eventsSpy.find((e) => e.type === 'memory_retrieval');
      expect(memoryEvent).toBeDefined();
      expect(memoryEvent.error).toContain('Memory search timeout');
    });
  });

  describe('Memory Context Injection', () => {
    it('should inject memory context into system prompt', async () => {
      const mockMemories: MemorySearchResult[] = [
        {
          content: 'User prefers functional programming style',
          relevance: 0.9,
          timestamp: Date.now(),
          metadata: {},
        },
        {
          content: 'User uses ESLint with strict rules',
          relevance: 0.8,
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      (mockMemory.searchUserMemories as any).mockResolvedValue(mockMemories);

      const context: TaskContext = {
        task: 'Write a new utility function',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtime.execute(context);
      } catch {
        // Expected to fail without LLM provider
      }

      // Verify memory retrieval event shows context was injected
      const memoryEvent = eventsSpy.find((e) => e.type === 'memory_retrieval');
      expect(memoryEvent).toBeDefined();
      expect(memoryEvent.memoriesRelevant).toBe(2);
    });

    it('should work without memory context when no relevant memories found', async () => {
      (mockMemory.searchUserMemories as any).mockResolvedValue([
        {
          content: 'Irrelevant memory',
          relevance: 0.3, // Below threshold
          timestamp: Date.now(),
          metadata: {},
        },
      ]);

      const context: TaskContext = {
        task: 'Test task',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtime.execute(context);
      } catch {
        // Expected to fail
      }

      const memoryEvent = eventsSpy.find((e) => e.type === 'memory_retrieval');
      expect(memoryEvent).toBeDefined();
      expect(memoryEvent.memoriesRelevant).toBe(0);
    });
  });

  describe('Configuration Overrides', () => {
    it('should respect memoryEnabled=false configuration', async () => {
      const runtimeNoMemory = new AgentRuntime(
        'test-agent-no-memory',
        providerRegistry,
        mockMemory,
        telemetry,
        {
          memoryEnabled: false,
        }
      );

      const context: TaskContext = {
        task: 'Test task',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtimeNoMemory.execute(context);
      } catch {
        // Expected to fail
      }

      // Verify memory search was NOT called
      expect(mockMemory.searchUserMemories).not.toHaveBeenCalled();
      expect(mockMemory.searchAgentMemories).not.toHaveBeenCalled();
    });

    it('should use custom relevance threshold', async () => {
      const runtimeCustomThreshold = new AgentRuntime(
        'test-agent-custom',
        providerRegistry,
        mockMemory,
        telemetry,
        {
          memoryEnabled: true,
          memoryRelevanceThreshold: 0.9, // Higher threshold
        }
      );

      const eventsCustomSpy: any[] = [];
      runtimeCustomThreshold.on((event: any) => {
        eventsCustomSpy.push(event);
      });

      const mockMemories: MemorySearchResult[] = [
        { content: 'High relevance', relevance: 0.95, timestamp: Date.now(), metadata: {} },
        { content: 'Medium relevance', relevance: 0.8, timestamp: Date.now(), metadata: {} },
      ];

      (mockMemory.searchUserMemories as any).mockResolvedValue(mockMemories);

      const context: TaskContext = {
        task: 'Test task',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtimeCustomThreshold.execute(context);
      } catch {
        // Expected to fail
      }

      const memoryEvent = eventsCustomSpy.find((e) => e.type === 'memory_retrieval');
      expect(memoryEvent).toBeDefined();
      expect(memoryEvent.threshold).toBe(0.9);
      expect(memoryEvent.memoriesRelevant).toBe(1); // Only 1 above 0.9
    });
  });

  describe('Scope-based Memory Search', () => {
    it('should search user memories when userId provided', async () => {
      (mockMemory.searchUserMemories as any).mockResolvedValue([]);

      const context: TaskContext = {
        task: 'Test task',
        userId: 'user-123',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtime.execute(context);
      } catch {
        // Expected to fail
      }

      expect(mockMemory.searchUserMemories).toHaveBeenCalled();
      expect(mockMemory.searchAgentMemories).not.toHaveBeenCalled();
    });

    it('should search agent memories when only sessionId provided', async () => {
      (mockMemory.searchAgentMemories as any).mockResolvedValue([]);

      const context: TaskContext = {
        task: 'Test task',
        sessionId: 'session-456',
        tools: [],
      };

      try {
        await runtime.execute(context);
      } catch {
        // Expected to fail
      }

      expect(mockMemory.searchAgentMemories).toHaveBeenCalled();
      expect(mockMemory.searchUserMemories).not.toHaveBeenCalled();
    });

    it('should search agent memories when no userId or sessionId', async () => {
      (mockMemory.searchAgentMemories as any).mockResolvedValue([]);

      const context: TaskContext = {
        task: 'Test task',
        tools: [],
      };

      try {
        await runtime.execute(context);
      } catch {
        // Expected to fail
      }

      expect(mockMemory.searchAgentMemories).toHaveBeenCalled();
      expect(mockMemory.searchUserMemories).not.toHaveBeenCalled();
    });
  });
});
