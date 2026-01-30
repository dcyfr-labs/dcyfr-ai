/**
 * MCP (Model Context Protocol) Type Definitions
 *
 * Defines interfaces for MCP server registration, discovery, and management.
 *
 * @module @dcyfr/ai/mcp/types
 */

/**
 * MCP server transport type
 */
export type MCPTransport = 'stdio' | 'sse' | 'websocket';

/**
 * MCP server status
 */
export type MCPServerStatus = 'available' | 'unavailable' | 'error' | 'disabled';

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  /** Server identifier */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Transport type */
  transport: MCPTransport;
  /** Command to start the server (for stdio transport) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** URL for SSE/WebSocket transports */
  url?: string;
  /** Whether the server is enabled */
  enabled?: boolean;
  /** Tier (public, private, project) */
  tier?: 'public' | 'private' | 'project';
  /** Tags for filtering */
  tags?: string[];
}

/**
 * MCP server manifest (runtime info)
 */
export interface MCPServerManifest {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Protocol version */
  protocolVersion: string;
  /** Server capabilities */
  capabilities: MCPServerCapabilities;
  /** Available tools */
  tools?: MCPTool[];
  /** Available resources */
  resources?: MCPResource[];
}

/**
 * MCP server capabilities
 */
export interface MCPServerCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  logging?: boolean;
}

/**
 * Loaded MCP server instance
 */
export interface LoadedMCPServer {
  /** Server configuration */
  config: MCPServerConfig;
  /** Server manifest (populated after connection) */
  manifest?: MCPServerManifest;
  /** Current status */
  status: MCPServerStatus;
  /** Last status check */
  lastChecked: Date;
  /** Error message if status is 'error' */
  error?: string;
  /** Source (file path or package) */
  source: string;
}

/**
 * MCP registry configuration
 */
export interface MCPRegistryConfig {
  /** Enable auto-discovery */
  autoDiscover?: boolean;
  /** Paths to search for MCP configs */
  searchPaths?: string[];
  /** Default config file name */
  configFileName?: string;
  /** Health check interval (ms) */
  healthCheckInterval?: number;
  /** Enable health monitoring */
  healthMonitoring?: boolean;
}

/**
 * MCP health check result
 */
export interface MCPHealthCheckResult {
  server: string;
  status: MCPServerStatus;
  responseTime?: number;
  error?: string;
  timestamp: Date;
}
