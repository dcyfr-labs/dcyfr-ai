/**
 * MCP Tool Bridge
 *
 * Bridges MCP server tool discovery with the AgentRuntime tool system.
 * Converts MCP tools into the TaskContext.tools format for execution.
 *
 * @packageDocumentation
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Configuration for MCP tool discovery.
 */
export interface MCPToolBridgeConfig {
  /** Enable automatic tool discovery from available MCP servers */
  autoDiscover: boolean;
  /** Optional filter: only discover from servers matching these names */
  serverFilter?: string[];
  /** Retry count for failed tool invocations (default: 1) */
  retryCount?: number;
  /** Timeout for tool invocation in ms (default: 30000) */
  invocationTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * An MCP tool adapted for runtime execution.
 */
export interface BridgedTool {
  /** Tool name (prefixed with server name) */
  name: string;
  /** Tool description */
  description: string;
  /** JSON Schema for input validation */
  schema: Record<string, unknown>;
  /** Execute the tool via MCP */
  execute: (input: unknown, context?: unknown) => Promise<unknown>;
  /** Source MCP server name */
  serverName: string;
  /** Original MCP tool name (without server prefix) */
  originalName: string;
}

/**
 * Result of a tool invocation.
 */
export interface ToolInvocationResult {
  success: boolean;
  output?: unknown;
  error?: string;
  retried: boolean;
  durationMs: number;
}

/**
 * Tool handler function — provided by consumers to execute MCP tool calls.
 * This abstraction allows different transport implementations (stdio, HTTP, etc.)
 */
export type MCPToolHandler = (
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}>;

/**
 * Tool discovery function — lists available tools from an MCP server.
 */
export type MCPToolDiscoverer = (serverName: string) => Promise<
  Array<{
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }>
>;

/* ------------------------------------------------------------------ */
/*  MCPToolBridge                                                      */
/* ------------------------------------------------------------------ */

/**
 * Bridges MCP server tools with the AgentRuntime tool system.
 *
 * The bridge:
 * 1. Discovers available tools from MCP servers
 * 2. Maps MCP tool schemas to the runtime tool format
 * 3. Handles tool invocation with retry logic
 * 4. Manages tool lifecycle (add/remove/refresh)
 *
 * @example
 * ```typescript
 * const bridge = new MCPToolBridge({
 *   autoDiscover: true,
 *   serverFilter: ['github', 'filesystem'],
 * });
 *
 * // Register tool handler (transport-agnostic)
 * bridge.setToolHandler(async (server, tool, args) => {
 *   const client = getMCPClient(server);
 *   return client.callTool(tool, args);
 * });
 *
 * // Register discoverer
 * bridge.setToolDiscoverer(async (server) => {
 *   const client = getMCPClient(server);
 *   return client.listTools();
 * });
 *
 * // Discover tools from servers
 * await bridge.discoverTools(['github', 'filesystem']);
 *
 * // Get tools in runtime-compatible format
 * const tools = bridge.toRuntimeTools();
 * ```
 */
export class MCPToolBridge {
  private config: Required<MCPToolBridgeConfig>;
  private bridgedTools: Map<string, BridgedTool> = new Map();
  private toolHandler: MCPToolHandler | null = null;
  private toolDiscoverer: MCPToolDiscoverer | null = null;
  private invocationStats: Map<string, { calls: number; errors: number; totalMs: number }> =
    new Map();

