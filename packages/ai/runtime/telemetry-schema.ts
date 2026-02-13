/**
 * Runtime Telemetry Schema
 * 
 * Defines event types, cost calculations, and metrics for AgentRuntime execution tracking.
 * Provides accurate LLM cost calculations based on current provider pricing.
 * 
 * @module @dcyfr/ai/runtime/telemetry-schema
 */

/**
 * Event types emitted during agent execution
 */
export type ExecutionEventType =
  | 'start'              // Task execution started
  | 'finish'             // Task execution completed
  | 'memory_retrieval'   // Memory context retrieved
  | 'llm_call'           // LLM provider invoked
  | 'tool_execution'     // Tool executed
  | 'error'              // Error occurred
  | 'timeout'            // Execution timed out
  | 'summarization';     // Long-context summarization performed

/**
 * Base execution event structure
 */
export interface ExecutionEvent {
  /** Event type */
  type: ExecutionEventType;
  
  /** ISO timestamp of event */
  timestamp: number;
  
  /** Agent name that generated the event */
  agentName: string;
  
  /** Unique task ID (optional) */
  taskId?: string;
  
  /** User ID (optional) */
  userId?: string;
  
  /** Session ID (optional) */
  sessionId?: string;
}

/**
 * Task execution start event
 */
export interface TaskStartEvent extends ExecutionEvent {
  type: 'start';
  task: string;
}

/**
 * Task execution finish event
 */
export interface TaskFinishEvent extends ExecutionEvent {
  type: 'finish';
  success: boolean;
  iterations: number;
  output?: string;
  duration: number; // milliseconds
  cost?: CostBreakdown;
  error?: string;
}

/**
 * Memory retrieval event
 */
export interface MemoryRetrievalEvent extends ExecutionEvent {
  type: 'memory_retrieval';
  query: string;
  memoriesFound: number;
  memoriesRelevant: number;
  threshold: number;
  duration: number;
  error?: string;
}

/**
 * LLM call event
 */
export interface LLMCallEvent extends ExecutionEvent {
  type: 'llm_call';
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latency: number; // milliseconds
  success: boolean;
  error?: string;
}

/**
 * Tool execution event
 */
export interface ToolExecutionEvent extends ExecutionEvent {
  type: 'tool_execution';
  tool: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Error event
 */
export interface ErrorEvent extends ExecutionEvent {
  type: 'error';
  error: string;
  stack?: string;
  recoverable: boolean;
}

/**
 * Timeout event
 */
export interface TimeoutEvent extends ExecutionEvent {
  type: 'timeout';
  duration: number;
  maxDuration: number;
}

/**
 * Summarization event
 */
export interface SummarizationEvent extends ExecutionEvent {
  type: 'summarization';
  originalLength: number;
  summarizedLength: number;
  compressionRatio: number;
}

/**
 * Union type for all execution events
 */
export type AnyExecutionEvent =
  | TaskStartEvent
  | TaskFinishEvent
  | MemoryRetrievalEvent
  | LLMCallEvent
  | ToolExecutionEvent
  | ErrorEvent
  | TimeoutEvent
  | SummarizationEvent;

/**
 * Cost breakdown for task execution
 */
export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
  provider: string;
  model: string;
}

/**
 * LLM pricing configuration (per 1M tokens in USD)
 */
export interface LLMPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
}

/**
 * Current LLM pricing by provider and model
 * Updated as of February 2026
 */
export const LLM_PRICING: Record<string, Record<string, LLMPricing>> = {
  openai: {
    'gpt-4-turbo': {
      inputCostPer1M: 10.00,   // $10/1M input tokens
      outputCostPer1M: 30.00,  // $30/1M output tokens
    },
    'gpt-4': {
      inputCostPer1M: 30.00,
      outputCostPer1M: 60.00,
    },
    'gpt-3.5-turbo': {
      inputCostPer1M: 0.50,
      outputCostPer1M: 1.50,
    },
  },
  anthropic: {
    'claude-sonnet-4': {
      inputCostPer1M: 3.00,    // $3/1M input tokens
      outputCostPer1M: 15.00,  // $15/1M output tokens
    },
    'claude-sonnet-3.5': {
      inputCostPer1M: 3.00,
      outputCostPer1M: 15.00,
    },
    'claude-opus-3': {
      inputCostPer1M: 15.00,
      outputCostPer1M: 75.00,
    },
    'claude-haiku-3': {
      inputCostPer1M: 0.25,
      outputCostPer1M: 1.25,
    },
  },
  groq: {
    'llama-3-70b': {
      inputCostPer1M: 0.59,
      outputCostPer1M: 0.79,
    },
    'llama-3-8b': {
      inputCostPer1M: 0.05,
      outputCostPer1M: 0.08,
    },
    'mixtral-8x7b': {
      inputCostPer1M: 0.24,
      outputCostPer1M: 0.24,
    },
  },
  ollama: {
    default: {
      inputCostPer1M: 0,  // Local models are free
      outputCostPer1M: 0,
    },
  },
};

