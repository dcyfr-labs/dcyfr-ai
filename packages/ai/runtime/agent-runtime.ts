import type { ProviderRegistry } from '../core/provider-registry.js';
import type { DCYFRMemory } from '../memory/types.js';
import type { TelemetryEngine, TelemetrySessionManager } from '../core/telemetry-engine.js';
import type { MemorySearchResult } from '../memory/types.js';
import type { ZodSchema } from 'zod';
import type {
  RuntimeState,
  RuntimeConfig,
  TaskContext,
  AgentExecutionResult,
  Decision,
  Observation,
  ToolExecutionContext,
  HookContext,
  BeforeExecuteHook,
  AfterExecuteHook,
} from './types.js';
import { PermissionDeniedError } from './types.js';

/**
 * Version compatibility checking utilities
 */
interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(version: string): VersionInfo {
  const parts = version.replace(/^[^\d]*/, '').split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

function checkVersionCompatibility(runtimeVersion: string, agentsVersion?: string): void {
  // Current @dcyfr/ai version
  const runtime = parseVersion(runtimeVersion);
  
  if (!agentsVersion) {
    console.warn(
      '[AgentRuntime] Warning: Unable to detect @dcyfr/ai-agents version. ' +
      'Ensure versions are compatible. Current runtime: v' + runtimeVersion
    );
    return;
  }
  
  const agents = parseVersion(agentsVersion);
  
  // Version compatibility rules:
  // - Major version must match (1.x.x with 1.x.x)
  // - Runtime can be newer minor version than agents
  // - Agents should not be more than 1 major version ahead
  
  if (runtime.major !== agents.major) {
    console.warn(
      '[AgentRuntime] Version Mismatch Warning: ' +
      `Runtime v${runtimeVersion} (major ${runtime.major}) ` +
      `with Agents v${agentsVersion} (major ${agents.major}). ` +
      'Different major versions may cause compatibility issues. ' +
      'Consider upgrading to matching versions.'
    );
  } else if (agents.minor > runtime.minor + 2) {
    console.warn(
      '[AgentRuntime] Version Skew Warning: ' +
      `Agents v${agentsVersion} is significantly ahead of runtime v${runtimeVersion}. ` +
      'Consider upgrading @dcyfr/ai for latest features and compatibility.'
    );
  }
}

/**
 * AgentRuntime - Executes multi-step tasks with LLM integration
 * 
 * Bridges agent execution loop with LLM providers, memory, and telemetry.
 * Supports tool execution, observation recording, and multi-iteration reasoning.
 * 
 * @example
 * ```typescript
 * const runtime = new AgentRuntime(
 *   'code-reviewer',
 *   providerRegistry,
 *   memory,
 *   telemetry
 * );
 * 
 * const result = await runtime.execute({
 *   task: 'Review the authentication logic in auth.ts',
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   tools: [fileSearchTool, readFileTool]
 * });
 * ```
 */
export class AgentRuntime {
  private agentName: string;
  private providerRegistry: ProviderRegistry;
  private memory: DCYFRMemory;
  private telemetry: TelemetryEngine;
  private config: Required<RuntimeConfig>;
  private beforeExecuteHooks: BeforeExecuteHook[] = [];
  private afterExecuteHooks: AfterExecuteHook[] = [];

  constructor(
    agentName: string,
    providerRegistry: ProviderRegistry,
    memory: DCYFRMemory,
    telemetry: TelemetryEngine,
    config?: RuntimeConfig
  ) {
    // Version compatibility check
    this.performVersionCheck();
    
    this.agentName = agentName;
    this.providerRegistry = providerRegistry;
    this.memory = memory;
    this.telemetry = telemetry;
    
    // Apply default configuration
    this.config = {
      maxIterations: config?.maxIterations ?? 10,
      timeout: config?.timeout ?? 120000, // 2 minutes
      memoryEnabled: config?.memoryEnabled ?? true,
      memoryTimeout: config?.memoryTimeout ?? 3000,
      memoryRelevanceThreshold: config?.memoryRelevanceThreshold ?? 0.7,
      summarizationEnabled: config?.summarizationEnabled ?? true,
      summarizationInterval: config?.summarizationInterval ?? 5,
      workingMemoryEnabled: config?.workingMemoryEnabled ?? true,
      persistWorkingMemory: config?.persistWorkingMemory ?? false,
      debugWorkingMemory: config?.debugWorkingMemory ?? false,
      systemPrompt: config?.systemPrompt ?? this.getDefaultSystemPrompt(),
    };
  }

  /**
   * Check version compatibility between @dcyfr/ai and @dcyfr/ai-agents
   * Logs warnings if version mismatches could cause issues
   */
  private performVersionCheck(): void {
    try {
      // Get current runtime version from package.json
      const runtimeVersion = '1.0.4'; // This should be dynamically imported in production
      
      // Try to detect agents package version
      let agentsVersion: string | undefined;
      
      try {
        // This is a best-effort detection - in practice, the calling package
        // would need to provide this information
        const process = globalThis.process;
        if (process?.versions) {
          // Check environment for version info
          agentsVersion = process.env.DCYFR_AGENTS_VERSION;
        }
      } catch {
        // Ignore errors in version detection
      }
      
      checkVersionCompatibility(runtimeVersion, agentsVersion);
    } catch (error) {
      // Don't fail initialization due to version checking issues
      console.warn('[AgentRuntime] Version check failed:', error);
    }
  }

  /**
   * Register a before-execution hook
   * 
   * Hooks are called before task execution begins.
   * A hook can reject execution by throwing PermissionDeniedError.
   * 
   * @param hook - Function to call before execution
   * 
   * @example
   * ```typescript
   * runtime.beforeExecute(async (context) => {
   *   if (!hasPermission(context.userId, 'execute')) {
   *     throw new PermissionDeniedError('User lacks execute permission');
   *   }
   * });
   * ```
   */
  beforeExecute(hook: BeforeExecuteHook): void {
    this.beforeExecuteHooks.push(hook);
  }

  /**
   * Register an after-execution hook
   * 
   * Hooks are called after task execution completes (success or failure).
   * Useful for logging, auditing, or cleanup operations.
   * 
   * @param hook - Function to call after execution
   * 
   * @example
   * ```typescript
   * runtime.afterExecute(async (context, result) => {
   *   await auditLog.record({
   *     agent: context.agentName,
   *     task: context.task,
   *     success: result.success,
   *     cost: result.cost,
   *   });
   * });
   * ```
   */
  afterExecute(hook: AfterExecuteHook): void {
    this.afterExecuteHooks.push(hook);
  }

  /**
   * Execute a task from start to completion
   * 
   * @param context - Task context with description, tools, and metadata
   * @returns Execution result with output, cost, and telemetry data
   */
  async execute(context: TaskContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    let sessionManager: TelemetrySessionManager | undefined;
    let sessionId: string | undefined;
    let memoryWriteFailed = false;

    try {
      // Create hook context
      const hookContext: HookContext = {
        agentName: this.agentName,
        task: context.task,
        userId: context.userId,
        sessionId: context.sessionId,
        timestamp: Date.now(),
      };

      // Run before-execution hooks
      for (const hook of this.beforeExecuteHooks) {
        try {
          await hook(hookContext);
        } catch (error) {
          // Check if permission was denied
          if (error instanceof PermissionDeniedError) {
            const executionTime = Date.now() - startTime;
            const result: AgentExecutionResult = {
              success: false,
              error: error.message,
              outcome: 'error',
              executionTime,
              cost: 0,
              iterations: 0,
            };

            // Run after-execution hooks even on permission denial
            await this.runAfterExecuteHooks(hookContext, result);

            return result;
          }
          // Mark as hook error and re-throw
          const hookError = error instanceof Error ? error : new Error(String(error));
          (hookError as any).isHookError = true;
          throw hookError;
        }
      }

      // Create telemetry session
      // Note: startSession expects AgentType, but we have agentName as string
      // For now, we'll use 'claude' as default - this should be configurable
      sessionManager = this.telemetry.startSession(
        'claude' as any, // TODO: Make agentType configurable
        {
          taskType: 'feature',
          description: context.task,
        }
      );
      sessionId = sessionManager.getSession().sessionId;

      // Emit start event
      this.emitEvent({
        type: 'start',
        agentName: this.agentName,
        task: context.task,
        timestamp: Date.now(),
      });

      // Initialize state
      const state = await this.initializeState(context);

      // Execute with timeout
      const result = await this.executeWithTimeout(state, context, startTime);

      // Persist insights to memory
      if (this.config.memoryEnabled && result.success) {
        try {
          await this.persistInsights(context, state, result);
        } catch (error) {
          console.warn('[AgentRuntime] Failed to persist insights:', error);
          memoryWriteFailed = true;
        }
      }

      // Debug log working memory state
      if (this.config.debugWorkingMemory && state.workingMemory.size > 0) {
        const memorySnapshot: Record<string, unknown> = {};
        state.workingMemory.forEach((value, key) => {
          memorySnapshot[key] = value;
        });
        console.log('[WorkingMemory] Final state:', JSON.stringify(memorySnapshot, null, 2));
      }

      // Clear working memory unless persistence is enabled
      if (!this.config.persistWorkingMemory) {
        if (this.config.debugWorkingMemory) {
          console.log('[WorkingMemory] Clearing ephemeral state');
        }
        state.workingMemory.clear();
      }

      // End telemetry session
      if (sessionManager) {
        await sessionManager.end(result.success ? 'success' : 'failed');
      }

      // Emit finish event
      this.emitEvent({
        type: 'finish',
        success: result.success,
        iterations: state.iteration,
        output: result.output,
        duration: Date.now() - startTime,
        error: result.error,
      });

      const finalResult = {
        ...result,
        sessionId,
        memoryWriteFailed: memoryWriteFailed || undefined,
      };

      // Run after-execution hooks
      const finalHookContext: HookContext = {
        agentName: this.agentName,
        task: context.task,
        userId: context.userId,
        sessionId: context.sessionId,
        timestamp: Date.now(),
      };
      await this.runAfterExecuteHooks(finalHookContext, finalResult);

      return finalResult;
    } catch (error) {
      // Re-throw hook errors to propagate them properly
      if (error && typeof error === 'object' && (error as any).isHookError) {
        throw error;
      }

      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // End telemetry session on error
      if (sessionManager) {
        await sessionManager.end('failed');
      }

      // Emit error event
      this.emitEvent({
        type: 'error',
        error: error instanceof Error ? error : new Error(errorMessage),
        context: 'execution',
        timestamp: Date.now(),
      });

      const result: AgentExecutionResult = {
        success: false,
        error: errorMessage,
        outcome: 'error',
        executionTime,
        cost: 0,
        iterations: 0,
        sessionId,
      };

      // Run after-execution hooks even on error
      const errorHookContext: HookContext = {
        agentName: this.agentName,
        task: context.task,
        userId: context.userId,
        sessionId: context.sessionId,
        timestamp: Date.now(),
      };
      await this.runAfterExecuteHooks(errorHookContext, result);

      return result;
    }
  }

  /**
   * Run all after-execution hooks
   * @private
   */
  private async runAfterExecuteHooks(
    hookContext: HookContext,
    result: AgentExecutionResult
  ): Promise<void> {
    for (const hook of this.afterExecuteHooks) {
      try {
        await hook(hookContext, result);
      } catch (error) {
        // Log hook errors but don't fail execution
        console.warn('[AgentRuntime] After-execute hook failed:', error);
      }
    }
  }

  /**
   * Initialize execution state with memory context
   */
  private async initializeState(context: TaskContext): Promise<RuntimeState> {
    const state: RuntimeState = {
      messages: [],
      observations: [],
      iteration: 0,
      workingMemory: new Map(),
      isFinished: false,
      steps: [],
    };

    // Retrieve memory context if enabled
    let memoryContext = '';
    if (this.config.memoryEnabled) {
      memoryContext = await this.retrieveContext(context);
    }

    // Build system prompt with memory context
    const systemPrompt = memoryContext
      ? `${this.config.systemPrompt}\n\nPrevious relevant information:\n${memoryContext}`
      : this.config.systemPrompt;

    // Initialize messages with system prompt and user task
    state.messages.push({
      role: 'system',
      content: systemPrompt,
    });

    state.messages.push({
      role: 'user',
      content: context.task,
    });

    return state;
  }

  /**
   * Execute task with timeout enforcement
   */
  private async executeWithTimeout(
    state: RuntimeState,
    context: TaskContext,
    startTime: number
  ): Promise<Omit<AgentExecutionResult, 'sessionId'>> {
    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        resolve({
          success: false,
          outcome: 'timeout',
          executionTime: Date.now() - startTime,
          cost: this.calculateCost(state),
          iterations: state.iteration,
          error: `Execution exceeded timeout of ${this.config.timeout}ms`,
        });
      }, this.config.timeout);

      this.executeIterations(state, context, startTime)
        .then((result) => {
          clearTimeout(timeoutHandle);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutHandle);
          resolve({
            success: false,
            outcome: 'error',
            executionTime: Date.now() - startTime,
            cost: this.calculateCost(state),
            iterations: state.iteration,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    });
  }

  /**
   * Execute iteration loop until completion or max iterations
   */
  private async executeIterations(
    state: RuntimeState,
    context: TaskContext,
    startTime: number
  ): Promise<Omit<AgentExecutionResult, 'sessionId'>> {
    while (!state.isFinished && state.iteration < this.config.maxIterations) {
      state.iteration++;

      // Make decision via LLM
      const decision = await this.makeDecision(state, context);

      // Record step
      state.steps.push({
        iteration: state.iteration,
        thought: decision.thought,
        action: decision.action,
        timestamp: Date.now(),
      });

      // Debug log working memory state after each step
      if (this.config.debugWorkingMemory && state.workingMemory.size > 0) {
        const memorySnapshot: Record<string, unknown> = {};
        state.workingMemory.forEach((value, key) => {
          memorySnapshot[key] = value;
        });
        console.log(`[WorkingMemory Step ${state.iteration}]`, JSON.stringify(memorySnapshot, null, 2));
      }

      // Emit step event
      this.emitEvent({
        type: 'step',
        iteration: state.iteration,
        thought: decision.thought,
        action: decision.action,
        timestamp: Date.now(),
      });

      // Execute action if present
      if (decision.action) {
        const observation = await this.executeTool(decision.action, context, state);
        
        state.observations.push(observation);
        state.steps[state.steps.length - 1].observation = observation.success
          ? String(observation.output)
          : observation.error?.message || 'Tool execution failed';

        // Add observation to messages
        state.messages.push({
          role: 'tool',
          content: observation.success
            ? JSON.stringify(observation.output)
            : `Error: ${observation.error?.message}`,
          name: observation.tool,
        });
      } else {
        // No action means agent is done
        state.isFinished = true;
      }

      // Check for periodic summarization
      if (
        this.config.summarizationEnabled &&
        state.iteration === this.config.summarizationInterval
      ) {
        await this.summarizeMessages(state, context);
      }
    }

    // Check if max iterations reached
    if (state.iteration >= this.config.maxIterations && !state.isFinished) {
      return {
        success: false,
        outcome: 'max_iterations_reached',
        executionTime: Date.now() - startTime,
        cost: this.calculateCost(state),
        iterations: state.iteration,
        error: `Reached maximum iterations (${this.config.maxIterations})`,
      };
    }

    // Extract final output from last assistant message
    const lastAssistantMessage = [...state.messages]
      .reverse()
      .find((m) => m.role === 'assistant');

    return {
      success: true,
      outcome: 'success',
      output: lastAssistantMessage?.content || 'Task completed',
      executionTime: Date.now() - startTime,
      cost: this.calculateCost(state),
      iterations: state.iteration,
    };
  }

  /**
   * Make a decision using LLM via ProviderRegistry
   */
  private async makeDecision(
    state: RuntimeState,
    context: TaskContext
  ): Promise<Decision> {
    // Format prompt with message history and tool descriptions
    const prompt = this.formatPrompt(state, context);

    // Build TaskContext for provider registry
    const providerTask: import('../types').TaskContext = {
      description: context.task,
      phase: 'implementation',
      filesInProgress: [],
    };

    // Call LLM via provider registry with fallback
    const result = await this.providerRegistry.executeWithFallback(
      providerTask,
      async (provider) => {
        // TODO: Actual provider-specific API calls
        // For now, return a mock response that demonstrates the format
        // Real implementation would call:
        //   - Anthropic API for claude/anthropic
        //   - OpenAI API for openai/groq
        //   - Ollama API for ollama
        //   - Copilot API for copilot
        
        console.warn(`[AgentRuntime] Calling LLM provider: ${provider} (mock response)`);
        
        // Mock response that will be parsed
        return {
          content: `Thought: I need to analyze the task and determine the best approach.\nFinal Answer: Task analysis complete.`,
          usage: {
            inputTokens: prompt.length / 4, // Rough estimate
            outputTokens: 50,
          },
        };
      }
    );

    // Parse response into decision
    const decision = this.parseDecision(result.data);

    // Track token usage for cost calculation
    if (result.data && typeof result.data === 'object') {
      const data = result.data as any;
      const usage = data.usage;
      if (usage) {
        const currentTokens = (state.workingMemory.get('tokens') as any) || {
          input: 0,
          output: 0,
        };
        state.workingMemory.set('tokens', {
          input: currentTokens.input + (usage.inputTokens || 0),
          output: currentTokens.output + (usage.outputTokens || 0),
        });
      }
    }

    // Track provider used for cost calculation
    state.workingMemory.set('provider', result.provider);

    // Add assistant response to messages
    state.messages.push({
      role: 'assistant',
      content: `Thought: ${decision.thought}${decision.action ? `\nAction: ${decision.action.tool}\nAction Input: ${JSON.stringify(decision.action.input)}` : '\nFinal Answer: Complete'}`,
    });

    return decision;
  }

  /**
   * Format prompt with message history and tool descriptions
   */
  private formatPrompt(state: RuntimeState, context: TaskContext): string {
    // Build tool descriptions in machine-readable format
    const toolDescriptions = context.tools?.map((tool) => {
      return `Tool: ${tool.name}\nDescription: ${tool.description}\nInput schema: ${JSON.stringify(tool.schema, null, 2)}`;
    }).join('\n\n') || '';

    // Format message history
    const messages = state.messages
      .map((m) => {
        if (m.role === 'tool') {
          return `[tool:${m.name}]: ${m.content}`;
        }
        return `[${m.role}]: ${m.content}`;
      })
      .join('\n');

    const toolSection = toolDescriptions
      ? `\n\nAvailable tools:\n${toolDescriptions}\n\nTo use a tool, respond with:\nThought: <your reasoning>\nAction: <tool_name>\nAction Input: <JSON input>\n\nOr to finish, respond with:\nThought: <final thoughts>\nFinal Answer: <response>`
      : '';

    return `${messages}${toolSection}`;
  }

  /**
   * Parse LLM response into Decision object
   * Supports both tool_use format and text-based format
   */
  private parseDecision(response: unknown): Decision {
    try {
      // Try parsing as structured tool_use response first
      if (typeof response === 'object' && response !== null) {
        const resp = response as any;
        
        // Check for tool_use format (Anthropic-style)
        if (resp.content && Array.isArray(resp.content)) {
          const textBlock = resp.content.find((block: any) => block.type === 'text');
          const toolBlock = resp.content.find((block: any) => block.type === 'tool_use');
          
          if (toolBlock) {
            return {
              thought: textBlock?.text || 'Using tool',
              action: {
                tool: toolBlock.name,
                input: toolBlock.input,
              },
            };
          }
        }
        
        // Check for direct action format
        if (resp.action) {
          return {
            thought: resp.thought || 'Decision made',
            action: resp.action,
          };
        }
        
        // Extract text content for text-based parsing
        const textContent = resp.content || resp.text || String(response);
        return this.parseTextDecision(textContent);
      }
      
      // Fallback to text parsing
      return this.parseTextDecision(String(response));
    } catch (error) {
      console.error('[AgentRuntime] Decision parsing failed:', error);
      return {
        thought: 'Error parsing response',
        action: undefined,
      };
    }
  }

  /**
   * Parse text-based decision format
   * Expected format:
   *   Thought: <reasoning>
   *   Action: <tool_name>
   *   Action Input: <JSON>
   * Or:
   *   Thought: <reasoning>
   *   Final Answer: <response>
   */
  private parseTextDecision(text: string): Decision {
    // Extract thought
    const thoughtMatch = text.match(/Thought:\s*(.+?)(?=\n(?:Action|Final Answer)|$)/s);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : 'Thinking...';
    
    // Check for Final Answer (agent is done)
    if (text.includes('Final Answer:')) {
      return { thought, action: undefined };
    }
    
    // Extract action
    const actionMatch = text.match(/Action:\s*(.+?)(?=\n|$)/);
    const actionInputMatch = text.match(/Action Input:\s*(.+?)(?=\n(?:Thought|Action|$)|$)/s);
    
    if (actionMatch && actionInputMatch) {
      const toolName = actionMatch[1].trim();
      const inputStr = actionInputMatch[1].trim();
      
      try {
        const input = JSON.parse(inputStr);
        return {
          thought,
          action: {
            tool: toolName,
            input,
          },
        };
      } catch (error) {
        console.warn('[AgentRuntime] Failed to parse action input as JSON:', inputStr);
        return { thought, action: undefined };
      }
    }
    
    // No action found
    return { thought, action: undefined };
  }

  /**
   * Execute a tool with Zod validation
   */
  private async executeTool(
    action: { tool: string; input: Record<string, unknown> },
    context: TaskContext,
    state: RuntimeState
  ): Promise<Observation> {
    const startTime = Date.now();
    const tool = context.tools?.find((t) => t.name === action.tool);

    if (!tool) {
      const observation: Observation = {
        tool: action.tool,
        input: action.input,
        duration: Date.now() - startTime,
        success: false,
        error: new Error(`Tool not found: ${action.tool}`),
        timestamp: Date.now(),
      };
      
      this.emitEvent({
        type: 'error',
        error: observation.error,
        context: 'tool_not_found',
        timestamp: Date.now(),
      });
      
      return observation;
    }

    // Emit tool_call event
    this.emitEvent({
      type: 'tool_call',
      tool: action.tool,
      input: action.input,
      iteration: state.iteration,
      timestamp: Date.now(),
    });

    try {
      // Validate input against Zod schema if available
      if (tool.schema && typeof (tool.schema as any).safeParse === 'function') {
        const schema = tool.schema as ZodSchema;
        const validationResult = schema.safeParse(action.input);
        
        if (!validationResult.success) {
          const validationError = new Error(
            `Tool input validation failed for ${action.tool}: ${validationResult.error.message}`
          );
          
          this.emitEvent({
            type: 'error',
            error: validationError,
            context: 'tool_validation',
            timestamp: Date.now(),
          });
          
          return {
            tool: action.tool,
            input: action.input,
            duration: Date.now() - startTime,
            success: false,
            error: validationError,
            timestamp: Date.now(),
          };
        }
        
        // Use validated input
        action.input = validationResult.data as Record<string, unknown>;
      }
      
      // Build tool execution context
      const toolContext: ToolExecutionContext = {
        workingMemory: state.workingMemory,
        queryMemory: this.createQueryMemoryHelper(context),
        taskContext: context,
        iteration: state.iteration,
      };

      // Check working memory cache if enabled
      if (this.config.workingMemoryEnabled) {
        const cacheKey = `tool:${action.tool}:${this.hashInput(action.input)}`;
        const cachedResult = state.workingMemory.get(cacheKey);
        
        if (cachedResult !== undefined) {
          this.emitEvent({
            type: 'working_memory_hit',
            tool: action.tool,
            cacheKey,
            timestamp: Date.now(),
          });
          
          return {
            tool: action.tool,
            input: action.input,
            output: cachedResult,
            duration: Date.now() - startTime,
            success: true,
            timestamp: Date.now(),
          };
        }
      }

      // Execute tool
      const output = await tool.execute(action.input, toolContext);
      const duration = Date.now() - startTime;

      // Cache result in working memory if enabled
      if (this.config.workingMemoryEnabled) {
        const cacheKey = `tool:${action.tool}:${this.hashInput(action.input)}`;
        state.workingMemory.set(cacheKey, output);
      }

      // Emit tool_result event
      this.emitEvent({
        type: 'tool_result',
        tool: action.tool,
        result: output,
        duration,
        timestamp: Date.now(),
      });

      return {
        tool: action.tool,
        input: action.input,
        output,
        duration,
        success: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Emit error event
      this.emitEvent({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        context: 'tool_execution',
        timestamp: Date.now(),
      });

      return {
        tool: action.tool,
        input: action.input,
        duration,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Hash input object for cache key
   */
  private hashInput(input: Record<string, unknown>): string {
    const sorted = Object.keys(input).sort((a, b) => a.localeCompare(b)).reduce((acc, key) => {
      acc[key] = input[key];
      return acc;
    }, {} as Record<string, unknown>);
    return JSON.stringify(sorted);
  }

  /**
   * Retrieve relevant context from DCYFRMemory
   */
  private async retrieveContext(context: TaskContext): Promise<string> {
    const startTime = Date.now();
    
    try {
      let memories: MemorySearchResult[] = [];
      
      // Determine scope and call appropriate search method
      if (context.userId) {
        memories = await Promise.race([
          this.memory.searchUserMemories(context.userId, context.task, 5),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Memory search timeout')), this.config.memoryTimeout)
          ),
        ]);
      } else if (context.sessionId) {
        // Session memory - for now, fallback to agent memory with sessionId filter
        // TODO: Add searchSessionMemories once implemented in DCYFRMemory
        memories = await Promise.race([
          this.memory.searchAgentMemories(
            context.agentId || this.agentName,
            context.task,
            5
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Memory search timeout')), this.config.memoryTimeout)
          ),
        ]);
      } else {
        // Agent scope
        memories = await Promise.race([
          this.memory.searchAgentMemories(
            context.agentId || this.agentName,
            context.task,
            5
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Memory search timeout')), this.config.memoryTimeout)
          ),
        ]);
      }

      // Filter by relevance threshold
      const relevant = memories.filter(
        (m: MemorySearchResult) => m.relevance > this.config.memoryRelevanceThreshold
      );

      // Emit memory retrieval telemetry event
      this.emitEvent({
        type: 'memory_retrieval',
        agentName: this.agentName,
        query: context.task,
        memoriesFound: memories.length,
        memoriesRelevant: relevant.length,
        threshold: this.config.memoryRelevanceThreshold,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      });

      if (relevant.length === 0) {
        return '';
      }

      return relevant.map((m: MemorySearchResult) => `- ${m.content}`).join('\n');
    } catch (error) {
      // Emit error event
      this.emitEvent({
        type: 'memory_retrieval',
        agentName: this.agentName,
        query: context.task,
        memoriesFound: 0,
        memoriesRelevant: 0,
        threshold: this.config.memoryRelevanceThreshold,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
      
      console.warn('[AgentRuntime] Memory search failed:', error);
      return '';
    }
  }

  /**
   * Persist execution insights to DCYFRMemory
   */
  private async persistInsights(
    context: TaskContext,
    state: RuntimeState,
    result: AgentExecutionResult
  ): Promise<void> {
    const summary = `Task: ${context.task}\nOutcome: ${result.outcome}\nIterations: ${state.iteration}\nTools used: ${state.observations.map((o) => o.tool).join(', ')}`;
    
    // Store in user memory if userId is present
    if (context.userId) {
      await this.memory.addUserMemory(context.userId, summary, {
        metadata: {
          agentId: context.agentId || this.agentName,
          sessionId: context.sessionId,
          success: result.success,
          toolsUsed: state.observations.map((o) => o.tool),
        },
      });
    } else {
      // Store in agent memory
      await this.memory.addAgentMemory(
        context.agentId || this.agentName,
        context.sessionId || `runtime-${Date.now()}`,
        {
          task: context.task,
          outcome: result.outcome,
          iterations: state.iteration,
          success: result.success,
          toolsUsed: state.observations.map((o) => o.tool),
          summary,
        }
      );
    }
  }

  /**
   * Summarize message history to prevent prompt bloat
   */
  private async summarizeMessages(state: RuntimeState, context: TaskContext): Promise<void> {
    // TODO: Implement summarization via LLM
    // Placeholder: truncate to last 2 iterations
    const keepCount = 4; // system + user + last 2 iterations
    if (state.messages.length > keepCount) {
      state.messages = [
        state.messages[0], // system
        state.messages[1], // user
        ...state.messages.slice(-2), // last 2
      ];
    }
  }

  /**
   * Create queryMemory helper for tools
   */
  private createQueryMemoryHelper(context: TaskContext) {
    return async (params: {
      query: string;
      scope: 'user' | 'agent' | 'session';
      userId?: string;
      agentId?: string;
      sessionId?: string;
    }): Promise<Array<{ content: string; score: number }>> => {
      try {
        let memories: MemorySearchResult[] = [];
        
        if (params.scope === 'user' && (params.userId || context.userId)) {
          memories = await Promise.race([
            this.memory.searchUserMemories(
              params.userId || context.userId!,
              params.query,
              5
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Memory query timeout')), this.config.memoryTimeout)
            ),
          ]);
        } else {
          // Agent or session scope
          memories = await Promise.race([
            this.memory.searchAgentMemories(
              params.agentId || context.agentId || this.agentName,
              params.query,
              5
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Memory query timeout')), this.config.memoryTimeout)
            ),
          ]);
        }

        return memories
          .filter((m: MemorySearchResult) => m.relevance > this.config.memoryRelevanceThreshold)
          .map((m: MemorySearchResult) => ({
            content: m.content,
            score: m.relevance,
          }));
      } catch (error) {
        console.warn('[AgentRuntime] Tool memory query failed:', error);
        return [];
      }
    };
  }

  /**
   * Calculate execution cost from token usage
   */
  private calculateCost(state: RuntimeState): number {
    const tokens = state.workingMemory.get('tokens') as any;
    const provider = state.workingMemory.get('provider') as string;
    
    if (!tokens) {
      return 0;
    }
    
    const totalTokens = (tokens.input || 0) + (tokens.output || 0);
    
    // Provider-specific pricing (per million tokens)
    const pricing: Record<string, number> = {
      claude: 15.0, // $15 per 1M tokens
      anthropic: 15.0, // Same as claude
      openai: 10.0, // Approximate for GPT-4
      copilot: 0, // Using GitHub's models
      groq: 0, // Free tier
      ollama: 0, // Local model
    };
    
    const pricePerMillion = pricing[provider] || 0;
    
    // Calculate cost: (tokens / 1,000,000) * price per million
    return (totalTokens / 1_000_000) * pricePerMillion;
  }

  /**
   * Event listeners for runtime events
   */
  private eventListeners: Array<(event: any) => void> = [];

  /**
   * Subscribe to runtime events
   */
  public on(listener: (event: any) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Unsubscribe from runtime events
   */
  public off(listener: (event: any) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit lifecycle events to all listeners
   */
  private emitEvent(event: any): void {
    // Emit to registered listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[AgentRuntime] Event listener error:', error);
      }
    }
    
    // Also log for debugging (can be disabled in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AgentRuntime Event]', event);
    }
  }

  /**
   * Get default system prompt for agent
   */
  private getDefaultSystemPrompt(): string {
    return `You are ${this.agentName}, an AI agent that helps users complete tasks.

You have access to tools that you can use to accomplish your goals.

For each step:
1. Think about what you need to do next
2. Decide which tool to use (if any)
3. Provide your reasoning

When you are done with the task, respond without selecting a tool.`;
  }
}
