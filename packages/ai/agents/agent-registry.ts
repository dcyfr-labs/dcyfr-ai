/**
 * Agent Registry - Multi-tier agent management
 *
 * Manages agents across three tiers with priority resolution:
 * - project: Project-specific agents (highest priority)
 * - private: @dcyfr/agents package (medium priority)
 * - public: @dcyfr/ai built-in agents (lowest priority)
 *
 * @module @dcyfr/ai/agents/agent-registry
 * @example
 * ```typescript
 * import { AgentRegistry } from '@dcyfr/ai/agents/agent-registry';
 * import { dcyfrAgents } from '@dcyfr/agents';
 *
 * const registry = new AgentRegistry();
 *
 * // Register tier-specific sources
 * registry.registerTier('public', '@dcyfr/ai/agents-builtin');
 * registry.registerTier('private', dcyfrAgents);
 * registry.registerTier('project', '.claude/agents');
 *
 * // Resolve agent with tier precedence
 * const agent = registry.resolveAgent('test-engineer');
 * ```
 */

import {
  AgentLoader,
  AgentLoadError,
  getGlobalAgentLoader,
} from './agent-loader';
import type {
  Agent,
  AgentManifest,
  AgentTier,
  AgentCategory,
  AgentRegistryConfig,
  LoadedAgent,
} from './types';

/**
 * Tier source configuration
 */
interface TierSource {
  tier: AgentTier;
  source: string | Agent[];
  loader: AgentLoader;
  loaded: boolean;
}

/**
 * Default registry configuration
 */
const DEFAULT_CONFIG: AgentRegistryConfig = {
  autoDiscover: false,
  projectPaths: ['.claude/agents', '.github/agents'],
  public: {
    enabled: true,
    source: '@dcyfr/ai/agents-builtin',
  },
  private: {
    enabled: false,
  },
  project: {
    enabled: true,
    paths: ['.claude/agents', '.github/agents'],
  },
};

/**
 * Agent Registry - multi-tier agent management
 */
export class AgentRegistry {
  private tiers: Map<AgentTier, TierSource> = new Map();
  private config: AgentRegistryConfig;
  private initialized: boolean = false;

  constructor(config: Partial<AgentRegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the registry with configured tiers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize public tier if enabled
    if (this.config.public?.enabled && this.config.public.source) {
      await this.registerTier('public', this.config.public.source);
    }

    // Initialize private tier if enabled
    if (this.config.private?.enabled && this.config.private.source) {
      await this.registerTier('private', this.config.private.source);
    }

    // Initialize project tier if enabled
    if (this.config.project?.enabled && this.config.project.paths) {
      for (const path of this.config.project.paths) {
        await this.registerTier('project', path);
      }
    }

    this.initialized = true;
  }

  /**
   * Register a tier with a source (package path or agent array)
   */
  async registerTier(
    tier: AgentTier,
    source: string | Agent[]
  ): Promise<void> {
    const loader = new AgentLoader({
      searchPaths: typeof source === 'string' ? [source] : [],
      autoDiscover: typeof source === 'string',
      failureMode: 'warn',
      timeout: 30000,
    });

    const tierSource: TierSource = {
      tier,
      source,
      loader,
      loaded: false,
    };

    this.tiers.set(tier, tierSource);

    // Load agents from source
    await this.loadTier(tier);
  }

  /**
   * Load agents for a specific tier
   */
  async loadTier(tier: AgentTier): Promise<void> {
    const tierSource = this.tiers.get(tier);
    if (!tierSource) {
      throw new Error(`Tier '${tier}' is not registered`);
    }

    if (tierSource.loaded) return;

    const { source, loader } = tierSource;

    if (typeof source === 'string') {
      // Load from package or file path
      try {
        if (source.startsWith('@') || source.startsWith('.')) {
          // Try to import as a module that exports agents
          const module = await import(source);
          const agents = module.default || module.agents || module;

          if (Array.isArray(agents)) {
            await loader.loadAgents(agents, tier);
          } else if (typeof agents === 'object') {
            // Object with agent exports
            for (const [, agent] of Object.entries(agents)) {
              if (this.isAgent(agent)) {
                await loader.loadAgent(agent as Agent, tier);
              }
            }
          }
        } else {
          // Discover agents in path
          await loader.discoverAgents();
        }
      } catch (error) {
        console.warn(`⚠️  Failed to load tier '${tier}' from ${source}:`, error);
      }
    } else {
      // Load from agent array
      await loader.loadAgents(source, tier);
    }

    tierSource.loaded = true;
  }

  /**
   * Resolve an agent by name with tier precedence
   * Priority: project > private > public
   */
  resolveAgent(name: string): Agent | undefined {
    const tierOrder: AgentTier[] = ['project', 'private', 'public'];

    for (const tier of tierOrder) {
      const tierSource = this.tiers.get(tier);
      if (!tierSource) continue;

      const loaded = tierSource.loader.getAgent(name);
      if (loaded && loaded.enabled) {
        return loaded.agent;
      }
    }

    return undefined;
  }

