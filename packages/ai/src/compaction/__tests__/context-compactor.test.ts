/**
 * ContextCompactor Tests
 *
 * Tests for the context compaction system with pre-flush summarization.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ContextCompactor,
  type AgentContext,
  type ContextMessage,
} from '../context-compactor.js';
import type { DCYFRMemory } from '../../../memory/types.js';

// Mock memory adapter
function createMockMemory(): DCYFRMemory {
  return {
    addUserMemory: vi.fn().mockResolvedValue(undefined),
    searchUserMemories: vi.fn().mockResolvedValue([]),
    getUserMemories: vi.fn().mockResolvedValue([]),
    addAgentMemory: vi.fn().mockResolvedValue(undefined),
    searchAgentMemories: vi.fn().mockResolvedValue([]),
    getAgentState: vi.fn().mockResolvedValue(undefined),
    addSessionMemory: vi.fn().mockResolvedValue(undefined),
    getSessionContext: vi.fn().mockResolvedValue([]),
    deleteUserMemories: vi.fn().mockResolvedValue(0),
    deleteSessionMemories: vi.fn().mockResolvedValue(0),
  };
}

// Create test context with many messages to simulate high token usage
function createLargeContext(messageCount: number): AgentContext {
  const messages: ContextMessage[] = [];
  for (let i = 0; i < messageCount; i++) {
    messages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i + 1}: ${'x'.repeat(500)}`, // ~125 tokens each
    });
  }
  return {
    messages,
    systemPrompt: 'You are a helpful assistant.',
  };
}

// Create small test context
function createSmallContext(): AgentContext {
  return {
    messages: [
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there! How can I help?' },
      { role: 'user', content: 'Tell me about TypeScript.' },
      { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
    ],
    systemPrompt: 'You are a helpful assistant.',
  };
}

// Create JSON response for mock LLM
function createMockLLMResponse(): string {
  return JSON.stringify({
    facts: ['User asked about TypeScript', 'We discussed typing'],
    decisions: ['Will use strict mode'],
    outstandingQuestions: ['Which framework to use?'],
    summary: 'We discussed TypeScript configuration.',
  });
}

describe('ContextCompactor', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const compactor = new ContextCompactor();
      expect(compactor).toBeDefined();
    });

    it('should accept custom config', () => {
      const memory = createMockMemory();
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({
        memory,
        llmCall,
        threshold: 0.8,
        preserveRecentTurns: 3,
        maxSummaryTokens: 300,
        debug: true,
      });
      expect(compactor).toBeDefined();
    });
  });

  describe('calculateUtilization', () => {
    it('should calculate utilization for small context', () => {
      const compactor = new ContextCompactor();
      const context = createSmallContext();
      const util = compactor.calculateUtilization(context);

      expect(util.totalTokens).toBeGreaterThan(0);
      expect(util.windowSize).toBe(128000); // Default
      expect(util.utilization).toBeLessThan(0.1); // Small context = low utilization
      expect(util.shouldCompact).toBe(false);
    });

    it('should calculate breakdown by component', () => {
      const compactor = new ContextCompactor();
      const context: AgentContext = {
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: 'System prompt here',
        skills: 'Skill 1, Skill 2',
        memories: 'Memory 1, Memory 2',
        toolResults: 'Tool result',
      };
      const util = compactor.calculateUtilization(context);

      expect(util.breakdown.systemPrompt).toBeGreaterThan(0);
      expect(util.breakdown.skills).toBeGreaterThan(0);
      expect(util.breakdown.memories).toBeGreaterThan(0);
      expect(util.breakdown.conversation).toBeGreaterThan(0);
      expect(util.breakdown.toolResults).toBeGreaterThan(0);
    });

    it('should indicate shouldCompact when above threshold', () => {
      // Use very low threshold so even small context triggers
      const compactor = new ContextCompactor({ threshold: 0.00001 });
      const context = createSmallContext();
      const util = compactor.calculateUtilization(context);

      expect(util.shouldCompact).toBe(true);
    });

    it('should estimate savings', () => {
      const compactor = new ContextCompactor({ preserveRecentTurns: 2 });
      const context = createLargeContext(20); // 20 messages
      const util = compactor.calculateUtilization(context);

      expect(util.estimatedSavings).toBeGreaterThan(0);
    });
  });

  describe('preFlush', () => {
    it('should return null when no llmCall configured', async () => {
      const compactor = new ContextCompactor();
      const context = createSmallContext();
      const summary = await compactor.preFlush(context);

      expect(summary).toBeNull();
    });

    it('should generate summary using LLM', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({ llmCall });
      const context = createSmallContext();

      const summary = await compactor.preFlush(context);

      expect(summary).not.toBeNull();
      expect(summary!.summary).toContain('TypeScript');
      expect(summary!.facts).toContain('User asked about TypeScript');
      expect(summary!.decisions).toContain('Will use strict mode');
      expect(llmCall).toHaveBeenCalled();
    });

    it('should persist summary to memory', async () => {
      const memory = createMockMemory();
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({ memory, llmCall });
      const context = createSmallContext();

      await compactor.preFlush(context);

      expect(memory.addAgentMemory).toHaveBeenCalledWith(
        'context-compactor',
        expect.stringContaining('preflush-'),
        expect.objectContaining({ type: 'preFlushSummary' }),
      );
    });

    it('should handle LLM errors gracefully', async () => {
      const llmCall = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
      const compactor = new ContextCompactor({ llmCall });
      const context = createSmallContext();

      const summary = await compactor.preFlush(context);

      // Should return null on error (graceful degradation)
      expect(summary).toBeNull();
      expect(compactor.isPreFlushRetryPending()).toBe(true);
    });

    it('should parse non-JSON response as summary', async () => {
      const llmCall = vi.fn().mockResolvedValue('This is a plain text summary.');
      const compactor = new ContextCompactor({ llmCall });
      const context = createSmallContext();

      const summary = await compactor.preFlush(context);

      expect(summary).not.toBeNull();
      expect(summary!.summary).toBe('This is a plain text summary.');
      expect(summary!.facts).toEqual([]);
      expect(summary!.decisions).toEqual([]);
    });

    it('should record original turn count', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({ llmCall });
      const context = createSmallContext(); // 4 messages

      const summary = await compactor.preFlush(context);

      expect(summary!.originalTurnCount).toBe(4);
    });
  });

  describe('compact', () => {
    it('should not compact when below threshold', async () => {
      const compactor = new ContextCompactor({ threshold: 0.9 });
      const context = createSmallContext();

      const result = await compactor.compact(context);

      expect(result.compacted).toBe(false);
      expect(result.tokensSaved).toBe(0);
    });

    it('should compact when above threshold', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      // Use very low threshold to force compaction
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
        preserveRecentTurns: 2,
      });
      const context = createLargeContext(20); // 20 messages
      const originalLength = context.messages.length;

      const result = await compactor.compact(context);

      expect(result.compacted).toBe(true);
      expect(result.tokensSaved).toBeGreaterThan(0);
      // Context is modified in place
      expect(context.messages.length).toBeLessThan(originalLength);
    });

    it('should preserve recent turns', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
        preserveRecentTurns: 3,
      });
      const context = createLargeContext(20);
      // Mark the last 3 messages for identification
      context.messages[17].content = 'PRESERVED_1';
      context.messages[18].content = 'PRESERVED_2';
      context.messages[19].content = 'PRESERVED_3';

      await compactor.compact(context);

      // Last 3 messages should be preserved
      const preserved = context.messages.filter(m =>
        m.content.startsWith('PRESERVED_'),
      );
      expect(preserved.length).toBe(3);
    });

    it('should inject summary message', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
        preserveRecentTurns: 2,
      });
      const context = createLargeContext(10);

      const result = await compactor.compact(context);

      expect(result.preFlushSummary).toBeDefined();
      // First message should be the summary injection
      expect(context.messages[0].content).toContain('Previous Context Summary');
    });

    it('should include pre-flush summary in result', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
      });
      const context = createLargeContext(10);

      const result = await compactor.compact(context);

      expect(result.preFlushSummary).toBeDefined();
      expect(result.preFlushSummary!.summary).toContain('TypeScript');
    });

    it('should defer compaction when pre-flush fails', async () => {
      const llmCall = vi.fn().mockRejectedValue(new Error('LLM error'));
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
      });
      const context = createLargeContext(10);

      const result = await compactor.compact(context);

      expect(result.compacted).toBe(false);
      expect(result.error).toContain('Pre-flush failed');
    });

    it('should use last successful summary on retry', async () => {
      const llmCall = vi.fn()
        .mockResolvedValueOnce(createMockLLMResponse())
        .mockRejectedValueOnce(new Error('LLM error'));

      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
        preserveRecentTurns: 2,
      });

      // First call succeeds
      const context1 = createLargeContext(10);
      await compactor.compact(context1);

      // Clear retry flag for second attempt
      compactor.clearPreFlushRetryPending();

      // Second call fails but should use cached summary
      const context2 = createLargeContext(10);
      const result2 = await compactor.compact(context2);

      // Should still compact using cached summary
      expect(result2.compacted).toBe(true);
    });
  });

  describe('executeAsHook', () => {
    it('should return context unchanged when below threshold', async () => {
      const compactor = new ContextCompactor({ threshold: 0.9 });
      const context = createSmallContext();
      const originalMessages = [...context.messages];

      const result = await compactor.executeAsHook(context);

      expect(result).toBe(context);
      expect(result.messages).toEqual(originalMessages);
    });

    it('should compact and return modified context when above threshold', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
        preserveRecentTurns: 2,
      });
      const context = createLargeContext(20);
      const originalLength = context.messages.length;

      const result = await compactor.executeAsHook(context);

      expect(result).toBe(context); // Same object reference
      expect(result.messages.length).toBeLessThan(originalLength);
    });
  });

  describe('lifecycle methods', () => {
    it('should return last pre-flush summary', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({ llmCall });
      const context = createSmallContext();

      await compactor.preFlush(context);

      const summary = compactor.getLastPreFlushSummary();
      expect(summary).toBeDefined();
      expect(summary!.summary).toContain('TypeScript');
    });

    it('should track pre-flush retry pending status', async () => {
      const llmCall = vi.fn().mockRejectedValue(new Error('fail'));
      const compactor = new ContextCompactor({ llmCall });
      const context = createSmallContext();

      expect(compactor.isPreFlushRetryPending()).toBe(false);

      await compactor.preFlush(context);

      expect(compactor.isPreFlushRetryPending()).toBe(true);

      compactor.clearPreFlushRetryPending();

      expect(compactor.isPreFlushRetryPending()).toBe(false);
    });
  });

  describe('static properties', () => {
    it('should expose HOOK_PRIORITY', () => {
      expect(ContextCompactor.HOOK_PRIORITY).toBe(50);
    });
  });

  describe('edge cases', () => {
    it('should handle empty message history', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
      });
      const context: AgentContext = {
        messages: [],
        systemPrompt: 'System',
      };

      const result = await compactor.compact(context);

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle context with only recent turns', async () => {
      const llmCall = vi.fn().mockResolvedValue(createMockLLMResponse());
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
        preserveRecentTurns: 10,
      });
      // Only 5 messages but preserve 10 — all should be kept
      const context = createLargeContext(5);

      await compactor.compact(context);

      // All original messages preserved (plus summary)
      expect(context.messages.length).toBe(6); // 5 original + 1 summary
    });

    it('should handle custom token counter', () => {
      const customCounter = vi.fn().mockReturnValue(100);
      const compactor = new ContextCompactor({ tokenCounter: customCounter });
      const context = createSmallContext();

      compactor.calculateUtilization(context);

      expect(customCounter).toHaveBeenCalled();
    });

    it('should handle concurrent compact calls', async () => {
      const llmCall = vi.fn().mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 10));
        return createMockLLMResponse();
      });
      const compactor = new ContextCompactor({
        llmCall,
        threshold: 0.00001,
      });

      const context1 = createLargeContext(10);
      const context2 = createLargeContext(10);

      // Run concurrently
      const [result1, result2] = await Promise.all([
        compactor.compact(context1),
        compactor.compact(context2),
      ]);

      // Both should complete without error
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});
