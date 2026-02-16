/**
 * MCP Auto-Configuration System
 * TLP:CLEAR
 * 
 * Automatically configures MCP servers based on detected agent capabilities
 * and workspace requirements. Provides intelligent MCP server selection and
 * lifecycle management for optimal agent performance.
 * 
 * @version 1.0.0
 * @date 2026-02-14
 * @module dcyfr-ai/mcp/auto-configuration
 */

import { EventEmitter } from 'events';
import { MCPRegistry } from '../mcp/mcp-registry.js';
import type { 
  MCPServerConfig, 
  MCPServerManifest, 
  MCPServerStatus,
  LoadedMCPServer 
} from '../mcp/types.js';
import type { AgentCapabilityManifest } from './types/agent-capabilities.js';

/**
 * MCP server capability mapping
 */
export interface MCPCapabilityMapping {
  /**
   * Server name/identifier
   */
  serverName: string;
  
  /**
   * Capabilities that trigger this server's inclusion
   */
  requiredCapabilities: string[];
  
  /**
   * Optional capabilities that benefit from this server
   */
  optionalCapabilities?: string[];
  
  /**
   * Minimum number of agents needing this server to auto-configure
   */
  minAgentThreshold?: number;
  
  /**
   * Server priority (1-10, higher = more important)
   */
  priority: number;
  
  /**
   * Configuration template for this server
   */
  configTemplate: MCPServerConfig;
  
  /**
   * Custom environment variables based on workspace detection
   */
  dynamicEnv?: (workspace: string) => Record<string, string>;
}

/**
 * Auto-configuration system configuration
 */
export interface MCPAutoConfigOptions {
  /**
   * Workspace root path for configuration generation
   */
  workspaceRoot: string;
  
  /**
   * Enable automatic server startup
   */
  autoStartServers?: boolean;
  
  /**
   * Enable server health monitoring
   */
  healthMonitoring?: boolean;
  
  /**
   * Custom capability mappings to extend defaults
   */
  customMappings?: MCPCapabilityMapping[];
  
  /**
   * Minimum agent threshold for auto-configuration
   */
  globalMinThreshold?: number;
  
  /**
   * Configuration file output path
   */
  configOutputPath?: string;
}

/**
 * Configuration generation result
 */
export interface ConfigGenerationResult {
  /**
   * Generated MCP servers
   */
  servers: ConfiguredMCPServer[];
  
  /**
   * Configuration written to file
   */
  configFilePath?: string;
  
  /**
   * Servers that were started
   */
  startedServers: string[];
  
  /**
   * Configuration warnings
   */
  warnings: string[];
  
  /**
   * Server recommendation explanations
   */
  recommendations: ServerRecommendation[];
}

/**
 * Configured MCP server
 */
export interface ConfiguredMCPServer {
  /**
   * Server configuration
   */
  config: MCPServerConfig;
  
  /**
   * Reason for inclusion
   */
  reason: string;
  
  /**
   * Number of agents benefiting from this server
   */
  benefitingAgents: number;
  
  /**
   * Related capability IDs
   */
  relatedCapabilities: string[];
}

/**
 * Server recommendation
 */
export interface ServerRecommendation {
  /**
   * Server name
   */
  serverName: string;
  
  /**
   * Recommendation type
   */
  type: 'required' | 'recommended' | 'optional';
  
  /**
   * Explanation
   */
  explanation: string;
  
  /**
   * Affected agent count
   */
  affectedAgents: number;
}

/**
 * MCP Server Auto-Configuration System
 * 
 * Analyzes agent capabilities and automatically configures appropriate
 * MCP servers to support agent operations efficiently.
 */
export class MCPAutoConfiguration extends EventEmitter {
  private registry: MCPRegistry;
  private options: MCPAutoConfigOptions;
  private capabilityMappings: MCPCapabilityMapping[];
  private registeredAgents: Map<string, AgentCapabilityManifest> = new Map();

  constructor(options: MCPAutoConfigOptions) {
    super();
    this.options = {
      autoStartServers: true,
      healthMonitoring: true,
      globalMinThreshold: 1,
      configOutputPath: '.mcp.json',
      ...options,
    };

    this.registry = new MCPRegistry({
      autoDiscover: false,
      healthMonitoring: this.options.healthMonitoring,
    });

    this.capabilityMappings = this.getDefaultCapabilityMappings();
    
    if (this.options.customMappings) {
      this.capabilityMappings.push(...this.options.customMappings);
    }

    this.setupEventHandlers();
  }

