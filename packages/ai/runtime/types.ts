/**
 * Agent runtime execution state
 * Tracks messages, observations, and iteration count across execution lifecycle
 */
export interface RuntimeState {
  /** Conversation history including system, user, assistant, and tool messages */
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string; // Tool name for tool messages
    tool_call_id?: string; // For correlating tool results
  }>;
  
  /** Tool execution observations */
  observations: Observation[];
  
  /** Current iteration number (1-indexed) */
  iteration: number;
  
  /** Working memory for caching tool results and intermediate state */
  workingMemory: Map<string, unknown>;
  
  /** Execution completed flag */
  isFinished: boolean;
  
  /** All execution steps for debugging */
  steps: Array<{
    iteration: number;
    thought: string;
    action?: {
      tool: string;
      input: Record<string, unknown>;
    };
    observation?: string;
    timestamp: number;
  }>;
}

/**
 * Tool execution observation
 */
export interface Observation {
  /** Tool that was executed */
  tool: string;
  
  /** Input parameters */
  input: Record<string, unknown>;
  
  /** Tool output (if successful) */
  output?: unknown;
  
  /** Execution duration in milliseconds */
  duration: number;
  
  /** Success flag */
  success: boolean;
  
  /** Error details (if failed) */
  error?: Error;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * LLM decision parsed from provider response
 */
export interface Decision {
  /** Agent's reasoning about the current state */
  thought: string;
  
  /** Action to take (undefined means agent is done) */
  action?: {
    tool: string;
    input: Record<string, unknown>;
  };
}

/**
 * Configuration for AgentRuntime execution
 */
export interface RuntimeConfig {
  /** Maximum iterations before timeout (default: 10) */
  maxIterations?: number;
  
  /** Execution timeout in milliseconds (default: 120000) */
  timeout?: number;
  
  /** Whether to enable memory retrieval and persistence (default: true) */
  memoryEnabled?: boolean;
  
  /** Memory search timeout in milliseconds (default: 3000) */
  memoryTimeout?: number;
  
  /** Memory relevance threshold for filtering (default: 0.7) */
  memoryRelevanceThreshold?: number;
  
  /** Enable periodic summarization for long tasks (default: true) */
  summarizationEnabled?: boolean;
  
  /** Iteration count to trigger summarization (default: 5) */
  summarizationInterval?: number;
  
  /** Enable working memory cache (default: true) */
  workingMemoryEnabled?: boolean;
  
  /** System prompt override (if not provided, uses agent's default) */
  systemPrompt?: string;
}

/**
 * Task context for agent execution
 */
export interface TaskContext {
  /** Task description (user input) */
  task: string;
  
  /** User ID for memory scoping */
  userId?: string;
  
  /** Session ID for telemetry correlation */
  sessionId?: string;
  
  /** Agent ID (defaults to runtime's agentName) */
  agentId?: string;
  
  /** Distributed trace ID for cross-service correlation */
  traceId?: string;
  
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  
  /** Available tools for this execution */
  tools?: Array<{
    name: string;
    description: string;
    schema: unknown; // Zod schema or JSON schema
    execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>;
  }>;
}

/**
 * Context provided to tools during execution
 */
export interface ToolExecutionContext {
  /** Working memory for caching and state sharing */
  workingMemory: Map<string, unknown>;
  
  /** Query DCYFRMemory for relevant information */
  queryMemory: (params: {
    query: string;
    scope: 'user' | 'agent' | 'session';
    userId?: string;
    agentId?: string;
    sessionId?: string;
  }) => Promise<Array<{ content: string; score: number }>>;
  
  /** Current task context */
  taskContext: TaskContext;
  
  /** Current iteration number */
  iteration: number;
}

/**
 * Result of agent execution
 */
export interface AgentExecutionResult {
  /** Execution succeeded */
  success: boolean;
  
  /** Final output (if successful) */
  output?: string;
  
  /** Error message (if failed) */
  error?: string;
  
  /** Execution outcome (success | timeout | max_iterations_reached | routing_failed | error) */
  outcome: 'success' | 'timeout' | 'max_iterations_reached' | 'routing_failed' | 'queue_overflow' | 'error';
  
  /** Execution time in milliseconds */
  executionTime: number;
  
  /** Total cost in USD */
  cost: number;
  
  /** Number of iterations completed */
  iterations: number;
  
  /** Fallback agent used (if any) */
  fallbackUsed?: boolean;
  
  /** Child session IDs (for delegated tasks) */
  childSessions?: string[];
  
  /** Files modified during execution */
  filesModified?: string[];
  
  /** Telemetry session ID */
  sessionId?: string;
  
  /** Memory write failed warning */
  memoryWriteFailed?: boolean;
}

/**
 * Delegation context for multi-agent orchestration
 */
export interface DelegationContext {
  /** Parent task ID */
  parentTaskId: string;
  
  /** Current delegation depth */
  depth: number;
  
  /** Maximum delegation depth allowed */
  maxDepth: number;
  
  /** Parent agent name */
  parentAgent: string;
}
