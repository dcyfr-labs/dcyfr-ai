/**
 * MCP Registry - MCP Server Discovery and Management
 *
 * Manages MCP servers across the application with discovery, health monitoring,
 * and tier-based organization.
 *
 * @module @dcyfr/ai/mcp/mcp-registry
 * @example
 * ```typescript
 * import { MCPRegistry } from '@dcyfr/ai/mcp/mcp-registry';
 *
 * const registry = new MCPRegistry({
 *   autoDiscover: true,
 *   searchPaths: ['.mcp.json', '.vscode/mcp.json'],
 * });
 *
 * // Initialize and discover servers
 * await registry.initialize();
 *
 * // Get available servers
 * const servers = registry.getAvailableServers();
 * ```
 */

import type {
  MCPServerConfig,
  MCPServerManifest,
  MCPServerStatus,
  LoadedMCPServer,
  MCPRegistryConfig,
  MCPHealthCheckResult,
} from './types';

/**
 * Default registry configuration
 */
const DEFAULT_CONFIG: MCPRegistryConfig = {
  autoDiscover: false,
  searchPaths: ['.mcp.json', '.vscode/mcp.json'],
  configFileName: '.mcp.json',
  healthCheckInterval: 60000, // 1 minute
  healthMonitoring: false,
};

/**
 * MCP Registry - manages MCP servers
 */
