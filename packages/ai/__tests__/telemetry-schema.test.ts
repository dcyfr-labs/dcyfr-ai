/**
 * Telemetry Schema Tests
 * Tests cost calculations, event aggregation, and metrics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateLLMCost,
  aggregateCosts,
  formatCost,
  calculateExecutionMetrics,
  LLM_PRICING,
  type CostBreakdown,
  type AnyExecutionEvent,
  type TaskFinishEvent,
  type LLMCallEvent,
} from '../runtime/telemetry-schema';
import { TelemetryEngine } from '../core/telemetry-engine';

describe('LLM Cost Calculations', () => {
  describe('GPT-4 Turbo Pricing', () => {
    it('should calculate cost correctly for GPT-4 Turbo', () => {
      const cost = calculateLLMCost('openai', 'gpt-4-turbo', 1000, 500);

      expect(cost.inputTokens).toBe(1000);
      expect(cost.outputTokens).toBe(500);
      expect(cost.totalTokens).toBe(1500);
      expect(cost.provider).toBe('openai');
      expect(cost.model).toBe('gpt-4-turbo');
      expect(cost.currency).toBe('USD');

      // $10/1M input tokens = $0.01 for 1000 tokens
      expect(cost.inputCost).toBeCloseTo(0.01, 4);
      // $30/1M output tokens = $0.015 for 500 tokens
      expect(cost.outputCost).toBeCloseTo(0.015, 4);
      // Total = $0.025
      expect(cost.totalCost).toBeCloseTo(0.025, 4);
    });

    it('should handle large token counts for GPT-4 Turbo', () => {
      // 100K input, 50K output
      const cost = calculateLLMCost('openai', 'gpt-4-turbo', 100_000, 50_000);

      // $10/1M * 100K = $1.00
      expect(cost.inputCost).toBeCloseTo(1.0, 2);
      // $30/1M * 50K = $1.50
      expect(cost.outputCost).toBeCloseTo(1.5, 2);
      // Total = $2.50
      expect(cost.totalCost).toBeCloseTo(2.5, 2);
    });
  });

  describe('Claude Sonnet 4 Pricing', () => {
    it('should calculate cost correctly for Claude Sonnet 4', () => {
      const cost = calculateLLMCost('anthropic', 'claude-sonnet-4', 1000, 500);

      expect(cost.inputTokens).toBe(1000);
      expect(cost.outputTokens).toBe(500);
      expect(cost.provider).toBe('anthropic');
      expect(cost.model).toBe('claude-sonnet-4');

      // $3/1M input tokens = $0.003 for 1000 tokens
      expect(cost.inputCost).toBeCloseTo(0.003, 4);
      // $15/1M output tokens = $0.0075 for 500 tokens
      expect(cost.outputCost).toBeCloseTo(0.0075, 4);
      // Total = $0.0105
      expect(cost.totalCost).toBeCloseTo(0.0105, 4);
    });

    it('should handle large token counts for Claude Sonnet 4', () => {
      // 200K input, 100K output
      const cost = calculateLLMCost('anthropic', 'claude-sonnet-4', 200_000, 100_000);

      // $3/1M * 200K = $0.60
      expect(cost.inputCost).toBeCloseTo(0.6, 2);
      // $15/1M * 100K = $1.50
      expect(cost.outputCost).toBeCloseTo(1.5, 2);
      // Total = $2.10
      expect(cost.totalCost).toBeCloseTo(2.1, 2);
    });
  });

  describe('Other Providers', () => {
    it('should calculate cost for Groq models', () => {
      const cost = calculateLLMCost('groq', 'llama-3-70b', 10_000, 5_000);

      // $0.59/1M input = $0.0059
      expect(cost.inputCost).toBeCloseTo(0.0059, 4);
      // $0.79/1M output = $0.00395
      expect(cost.outputCost).toBeCloseTo(0.00395, 5);
    });

    it('should return zero cost for Ollama (local models)', () => {
      const cost = calculateLLMCost('ollama', 'llama3', 100_000, 50_000);

      expect(cost.inputCost).toBe(0);
      expect(cost.outputCost).toBe(0);
      expect(cost.totalCost).toBe(0);
    });

    it('should handle unknown provider/model gracefully', () => {
      const cost = calculateLLMCost('unknown-provider', 'unknown-model', 1000, 500);

      expect(cost.inputCost).toBe(0);
      expect(cost.outputCost).toBe(0);
      expect(cost.totalCost).toBe(0);
    });

    it('should be case-insensitive for provider/model names', () => {
      const cost1 = calculateLLMCost('OpenAI', 'GPT-4-Turbo', 1000, 500);
      const cost2 = calculateLLMCost('openai', 'gpt-4-turbo', 1000, 500);

      expect(cost1.totalCost).toBeCloseTo(cost2.totalCost, 4);
    });
  });
});

describe('Cost Aggregation', () => {
  it('should aggregate multiple cost breakdowns', () => {
    const costs: CostBreakdown[] = [
      calculateLLMCost('openai', 'gpt-4-turbo', 1000, 500),
      calculateLLMCost('openai', 'gpt-4-turbo', 2000, 1000),
      calculateLLMCost('openai', 'gpt-4-turbo', 500, 250),
    ];

    const aggregated = aggregateCosts(costs);

    expect(aggregated.inputTokens).toBe(3500);
    expect(aggregated.outputTokens).toBe(1750);
    expect(aggregated.totalTokens).toBe(5250);
    expect(aggregated.totalCost).toBeCloseTo(0.0875, 4); // Sum of individual costs
  });

  it('should handle costs from multiple providers', () => {
    const costs: CostBreakdown[] = [
      calculateLLMCost('openai', 'gpt-4-turbo', 1000, 500),
      calculateLLMCost('anthropic', 'claude-sonnet-4', 1000, 500),
    ];

    const aggregated = aggregateCosts(costs);

    expect(aggregated.provider).toBe('multiple');
    expect(aggregated.model).toBe('multiple');
    expect(aggregated.inputTokens).toBe(2000);
    expect(aggregated.outputTokens).toBe(1000);
  });

  it('should handle empty cost array', () => {
    const aggregated = aggregateCosts([]);

    expect(aggregated.inputTokens).toBe(0);
    expect(aggregated.outputTokens).toBe(0);
    expect(aggregated.totalCost).toBe(0);
  });
});

describe('Cost Formatting', () => {
  it('should format zero cost', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('should format small costs with 4 decimals', () => {
    expect(formatCost(0.0012)).toBe('$0.0012');
    expect(formatCost(0.0099)).toBe('$0.0099');
  });

  it('should format normal costs with 2 decimals', () => {
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(1.23)).toBe('$1.23');
    expect(formatCost(10.5)).toBe('$10.50');
  });

  it('should format large costs', () => {
    expect(formatCost(123.456)).toBe('$123.46');
    expect(formatCost(1000.00)).toBe('$1000.00');
  });
});

describe('Execution Metrics Calculation', () => {
  it('should calculate metrics from event stream', () => {
    const events: AnyExecutionEvent[] = [
      {
        type: 'start',
        agentName: 'test-agent',
        task: 'Task 1',
        timestamp: Date.now(),
      },
      {
        type: 'finish',
        agentName: 'test-agent',
        success: true,
        iterations: 3,
        duration: 1000,
        timestamp: Date.now(),
        cost: calculateLLMCost('openai', 'gpt-4-turbo', 1000, 500),
      } as TaskFinishEvent,
      {
        type: 'start',
        agentName: 'test-agent',
        task: 'Task 2',
        timestamp: Date.now(),
      },
      {
        type: 'finish',
        agentName: 'test-agent',
        success: false,
        iterations: 1,
        duration: 500,
        timestamp: Date.now(),
        error: 'Test error',
      } as TaskFinishEvent,
      {
        type: 'llm_call',
        agentName: 'test-agent',
        provider: 'openai',
        model: 'gpt-4-turbo',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.025,
        latency: 200,
        success: true,
        timestamp: Date.now(),
      } as LLMCallEvent,
    ];

    const metrics = calculateExecutionMetrics(events);

    expect(metrics.totalTasks).toBe(2);
    expect(metrics.successfulTasks).toBe(1);
    expect(metrics.failedTasks).toBe(1);
    expect(metrics.timedOutTasks).toBe(0);
    expect(metrics.totalDuration).toBe(1500);
    expect(metrics.averageDuration).toBe(750);
    expect(metrics.totalIterations).toBe(4);
    expect(metrics.averageIterations).toBe(2);
    expect(metrics.llmCallCount).toBe(1);
  });

  it('should handle empty event stream', () => {
    const metrics = calculateExecutionMetrics([]);

    expect(metrics.totalTasks).toBe(0);
    expect(metrics.successfulTasks).toBe(0);
    expect(metrics.averageDuration).toBe(0);
    expect(metrics.averageCost).toBe(0);
  });

  it('should calculate cost metrics correctly', () => {
    const events: AnyExecutionEvent[] = [
      {
        type: 'finish',
        agentName: 'test-agent',
        success: true,
        iterations: 1,
        duration: 1000,
        timestamp: Date.now(),
        cost: calculateLLMCost('openai', 'gpt-4-turbo', 10_000, 5_000),
      } as TaskFinishEvent,
      {
        type: 'finish',
        agentName: 'test-agent',
        success: true,
        iterations: 1,
        duration: 1000,
        timestamp: Date.now(),
        cost: calculateLLMCost('anthropic', 'claude-sonnet-4', 10_000, 5_000),
      } as TaskFinishEvent,
    ];

    const metrics = calculateExecutionMetrics(events);

    expect(metrics.totalTasks).toBe(2);
    expect(metrics.totalCost.inputTokens).toBe(20_000);
    expect(metrics.totalCost.outputTokens).toBe(10_000);
    expect(metrics.totalCost.totalCost).toBeGreaterThan(0);
    expect(metrics.averageCost).toBeCloseTo(metrics.totalCost.totalCost / 2, 4);
  });
});

describe('TelemetryEngine.trackExecution', () => {
  let telemetry: TelemetryEngine;

  beforeEach(() => {
    telemetry = new TelemetryEngine({ storage: 'memory' });
  });

  it('should track execution events', async () => {
    const event = {
      type: 'llm_call',
      agentName: 'test-agent',
      provider: 'openai',
      model: 'gpt-4-turbo',
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.025,
      latency: 200,
      success: true,
      timestamp: Date.now(),
    };

    await telemetry.trackExecution(event);

    const events = await telemetry.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it('should track multiple events', async () => {
    const event1 = {
      type: 'start',
      agentName: 'test-agent',
      task: 'Task 1',
      timestamp: Date.now(),
    };

    const event2 = {
      type: 'finish',
      agentName: 'test-agent',
      success: true,
      iterations: 1,
      duration: 1000,
      timestamp: Date.now(),
    };

    await telemetry.trackExecution(event1);
    await telemetry.trackExecution(event2);

    const events = await telemetry.getEvents();
    expect(events).toHaveLength(2);
  });

  it('should respect timeout protection', async () => {
    // Mock slow storage
    const slowTelemetry = new TelemetryEngine({ storage: 'memory' });
    
    // Override storeEvent to be slow
    const originalStoreEvent = (slowTelemetry as any).storeEvent.bind(slowTelemetry);
    (slowTelemetry as any).storeEvent = async (event: any) => {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      return originalStoreEvent(event);
    };

    const event = {
      type: 'test',
      timestamp: Date.now(),
      agentName: 'test',
    };

    // Track with 100ms timeout
    const startTime = Date.now();
    await slowTelemetry.trackExecution(event, 100);
    const duration = Date.now() - startTime;

    // Should timeout and not wait the full 2 seconds
    expect(duration).toBeLessThan(500);
  });

  it('should clear events', async () => {
    await telemetry.trackExecution({ type: 'test', timestamp: Date.now(), agentName: 'test' });
    await telemetry.trackExecution({ type: 'test', timestamp: Date.now(), agentName: 'test' });

    let events = await telemetry.getEvents();
    expect(events).toHaveLength(2);

    await telemetry.clearEvents();

    events = await telemetry.getEvents();
    expect(events).toHaveLength(0);
  });

  it('should not throw on storage errors', async () => {
    const brokenTelemetry = new TelemetryEngine({ storage: 'memory' });
    
    // Break storage
    (brokenTelemetry as any).storeEvent = async () => {
      throw new Error('Storage broken');
    };

    const event = { type: 'test', timestamp: Date.now(), agentName: 'test' };

    // Should not throw
    await expect(brokenTelemetry.trackExecution(event)).resolves.toBeUndefined();
  });
});

describe('LLM_PRICING Data Structure', () => {
  it('should have pricing for OpenAI models', () => {
    expect(LLM_PRICING.openai).toBeDefined();
    expect(LLM_PRICING.openai['gpt-4-turbo']).toBeDefined();
    expect(LLM_PRICING.openai['gpt-4-turbo'].inputCostPer1M).toBe(10);
    expect(LLM_PRICING.openai['gpt-4-turbo'].outputCostPer1M).toBe(30);
  });

  it('should have pricing for Anthropic models', () => {
    expect(LLM_PRICING.anthropic).toBeDefined();
    expect(LLM_PRICING.anthropic['claude-sonnet-4']).toBeDefined();
    expect(LLM_PRICING.anthropic['claude-sonnet-4'].inputCostPer1M).toBe(3);
    expect(LLM_PRICING.anthropic['claude-sonnet-4'].outputCostPer1M).toBe(15);
  });

  it('should have zero cost for Ollama', () => {
    expect(LLM_PRICING.ollama).toBeDefined();
    expect(LLM_PRICING.ollama.default.inputCostPer1M).toBe(0);
    expect(LLM_PRICING.ollama.default.outputCostPer1M).toBe(0);
  });
});
