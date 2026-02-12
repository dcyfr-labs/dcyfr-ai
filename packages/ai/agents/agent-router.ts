/**
 * Agent Router - Task routing and delegation
 *
 * Routes tasks to appropriate agents based on patterns, categories, and conditions.
 * Supports delegation between agents and fallback chains.
 *
 * @module @dcyfr/ai/agents/agent-router
 * @example
 * ```typescript
 * import { AgentRouter } from '@dcyfr/ai/agents/agent-router';
 * import { AgentRegistry } from '@dcyfr/ai/agents/agent-registry';
 *
 * const registry = new AgentRegistry();
 * const router = new AgentRouter(registry, {
 *   defaultAgent: 'fullstack-developer',
 *   delegationEnabled: true,
 * });
 *
 * // Route a task
 * const result = await router.route({
 *   description: 'Fix the failing tests',
 *   phase: 'implementation',
 *   filesInProgress: ['src/app.test.ts'],
 * });
 *
 * console.log(`Routed to: ${result.agent.manifest.name}`);
 * ```
 */

import type {
  Agent,
  AgentRouterConfig,
  AgentRoutingRule,
  AgentRoutingResult,
  AgentExecutionContext,
  AgentExecutionResult,
  LoadedAgent,
} from './types';
import type { TaskContext as AgentTaskContext } from '../types';
import type { TaskContext as RuntimeTaskContext } from '../runtime/types';
import { AgentRegistry } from './agent-registry';
import { AgentRuntime } from '../runtime/agent-runtime.js';
import type { ProviderRegistry } from '../core/provider-registry';
import type { DCYFRMemory } from '../memory/types';
import type { TelemetryEngine } from '../core/telemetry-engine';

/**
 * Default routing rules based on task patterns
 */
const DEFAULT_ROUTING_RULES: AgentRoutingRule[] = [
  // Testing patterns
  {
    pattern: /test|spec|jest|vitest|coverage|assertion/i,
    agent: 'test-engineer',
    priority: 10,
  },
  // Security patterns
  {
    pattern: /security|auth|vulnerab|owasp|xss|injection|encrypt/i,
    agent: 'security-engineer',
    priority: 10,
  },
  // Performance patterns
  {
    pattern: /performance|optimize|speed|memory|cpu|cache|lazy|bundle/i,
    agent: 'performance-profiler',
    priority: 10,
  },
  // Architecture patterns
  {
    pattern: /architect|design|refactor|pattern|structure|modular/i,
    agent: 'architecture-reviewer',
    priority: 20,
  },
  // Database patterns
  {
    pattern: /database|sql|postgres|mongo|redis|query|migration/i,
    agent: 'database-architect',
    priority: 20,
  },
  // DevOps patterns
  {
    pattern: /deploy|ci|cd|docker|kubernetes|aws|azure|infra/i,
    agent: 'devops-engineer',
    priority: 20,
  },
  // Data patterns
  {
    pattern: /data|analysis|ml|machine learning|model|dataset/i,
    agent: 'data-scientist',
    priority: 20,
  },
  // Documentation patterns
  {
    pattern: /document|readme|api doc|jsdoc|typedoc/i,
    agent: 'technical-writer',
    priority: 30,
  },
  // Research patterns
  {
    pattern: /research|investigate|explore|understand|analyze/i,
    agent: 'research-orchestrator',
    priority: 30,
  },
  // Frontend patterns
  {
    pattern: /frontend|react|vue|angular|css|style|ui|component/i,
    agent: 'frontend-developer',
    priority: 40,
  },
  // Backend patterns
  {
    pattern: /backend|api|server|endpoint|route|middleware/i,
    agent: 'backend-architect',
    priority: 40,
  },
  // Default development
  {
    pattern: /fix|bug|implement|feature|code|develop/i,
    agent: 'fullstack-developer',
    priority: 50,
  },
];

/**
 * Default router configuration
 */
const DEFAULT_CONFIG: AgentRouterConfig = {
  defaultAgent: 'fullstack-developer',
  routingRules: DEFAULT_ROUTING_RULES,
  delegationEnabled: true,
  maxDelegationDepth: 3,
};

/**
 * Agent Router - routes tasks to appropriate agents
 */
export class AgentRouter {
  private registry: AgentRegistry;
  private config: AgentRouterConfig;
  private delegationDepth: number = 0;
  private providerRegistry: ProviderRegistry;
  private memory: DCYFRMemory;
  private telemetry: TelemetryEngine;

