/**
 * Agent Loader - Dynamic agent loading and discovery
 *
 * Handles loading agents from filesystem, packages, and runtime registration.
 * Supports multiple discovery patterns and validates agent manifests.
 *
 * @module @dcyfr/ai/agents/agent-loader
 * @example
 * ```typescript
 * import { AgentLoader } from '@dcyfr/ai/agents/agent-loader';
 *
 * const loader = new AgentLoader({
 *   searchPaths: ['.claude/agents', 'node_modules/@dcyfr/ai/agents-builtin'],
 *   autoDiscover: true,
 * });
 *
 * // Load all agents from search paths
 * await loader.discoverAgents();
 *
 * // Load a specific agent
 * await loader.loadAgent('@dcyfr/ai/agents-builtin/test-engineer');
 *
 * // Get loaded agent
 * const agent = loader.getAgent('test-engineer');
 * ```
 */

import type {
  Agent,
  AgentManifest,
  AgentTier,
  AgentLoaderConfig,
  LoadedAgent,
} from './types';

/**
 * Error thrown when agent loading fails
 */
export class AgentLoadError extends Error {
  constructor(
    message: string,
    public agentName: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AgentLoadError';
  }
}

/**
 * Error thrown when agent validation fails
 */
export class AgentValidationError extends Error {
  constructor(
    message: string,
    public agentName: string
  ) {
    super(message);
    this.name = 'AgentValidationError';
  }
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AgentLoaderConfig = {
  searchPaths: [],
  autoDiscover: false,
  failureMode: 'throw',
  timeout: 30000,
};

/**
 * Agent Loader - manages agent loading and discovery
 */
export class AgentLoader {
  private agents: Map<string, LoadedAgent> = new Map();
  private config: AgentLoaderConfig;

