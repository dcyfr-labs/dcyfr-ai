/**
 * MCP Runtime Activation Module
 *
 * Bridges MCP server tools with AgentRuntime for
 * automatic tool discovery and invocation.
 *
 * @packageDocumentation
 */

export {
  MCPToolBridge,
  MCPToolInvocationError,
  type MCPToolBridgeConfig,
  type BridgedTool,
  type ToolInvocationResult,
  type MCPToolHandler,
  type MCPToolDiscoverer,
} from './mcp-tool-bridge.js';