  /**
   * Get a loaded agent with metadata
   */
  getLoadedAgent(name: string): LoadedAgent | undefined {
    const tierOrder: AgentTier[] = ['project', 'private', 'public'];

    for (const tier of tierOrder) {
      const tierSource = this.tiers.get(tier);
      if (!tierSource) continue;

      const loaded = tierSource.loader.getAgent(name);
      if (loaded && loaded.enabled) {
        return loaded;
      }
    }

    return undefined;
  }

  /**
   * Get all agents across all tiers
   */
  getAllAgents(): LoadedAgent[] {
    const allAgents: Map<string, LoadedAgent> = new Map();
    const tierOrder: AgentTier[] = ['public', 'private', 'project'];

    // Load in reverse order so higher priority overwrites
    for (const tier of tierOrder) {
      const tierSource = this.tiers.get(tier);
      if (!tierSource) continue;

      for (const agent of tierSource.loader.getAgents()) {
        allAgents.set(agent.name, agent);
      }
    }

    return Array.from(allAgents.values());
  }

  /**
   * Get all agent manifests (for discovery/catalog)
   */
  getAllManifests(): AgentManifest[] {
    return this.getAllAgents().map((a) => a.manifest);
  }

  /**
   * Get agents by category
   */
  getAgentsByCategory(category: AgentCategory): LoadedAgent[] {
    return this.getAllAgents().filter((a) => a.manifest.category === category);
  }

  /**
   * Get agents by tier
   */
  getAgentsByTier(tier: AgentTier): LoadedAgent[] {
    const tierSource = this.tiers.get(tier);
    if (!tierSource) return [];
    return tierSource.loader.getAgents();
  }

  /**
   * Get agents by tag
   */
  getAgentsByTag(tag: string): LoadedAgent[] {
    return this.getAllAgents().filter(
      (a) => a.manifest.tags?.includes(tag)
    );
  }

  /**
   * Search agents by name or description
   */
  searchAgents(query: string): LoadedAgent[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllAgents().filter(
      (a) =>
        a.manifest.name.toLowerCase().includes(lowerQuery) ||
        a.manifest.description.toLowerCase().includes(lowerQuery) ||
        a.manifest.tags?.some((t) => t.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Merge agent configurations (overlay pattern)
   * Base agent from lower tier, overrides from higher tier
   */
  mergeAgentConfigs(
    baseAgent: Agent,
    overrides: Partial<Agent>
  ): Agent {
    return {
      ...baseAgent,
      manifest: {
        ...baseAgent.manifest,
        ...(overrides.manifest || {}),
      },
      instructions: overrides.instructions || baseAgent.instructions,
      systemPrompt: overrides.systemPrompt || baseAgent.systemPrompt,
      onLoad: overrides.onLoad || baseAgent.onLoad,
      onUnload: overrides.onUnload || baseAgent.onUnload,
      onBeforeExecute: overrides.onBeforeExecute || baseAgent.onBeforeExecute,
      onAfterExecute: overrides.onAfterExecute || baseAgent.onAfterExecute,
      onError: overrides.onError || baseAgent.onError,
    };
  }

  /**
   * Enable an agent by name (searches all tiers)
   */
  enableAgent(name: string): boolean {
    for (const tierSource of this.tiers.values()) {
      const agent = tierSource.loader.getAgent(name);
      if (agent) {
        tierSource.loader.enableAgent(name);
        return true;
      }
    }
    return false;
  }

  /**
   * Disable an agent by name (searches all tiers)
   */
  disableAgent(name: string): boolean {
    for (const tierSource of this.tiers.values()) {
      const agent = tierSource.loader.getAgent(name);
      if (agent) {
        tierSource.loader.disableAgent(name);
        return true;
      }
    }
    return false;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalAgents: number;
    byTier: Record<AgentTier, number>;
    byCategory: Record<string, number>;
    enabled: number;
    disabled: number;
  } {
    const allAgents = this.getAllAgents();

    const byTier: Record<AgentTier, number> = {
      public: 0,
      private: 0,
      project: 0,
    };

    const byCategory: Record<string, number> = {};

    let enabled = 0;
    let disabled = 0;

    for (const agent of allAgents) {
      byTier[agent.tier]++;

      const category = agent.manifest.category;
      byCategory[category] = (byCategory[category] || 0) + 1;

      if (agent.enabled) {
        enabled++;
      } else {
        disabled++;
      }
    }

    return {
      totalAgents: allAgents.length,
      byTier,
      byCategory,
      enabled,
      disabled,
    };
  }

  /**
   * Clear all tiers and agents
   */
  async clearAll(): Promise<void> {
    for (const tierSource of this.tiers.values()) {
      await tierSource.loader.clearAll();
    }
    this.tiers.clear();
    this.initialized = false;
  }

  /**
   * Check if value is an Agent
   */
  private isAgent(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      'manifest' in value &&
      typeof (value as Agent).manifest === 'object'
    );
  }
}

/**
 * Global agent registry instance
 */
let globalRegistry: AgentRegistry | null = null;

/**
 * Get or create global agent registry
 */
export function getGlobalAgentRegistry(
  config?: Partial<AgentRegistryConfig>
): AgentRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistry(config);
  }
  return globalRegistry;
}

/**
 * Reset global agent registry
 */
export function resetGlobalAgentRegistry(): void {
  globalRegistry = null;
}
