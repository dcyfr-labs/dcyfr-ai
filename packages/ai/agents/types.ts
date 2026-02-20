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
 * Personality trait value (0-1 scale)
 * Examples: warmth=0.7, formality=0.5, humor=0.3
 */
export type PersonalityTrait = number;

/**
 * Personality traits defining agent voice characteristics
 * All values on 0-1 scale (e.g., warmth: 0.7 = fairly warm)
 */
export interface PersonalityTraits {
  /** Warmth level (collaborative, supportive) */
  warmth?: PersonalityTrait;
  /** Formality level (structured, professional) */
  formality?: PersonalityTrait;
  /** Humor level (playful, lighthearted) */
  humor?: PersonalityTrait;
  /** Directness level (clear, straightforward) */
  directness?: PersonalityTrait;
  /** Technical depth level (precise, expert-level) */
  technicality?: PersonalityTrait;
  /** Empathy level (understanding, patient) */
  empathy?: PersonalityTrait;
  /** Custom traits (extend as needed) */
  [key: string]: PersonalityTrait | undefined;
}

/**
 * Situational tone adjustment
 * Modifies base personality for specific contexts
 */
export interface SituationalTone {
  /** Tone identifier (e.g., 'teaching', 'error_handling', 'security_warning') */
  situation: string;
  /** Trait adjustments relative to base (e.g., {warmth: '+0.2', formality: '-0.1'}) */
  traitAdjustments: Partial<Record<keyof PersonalityTraits, string>>;
  /** Guidance for applying this tone */
  guidance: string;
}

/**
 * Intent signal for proactive guidance
 * Detects user intent from context to adjust response style
 */
export interface IntentSignal {
  /** Intent type */
  type: 'learning' | 'debugging' | 'building' | 'reviewing' | 'exploring' | 'rushing';
  /** File patterns that signal this intent (glob or regex strings) */
  filePatterns?: string[];
  /** Context keywords that signal this intent */
  keywords?: string[];
  /** Guidance for responding to this intent */
  guidance: string;
}

/**
 * Proactive guidance configuration
 * Enables anticipatory agent behavior based on context
 */
export interface ProactiveGuidance {
  /** Intent signals the agent can recognize */
  intentSignals?: IntentSignal[];
  /** Custom context adaptation instructions */
  contextAdaptation?: string;
}

/**
 * Agent persona - voice, identity, and interaction style
 * Inherits from brand_voice in DCYFR_CONTEXT.json by default
 * Agent-specific overrides merge with brand personality
 */
export interface AgentPersona {
  /** Agent identity (optional - uses brand identity if not specified) */
  identity?: {
    /** Agent name (e.g., "Security Guardian", "Architecture Advisor") */
    name?: string;
    /** Agent archetype (e.g., "The Mentor", "The Detective") */
    archetype?: string;
    /** Identity description */
    description?: string;
  };
  /** Voice attributes (optional - inherits from brand_voice) */
  voice?: {
    /** Voice attribute strings (e.g., ["Precise", "Empowering", "Security-first"]) */
    attributes?: string[];
    /** Personality trait overrides (merges with brand traits) */
    personalityTraits?: Partial<PersonalityTraits>;
    /** Perspective (e.g., "first-person-plural" = "we/our") */
    perspective?: 'first-person-singular' | 'first-person-plural' | 'second-person' | 'third-person';
    /** Pronouns (e.g., "we/our", "I/my") */
    pronouns?: string;
  };
  /** Situational tone adjustments (optional - extends brand tones) */
  situationalTones?: SituationalTone[];
  /** Anti-patterns specific to this agent (optional - extends brand anti-patterns) */
  antiPatterns?: string[];
  /** Proactive guidance configuration (optional) */
  proactiveGuidance?: ProactiveGuidance;
  /**
   * Whether this agent inherits from the canonical brand voice defaults.
   * Defaults to `true`. Set to `false` for fully custom agent personas that
   * should not merge with brand_voice in DCYFR_CONTEXT.json.
   */
  inheritsBrandVoice?: boolean;
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
  /** Agent persona - voice, identity, and interaction style (optional) */
  persona?: AgentPersona;
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