  /**
   * Default capability to MCP server mappings
   */
  private getDefaultCapabilityMappings(): MCPCapabilityMapping[] {
    return [
      {
        serverName: 'dcyfr-designtokens',
        requiredCapabilities: ['design_token_compliance', 'pattern_enforcement'],
        optionalCapabilities: ['ui_component_generation'],
        minAgentThreshold: 1,
        priority: 9,
        configTemplate: {
          name: 'dcyfr-designtokens',
          description: 'DCYFR Design Token validation and enforcement',
          transport: 'stdio',
          command: 'npx',
          args: ['@dcyfr/ai', 'mcp:tokens'],
          enabled: true,
          tier: 'project',
          tags: ['design', 'tokens', 'validation'],
        },
        dynamicEnv: (workspace) => ({
          DCYFR_WORKSPACE_ROOT: workspace,
          DCYFR_DESIGN_TOKENS_PATH: `${workspace}/src/lib/design-tokens.ts`,
        }),
      },
      {
        serverName: 'dcyfr-analytics',
        requiredCapabilities: ['performance_monitoring', 'telemetry_tracking'],
        optionalCapabilities: ['user_behavior_analysis'],
        minAgentThreshold: 2,
        priority: 7,
        configTemplate: {
          name: 'dcyfr-analytics',
          description: 'DCYFR Analytics and performance monitoring',
          transport: 'stdio',
          command: 'npx',
          args: ['@dcyfr/ai', 'mcp:analytics'],
          enabled: true,
          tier: 'project',
          tags: ['analytics', 'performance', 'monitoring'],
        },
        dynamicEnv: (workspace) => ({
          DCYFR_WORKSPACE_ROOT: workspace,
          REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        }),
      },
      {
        serverName: 'dcyfr-contentmanager',
        requiredCapabilities: ['content_management', 'blog_post_creation'],
        optionalCapabilities: ['seo_optimization', 'markdown_processing'],
        minAgentThreshold: 1,
        priority: 8,
        configTemplate: {
          name: 'dcyfr-contentmanager',
          description: 'DCYFR Content management for blog and documentation',
          transport: 'stdio',
          command: 'npx',
          args: ['@dcyfr/ai', 'mcp:content'],
          enabled: true,
          tier: 'project',
          tags: ['content', 'blog', 'mdx'],
        },
        dynamicEnv: (workspace) => ({
          DCYFR_WORKSPACE_ROOT: workspace,
          DCYFR_CONTENT_DIR: `${workspace}/src/content`,
        }),
      },
      {
        serverName: 'dcyfr-promptintel',
        requiredCapabilities: ['security_scanning', 'threat_detection'],
        optionalCapabilities: ['prompt_injection_prevention'],
        minAgentThreshold: 1,
        priority: 10,
        configTemplate: {
          name: 'dcyfr-promptintel',
          description: 'DCYFR AI threat intelligence and prompt security',
          transport: 'stdio',
          command: 'npx',
          args: ['@dcyfr/ai', 'mcp:promptintel'],
          enabled: true,
          tier: 'private',
          tags: ['security', 'ai-safety', 'threats'],
        },
        dynamicEnv: (workspace) => ({
          DCYFR_WORKSPACE_ROOT: workspace,
          DCYFR_SECURITY_LEVEL: 'HIGH',
        }),
      },
      {
        serverName: 'dcyfr-delegation',
        requiredCapabilities: ['task_delegation', 'workflow_orchestration'],
        optionalCapabilities: ['agent_coordination'],
        minAgentThreshold: 3,
        priority: 6,
        configTemplate: {
          name: 'dcyfr-delegation',
          description: 'DCYFR Delegation monitoring and coordination',
          transport: 'stdio',
          command: 'npx',
          args: ['@dcyfr/ai', 'mcp:delegation'],
          enabled: true,
          tier: 'private',
          tags: ['delegation', 'coordination', 'workflow'],
        },
        dynamicEnv: (workspace) => ({
          DCYFR_WORKSPACE_ROOT: workspace,
          DCYFR_DELEGATION_MAX_DEPTH: '10',
        }),
      },
      // Standard MCP servers for common capabilities
      {
        serverName: 'playwright',
        requiredCapabilities: ['browser_automation', 'e2e_testing'],
        optionalCapabilities: ['web_scraping', 'ui_testing'],
        minAgentThreshold: 1,
        priority: 5,
        configTemplate: {
          name: 'playwright',
          description: 'Browser automation and testing',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@executeautomation/playwright-mcp-server'],
          enabled: true,
          tier: 'public',
          tags: ['browser', 'testing', 'automation'],
        },
      },
      {
        serverName: 'filesystem',
        requiredCapabilities: ['file_operations', 'directory_management'],
        optionalCapabilities: ['code_generation', 'template_processing'],
        minAgentThreshold: 1,
        priority: 4,
        configTemplate: {
          name: 'filesystem',
          description: 'File system operations',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          enabled: true,
          tier: 'public',
          tags: ['filesystem', 'files', 'storage'],
        },
        dynamicEnv: (workspace) => ({
          ALLOWED_DIRECTORIES: workspace,
        }),
      },
    ];
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Event handlers would be configured if MCPRegistry supported events
    // Currently MCPRegistry doesn't extend EventEmitter
  }