  constructor(config: Partial<MCPToolBridgeConfig> = {}) {
    this.config = {
      autoDiscover: config.autoDiscover ?? false,
      serverFilter: config.serverFilter ?? [],
      retryCount: config.retryCount ?? 1,
      invocationTimeout: config.invocationTimeout ?? 30000,
      debug: config.debug ?? false,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Handler Registration                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Set the handler function for executing MCP tool calls.
   * Must be set before tools can be invoked.
   */
  setToolHandler(handler: MCPToolHandler): void {
    this.toolHandler = handler;
  }

  /**
   * Set the discovery function for listing tools from MCP servers.
   * Must be set before `discoverTools()` can be called.
   */
  setToolDiscoverer(discoverer: MCPToolDiscoverer): void {
    this.toolDiscoverer = discoverer;
  }

  /* ---------------------------------------------------------------- */
  /*  Tool Discovery                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Discover and register tools from MCP servers.
   *
   * @param serverNames - List of server names to discover from
   * @returns Number of tools discovered
   */
  async discoverTools(serverNames: string[]): Promise<number> {
    if (!this.toolDiscoverer) {
      throw new Error('Tool discoverer not set. Call setToolDiscoverer() first.');
    }

    const filtered = this.config.serverFilter.length > 0
      ? serverNames.filter((s) => this.config.serverFilter.includes(s))
      : serverNames;

    let totalDiscovered = 0;

    for (const serverName of filtered) {
      try {
        const tools = await this.toolDiscoverer(serverName);

        for (const tool of tools) {
          const bridgedName = `${serverName}__${tool.name}`;
          const bridgedTool = this.createBridgedTool(serverName, tool);
          this.bridgedTools.set(bridgedName, bridgedTool);
          totalDiscovered++;
        }

        if (this.config.debug) {
          console.log(
            `[MCPToolBridge] Discovered ${tools.length} tools from ${serverName}`,
          );
        }
      } catch (error) {
        if (this.config.debug) {
          console.error(
            `[MCPToolBridge] Failed to discover tools from ${serverName}:`,
            error,
          );
        }
      }
    }

    return totalDiscovered;
  }

  /**
   * Manually register tools for a server (useful when discovery isn't available).
   */
  registerToolsForServer(
    serverName: string,
    tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>,
  ): void {
    for (const tool of tools) {
      const bridgedName = `${serverName}__${tool.name}`;
      this.bridgedTools.set(bridgedName, this.createBridgedTool(serverName, tool));
    }
  }

  private createBridgedTool(
    serverName: string,
    tool: { name: string; description: string; inputSchema?: Record<string, unknown> },
  ): BridgedTool {
    const bridgedName = `${serverName}__${tool.name}`;

    return {
      name: bridgedName,
      description: `[${serverName}] ${tool.description}`,
      schema: tool.inputSchema || {},
      serverName,
      originalName: tool.name,
      execute: async (input: unknown) => {
        return this.invokeTool(serverName, tool.name, (input as Record<string, unknown>) || {});
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Tool Invocation                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Invoke an MCP tool with retry logic.
   * Retry strategy: on failure → wait 500ms → retry once → surface error.
   */
  async invokeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.toolHandler) {
      throw new Error('Tool handler not set. Call setToolHandler() first.');
    }

    const statsKey = `${serverName}__${toolName}`;
    if (!this.invocationStats.has(statsKey)) {
      this.invocationStats.set(statsKey, { calls: 0, errors: 0, totalMs: 0 });
    }
    const stats = this.invocationStats.get(statsKey)!;

    let lastError: Error | undefined;
    const maxAttempts = 1 + this.config.retryCount;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();
      try {
        const result = await this.withTimeout(
          this.toolHandler(serverName, toolName, args),
          this.config.invocationTimeout,
        );

        const durationMs = Date.now() - startTime;
        stats.calls++;
        stats.totalMs += durationMs;

        if (result.isError) {
          const errorText = result.content
            .map((c) => c.text || '')
            .filter(Boolean)
            .join('\n');
          throw new MCPToolInvocationError(
            `MCP tool ${serverName}/${toolName} returned error: ${errorText}`,
            serverName,
            toolName,
            false,
          );
        }

        // Extract text content
        const texts = result.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!);

        // Try to parse as JSON
        if (texts.length === 1) {
          try {
            return JSON.parse(texts[0]);
          } catch {
            return texts[0];
          }
        }
        return texts.length > 0 ? texts.join('\n') : result.content;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        stats.errors++;
        stats.totalMs += durationMs;
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.config.debug) {
          console.warn(
            `[MCPToolBridge] Tool invocation failed (attempt ${attempt}/${maxAttempts}): ${serverName}/${toolName}`,
            lastError.message,
          );
        }

        // Wait before retry
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    // All retries exhausted
    throw new MCPToolInvocationError(
      `MCP tool ${serverName}/${toolName} failed after ${maxAttempts} attempts: ${lastError?.message}`,
      serverName,
      toolName,
      true,
    );
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );

      promise
        .then((v) => {
          clearTimeout(timer);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Runtime Integration                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Convert all bridged tools to the TaskContext.tools format
   * used by AgentRuntime.execute().
   *
   * @returns Array of tool objects compatible with TaskContext.tools
   */
  toRuntimeTools(): Array<{
    name: string;
    description: string;
    schema: unknown;
    execute: (input: unknown, context?: unknown) => Promise<unknown>;
  }> {
    return Array.from(this.bridgedTools.values()).map((bt) => ({
      name: bt.name,
      description: bt.description,
      schema: bt.schema,
      execute: bt.execute,
    }));
  }

  /* ---------------------------------------------------------------- */
  /*  Accessors                                                        */
  /* ---------------------------------------------------------------- */

  /** Get all bridged tools */
  getTools(): BridgedTool[] {
    return Array.from(this.bridgedTools.values());
  }

  /** Get a specific tool by bridged name */
  getTool(name: string): BridgedTool | undefined {
    return this.bridgedTools.get(name);
  }

  /** Get tools from a specific server */
  getToolsByServer(serverName: string): BridgedTool[] {
    return Array.from(this.bridgedTools.values()).filter(
      (t) => t.serverName === serverName,
    );
  }

  /** Number of bridged tools */
  get size(): number {
    return this.bridgedTools.size;
  }

  /** Get invocation statistics */
  getStats(): Map<string, { calls: number; errors: number; totalMs: number }> {
    return new Map(this.invocationStats);
  }

  /** Remove all tools from a server */
  removeServerTools(serverName: string): number {
    let removed = 0;
    for (const [name, tool] of this.bridgedTools) {
      if (tool.serverName === serverName) {
        this.bridgedTools.delete(name);
        removed++;
      }
    }
    return removed;
  }

  /** Clear all bridged tools */
  clear(): void {
    this.bridgedTools.clear();
    this.invocationStats.clear();
  }
}

/* ------------------------------------------------------------------ */
/*  Error Types                                                        */
/* ------------------------------------------------------------------ */

/**
 * Error thrown when an MCP tool invocation fails.
 */
export class MCPToolInvocationError extends Error {
  readonly serverName: string;
  readonly toolName: string;
  readonly retriesExhausted: boolean;

  constructor(
    message: string,
    serverName: string,
    toolName: string,
    retriesExhausted: boolean,
  ) {
    super(message);
    this.name = 'MCPToolInvocationError';
    this.serverName = serverName;
    this.toolName = toolName;
    this.retriesExhausted = retriesExhausted;
  }
}
