/**
 * MCPToolBridge Tests
 *
 * Tests for MCP tool discovery, mapping, and invocation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MCPToolBridge,
  MCPToolInvocationError,
  type MCPToolHandler,
  type MCPToolDiscoverer,
} from '../mcp-tool-bridge.js';

// Mock tool handler
function createMockHandler(response: unknown = { result: 'ok' }): MCPToolHandler {
  return vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(response) }],
    isError: false,
  });
}

// Mock tool discoverer
function createMockDiscoverer(
  tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> = [],
): MCPToolDiscoverer {
  return vi.fn().mockResolvedValue(tools);
}

const SAMPLE_TOOLS = [
  {
    name: 'list_issues',
    description: 'List GitHub issues',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed'] },
      },
      required: ['repo'],
    },
  },
  {
    name: 'create_issue',
    description: 'Create a new GitHub issue',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['repo', 'title'],
    },
  },
];

describe('MCPToolBridge', () => {
  let bridge: MCPToolBridge;

  beforeEach(() => {
    bridge = new MCPToolBridge();
  });

  describe('construction', () => {
    it('should create with default config', () => {
      expect(bridge).toBeDefined();
      expect(bridge.size).toBe(0);
    });

    it('should accept custom config', () => {
      const custom = new MCPToolBridge({
        autoDiscover: true,
        serverFilter: ['github'],
        retryCount: 2,
        invocationTimeout: 60000,
        debug: true,
      });
      expect(custom).toBeDefined();
    });
  });

  describe('discoverTools', () => {
    it('should discover tools from servers', async () => {
      const discoverer = createMockDiscoverer(SAMPLE_TOOLS);
      bridge.setToolDiscoverer(discoverer);

      const count = await bridge.discoverTools(['github']);

      expect(count).toBe(2);
      expect(bridge.size).toBe(2);
      expect(discoverer).toHaveBeenCalledWith('github');
    });

    it('should prefix tool names with server name', async () => {
      bridge.setToolDiscoverer(createMockDiscoverer(SAMPLE_TOOLS));
      await bridge.discoverTools(['github']);

      const tools = bridge.getTools();
      expect(tools[0].name).toBe('github__list_issues');
      expect(tools[1].name).toBe('github__create_issue');
    });

    it('should prefix description with server name', async () => {
      bridge.setToolDiscoverer(createMockDiscoverer(SAMPLE_TOOLS));
      await bridge.discoverTools(['github']);

      const tool = bridge.getTool('github__list_issues');
      expect(tool?.description).toBe('[github] List GitHub issues');
    });

    it('should preserve original tool name', async () => {
      bridge.setToolDiscoverer(createMockDiscoverer(SAMPLE_TOOLS));
      await bridge.discoverTools(['github']);

      const tool = bridge.getTool('github__list_issues');
      expect(tool?.originalName).toBe('list_issues');
      expect(tool?.serverName).toBe('github');
    });

    it('should discover from multiple servers', async () => {
      const discoverer = vi.fn()
        .mockResolvedValueOnce([{ name: 'list', description: 'List items' }])
        .mockResolvedValueOnce([{ name: 'read', description: 'Read file' }]);

      bridge.setToolDiscoverer(discoverer);
      const count = await bridge.discoverTools(['github', 'filesystem']);

      expect(count).toBe(2);
      expect(bridge.getTool('github__list')).toBeDefined();
      expect(bridge.getTool('filesystem__read')).toBeDefined();
    });

    it('should filter servers when serverFilter is set', async () => {
      const discoverer = createMockDiscoverer(SAMPLE_TOOLS);
      const filtered = new MCPToolBridge({ serverFilter: ['github'] });
      filtered.setToolDiscoverer(discoverer);

      await filtered.discoverTools(['github', 'filesystem', 'docker']);

      // Only github should be discovered
      expect(discoverer).toHaveBeenCalledTimes(1);
      expect(discoverer).toHaveBeenCalledWith('github');
    });

    it('should throw when no discoverer is set', async () => {
      await expect(bridge.discoverTools(['github'])).rejects.toThrow(
        'Tool discoverer not set',
      );
    });

    it('should handle discovery errors gracefully', async () => {
      const discoverer = vi.fn().mockRejectedValue(new Error('Connection failed'));
      bridge.setToolDiscoverer(discoverer);

      // Should not throw — just skip that server
      const count = await bridge.discoverTools(['github']);
      expect(count).toBe(0);
    });
  });

  describe('registerToolsForServer', () => {
    it('should manually register tools', () => {
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      expect(bridge.size).toBe(2);
      expect(bridge.getTool('github__list_issues')).toBeDefined();
    });
  });

  describe('invocation', () => {
    it('should invoke a tool and return JSON result', async () => {
      const handler = createMockHandler({ issues: [{ id: 1, title: 'Bug' }] });
      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = bridge.getTool('github__list_issues')!;
      const result = await tool.execute({ repo: 'dcyfr/dcyfr-ai' });

      expect(result).toEqual({ issues: [{ id: 1, title: 'Bug' }] });
      expect(handler).toHaveBeenCalledWith('github', 'list_issues', { repo: 'dcyfr/dcyfr-ai' });
    });

    it('should return plain text when not JSON', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello world' }],
        isError: false,
      });
      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('test', [{ name: 'greet', description: 'Greet' }]);

      const tool = bridge.getTool('test__greet')!;
      const result = await tool.execute({});

      expect(result).toBe('Hello world');
    });

    it('should throw on tool error response', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Not found' }],
        isError: true,
      });
      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = bridge.getTool('github__list_issues')!;

      // Default retryCount is 1, so 2 attempts total
      await expect(tool.execute({ repo: 'x' })).rejects.toThrow(MCPToolInvocationError);
    });

    it('should retry on handler error', async () => {
      const handler = vi.fn()
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
          isError: false,
        });

      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = bridge.getTool('github__list_issues')!;
      const result = await tool.execute({ repo: 'dcyfr/dcyfr-ai' });

      expect(result).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should exhaust retries and throw', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Server offline'));
      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = bridge.getTool('github__list_issues')!;

      try {
        await tool.execute({ repo: 'x' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPToolInvocationError);
        const mcpError = error as MCPToolInvocationError;
        expect(mcpError.retriesExhausted).toBe(true);
        expect(mcpError.serverName).toBe('github');
        expect(mcpError.toolName).toBe('list_issues');
      }

      // 1 initial + 1 retry = 2 calls
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should throw when no handler is set', async () => {
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);
      const tool = bridge.getTool('github__list_issues')!;

      await expect(tool.execute({ repo: 'x' })).rejects.toThrow('Tool handler not set');
    });

    it('should respect custom retry count', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'));
      const custom = new MCPToolBridge({ retryCount: 3 });
      custom.setToolHandler(handler);
      custom.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = custom.getTool('github__list_issues')!;

      await expect(tool.execute({ repo: 'x' })).rejects.toThrow();
      // 1 initial + 3 retries = 4 calls
      expect(handler).toHaveBeenCalledTimes(4);
    });

    it('should timeout long-running invocations', async () => {
      const handler = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000)),
      );

      const quick = new MCPToolBridge({ invocationTimeout: 100, retryCount: 0 });
      quick.setToolHandler(handler);
      quick.registerToolsForServer('slow', [{ name: 'op', description: 'Slow op' }]);

      const tool = quick.getTool('slow__op')!;

      await expect(tool.execute({})).rejects.toThrow('Timeout');
    });
  });

  describe('toRuntimeTools', () => {
    it('should convert bridged tools to runtime format', () => {
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const runtimeTools = bridge.toRuntimeTools();

      expect(runtimeTools).toHaveLength(2);
      expect(runtimeTools[0]).toHaveProperty('name');
      expect(runtimeTools[0]).toHaveProperty('description');
      expect(runtimeTools[0]).toHaveProperty('schema');
      expect(runtimeTools[0]).toHaveProperty('execute');
      expect(typeof runtimeTools[0].execute).toBe('function');
    });

    it('should preserve schema from MCP tool', () => {
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const runtimeTools = bridge.toRuntimeTools();
      const listTool = runtimeTools.find((t) => t.name === 'github__list_issues');

      expect(listTool?.schema).toEqual(SAMPLE_TOOLS[0].inputSchema);
    });
  });

  describe('accessors', () => {
    it('should get tools by server', () => {
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);
      bridge.registerToolsForServer('fs', [{ name: 'read', description: 'Read file' }]);

      const githubTools = bridge.getToolsByServer('github');
      expect(githubTools).toHaveLength(2);

      const fsTools = bridge.getToolsByServer('fs');
      expect(fsTools).toHaveLength(1);
    });

    it('should remove server tools', () => {
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);
      bridge.registerToolsForServer('fs', [{ name: 'read', description: 'Read' }]);

      const removed = bridge.removeServerTools('github');

      expect(removed).toBe(2);
      expect(bridge.size).toBe(1);
      expect(bridge.getTool('github__list_issues')).toBeUndefined();
      expect(bridge.getTool('fs__read')).toBeDefined();
    });

    it('should clear all tools', () => {
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);
      bridge.clear();

      expect(bridge.size).toBe(0);
    });

    it('should track invocation stats', async () => {
      const handler = createMockHandler({ ok: true });
      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = bridge.getTool('github__list_issues')!;
      await tool.execute({ repo: 'x' });
      await tool.execute({ repo: 'y' });

      const stats = bridge.getStats();
      const toolStats = stats.get('github__list_issues');

      expect(toolStats).toBeDefined();
      expect(toolStats!.calls).toBe(2);
      expect(toolStats!.errors).toBe(0);
      expect(toolStats!.totalMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should create MCPToolInvocationError with correct fields', () => {
      const error = new MCPToolInvocationError(
        'Test error',
        'github',
        'list_issues',
        true,
      );

      expect(error.name).toBe('MCPToolInvocationError');
      expect(error.message).toBe('Test error');
      expect(error.serverName).toBe('github');
      expect(error.toolName).toBe('list_issues');
      expect(error.retriesExhausted).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should handle disconnect → retry → success pattern', async () => {
      const handler = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: '{"recovered": true}' }],
          isError: false,
        });

      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = bridge.getTool('github__list_issues')!;
      const result = await tool.execute({ repo: 'x' });

      expect(result).toEqual({ recovered: true });
    });

    it('should handle disconnect → retry → fail pattern', async () => {
      const handler = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      bridge.setToolHandler(handler);
      bridge.registerToolsForServer('github', SAMPLE_TOOLS);

      const tool = bridge.getTool('github__list_issues')!;

      try {
        await tool.execute({ repo: 'x' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPToolInvocationError);
        const e = error as MCPToolInvocationError;
        expect(e.retriesExhausted).toBe(true);
        expect(e.message).toContain('ECONNREFUSED');
      }
    });
  });
});