export class MCPRegistry {
  private servers: Map<string, LoadedMCPServer> = new Map();
  private config: MCPRegistryConfig;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<MCPRegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.autoDiscover && this.config.searchPaths) {
      for (const searchPath of this.config.searchPaths) {
        await this.loadFromFile(searchPath);
      }
    }

    if (this.config.healthMonitoring) {
      this.startHealthMonitoring();
    }

    this.initialized = true;
  }

  /**
   * Load MCP servers from a config file
   */
  async loadFromFile(filePath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      const content = await fs.readFile(absolutePath, 'utf-8');
      const config = JSON.parse(content);

      // Handle different config formats
      const servers: Record<string, MCPServerConfig> =
        config.mcpServers || config.servers || config;

      for (const [name, serverConfig] of Object.entries(servers)) {
        if (typeof serverConfig === 'object' && serverConfig !== null) {
          const config = serverConfig as MCPServerConfig;
          await this.registerServer({
            ...config,
            name: config.name || name,
          }, absolutePath);
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid - skip silently
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`⚠️  Failed to load MCP config from ${filePath}:`, error);
      }
    }
  }

  /**
   * Register an MCP server
   */
  async registerServer(
    config: MCPServerConfig,
    source: string = 'runtime'
  ): Promise<LoadedMCPServer> {
    const server: LoadedMCPServer = {
      config: {
        enabled: true,
        tier: 'project',
        ...config,
      },
      status: 'available',
      lastChecked: new Date(),
      source,
    };

    this.servers.set(config.name, server);

    // Perform initial health check if monitoring is enabled
    if (this.config.healthMonitoring) {
      await this.checkServerHealth(config.name);
    }

    return server;
  }

  /**
   * Unregister an MCP server
   */
  unregisterServer(name: string): boolean {
    return this.servers.delete(name);
  }

  /**
   * Get a server by name
   */
  getServer(name: string): LoadedMCPServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Get all registered servers
   */
  getAllServers(): LoadedMCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get available (enabled and healthy) servers
   */
  getAvailableServers(): LoadedMCPServer[] {
    return this.getAllServers().filter(
      (s) => s.config.enabled !== false && s.status === 'available'
    );
  }

  /**
   * Get servers by tier
   */
  getServersByTier(tier: 'public' | 'private' | 'project'): LoadedMCPServer[] {
    return this.getAllServers().filter((s) => s.config.tier === tier);
  }

  /**
   * Get servers by tag
   */
  getServersByTag(tag: string): LoadedMCPServer[] {
    return this.getAllServers().filter((s) => s.config.tags?.includes(tag));
  }

  /**
   * Enable a server
   */
  enableServer(name: string): boolean {
    const server = this.servers.get(name);
    if (!server) return false;
    server.config.enabled = true;
    return true;
  }

  /**
   * Disable a server
   */
  disableServer(name: string): boolean {
    const server = this.servers.get(name);
    if (!server) return false;
    server.config.enabled = false;
    server.status = 'disabled';
    return true;
  }

  /**
   * Check health of a specific server
   */
  async checkServerHealth(name: string): Promise<MCPHealthCheckResult> {
    const server = this.servers.get(name);
    if (!server) {
      return {
        server: name,
        status: 'unavailable',
        error: 'Server not found',
        timestamp: new Date(),
      };
    }

    const startTime = Date.now();

    try {
      // For stdio servers, check if command exists
      if (server.config.transport === 'stdio' && server.config.command) {
        const { execSync } = await import('child_process');
        try {
          execSync(`which ${server.config.command}`, { stdio: 'ignore' });
          server.status = 'available';
        } catch {
          server.status = 'unavailable';
          server.error = `Command '${server.config.command}' not found`;
        }
      }
      // For URL-based servers, attempt a connection check
      else if (server.config.url) {
        try {
          const response = await fetch(server.config.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          });
          server.status = response.ok ? 'available' : 'unavailable';
        } catch (error) {
          server.status = 'unavailable';
          server.error = `Cannot reach ${server.config.url}`;
        }
      }

      server.lastChecked = new Date();

      return {
        server: name,
        status: server.status,
        responseTime: Date.now() - startTime,
        error: server.error,
        timestamp: server.lastChecked,
      };
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : String(error);
      server.lastChecked = new Date();

      return {
        server: name,
        status: 'error',
        error: server.error,
        timestamp: server.lastChecked,
      };
    }
  }

  /**
   * Check health of all servers
   */
  async checkAllHealth(): Promise<MCPHealthCheckResult[]> {
    const results: MCPHealthCheckResult[] = [];

    for (const [name] of this.servers) {
      const result = await this.checkServerHealth(name);
      results.push(result);
    }

    return results;
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.checkAllHealth();
    }, this.config.healthCheckInterval || 60000);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalServers: number;
    available: number;
    unavailable: number;
    disabled: number;
    error: number;
    byTier: Record<string, number>;
    byTransport: Record<string, number>;
  } {
    const servers = this.getAllServers();

    const byTier: Record<string, number> = {};
    const byTransport: Record<string, number> = {};

    let available = 0;
    let unavailable = 0;
    let disabled = 0;
    let errorCount = 0;

    for (const server of servers) {
      // Count by status
      switch (server.status) {
        case 'available':
          available++;
          break;
        case 'unavailable':
          unavailable++;
          break;
        case 'disabled':
          disabled++;
          break;
        case 'error':
          errorCount++;
          break;
      }

      // Count by tier
      const tier = server.config.tier || 'project';
      byTier[tier] = (byTier[tier] || 0) + 1;

      // Count by transport
      const transport = server.config.transport;
      byTransport[transport] = (byTransport[transport] || 0) + 1;
    }

    return {
      totalServers: servers.length,
      available,
      unavailable,
      disabled,
      error: errorCount,
      byTier,
      byTransport,
    };
  }

  /**
   * Export configuration for all servers
   */
  exportConfig(): Record<string, MCPServerConfig> {
    const config: Record<string, MCPServerConfig> = {};

    for (const [name, server] of this.servers) {
      config[name] = server.config;
    }

    return config;
  }

  /**
   * Clear all servers
   */
  clearAll(): void {
    this.stopHealthMonitoring();
    this.servers.clear();
    this.initialized = false;
  }

  /**
   * Shutdown the registry
   */
  async shutdown(): Promise<void> {
    this.stopHealthMonitoring();
    this.servers.clear();
    this.initialized = false;
  }
}

/**
 * Global MCP registry instance
 */
let globalRegistry: MCPRegistry | null = null;

/**
 * Get or create global MCP registry
 */
export function getGlobalMCPRegistry(
  config?: Partial<MCPRegistryConfig>
): MCPRegistry {
  if (!globalRegistry) {
    globalRegistry = new MCPRegistry(config);
  }
  return globalRegistry;
}

/**
 * Reset global MCP registry
 */
export function resetGlobalMCPRegistry(): void {
  if (globalRegistry) {
    globalRegistry.shutdown();
  }
  globalRegistry = null;
}