  /**
   * Register agent for auto-configuration analysis
   */
  async registerAgent(manifest: AgentCapabilityManifest): Promise<void> {
    this.registeredAgents.set(manifest.agent_id, manifest);
    this.emit('agent_registered', { agentId: manifest.agent_id });
    
    // Auto-reconfigure if enabled
    if (this.options.autoStartServers) {
      await this.reconfigureServers();
    }
  }

  /**
   * Unregister agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    this.registeredAgents.delete(agentId);
    this.emit('agent_unregistered', { agentId });
    
    // Auto-reconfigure to potentially remove unused servers
    if (this.options.autoStartServers) {
      await this.reconfigureServers();
    }
  }

  /**
   * Analyze current agents and generate MCP server configuration
   */
  async generateConfiguration(): Promise<ConfigGenerationResult> {
    const capabilityCount = this.analyzeCapabilities();
    const requiredServers = this.determineRequiredServers(capabilityCount);
    const configuredServers = this.configureServers(requiredServers);
    
    const result: ConfigGenerationResult = {
      servers: configuredServers,
      startedServers: [],
      warnings: [],
      recommendations: this.generateRecommendations(capabilityCount, requiredServers),
    };

    // Write configuration file if specified
    if (this.options.configOutputPath) {
      await this.writeConfigurationFile(configuredServers, this.options.configOutputPath);
      result.configFilePath = this.options.configOutputPath;
    }

    // Start servers if auto-start is enabled
    if (this.options.autoStartServers) {
      for (const server of configuredServers) {
        try {
          await this.registry.registerServer(server.config);
          result.startedServers.push(server.config.name);
        } catch (error) {
          result.warnings.push(`Failed to start server ${server.config.name}: ${(error as Error).message}`);
        }
      }
    }

    this.emit('configuration_generated', result);
    return result;
  }

  /**
   * Reconfigure servers based on current agent set
   */
  async reconfigureServers(): Promise<ConfigGenerationResult> {
    return this.generateConfiguration();
  }

  /**
   * Analyze agent capabilities and count usage
   */
  private analyzeCapabilities(): Map<string, number> {
    const capabilityCount = new Map<string, number>();
    
    for (const manifest of this.registeredAgents.values()) {
      for (const capability of manifest.capabilities) {
        capabilityCount.set(
          capability.capability_id,
          (capabilityCount.get(capability.capability_id) || 0) + 1
        );
      }
    }

    return capabilityCount;
  }

