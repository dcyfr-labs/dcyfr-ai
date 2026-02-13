/**
 * Extension Points Hook System Tests
 * 
 * Tests the hook system for before/after execution callbacks
 * to enable Phase 1+ safety and auditing features.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRuntime } from '../runtime/agent-runtime.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import { getMemory } from '../memory/index.js';
import { TelemetryEngine } from '../core/telemetry-engine.js';
import { PermissionDeniedError } from '../runtime/types.js';
import type { TaskContext, HookContext, AgentExecutionResult } from '../runtime/types.js';

describe('Extension Points Hook System', () => {
  let runtime: AgentRuntime;
  let providerRegistry: ProviderRegistry;
  let memory: ReturnType<typeof getMemory>;
  let telemetry: TelemetryEngine;

  beforeEach(() => {
    // Mock provider registry to avoid needing real LLM providers
    providerRegistry = {
      generateContent: vi.fn().mockResolvedValue({
        text: 'Test response',
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'test-model'
      }),
      isHealthy: vi.fn().mockReturnValue(true),
      getPrimaryProvider: vi.fn().mockReturnValue('test-provider'),
      getFallbackChain: vi.fn().mockReturnValue([])
    } as any;

    // Mock memory to avoid configuration requirements
    memory = {
      searchUserMemories: vi.fn().mockResolvedValue([]),
      searchAgentMemories: vi.fn().mockResolvedValue([]),
      storeUserMemory: vi.fn().mockResolvedValue(undefined),
      storeAgentMemory: vi.fn().mockResolvedValue(undefined),
      isConfigured: vi.fn().mockReturnValue(true)
    } as any;

    // Mock telemetry
    telemetry = {
      startSession: vi.fn().mockReturnValue({
        getSession: () => ({ sessionId: 'test-session-id' }),
        end: vi.fn().mockResolvedValue(undefined)
      }),
      trackEvent: vi.fn(),
      trackError: vi.fn(),
      end: vi.fn()
    } as any;

    runtime = new AgentRuntime(
      'hook-test-agent',
      providerRegistry,
      memory,
      telemetry,
      {
        maxIterations: 5,
        timeout: 10000,
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Before-Execution Hooks', () => {
    it('should register and call beforeExecute hooks', async () => {
      const hookCalled = vi.fn();

      runtime.beforeExecute(async (context: HookContext) => {
        hookCalled(context);
      });

      const context: TaskContext = {
        task: 'Test before hook',
        userId: 'test-user',
      };

      // Execute task (will fail without LLM but hook should be called)
      await runtime.execute(context);

      expect(hookCalled).toHaveBeenCalledTimes(1);
      expect(hookCalled).toHaveBeenCalledWith({
        agentName: 'hook-test-agent',
        task: 'Test before hook',
        userId: 'test-user',
        sessionId: undefined,
        timestamp: expect.any(Number),
      });
    });

    it('should allow multiple beforeExecute hooks', async () => {
      const hook1 = vi.fn();
      const hook2 = vi.fn();

      runtime.beforeExecute(async (context) => {
        hook1(context.task);
      });

      runtime.beforeExecute(async (context) => {
        hook2(context.task);
      });

      const context: TaskContext = {
        task: 'Multiple hooks test',
        userId: 'test-user',
      };

      await runtime.execute(context);

      expect(hook1).toHaveBeenCalledWith('Multiple hooks test');
      expect(hook2).toHaveBeenCalledWith('Multiple hooks test');
    });

    it('should reject execution with PermissionDeniedError', async () => {
      runtime.beforeExecute(async (context: HookContext) => {
        if (context.task.includes('forbidden')) {
          throw new PermissionDeniedError('Operation forbidden by policy');
        }
      });

      const context: TaskContext = {
        task: 'This is a forbidden operation',
        userId: 'test-user',
      };

      const result = await runtime.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation forbidden by policy');
      expect(result.outcome).toBe('error');
    });

    it('should allow execution when no hooks reject', async () => {
      runtime.beforeExecute(async (context: HookContext) => {
        // This hook allows execution
        expect(context.task).toBeDefined();
      });

      const context: TaskContext = {
        task: 'Allowed operation',
        userId: 'test-user',
      };

      const result = await runtime.execute(context);

      // Execution proceeds (fails later due to no LLM)
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('outcome');
    });

    it('should handle hook errors other than PermissionDeniedError', async () => {
      runtime.beforeExecute(async (context: HookContext) => {
        throw new Error('Unexpected hook error');
      });

      const context: TaskContext = {
        task: 'Hook error test',
        userId: 'test-user',
      };

      // Should propagate the error
      await expect(runtime.execute(context)).rejects.toThrow('Unexpected hook error');
    });

    it('should stop hook execution on first rejection', async () => {
      const hook1 = vi.fn().mockImplementation(async () => {
        throw new PermissionDeniedError('First hook rejection');
      });

      const hook2 = vi.fn(); // Should not be called

      runtime.beforeExecute(hook1);
      runtime.beforeExecute(hook2);

      const context: TaskContext = {
        task: 'Early rejection test',
        userId: 'test-user',
      };

      const result = await runtime.execute(context);

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).not.toHaveBeenCalled();
      expect(result.error).toBe('First hook rejection');
    });
  });

  describe('After-Execution Hooks', () => {
    it('should register and call afterExecute hooks', async () => {
      const hookCalled = vi.fn();

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        hookCalled(context, result);
      });

      const context: TaskContext = {
        task: 'Test after hook',
        userId: 'test-user',
      };

      const result = await runtime.execute(context);

      expect(hookCalled).toHaveBeenCalledTimes(1);
      expect(hookCalled).toHaveBeenCalledWith(
        {
          agentName: 'hook-test-agent',
          task: 'Test after hook',
          userId: 'test-user',
          sessionId: undefined,
          timestamp: expect.any(Number),
        },
        result
      );
    });

    it('should call afterExecute hooks even on execution failure', async () => {
      const afterHook = vi.fn();

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        afterHook(result.success);
      });

      const context: TaskContext = {
        task: 'Failing task',
        userId: 'test-user',
      };

      await runtime.execute(context);

      expect(afterHook).toHaveBeenCalledWith(false); // Execution failed but hook called
    });

    it('should call afterExecute hooks even on permission denial', async () => {
      const afterHook = vi.fn();

      runtime.beforeExecute(async () => {
        throw new PermissionDeniedError('Access denied');
      });

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        afterHook(result.error);
      });

      const context: TaskContext = {
        task: 'Denied task',
        userId: 'test-user',
      };

      await runtime.execute(context);

      expect(afterHook).toHaveBeenCalledWith('Access denied');
    });

    it('should handle afterExecute hook errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      runtime.afterExecute(async () => {
        throw new Error('After hook failed');
      });

      const context: TaskContext = {
        task: 'After hook error test',
        userId: 'test-user',
      };

      // Should not throw despite after hook error
      const result = await runtime.execute(context);

      expect(result).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[AgentRuntime] After-execute hook failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should call all afterExecute hooks even if some fail', async () => {
      const hook1 = vi.fn().mockRejectedValue(new Error('Hook 1 failed'));
      const hook2 = vi.fn();

      runtime.afterExecute(hook1);
      runtime.afterExecute(hook2);

      const context: TaskContext = {
        task: 'Multiple after hooks test',
        userId: 'test-user',
      };

      await runtime.execute(context);

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1); // Called despite hook1 failure
    });
  });

  describe('Hook Integration', () => {
    it('should call both before and after hooks in sequence', async () => {
      const callOrder: string[] = [];

      runtime.beforeExecute(async (context: HookContext) => {
        callOrder.push(`before:${context.task}`);
      });

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        callOrder.push(`after:${context.task}:${result.success}`);
      });

      const context: TaskContext = {
        task: 'Full lifecycle test',
        userId: 'test-user',
      };

      await runtime.execute(context);

      expect(callOrder).toEqual([
        'before:Full lifecycle test',
        'after:Full lifecycle test:false',
      ]);
    });

    it('should provide correct hook context data', async () => {
      let capturedContext: HookContext | undefined;

      runtime.beforeExecute(async (context: HookContext) => {
        capturedContext = context;
      });

      const context: TaskContext = {
        task: 'Context data test',
        userId: 'user-123',
        sessionId: 'session-456',
      };

      await runtime.execute(context);

      expect(capturedContext).toEqual({
        agentName: 'hook-test-agent',
        task: 'Context data test',
        userId: 'user-123',
        sessionId: 'session-456',
        timestamp: expect.any(Number),
      });
    });

    it('should provide correct execution result to after hooks', async () => {
      let capturedResult: AgentExecutionResult | undefined;

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        capturedResult = result;
      });

      const context: TaskContext = {
        task: 'Result data test',
        userId: 'test-user',
      };

      await runtime.execute(context);

      expect(capturedResult).toMatchObject({
        success: expect.any(Boolean),
        outcome: expect.any(String),
        executionTime: expect.any(Number),
        cost: expect.any(Number),
        iterations: expect.any(Number),
      });
    });
  });

  describe('PermissionDeniedError', () => {
    it('should create PermissionDeniedError with correct properties', () => {
      const error = new PermissionDeniedError('Test permission error');

      expect(error.name).toBe('PermissionDeniedError');
      expect(error.message).toBe('Test permission error');
      expect(error instanceof Error).toBe(true);
    });

    it('should be distinguishable from other errors', async () => {
      let caughtError: Error | undefined;

      runtime.beforeExecute(async () => {
        throw new PermissionDeniedError('Permission test');
      });

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        if (result.error) {
          caughtError = new Error(result.error);
        }
      });

      const context: TaskContext = {
        task: 'Permission error test',
        userId: 'test-user',
      };

      const result = await runtime.execute(context);

      expect(result.error).toBe('Permission test');
      expect(result.success).toBe(false);
      expect(result.outcome).toBe('error');
    });
  });

  describe('Example Hook Implementations', () => {
    it('should demonstrate logging hook pattern', async () => {
      const logs: string[] = [];

      // Example logging hook
      runtime.beforeExecute(async (context: HookContext) => {
        logs.push(`[${new Date().toISOString()}] Executing: ${context.task}`);
      });

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        logs.push(
          `[${new Date().toISOString()}] Completed: ${context.task} ` +
          `(${result.success ? 'SUCCESS' : 'FAILED'}) ` +
          `Cost: $${result.cost.toFixed(4)} ` +
          `Duration: ${result.executionTime}ms`
        );
      });

      const context: TaskContext = {
        task: 'Logged operation',
        userId: 'test-user',
      };

      await runtime.execute(context);

      expect(logs).toHaveLength(2);
      expect(logs[0]).toContain('Executing: Logged operation');
      expect(logs[1]).toContain('Completed: Logged operation');
      expect(logs[1]).toContain('FAILED'); // Expected to fail without LLM
    });

    it('should demonstrate permission checking hook pattern', async () => {
      // Example permission system
      const permissions = new Map([
        ['admin-user', ['read', 'write', 'admin']],
        ['regular-user', ['read']],
        ['guest-user', []],
      ]);

      runtime.beforeExecute(async (context: HookContext) => {
        const userPerms = permissions.get(context.userId || 'guest-user') || [];
        
        if (context.task.includes('delete') && !userPerms.includes('admin')) {
          throw new PermissionDeniedError('Admin permission required for delete operations');
        }
        
        if (context.task.includes('write') && !userPerms.includes('write')) {
          throw new PermissionDeniedError('Write permission required');
        }
      });

      // Test admin user - should succeed
      const adminContext: TaskContext = {
        task: 'delete old files',
        userId: 'admin-user',
      };

      const adminResult = await runtime.execute(adminContext);
      expect(adminResult.error).not.toContain('Admin permission required');

      // Test regular user - should fail
      const userContext: TaskContext = {
        task: 'delete temp files',
        userId: 'regular-user',
      };

      const userResult = await runtime.execute(userContext);
      expect(userResult.error).toBe('Admin permission required for delete operations');
    });

    it('should demonstrate audit trail hook pattern', async () => {
      const auditTrail: Array<{
        agent: string;
        task: string;
        user: string;
        timestamp: number;
        result: 'success' | 'failed' | 'denied';
        cost: number;
      }> = [];

      runtime.afterExecute(async (context: HookContext, result: AgentExecutionResult) => {
        auditTrail.push({
          agent: context.agentName,
          task: context.task,
          user: context.userId || 'anonymous',
          timestamp: context.timestamp,
          result: result.success ? 'success' : (result.error?.includes('Permission') ? 'denied' : 'failed'),
          cost: result.cost,
        });
      });

      // Execute multiple tasks
      await runtime.execute({ task: 'Task 1', userId: 'user-1' });
      await runtime.execute({ task: 'Task 2', userId: 'user-2' });

      expect(auditTrail).toHaveLength(2);
      expect(auditTrail[0]).toMatchObject({
        agent: 'hook-test-agent',
        task: 'Task 1',
        user: 'user-1',
        result: 'failed', // No LLM available
      });
      expect(auditTrail[1]).toMatchObject({
        agent: 'hook-test-agent',
        task: 'Task 2',
        user: 'user-2',
        result: 'failed',
      });
    });
  });
});