import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime } from '../agent-runtime.js';
import { z } from 'zod';
import type { ProviderRegistry } from '../../core/provider-registry.js';
import type { DCYFRMemory } from '../../memory/types.js';
import type { TelemetryEngine } from '../../core/telemetry-engine.js';
import type { TaskContext } from '../types.js';

describe('AgentRuntime', () => {
  let providerRegistry: ProviderRegistry;
  let memory: DCYFRMemory;
  let telemetry: TelemetryEngine;
  let runtime: AgentRuntime;

  beforeEach(() => {
    // Create mock dependencies
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
      getSession: vi.fn(),
    } as unknown as TelemetryEngine;

    runtime = new AgentRuntime('test-agent', providerRegistry, memory, telemetry);
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(runtime).toBeDefined();
      expect(runtime).toBeInstanceOf(AgentRuntime);
    });

    it('should accept custom configuration', () => {
      const customRuntime = new AgentRuntime(
        'custom-agent',
        providerRegistry,
        memory,
        telemetry,
        {
          maxIterations: 5,
          timeout: 60000,
          memoryEnabled: false,
        }
      );
      expect(customRuntime).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute basic task with single tool use', async () => {
      const context: TaskContext = {
        task: 'What is the weather in San Francisco?',
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather for a city',
            schema: {},
            execute: vi.fn().mockResolvedValue({ temp: 72, condition: 'sunny' }),
          },
        ],
      };

      // Mock LLM response
      let callCount = 0;
      (providerRegistry.executeWithFallback as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              content: `Thought: I need to check the weather
Action: get_weather
Action Input: {"city": "San Francisco"}`,
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        return Promise.resolve({
          success: true,
          data: {
            content: `Thought: Weather retrieved
Final Answer: It is sunny and 72°F in San Francisco`,
          },
          provider: 'claude',
          fallbackUsed: false,
          executionTime: 100,
          validationsPassed: [],
          validationsFailed: [],
        });
      });

      const result = await runtime.execute(context);

      expect(result.success).toBe(true);
      expect(result.iterations).toBeGreaterThan(0);
      expect(telemetry.startSession).toHaveBeenCalled();
    });

    it('should handle timeout gracefully', async () => {
      const context: TaskContext = {
        task: 'Long running task',
        tools: [],
      };

      // Create runtime with short timeout
      const shortTimeoutRuntime = new AgentRuntime(
        'test-agent',
        providerRegistry,
        memory,
        telemetry,
        { timeout: 100 }
      );

      // Mock slow LLM response
      (providerRegistry.executeWithFallback as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const result = await shortTimeoutRuntime.execute(context);

      expect(result.success).toBe(false);
      expect(result.outcome).toBe('timeout');
    });

    it('should enforce max iterations', async () => {
      const context: TaskContext = {
        task: 'Task that never finishes',
        tools: [],
      };

      // Create runtime with low max iterations
      const limitedRuntime = new AgentRuntime(
        'test-agent',
        providerRegistry,
        memory,
        telemetry,
        { maxIterations: 2 }
      );

      // Mock LLM always returning an action
      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: `Thought: Still working...
Action: some_tool
Action Input: {}`,
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      const result = await limitedRuntime.execute(context);

      expect(result.success).toBe(false);
      expect(result.outcome).toBe('max_iterations_reached');
      expect(result.iterations).toBe(2);
    });
  });

  describe('memory integration', () => {
    it('should retrieve context from memory before execution', async () => {
      (memory.searchUserMemories as any).mockResolvedValue([
        { content: 'User prefers concise answers', relevance: 0.9 },
      ]);

      const context: TaskContext = {
        task: 'Help me',
        userId: 'user-123',
        tools: [],
      };

      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: `Thought: User wants concise help
Final Answer: Here is a brief answer`,
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      await runtime.execute(context);

      expect(memory.searchUserMemories).toHaveBeenCalledWith(
        'user-123',
        'Help me',
        5
      );
    });

    it('should persist insights after successful execution', async () => {
      const context: TaskContext = {
        task: 'Test task',
        userId: 'user-123',
        tools: [],
      };

      // Mock successful execution
      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: `Thought: Task complete
Final Answer: Done`,
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      await runtime.execute(context);

      expect(memory.addUserMemory).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('Task: Test task'),
        expect.objectContaining({
          metadata: expect.objectContaining({
            success: true,
          }),
        })
      );
    });
  });

  describe('decision parsing', () => {
    it('should parse text-based decision format', async () => {
      const context: TaskContext = {
        task: 'Test parsing',
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            schema: {},
            execute: vi.fn().mockResolvedValue('result'),
          },
        ],
      };

      // Mock LLM response with text format
      let callCount = 0;
      (providerRegistry.executeWithFallback as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              content: `Thought: I need to use the test tool
Action: test_tool
Action Input: {"key": "value"}`,
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        return Promise.resolve({
          success: true,
          data: {
            content: `Thought: Tool executed successfully
Final Answer: Complete`,
          },
          provider: 'claude',
          fallbackUsed: false,
          executionTime: 100,
          validationsPassed: [],
          validationsFailed: [],
        });
      });

      const result = await runtime.execute(context);

      expect(result.success).toBe(true);
      expect(context.tools![0].execute).toHaveBeenCalledWith(
        { key: 'value' },
        expect.any(Object)
      );
    });

    it('should parse tool_use format from structured response', async () => {
      const context: TaskContext = {
        task: 'Test structured parsing',
        tools: [
          {
            name: 'structured_tool',
            description: 'A structured tool',
            schema: {},
            execute: vi.fn().mockResolvedValue('result'),
          },
        ],
      };

      // Mock LLM response with tool_use format (Anthropic-style)
      let callCount = 0;
      (providerRegistry.executeWithFallback as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              content: [
                {
                  type: 'text',
                  text: 'I will use the structured tool',
                },
                {
                  type: 'tool_use',
                  name: 'structured_tool',
                  input: { param: 'value' },
                },
              ],
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        return Promise.resolve({
          success: true,
          data: {
            content: `Thought: Tool used
Final Answer: Done`,
          },
          provider: 'claude',
          fallbackUsed: false,
          executionTime: 100,
          validationsPassed: [],
          validationsFailed: [],
        });
      });

      const result = await runtime.execute(context);

      expect(result.success).toBe(true);
      expect(context.tools![0].execute).toHaveBeenCalledWith(
        { param: 'value' },
        expect.any(Object)
      );
    });
  });

  describe('event emission', () => {
    it('should emit lifecycle events', async () => {
      const events: any[] = [];
      runtime.on((event) => events.push(event));

      const context: TaskContext = {
        task: 'Test events',
        tools: [],
      };

      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: 'Thought: Task done\\nFinal Answer: Complete',
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      await runtime.execute(context);

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('step');
      expect(eventTypes).toContain('finish');
    });

    it('should allow unsubscribing from events', async () => {
      const events: any[] = [];
      const listener = (event: any) => events.push(event);
      
      runtime.on(listener);
      runtime.off(listener);

      const context: TaskContext = {
        task: 'Test unsubscribe',
        tools: [],
      };

      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: 'Thought: Done\\nFinal Answer: Complete',
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      await runtime.execute(context);

      expect(events).toHaveLength(0); // No events should be received
    });
  });

  describe('telemetry integration', () => {
    it('should create session at start', async () => {
      const context: TaskContext = {
        task: 'Test task',
        tools: [],
      };

      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: 'Thought: Task done\\nFinal Answer: Complete',
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      await runtime.execute(context);

      expect(telemetry.startSession).toHaveBeenCalledWith(
        'claude',
        expect.objectContaining({
          taskType: 'feature',
          description: 'Test task',
        })
      );
    });

    it('should end session on completion', async () => {
      const context: TaskContext = {
        task: 'Test task',
        tools: [],
      };

      const mockEnd = vi.fn();
      (telemetry.startSession as any).mockReturnValue({
        getSession: () => ({ sessionId: 'session-123' }),
        end: mockEnd,
      });

      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: 'Thought: Done\\nFinal Answer: Complete',
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      await runtime.execute(context);

      expect(mockEnd).toHaveBeenCalledWith('success');
    });

    it('should calculate cost per provider (claude=$15/1M, groq=$0, ollama=$0)', async () => {
      const context: TaskContext = {
        task: 'Test cost tracking',
        tools: [],
      };

      // Test Claude cost calculation
      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: `Thought: Testing cost
Final Answer: Done`,
          usage: {
            inputTokens: 1000,
            outputTokens: 500,
          },
        },
        provider: 'claude',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      let result = await runtime.execute(context);

      // Expected cost: (1000 + 500) / 1,000,000 * $15 = $0.0225
      expect(result.cost).toBeCloseTo(0.0225, 4);

      // Test Groq (free)
      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: `Thought: Testing cost
Final Answer: Done`,
          usage: {
            inputTokens: 1000,
            outputTokens: 500,
          },
        },
        provider: 'groq',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      // Create new runtime instance to reset working memory
      const newRuntime = new AgentRuntime('test-agent', providerRegistry, memory, telemetry, {
        maxIterations: 10,
        timeout: 30000,
        memoryEnabled: false,
      });

      result = await newRuntime.execute(context);
      expect(result.cost).toBe(0);

      // Test Ollama (local/free)
      (providerRegistry.executeWithFallback as any).mockResolvedValue({
        success: true,
        data: {
          content: `Thought: Testing cost
Final Answer: Done`,
          usage: {
            inputTokens: 1000,
            outputTokens: 500,
          },
        },
        provider: 'ollama',
        fallbackUsed: false,
        executionTime: 100,
        validationsPassed: [],
        validationsFailed: [],
      });

      const ollamaRuntime = new AgentRuntime('test-agent', providerRegistry, memory, telemetry, {
        maxIterations: 10,
        timeout: 30000,
        memoryEnabled: false,
      });

      result = await ollamaRuntime.execute(context);
      expect(result.cost).toBe(0);
    });
  });

  describe('tool execution', () => {
    it('should validate tool input with Zod', async () => {
      const weatherSchema = z.object({
        city: z.string(),
        units: z.enum(['celsius', 'fahrenheit']).optional(),
      });

      const weatherTool = {
        name: 'get_weather',
        description: 'Get weather for a city',
        schema: weatherSchema,
        execute: vi.fn().mockResolvedValue({ temp: 72, condition: 'sunny' }),
      };

      const context: TaskContext = {
        task: 'What is the weather in San Francisco?',
        tools: [weatherTool],
      };

      // Mock LLM to use the weather tool
      let callCount = 0;
      (providerRegistry.executeWithFallback as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              content: `Thought: I should check the weather
Action: get_weather
Action Input: {"city": "San Francisco"}`,
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        return Promise.resolve({
          success: true,
          data: {
            content: `Thought: Got the weather data
Final Answer: It is sunny and 72°F in San Francisco`,
          },
          provider: 'claude',
          fallbackUsed: false,
          executionTime: 100,
          validationsPassed: [],
          validationsFailed: [],
        });
      });

      const result = await runtime.execute(context);

      expect(result.success).toBe(true);
      expect(weatherTool.execute).toHaveBeenCalledWith(
        { city: 'San Francisco' },
        expect.objectContaining({
          workingMemory: expect.any(Map),
          iteration: 1,
        })
      );
    });

    it('should reject invalid tool input', async () => {
      const weatherSchema = z.object({
        city: z.string(),
      });

      const weatherTool = {
        name: 'get_weather',
        description: 'Get weather',
        schema: weatherSchema,
        execute: vi.fn(),
      };

      const context: TaskContext = {
        task: 'Get weather',
        tools: [weatherTool],
      };

      // Mock LLM to provide invalid input (missing city)
      let callCount = 0;
      (providerRegistry.executeWithFallback as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              content: `Thought: Check weather
Action: get_weather
Action Input: {}`,
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        return Promise.resolve({
          success: true,
          data: {
            content: `Thought: Validation failed
Final Answer: Could not get weather`,
          },
          provider: 'claude',
          fallbackUsed: false,
          executionTime: 100,
          validationsPassed: [],
          validationsFailed: [],
        });
      });

      await runtime.execute(context);

      // Tool should not be executed due to validation failure
      expect(weatherTool.execute).not.toHaveBeenCalled();
    });

    it('should handle tool execution errors gracefully', async () => {
      const failingTool = {
        name: 'failing_tool',
        description: 'A tool that fails',
        schema: {},
        execute: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

      const context: TaskContext = {
        task: 'Use failing tool',
        tools: [failingTool],
      };

      // Mock LLM to use the failing tool, then finish
      let callCount = 0;
      (providerRegistry.executeWithFallback as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              content: `Thought: Try the tool
Action: failing_tool
Action Input: {}`,
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        return Promise.resolve({
          success: true,
          data: {
            content: `Thought: Tool failed, giving up
Final Answer: Could not complete task`,
          },
          provider: 'claude',
          fallbackUsed: false,
          executionTime: 100,
          validationsPassed: [],
          validationsFailed: [],
        });
      });

      const result = await runtime.execute(context);

      expect(result).toBeDefined();
      expect(result.success).toBe(true); // Overall execution succeeds despite tool failure
    });

    it('should cache tool results in working memory', async () => {
      const tool = {
        name: 'expensive_operation',
        description: 'Expensive operation',
        schema: z.object({ value: z.number() }),
        execute: vi.fn().mockResolvedValue('result'),
      };

      const context: TaskContext = {
        task: 'Run operation twice',
        tools: [tool],
      };

      // Mock LLM to call the same tool twice with same input
      let callCount = 0;
      (providerRegistry.executeWithFallback as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              content: `Thought: First call
Action: expensive_operation
Action Input: {"value": 42}`,
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        if (callCount === 2) {
          return Promise.resolve({
            success: true,
            data: {
              content: `Thought: Second call with same input
Action: expensive_operation
Action Input: {"value": 42}`,
            },
            provider: 'claude',
            fallbackUsed: false,
            executionTime: 100,
            validationsPassed: [],
            validationsFailed: [],
          });
        }
        return Promise.resolve({
          success: true,
          data: {
            content: `Thought: Done
Final Answer: Complete`,
          },
          provider: 'claude',
          fallbackUsed: false,
          executionTime: 100,
          validationsPassed: [],
          validationsFailed: [],
        });
      });

      await runtime.execute(context);

      // Tool should only be executed once due to caching
      expect(tool.execute).toHaveBeenCalledTimes(1);
    });
  });
});