  /**
   * Determine which servers are required based on capability analysis
   */
  private determineRequiredServers(capabilityCount: Map<string, number>): MCPCapabilityMapping[] {
    const requiredServers: MCPCapabilityMapping[] = [];

    for (const mapping of this.capabilityMappings) {
      const requiredCapCount = mapping.requiredCapabilities.reduce((sum, cap) => {
        return sum + (capabilityCount.get(cap) || 0);
      }, 0);

      const optionalCapCount = (mapping.optionalCapabilities || []).reduce((sum, cap) => {
        return sum + (capabilityCount.get(cap) || 0);
      }, 0);

      const totalRelevantAgents = requiredCapCount + optionalCapCount;
      const minThreshold = mapping.minAgentThreshold || this.options.globalMinThreshold || 1;

      // Include server if it has required capabilities or meets threshold
      if (requiredCapCount > 0 || totalRelevantAgents >= minThreshold) {
        requiredServers.push(mapping);
      }
    }

    // Sort by priority (higher priority first)
    return requiredServers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Configure servers with dynamic environment and workspace-specific settings
   */
  private configureServers(requiredServers: MCPCapabilityMapping[]): ConfiguredMCPServer[] {
    const configured: ConfiguredMCPServer[] = [];

    for (const mapping of requiredServers) {
      const config = { ...mapping.configTemplate };
      
      // Apply dynamic environment variables
      if (mapping.dynamicEnv) {
        config.env = {
          ...config.env,
          ...mapping.dynamicEnv(this.options.workspaceRoot),
        };
      }

      configured.push({
        config,
        reason: this.generateServerReason(mapping),
        benefitingAgents: this.countBenefitingAgents(mapping),
        relatedCapabilities: [...mapping.requiredCapabilities, ...(mapping.optionalCapabilities || [])],
      });
    }

    return configured;
  }

  /**
   * Generate human-readable reason for server inclusion
   */
  private generateServerReason(mapping: MCPCapabilityMapping): string {
    const agentCount = this.countBenefitingAgents(mapping);
    const capabilityList = mapping.requiredCapabilities.slice(0, 2).join(', ');
    
    return `Required by ${agentCount} agent(s) for ${capabilityList}${mapping.requiredCapabilities.length > 2 ? ' and more' : ''}`;
  }

  /**
   * Count agents that would benefit from this server
   */
  private countBenefitingAgents(mapping: MCPCapabilityMapping): number {
    let count = 0;
    const allCapabilities = [...mapping.requiredCapabilities, ...(mapping.optionalCapabilities || [])];
    
    for (const manifest of this.registeredAgents.values()) {
      const hasRelevantCapability = manifest.capabilities.some(cap => 
        allCapabilities.includes(cap.capability_id)
      );
      
      if (hasRelevantCapability) {
        count++;
      }
    }

    return count;
  }

  /**
   * Generate configuration recommendations
   */
  private generateRecommendations(
    capabilityCount: Map<string, number>,
    requiredServers: MCPCapabilityMapping[]
  ): ServerRecommendation[] {
    const recommendations: ServerRecommendation[] = [];

    for (const mapping of requiredServers) {
      const agentCount = this.countBenefitingAgents(mapping);
      const requiredCapCount = mapping.requiredCapabilities.reduce((sum, cap) => 
        sum + (capabilityCount.get(cap) || 0), 0
      );

      let type: 'required' | 'recommended' | 'optional';
      let explanation: string;

      if (requiredCapCount > 0) {
        type = 'required';
        explanation = `Essential for ${requiredCapCount} capabilities across ${agentCount} agents`;
      } else if (agentCount >= (mapping.minAgentThreshold || 1)) {
        type = 'recommended';
        explanation = `Beneficial for ${agentCount} agents with complementary capabilities`;
      } else {
        type = 'optional';
        explanation = `May improve performance for ${agentCount} agents`;
      }

      recommendations.push({
        serverName: mapping.serverName,
        type,
        explanation,
        affectedAgents: agentCount,
      });
    }

    return recommendations;
  }

  /**
   * Write configuration to file
   */
  private async writeConfigurationFile(
    servers: ConfiguredMCPServer[],
    filePath: string
  ): Promise<void> {
    const config = {
      mcpServers: servers.reduce((acc, server) => {
        acc[server.config.name] = {
          ...server.config,
          // Add metadata for human readers
          _metadata: {
            reason: server.reason,
            benefitingAgents: server.benefitingAgents,
            relatedCapabilities: server.relatedCapabilities,
            autoConfigured: true,
            configuredAt: new Date().toISOString(),
          },
        };
        return acc;
      }, {} as Record<string, any>),
    };

    const fs = await import('fs/promises');
    const path = await import('path');
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(this.options.workspaceRoot, filePath);

    await fs.writeFile(absolutePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Get current server status
   */
  async getServerStatus(): Promise<Array<{
    name: string;
    status: MCPServerStatus;
    config: MCPServerConfig;
    manifest?: MCPServerManifest;
  }>> {
    const servers = this.registry.getAvailableServers();
    return servers.map((server: LoadedMCPServer) => ({
      name: server.config.name,
      status: server.status,
      config: server.config,
      manifest: server.manifest,
    }));
  }

  /**
   * Health check all configured servers
   */
  async healthCheckServers(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const servers = this.registry.getAvailableServers();
    
    for (const server of servers) {
      try {
        // Health check by checking if server has 'available' status
        const isHealthy = server.status === 'available';
        results.set(server.config.name, isHealthy);
      } catch (error) {
        results.set(server.config.name, false);
      }
    }

    return results;
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.removeAllListeners();
    await this.registry.shutdown();
  }
}

/**
 * Factory function for creating auto-configuration system
 */
export function createMCPAutoConfiguration(options: MCPAutoConfigOptions): MCPAutoConfiguration {
  return new MCPAutoConfiguration(options); 
}

export default MCPAutoConfiguration;