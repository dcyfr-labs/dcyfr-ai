/**
 * Agent Type Definitions for DCYFR AI Framework
 *
 * Defines the interfaces and types for the agent system including manifests,
 * categories, tiers, and execution contexts.
 *
 * @module @dcyfr/ai/agents/types
 */

import type { ValidationSeverity, TaskContext } from '../types';

/**
 * Agent category classification
 * Used for organizing and routing agents by their specialization
 */
export type AgentCategory =
  | 'core'
  | 'development'
  | 'architecture'
  | 'testing'
  | 'security'
  | 'performance'
  | 'content'
  | 'devops'
  | 'data'
  | 'research'
  | 'specialized';

/**
 * Agent tier for OPSEC and loading priority
 * - public: Available in @dcyfr/ai (npm)
 * - private: Available in @dcyfr/agents (git+ssh)
 * - project: Project-specific overrides
 */
export type AgentTier = 'public' | 'private' | 'project';

/**
 * Model preference for agent execution
 */
export type AgentModel = 'haiku' | 'sonnet' | 'opus';

/**
 * Permission mode for agent actions
 */
export type AgentPermissionMode = 'readonly' | 'acceptEdits' | 'full';

/**
 * Quality gate definition for agent enforcement
 */
export interface AgentQualityGate {
  name: string;
  threshold: number;
  metric: string;
  failureMode: 'error' | 'warn' | 'skip';
}

/**
 * Proactive trigger for agent activation
 */
export interface AgentProactiveTrigger {
  /** Pattern to match (string or regex pattern string) */
  pattern: string;
  /** Action to take when triggered */
  action: 'warn' | 'block' | 'fix' | 'suggest';
  /** Message to display */
  message: string;
  /** Priority (lower = higher priority) */
  priority?: number;
}

/**
 * Agent skill reference
 */
export interface AgentSkill {
  name: string;
  path?: string;
  required?: boolean;
}

/**
 * Agent manifest - complete agent definition
 */
export interface AgentManifest {
  /** Unique agent identifier */
  name: string;
  /** Version following semver */
  version: string;
  /** Human-readable description */
  description: string;
  /** Agent category for routing */
  category: AgentCategory;
  /** Distribution tier */
  tier: AgentTier;
  /** Preferred model */
  model: AgentModel;
  /** Permission level */
  permissionMode: AgentPermissionMode;
  /** Tools the agent can use */
  tools: string[];
  /** Agents this agent can delegate to */
  delegatesTo?: string[];
  /** Agents that delegate to this one */
  delegatedFrom?: string[];
  /** Proactive triggers */
  proactiveTriggers?: AgentProactiveTrigger[];
  /** Quality gates to enforce */
  qualityGates?: AgentQualityGate[];
  /** Skills this agent uses */
  skills?: AgentSkill[];
  /** Author information */
  author?: string;
  /** License */
  license?: string;
  /** Custom configuration schema */
  configSchema?: Record<string, unknown>;
  /** Tags for filtering/searching */
  tags?: string[];
}

/**
 * Agent lifecycle hooks
 */
export interface AgentHooks {
  /** Called when agent is loaded */
  onLoad?: () => void | Promise<void>;
  /** Called when agent is unloaded */
  onUnload?: () => void | Promise<void>;
  /** Called before agent executes */
  onBeforeExecute?: (context: AgentExecutionContext) => void | Promise<void>;
  /** Called after agent executes */
  onAfterExecute?: (context: AgentExecutionContext, result: AgentExecutionResult) => void | Promise<void>;
  /** Called when agent encounters an error */
  onError?: (error: Error, context: AgentExecutionContext) => void | Promise<void>;
}

/**
 * Complete agent definition
 */
export interface Agent extends AgentHooks {
  /** Agent manifest */
  manifest: AgentManifest;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Instructions (markdown content) */
  instructions?: string;
}

/**
 * Loaded agent wrapper with metadata
 */
export interface LoadedAgent {
  name: string;
  manifest: AgentManifest;
  agent: Agent;
  tier: AgentTier;
  source: string;
  loaded: Date;
  enabled: boolean;
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  /** Task to execute */
  task: TaskContext;
  /** Agent configuration */
  config: Record<string, unknown>;
  /** Working directory */
  workingDirectory: string;
  /** Files in scope */
  files: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Agent that executed */
  agentName: string;
  /** Execution time in ms */
  executionTime: number;
  /** Whether fallback was used */
  fallbackUsed: boolean;
  /** Original agent if fallback was used */
  originalAgent?: string;
  /** Files modified */
  filesModified: string[];
  /** Violations detected */
  violations: AgentViolation[];
  /** Warnings generated */
  warnings: AgentViolation[];
  /** Error if failed */
  error?: Error;
}

/**
 * Agent violation (from quality gates)
 */
export interface AgentViolation {
  type: string;
  severity: ValidationSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  agentName: string;
  gateName?: string;
}

/**
 * Routing rule for agent selection
 */
export interface AgentRoutingRule {
  /** Pattern to match task description */
  pattern: string | RegExp;
  /** Agent to route to */
  agent: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Condition function */
  condition?: (task: TaskContext) => boolean;
}

/**
 * Routing result from agent router
 */
export interface AgentRoutingResult {
  /** Selected agent */
  agent: Agent;
  /** Matched rule */
  matchedRule?: AgentRoutingRule;
  /** Fallback agents if primary fails */
  fallbacks: Agent[];
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Agent registry configuration
 */
export interface AgentRegistryConfig {
  /** Enable auto-discovery of agents */
  autoDiscover?: boolean;
  /** Paths to search for project agents */
  projectPaths?: string[];
  /** Public tier configuration */
  public?: {
    enabled: boolean;
    source?: string;
  };
  /** Private tier configuration */
  private?: {
    enabled: boolean;
    source?: string;
  };
  /** Project tier configuration */
  project?: {
    enabled: boolean;
    paths?: string[];
  };
}

/**
 * Agent loader configuration
 */
export interface AgentLoaderConfig {
  /** Search paths for agents */
  searchPaths: string[];
  /** Enable auto-discovery */
  autoDiscover: boolean;
  /** Failure mode */
  failureMode: 'throw' | 'warn' | 'silent';
  /** Timeout for agent operations (ms) */
  timeout: number;
}

/**
 * Agent router configuration
 */
export interface AgentRouterConfig {
  /** Default agent to use if no match */
  defaultAgent: string;
  /** Routing rules */
  routingRules: AgentRoutingRule[];
  /** Enable delegation between agents */
  delegationEnabled: boolean;
  /** Maximum delegation depth */
  maxDelegationDepth?: number;
}