  constructor(config: Partial<AgentLoaderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load an agent by module path, file path, or object
   */
  async loadAgent(
    agentSource: string | Agent,
    tier: AgentTier = 'project'
  ): Promise<LoadedAgent> {
    try {
      let agent: Agent;
      let source: string;

      if (typeof agentSource === 'string') {
        source = agentSource;

        // Check if it's a module path (starts with @ or no slashes at start)
        if (agentSource.startsWith('@') || !agentSource.startsWith('/')) {
          // Dynamic import from node_modules or relative path
          const module = await import(agentSource);
          agent = module.default || module;
        } else {
          // File path - try to load as JSON or TypeScript/JavaScript
          if (agentSource.endsWith('.json')) {
            const module = await import(agentSource, { with: { type: 'json' } });
            agent = this.parseAgentFromJson(module.default);
          } else if (agentSource.endsWith('.md')) {
            agent = await this.parseAgentFromMarkdown(agentSource);
          } else {
            const module = await import(agentSource);
            agent = module.default || module;
          }
        }
      } else {
        agent = agentSource;
        source = 'runtime';
      }

      // Validate manifest
      this.validateManifest(agent.manifest);

      // Check for duplicates
      if (this.agents.has(agent.manifest.name)) {
        const existing = this.agents.get(agent.manifest.name)!;
        // Allow override if new tier has higher priority
        const tierPriority: Record<AgentTier, number> = {
          project: 0,
          private: 1,
          public: 2,
        };
        if (tierPriority[tier] >= tierPriority[existing.tier]) {
          throw new AgentValidationError(
            `Agent '${agent.manifest.name}' is already loaded from tier '${existing.tier}'`,
            agent.manifest.name
          );
        }
        // Override with higher priority tier
        await this.unloadAgent(agent.manifest.name);
      }

      // Call onLoad hook if present
      if (agent.onLoad) {
        await this.executeWithTimeout(
          () => agent.onLoad!(),
          this.config.timeout,
          `onLoad hook for ${agent.manifest.name}`
        );
      }

      // Store agent
      const loadedAgent: LoadedAgent = {
        name: agent.manifest.name,
        manifest: agent.manifest,
        agent,
        tier,
        source,
        loaded: new Date(),
        enabled: true,
      };

      this.agents.set(agent.manifest.name, loadedAgent);

      return loadedAgent;
    } catch (error) {
      const agentName =
        typeof agentSource === 'string' ? agentSource : 'unknown';

      if (this.config.failureMode === 'throw') {
        throw new AgentLoadError(
          `Failed to load agent: ${error instanceof Error ? error.message : String(error)}`,
          agentName,
          error instanceof Error ? error : undefined
        );
      } else if (this.config.failureMode === 'warn') {
        console.warn(`⚠️  Failed to load agent ${agentName}:`, error);
      }
      // silent mode: do nothing

      // Return a dummy LoadedAgent for non-throw modes
      throw error;
    }
  }

  /**
   * Load multiple agents
   */
  async loadAgents(
    agents: (string | Agent)[],
    tier: AgentTier = 'project'
  ): Promise<LoadedAgent[]> {
    const results: LoadedAgent[] = [];
    for (const agent of agents) {
      try {
        const loaded = await this.loadAgent(agent, tier);
        results.push(loaded);
      } catch (error) {
        if (this.config.failureMode === 'throw') {
          throw error;
        }
      }
    }
    return results;
  }

  /**
   * Discover agents in search paths
   */
  async discoverAgents(): Promise<AgentManifest[]> {
    const discovered: AgentManifest[] = [];

    for (const searchPath of this.config.searchPaths) {
      try {
        // Use dynamic import and promisify glob
        const { glob: globCallback } = await import('glob');
        const { promisify } = await import('util');
        const glob = promisify(globCallback) as (pattern: string, options?: any) => Promise<string[]>;

        // Search for agent files
        const patterns = [
          `${searchPath}/**/*.agent.ts`,
          `${searchPath}/**/*.agent.js`,
          `${searchPath}/**/*.agent.json`,
          `${searchPath}/**/*.md`,
        ];

        for (const pattern of patterns) {
          const files = await glob(pattern, { absolute: true });

          for (const file of files) {
            try {
              const loaded = await this.loadAgent(file);
              discovered.push(loaded.manifest);
            } catch (error) {
              if (this.config.failureMode === 'warn') {
                console.warn(`⚠️  Failed to discover agent at ${file}:`, error);
              }
            }
          }
        }
      } catch (error) {
        if (this.config.failureMode === 'warn') {
          console.warn(`⚠️  Failed to search path ${searchPath}:`, error);
        }
      }
    }

    return discovered;
  }

  /**
   * Unload an agent
   */
  async unloadAgent(agentName: string): Promise<void> {
    const loaded = this.agents.get(agentName);
    if (!loaded) {
      throw new Error(`Agent '${agentName}' is not loaded`);
    }

    // Call onUnload hook if present
    if (loaded.agent.onUnload) {
      await this.executeWithTimeout(
        () => loaded.agent.onUnload!(),
        this.config.timeout,
        `onUnload hook for ${agentName}`
      );
    }

    this.agents.delete(agentName);
  }

  /**
   * Enable an agent
   */
  enableAgent(agentName: string): void {
    const loaded = this.agents.get(agentName);
    if (!loaded) {
      throw new Error(`Agent '${agentName}' is not loaded`);
    }
    loaded.enabled = true;
  }

  /**
   * Disable an agent
   */
  disableAgent(agentName: string): void {
    const loaded = this.agents.get(agentName);
    if (!loaded) {
      throw new Error(`Agent '${agentName}' is not loaded`);
    }
    loaded.enabled = false;
  }

  /**
   * Get a loaded agent by name
   */
  getAgent(name: string): LoadedAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all loaded agents
   */
  getAgents(): LoadedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by tier
   */
  getAgentsByTier(tier: AgentTier): LoadedAgent[] {
    return this.getAgents().filter((a) => a.tier === tier);
  }

  /**
   * Get agents by category
   */
  getAgentsByCategory(category: string): LoadedAgent[] {
    return this.getAgents().filter((a) => a.manifest.category === category);
  }

  /**
   * Get enabled agents only
   */
  getEnabledAgents(): LoadedAgent[] {
    return this.getAgents().filter((a) => a.enabled);
  }

  /**
   * Get agent count
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * Check if an agent is loaded
   */
  hasAgent(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Clear all agents
   */
  async clearAll(): Promise<void> {
    const names = Array.from(this.agents.keys());
    await Promise.all(names.map((name) => this.unloadAgent(name)));
  }

  /**
   * Parse agent from markdown file (CLAUDE.md format)
   */
  private async parseAgentFromMarkdown(filePath: string): Promise<Agent> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath, '.md');

    // Extract frontmatter if present
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let frontmatter: Record<string, unknown> = {};
    let instructions = content;

    if (frontmatterMatch) {
      try {
        const yaml = await import('yaml');
        frontmatter = yaml.parse(frontmatterMatch[1]) || {};
        instructions = content.slice(frontmatterMatch[0].length).trim();
      } catch {
        // Frontmatter parsing failed, use entire content as instructions
      }
    }

    // Build manifest from frontmatter or defaults
    const manifest: AgentManifest = {
      name: (frontmatter.name as string) || fileName,
      version: (frontmatter.version as string) || '1.0.0',
      description: (frontmatter.description as string) || `Agent loaded from ${fileName}`,
      category: (frontmatter.category as AgentManifest['category']) || 'specialized',
      tier: (frontmatter.tier as AgentManifest['tier']) || 'project',
      model: (frontmatter.model as AgentManifest['model']) || 'sonnet',
      permissionMode: (frontmatter.permissionMode as AgentManifest['permissionMode']) || 'acceptEdits',
      tools: (frontmatter.tools as string[]) || [],
      delegatesTo: frontmatter.delegatesTo as string[] | undefined,
      tags: frontmatter.tags as string[] | undefined,
    };

    return {
      manifest,
      instructions,
      systemPrompt: frontmatter.systemPrompt as string | undefined,
    };
  }