  constructor(
    registry: AgentRegistry,
    providerRegistry: ProviderRegistry,
    memory: DCYFRMemory,
    telemetry: TelemetryEngine,
    config: Partial<AgentRouterConfig> = {}
  ) {
    this.registry = registry;
    this.providerRegistry = providerRegistry;
    this.memory = memory;
    this.telemetry = telemetry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Route a task to the most appropriate agent
   */
  async route(task: AgentTaskContext): Promise<AgentRoutingResult> {
    // Find matching rules sorted by priority
    const matchedRules = this.findMatchingRules(task);

    // Try each matched rule in priority order
    for (const rule of matchedRules) {
      const agent = this.registry.resolveAgent(rule.agent);
      if (agent) {
        const fallbacks = this.findFallbacks(agent, task);
        return {
          agent,
          matchedRule: rule,
          fallbacks,
          confidence: this.calculateConfidence(rule, task),
        };
      }
    }

    // Fall back to default agent
    const defaultAgent = this.registry.resolveAgent(this.config.defaultAgent);
    if (defaultAgent) {
      return {
        agent: defaultAgent,
        fallbacks: [],
        confidence: 0.5,
      };
    }

    throw new Error(
      `No agent found for task and default agent '${this.config.defaultAgent}' not available`
    );
  }

  /**
   * Route with custom rules (merges with default rules)
   */
  async routeWithRules(
    task: AgentTaskContext,
    customRules: AgentRoutingRule[]
  ): Promise<AgentRoutingResult> {
    const originalRules = this.config.routingRules;
    this.config.routingRules = [...customRules, ...originalRules];

    try {
      return await this.route(task);
    } finally {
      this.config.routingRules = originalRules;
    }
  }

  /**
   * Delegate task to another agent
   */
  async delegate(
    fromAgent: Agent,
    toAgentName: string,
    task: AgentTaskContext
  ): Promise<Agent> {
    if (!this.config.delegationEnabled) {
      throw new Error('Delegation is disabled');
    }

    if (
      this.config.maxDelegationDepth &&
      this.delegationDepth >= this.config.maxDelegationDepth
    ) {
      throw new Error(
        `Maximum delegation depth (${this.config.maxDelegationDepth}) exceeded`
      );
    }

    // Check if delegation is allowed
    if (
      fromAgent.manifest.delegatesTo &&
      !fromAgent.manifest.delegatesTo.includes(toAgentName)
    ) {
      throw new Error(
        `Agent '${fromAgent.manifest.name}' cannot delegate to '${toAgentName}'`
      );
    }

    const toAgent = this.registry.resolveAgent(toAgentName);
    if (!toAgent) {
      throw new Error(`Delegation target agent '${toAgentName}' not found`);
    }

    this.delegationDepth++;
    return toAgent;
  }

  /**
   * Execute task with automatic fallback
   */
  async executeWithFallback(
    context: AgentExecutionContext,
    primaryAgent: Agent,
    fallbacks: Agent[]
  ): Promise<AgentExecutionResult> {
    const agents = [primaryAgent, ...fallbacks];

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const startTime = Date.now();

      try {
        // Call onBeforeExecute hook
        if (agent.onBeforeExecute) {
          await agent.onBeforeExecute(context);
        }

        // Create AgentRuntime instance for this agent
        const runtime = new AgentRuntime(
          agent.manifest.name,
          this.providerRegistry,
          this.memory,
          this.telemetry,
          {
            maxIterations: 10,
            timeout: 120000, // 2 minutes
            memoryEnabled: true,
            systemPrompt: agent.systemPrompt || agent.instructions,
          }
        );

        // Convert AgentExecutionContext to TaskContext
        const taskContext: RuntimeTaskContext = {
          task: context.task.description,
          userId: context.metadata?.userId as string,
          sessionId: context.metadata?.sessionId as string,
          agentId: agent.manifest.name,
          tools: [], // TODO: Extract from manifest.tools and resolve
          metadata: context.metadata,
        };

        // Execute via AgentRuntime
        const runtimeResult = await runtime.execute(taskContext);

        // Convert back to AgentExecutionResult
        const result: AgentExecutionResult = {
          success: runtimeResult.success,
          agentName: agent.manifest.name,
          executionTime: runtimeResult.executionTime,
          fallbackUsed: i > 0,
          originalAgent: i > 0 ? primaryAgent.manifest.name : undefined,
          filesModified: [], // TODO: Extract from tool observations
          violations: [], // TODO: Extract from quality gates
          warnings: [], // TODO: Extract from runtime warnings
          error: runtimeResult.error ? new Error(runtimeResult.error) : undefined,
        };

        // Call onAfterExecute hook
        if (agent.onAfterExecute) {
          await agent.onAfterExecute(context, result);
        }

        // Return on success
        if (result.success) {
          return result;
        }

        // If this was the last agent, return the failed result
        if (i === agents.length - 1) {
          return result;
        }

        // Log fallback attempt
        console.warn(
          `⚠️  Agent '${agent.manifest.name}' failed, trying fallback...`
        );
      } catch (error) {
        // Call onError hook
        if (agent.onError) {
          await agent.onError(error as Error, context);
        }

        // If this was the last agent, return failure
        if (i === agents.length - 1) {
          return {
            success: false,
            agentName: agent.manifest.name,
            executionTime: Date.now() - startTime,
            fallbackUsed: i > 0,
            originalAgent: i > 0 ? primaryAgent.manifest.name : undefined,
            filesModified: [],
            violations: [],
            warnings: [],
            error: error as Error,
          };
        }

        // Try next fallback
        console.warn(
          `⚠️  Agent '${agent.manifest.name}' failed with error: ${(error as Error).message}, trying fallback...`
        );
      }
    }

    // Should never reach here
    throw new Error('No agents available for execution');
  }

