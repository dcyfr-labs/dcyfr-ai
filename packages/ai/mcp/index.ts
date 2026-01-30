/**
 * MCP Module - Exports for MCP (Model Context Protocol) integration
 *
 * @module @dcyfr/ai/mcp
 */

// Type exports
export type {
  MCPTransport,
  MCPServerStatus,
  MCPTool,
  MCPResource,
  MCPServerConfig,
  MCPServerManifest,
  MCPServerCapabilities,
  LoadedMCPServer,
  MCPRegistryConfig,
  MCPHealthCheckResult,
} from './types';

// MCP Registry exports
export {
  MCPRegistry,
  getGlobalMCPRegistry,
  resetGlobalMCPRegistry,
} from './mcp-registry';