  /**
   * Parse agent from JSON
   */
  private parseAgentFromJson(json: Record<string, unknown>): Agent {
    if (!json.manifest || typeof json.manifest !== 'object') {
      throw new AgentValidationError(
        'JSON agent missing required manifest object',
        'unknown'
      );
    }

    return {
      manifest: json.manifest as AgentManifest,
      instructions: json.instructions as string | undefined,
      systemPrompt: json.systemPrompt as string | undefined,
    };
  }

  /**
   * Validate agent manifest
   */
  private validateManifest(manifest: AgentManifest): void {
    if (!manifest.name) {
      throw new AgentValidationError(
        'Agent manifest missing required field: name',
        'unknown'
      );
    }

    if (!manifest.version) {
      throw new AgentValidationError(
        'Agent manifest missing required field: version',
        manifest.name
      );
    }

    // Validate version format (semver-like)
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new AgentValidationError(
        `Invalid version format: ${manifest.version} (expected x.y.z)`,
        manifest.name
      );
    }

    if (!manifest.category) {
      throw new AgentValidationError(
        'Agent manifest missing required field: category',
        manifest.name
      );
    }

    if (!manifest.tier) {
      throw new AgentValidationError(
        'Agent manifest missing required field: tier',
        manifest.name
      );
    }

    if (!manifest.description) {
      console.warn(`⚠️  Agent ${manifest.name} missing description`);
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => T | Promise<T>,
    timeout: number,
    taskName: string
  ): Promise<T> {
    return Promise.race([
      Promise.resolve(fn()),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout executing ${taskName}`)),
          timeout
        )
      ),
    ]);
  }
}

/**
 * Global agent loader instance
 */
let globalLoader: AgentLoader | null = null;

/**
 * Get or create global agent loader
 */
export function getGlobalAgentLoader(
  config?: Partial<AgentLoaderConfig>
): AgentLoader {
  if (!globalLoader) {
    globalLoader = new AgentLoader(config);
  }
  return globalLoader;
}

/**
 * Reset global agent loader
 */
export function resetGlobalAgentLoader(): void {
  globalLoader = null;
}
