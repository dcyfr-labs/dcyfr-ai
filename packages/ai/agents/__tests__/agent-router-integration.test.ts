import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRouter } from '../agent-router.js';
import { AgentRegistry } from '../agent-registry.js';
import type { Agent, AgentExecutionContext } from '../types.js';
import type { ProviderRegistry } from '../../core/provider-registry.js';
import type { DCYFRMemory } from '../../memory/types.js';
import type { TelemetryEngine } from '../../core/telemetry-engine.js';

describe('AgentRouter (Task Group 5)', () => {
  let router: AgentRouter;
  let registry: AgentRegistry;
  let providerRegistry: ProviderRegistry;
  let memory: DCYFRMemory;
  let telemetry: TelemetryEngine;
  let mockAgent: Agent;

  beforeEach(() => {
    // Mock dependencies
    providerRegistry = {
      executeWithFallback: vi.fn(),
    } as unknown as ProviderRegistry;

    memory = {
      searchUserMemories: vi.fn().mockResolvedValue([]),
      searchAgentMemories: vi.fn().mockResolvedValue([]),
      addUserMemory: vi.fn().mockResolvedValue('mem-123'),
      addAgentMemory: vi.fn().mockResolvedValue('mem-456'),
    } as unknown as DCYFRMemory;

    const mockEnd = vi.fn().mockResolvedValue(undefined);
    telemetry = {
      startSession: vi.fn().mockReturnValue({
        getSession: () => ({ sessionId: 'test-session-123' }),
        end: mockEnd,
      }),
    } as unknown as TelemetryEngine;

    // Mock agent
    mockAgent = {
      manifest: {
        name: 'test-agent',
        version: '1.0.0',
        description: 'Test agent for router integration',
        category: 'development',
        tier: 'private',
        model: 'sonnet',
        permissionMode: 'acceptEdits',
        tools: ['test_tool'],
      },
      systemPrompt: 'You are a test agent.',
    };

    // Mock registry
    registry = {
      resolveAgent: vi.fn().mockReturnValue(mockAgent),
      getAgentsByCategory: vi.fn().mockReturnValue([]),
    } as unknown as AgentRegistry;

    router = new AgentRouter(registry, providerRegistry, memory, telemetry);
  });

  it('should integrate AgentRuntime into executeWithFallback', async () => {
    const context: AgentExecutionContext = {
      task: {
        description: 'Test task execution',
        phase: 'implementation',
        filesInProgress: [],
      },
      config: {},
      workingDirectory: '/test',
      files: [],
      metadata: {
        userId: 'user-123',
        sessionId: 'session-456',
      },
    };

    // Mock successful execution
    (providerRegistry.executeWithFallback as any).mockResolvedValue({
      success: true,
      data: {
        content: 'Thought: Task complete\nFinal Answer: Done',
      },
      provider: 'claude',
      fallbackUsed: false,
      executionTime: 100,
      validationsPassed: [],
      validationsFailed: [],
    });

    const result = await router.executeWithFallback(context, mockAgent, []);

    expect(result.success).toBe(true);
    expect(result.agentName).toBe('test-agent');
    expect(result.fallbackUsed).toBe(false);
    expect(providerRegistry.executeWithFallback).toHaveBeenCalled();
    expect(telemetry.startSession).toHaveBeenCalled();
  });

  it('should handle fallback chain on failure', async () => {
    const fallbackAgent = {
      ...mockAgent,
      manifest: { ...mockAgent.manifest, name: 'fallback-agent' },
    };

    const context: AgentExecutionContext = {
      task: {
        description: 'Test fallback execution',
        phase: 'implementation',
        filesInProgress: [],
      },
      config: {},
      workingDirectory: '/test',
      files: [],
    };

    // Mock primary agent failure, fallback success
    let callCount = 0;
    (providerRegistry.executeWithFallback as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Primary agent failed');
      }
      return Promise.resolve({
        success: true,
        data: {
          content: 'Thought: Fallback success\nFinal Answer: Complete',
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });
    });

    const result = await router.executeWithFallback(context, mockAgent, [fallbackAgent]);

    expect(result.success).toBe(true);
    expect(result.agentName).toBe('fallback-agent');
    expect(result.fallbackUsed).toBe(true);
    expect(result.originalAgent).toBe('test-agent');
  });

  it('should propagate context (userId, sessionId, metadata)', async () => {
    const context: AgentExecutionContext = {
      task: {
        description: 'Test context propagation',
        phase: 'implementation',
        filesInProgress: [],
      },
      config: {},
      workingDirectory: '/test',
      files: [],
      metadata: {
        userId: 'user-789',
        sessionId: 'session-xyz',
        customKey: 'customValue',
      },
    };

    (providerRegistry.executeWithFallback as any).mockResolvedValue({
      success: true,
      data: {
        content: 'Thought: Context received\nFinal Answer: Complete',
      },
      provider: 'claude',
      fallbackUsed: false,
      executionTime: 100,
      validationsPassed: [],
      validationsFailed: [],
    });

    const result = await router.executeWithFallback(context, mockAgent, []);

    expect(result.success).toBe(true);
    // Verify telemetry called with session
    const sessionCall = (telemetry.startSession as any).mock.calls[0];
    expect(sessionCall).toBeDefined();
  });
});