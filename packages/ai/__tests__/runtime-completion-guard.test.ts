/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRuntime } from '../runtime/agent-runtime.js';

describe('AgentRuntime completion guard', () => {
  let providerRegistry: any;
  let memory: any;
  let telemetry: any;

  beforeEach(() => {
    memory = {
      searchUserMemories: vi.fn().mockResolvedValue([]),
      searchAgentMemories: vi.fn().mockResolvedValue([]),
      addUserMemory: vi.fn().mockResolvedValue(undefined),
      addAgentMemory: vi.fn().mockResolvedValue(undefined),
      isConfigured: vi.fn().mockReturnValue(true),
    };

    telemetry = {
      startSession: vi.fn().mockReturnValue({
        getSession: () => ({ sessionId: 'test-session-id' }),
        end: vi.fn().mockResolvedValue(undefined),
      }),
      trackEvent: vi.fn(),
      trackError: vi.fn(),
      end: vi.fn(),
    };
  });

  it('retries once then succeeds when Finalized: true is provided', async () => {
    // Guard fires on ambiguous responses (no Final Answer, no Finalized: true).
    // On retry the model adds both markers, so execution succeeds.
    let calls = 0;
    providerRegistry = {
      executeWithFallback: vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          return {
            provider: 'test-provider',
            data: {
              content: 'Thought: I am still processing the task',
              usage: { inputTokens: 10, outputTokens: 8 },
            },
          };
        }

        return {
          provider: 'test-provider',
          data: {
            content: 'Thought: finalizing now\nFinalized: true\nFinal Answer: final answer',
            usage: { inputTokens: 12, outputTokens: 10 },
          },
        };
      }),
    };

    const runtime = new AgentRuntime(
      'completion-guard-agent',
      providerRegistry,
      memory,
      telemetry,
      {
        maxIterations: 5,
        timeout: 10_000,
        completionGuardEnabled: true,
        completionGuardMaxRetries: 1,
      }
    );

    const result = await runtime.execute({ task: 'test completion marker behavior' });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('success');
    expect(result.iterations).toBe(2);
    expect(providerRegistry.executeWithFallback).toHaveBeenCalledTimes(2);
  });

  it('fails with completion_guard_failed after retry budget is exhausted', async () => {
    // All responses are ambiguous (no Final Answer, no Finalized: true).
    // Guard fires, retry is also ambiguous, budget is exhausted → failure.
    providerRegistry = {
      executeWithFallback: vi.fn().mockResolvedValue({
        provider: 'test-provider',
        data: {
          content: 'Thought: still thinking about the answer',
          usage: { inputTokens: 10, outputTokens: 8 },
        },
      }),
    };

    const runtime = new AgentRuntime(
      'completion-guard-agent',
      providerRegistry,
      memory,
      telemetry,
      {
        maxIterations: 5,
        timeout: 10_000,
        completionGuardEnabled: true,
        completionGuardMaxRetries: 1,
      }
    );

    const result = await runtime.execute({ task: 'test completion marker required' });

    expect(result.success).toBe(false);
    expect(result.outcome).toBe('completion_guard_failed');
    expect(result.error).toContain('Missing explicit Finalized: true marker');
    expect(result.iterations).toBe(2);
  });
});