/**
 * Calculate LLM cost based on provider, model, and token usage
 * 
 * @param provider - LLM provider (openai, anthropic, groq, ollama)
 * @param model - Model name
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost breakdown
 */
export function calculateLLMCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): CostBreakdown {
  // Normalize provider and model names
  const normalizedProvider = provider.toLowerCase();
  const normalizedModel = model.toLowerCase();

  // Get pricing for provider/model
  let pricing: LLMPricing;
  
  if (normalizedProvider === 'ollama') {
    // All local models are free
    pricing = LLM_PRICING.ollama.default;
  } else if (LLM_PRICING[normalizedProvider]?.[normalizedModel]) {
    pricing = LLM_PRICING[normalizedProvider][normalizedModel];
  } else {
    // Unknown provider/model - use default pricing or throw
    console.warn(
      `[TelemetrySchema] Unknown provider/model: ${provider}/${model}, using zero cost`
    );
    pricing = { inputCostPer1M: 0, outputCostPer1M: 0 };
  }

  // Calculate costs
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost,
    outputCost,
    totalCost,
    currency: 'USD',
    provider,
    model,
  };
}

/**
 * Aggregate cost from multiple LLM calls
 * 
 * @param costs - Array of cost breakdowns
 * @returns Aggregated cost breakdown
 */
export function aggregateCosts(costs: CostBreakdown[]): CostBreakdown {
  if (costs.length === 0) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
      provider: 'multiple',
      model: 'multiple',
    };
  }

  return costs.reduce((acc, cost) => ({
    inputTokens: acc.inputTokens + cost.inputTokens,
    outputTokens: acc.outputTokens + cost.outputTokens,
    totalTokens: acc.totalTokens + cost.totalTokens,
    inputCost: acc.inputCost + cost.inputCost,
    outputCost: acc.outputCost + cost.outputCost,
    totalCost: acc.totalCost + cost.totalCost,
    currency: 'USD',
    provider: acc.provider === cost.provider ? cost.provider : 'multiple',
    model: acc.model === cost.model ? cost.model : 'multiple',
  }));
}

/**
 * Format cost for display
 * 
 * @param cost - Cost breakdown
 * @returns Formatted cost string (e.g., "$0.0123")
 */
export function formatCost(cost: number): string {
  if (cost === 0) {
    return '$0.00';
  }
  
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  
  return `$${cost.toFixed(2)}`;
}

/**
 * Execution metrics aggregated from events
 */
export interface ExecutionMetrics {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  timedOutTasks: number;
  
  totalDuration: number;
  averageDuration: number;
  
  totalCost: CostBreakdown;
  averageCost: number;
  
  totalIterations: number;
  averageIterations: number;
  
  llmCallCount: number;
  toolExecutionCount: number;
  memoryRetrievalCount: number;
  
  errorCount: number;
  errorRate: number;
}

/**
 * Calculate execution metrics from event stream
 * 
 * @param events - Array of execution events
 * @returns Aggregated execution metrics
 */
export function calculateExecutionMetrics(
  events: AnyExecutionEvent[]
): ExecutionMetrics {
  const finishEvents = events.filter(
    (e): e is TaskFinishEvent => e.type === 'finish'
  );
  const llmEvents = events.filter((e): e is LLMCallEvent => e.type === 'llm_call');
  const toolEvents = events.filter(
    (e): e is ToolExecutionEvent => e.type === 'tool_execution'
  );
  const memoryEvents = events.filter(
    (e): e is MemoryRetrievalEvent => e.type === 'memory_retrieval'
  );
  const errorEvents = events.filter((e): e is ErrorEvent => e.type === 'error');

  const totalTasks = finishEvents.length;
  const successfulTasks = finishEvents.filter((e) => e.success).length;
  const failedTasks = finishEvents.filter((e) => !e.success && !e.error?.includes('timeout')).length;
  const timedOutTasks = finishEvents.filter((e) => e.error?.includes('timeout')).length;

  const totalDuration = finishEvents.reduce((sum, e) => sum + e.duration, 0);
  const averageDuration = totalTasks > 0 ? totalDuration / totalTasks : 0;

  const costs = finishEvents.filter((e) => e.cost).map((e) => e.cost!);
  const totalCost = aggregateCosts(costs);
  const averageCost = totalTasks > 0 ? totalCost.totalCost / totalTasks : 0;

  const totalIterations = finishEvents.reduce((sum, e) => sum + e.iterations, 0);
  const averageIterations = totalTasks > 0 ? totalIterations / totalTasks : 0;

  const errorCount = errorEvents.length;
  const errorRate = totalTasks > 0 ? errorCount / totalTasks : 0;

  return {
    totalTasks,
    successfulTasks,
    failedTasks,
    timedOutTasks,
    totalDuration,
    averageDuration,
    totalCost,
    averageCost,
    totalIterations,
    averageIterations,
    llmCallCount: llmEvents.length,
    toolExecutionCount: toolEvents.length,
    memoryRetrievalCount: memoryEvents.length,
    errorCount,
    errorRate,
  };
}
