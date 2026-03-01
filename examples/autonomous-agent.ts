/**
 * @example Autonomous Agent
 * @description Complete example demonstrating the autonomous agent runtime
 *              capabilities introduced in @dcyfr/ai v2.2.0:
 *
 *   1. File-first memory with hybrid search
 *   2. Dynamic skill injection
 *   3. Scheduled task execution
 *   4. Context compaction
 *   5. Messaging gateway (Telegram + CLI)
 *   6. Session management with trust levels
 *   7. Working memory persistence
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import {
  FileMemoryAdapter,
  SQLiteIndex,
  flushWorkingMemory,
} from '@dcyfr/ai/memory';

import { ContextCompactor } from '@dcyfr/ai/compaction';
import { SkillRegistry } from '@dcyfr/ai/skills';
import { SessionManager } from '@dcyfr/ai/session';
import { AgentScheduler } from '@dcyfr/ai/scheduler';
import {
  MessageGateway,
  TelegramAdapter,
  CLIAdapter,
} from '@dcyfr/ai/gateway';
import { MCPToolBridge } from '@dcyfr/ai/mcp';

// ─────────────────────────────────────────────────────────────────────────────
// 1. File-First Memory with Hybrid Search
// ─────────────────────────────────────────────────────────────────────────────

const memory = new FileMemoryAdapter({
  rootDir: '~/.dcyfr/memory',
  agentId: 'my-autonomous-agent',
  // Optional: enable SQLite hybrid search for faster retrieval
  sqliteIndex: new SQLiteIndex({
    dbPath: '~/.dcyfr/memory/my-autonomous-agent/index.db',
  }),
});

// Add facts the agent learns during operation
await memory.addAgentMemory(
  'my-autonomous-agent',
  'The user prefers TypeScript strict mode',
  { topic: 'preferences' },
);

// Search memories with hybrid BM25 + vector scoring
const results = await memory.searchAgentMemories('my-autonomous-agent', 'TypeScript preferences');
console.log('Found memories:', results.length);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dynamic Skill Injection
// ─────────────────────────────────────────────────────────────────────────────

const skills = new SkillRegistry({
  skillsDir: './.claude/skills',
  // Only inject skills the agent is trusted to use
  sessionTrustLevel: 'full',
});

await skills.initialize();

// Skills are automatically matched to queries via BM25 search
const augmentedPrompt = await skills.injectSkills(
  'You are a helpful assistant.',
  'I need to create a new OpenSpec change',
);
console.log('Augmented prompt includes relevant skills:', augmentedPrompt.length > 50);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Context Compaction
// ─────────────────────────────────────────────────────────────────────────────

const compactor = new ContextCompactor({
  maxContextTokens: 128_000,
  compactionThreshold: 0.7, // Compact when 70% full
  // Optional: LLM-powered pre-flush summarization
  llmCall: async (prompt, systemPrompt) => {
    // Replace with your LLM provider call
    return `Summary: ${prompt.slice(0, 200)}...`;
  },
});

const utilization = compactor.calculateUtilization({
  systemPrompt: 'You are a helpful agent.',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ],
  tools: [],
  workingMemory: new Map(),
});
console.log(`Context utilization: ${(utilization.utilizationPercent * 100).toFixed(1)}%`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Session Management
// ─────────────────────────────────────────────────────────────────────────────

const sessions = new SessionManager();

// Create a session with trust-level tool policy
const session = sessions.create({
  userId: 'admin-user',
  platform: 'telegram',
  trustLevel: 'full', // full | sandboxed | readonly
  metadata: { locale: 'en', timezone: 'America/New_York' },
});

console.log(`Session created: ${session.id}, trust: ${session.trustLevel}`);

// Tool access is enforced per trust level
// - full: all tools allowed
// - sandboxed: only allowlisted tools
// - readonly: read-only tools only

// ─────────────────────────────────────────────────────────────────────────────
// 5. Messaging Gateway
// ─────────────────────────────────────────────────────────────────────────────

const gateway = new MessageGateway({
  adapters: [
    new TelegramAdapter({
      // In production, provide a real sendFn that calls Telegram Bot API
      sendFn: async (msg) => {
        console.log(`[Telegram] Sending to ${msg.chatId}: ${msg.text}`);
        return { success: true, messageId: `tg-${Date.now()}` };
      },
    }),
    new CLIAdapter(),
  ],
  trustRules: [
    // Admin users get full trust
    {
      name: 'admin-full',
      userIds: ['admin-user-id'],
      trustLevel: 'full',
      priority: 10,
    },
    // All other Telegram users are sandboxed
    {
      name: 'telegram-default',
      platform: 'telegram',
      trustLevel: 'sandboxed',
      priority: 1,
    },
  ],
  // Rate limiting: 10 messages per minute per user
  rateLimitMaxMessages: 10,
  rateLimitWindowMs: 60_000,
});

// Listen for gateway events
gateway.on('message.received', (event) => {
  console.log(`Received message from ${event.data.userId}`);
});

gateway.on('message.blocked', (event) => {
  console.warn(`Blocked message: ${event.data.reason}`);
});

// Process an incoming message with input sanitization
const processed = await gateway.processInbound({
  id: 'msg-1',
  platform: 'telegram',
  userId: 'admin-user-id',
  chatId: 'chat-123',
  text: 'What is the project status?',
  timestamp: new Date(),
});

console.log(`Trust level: ${processed.trustLevel}, flagged: ${processed.flagged}`);

// Send a response
await gateway.reply(
  { id: 'msg-1', platform: 'telegram', userId: 'admin-user-id', chatId: 'chat-123', text: '', timestamp: new Date() },
  'The project is on track. All 420 tests passing.',
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Scheduled Tasks
// ─────────────────────────────────────────────────────────────────────────────

const scheduler = new AgentScheduler({
  executor: async (taskConfig) => {
    console.log(`Executing scheduled task: ${taskConfig.name}`);
    // Your task logic here
    return { success: true };
  },
});

// Schedule a daily health check at 9 AM
scheduler.schedule('0 9 * * *', {
  name: 'daily-health-check',
  description: 'Run daily workspace health check',
  metadata: { priority: 'medium' },
});

// Register a webhook endpoint for CI/CD triggers
scheduler.webhook('/webhook/deploy', {
  name: 'deploy-trigger',
  description: 'Triggered by CI/CD pipeline',
});

// Subscribe to events for reactive automation
scheduler.subscribe('pr.merged', {}, {
  name: 'post-merge',
  description: 'Run post-merge checks',
});

// Start the scheduler
scheduler.start();

// ─────────────────────────────────────────────────────────────────────────────
// 7. Working Memory Persistence
// ─────────────────────────────────────────────────────────────────────────────

const workingMemory = new Map<string, unknown>([
  ['currentTask', 'Implementing feature X'],
  ['progress', { phase: 3, total: 5, percent: 60 }],
  ['blockers', ['Waiting for API key', 'Need design review']],
  ['timestamp', new Date()],
]);

const flushed = flushWorkingMemory(workingMemory, {
  rootDir: '~/.dcyfr/memory',
  agentId: 'my-autonomous-agent',
  taskId: 'feature-x-implementation',
});

console.log(`Working memory saved: ${flushed.filePath} (${flushed.entriesWritten} entries)`);

// ─────────────────────────────────────────────────────────────────────────────
// 8. MCP Tool Bridge (optional)
// ─────────────────────────────────────────────────────────────────────────────

const mcpBridge = new MCPToolBridge({
  // Register tools from MCP server configs
  servers: [
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '' },
    },
  ],
});

// Discover and convert MCP tools to runtime tools
const tools = await mcpBridge.discoverTools();
console.log(`Discovered ${tools.length} MCP tools`);

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

scheduler.stop();
gateway.dispose();
console.log('Autonomous agent example complete.');