  /**
   * Add a routing rule
   */
  addRule(rule: AgentRoutingRule): void {
    this.config.routingRules.push(rule);
    // Re-sort by priority
    this.config.routingRules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a routing rule by pattern
   */
  removeRule(pattern: string | RegExp): boolean {
    const patternStr = pattern.toString();
    const index = this.config.routingRules.findIndex(
      (r) => r.pattern.toString() === patternStr
    );
    if (index !== -1) {
      this.config.routingRules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all routing rules
   */
  getRules(): AgentRoutingRule[] {
    return [...this.config.routingRules];
  }

  /**
   * Reset delegation depth
   */
  resetDelegation(): void {
    this.delegationDepth = 0;
  }

  /**
   * Get current delegation depth
   */
  getDelegationDepth(): number {
    return this.delegationDepth;
  }

  /**
   * Find matching routing rules for a task
   */
  private findMatchingRules(task: AgentTaskContext): AgentRoutingRule[] {
    const matches: AgentRoutingRule[] = [];

    for (const rule of this.config.routingRules) {
      // Check pattern match
      const pattern =
        rule.pattern instanceof RegExp
          ? rule.pattern
          : new RegExp(rule.pattern, 'i');

      const textToMatch = [
        task.description,
        ...task.filesInProgress,
        task.phase,
      ].join(' ');

      if (pattern.test(textToMatch)) {
        // Check condition if present
        if (rule.condition && !rule.condition(task)) {
          continue;
        }
        matches.push(rule);
      }
    }

    // Sort by priority (lower = higher priority)
    return matches.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Find fallback agents for a primary agent
   */
  private findFallbacks(primaryAgent: Agent, task: AgentTaskContext): Agent[] {
    const fallbacks: Agent[] = [];
    const seen = new Set<string>([primaryAgent.manifest.name]);

    // Add agents from delegatesTo list
    if (primaryAgent.manifest.delegatesTo) {
      for (const name of primaryAgent.manifest.delegatesTo) {
        if (seen.has(name)) continue;
        const agent = this.registry.resolveAgent(name);
        if (agent) {
          fallbacks.push(agent);
          seen.add(name);
        }
      }
    }

    // Add agents from same category
    const categoryAgents = this.registry.getAgentsByCategory(
      primaryAgent.manifest.category
    );
    for (const loaded of categoryAgents) {
      if (seen.has(loaded.name)) continue;
      if (loaded.enabled) {
        fallbacks.push(loaded.agent);
        seen.add(loaded.name);
      }
    }

    // Limit fallbacks to prevent infinite chains
    return fallbacks.slice(0, 3);
  }

  /**
   * Calculate confidence score for a routing match
   */
  private calculateConfidence(
    rule: AgentRoutingRule,
    task: AgentTaskContext
  ): number {
    // Base confidence from priority (lower priority = higher confidence)
    const priorityConfidence = Math.max(0, 1 - rule.priority / 100);

    // Boost confidence if condition matched
    const conditionBoost = rule.condition ? 0.1 : 0;

    // Calculate final confidence (0-1)
    return Math.min(1, priorityConfidence + conditionBoost);
  }
}

/**
 * Global agent router instance
 */
let globalRouter: AgentRouter | null = null;

/**
 * Get or create global agent router
 */
export function getGlobalAgentRouter(
  registry: AgentRegistry,
  config?: Partial<AgentRouterConfig>
): AgentRouter {
  if (!globalRouter) {
    // For now, create with placeholder dependencies
    // This should be updated to properly inject dependencies
    const { getMemory } = require('../memory/index.js');
    const { TelemetryEngine } = require('../core/telemetry-engine.js');
    const { ProviderRegistry } = require('../core/provider-registry.js');
    
    const providerRegistry = new ProviderRegistry({});
    const memory = getMemory();
    const telemetry = new TelemetryEngine();
    
    globalRouter = new AgentRouter(registry, providerRegistry, memory, telemetry, config);
  }
  return globalRouter;
}

/**
 * Reset global agent router
 */
export function resetGlobalAgentRouter(): void {
  globalRouter = null;
}
