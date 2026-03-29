/**
 * @example AutonomousAgent
 * @description Complete autonomous agent runtime with all v3 subsystems.
 *
 * Demonstrates:
 * 1. File-first memory with hybrid BM25 + vector search
 * 2. Dynamic skill injection via SkillRegistry
 * 3. Context compaction with utilization tracking
 * 4. Session management with trust levels
 * 5. Messaging gateway (Telegram + CLI adapters)
 * 6. Scheduled task execution (cron, webhooks, event subscriptions)
 * 7. Working memory persistence (flushWorkingMemory)
 * 8. MCP registry integration
 *
 * Prerequisites:
 * - Node.js >= 20
 * - @dcyfr/ai installed
 * - Skills directory at ./.claude/skills (or adjust skillsDir)
 *
 * Usage:
 *   npx tsx examples/autonomous-agent.ts
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import {
  FileMemoryAdapter,
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
import { MCPRegistry } from '@dcyfr/ai/mcp';

// ─────────────────────────────────────────────────────────────────────────────
// 1. File-First Memory with Hybrid Search
// ─────────────────────────────────────────────────────────────────────────────

const memory = new FileMemoryAdapter({
  rootDir: '~/.dcyfr/memory',
  agentId: 'my-autonomous-agent',
  // Optional: provide an embedFn for vector search alongside BM25
  // embedFn: async (text) => myEmbeddingModel.embed(text),
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
  // Trust level for skill access: 'public' | 'internal' | 'restricted' | 'confidential'
  sessionTrustLevel: 'internal',
});

await skills.initialize();

// Skills are automatically matched to queries via BM25 search
const injectionResult = await skills.injectSkills(
  'You are a helpful assistant.',
  'I need to create a new OpenSpec change',
);
console.log('Augmented prompt includes relevant skills:', injectionResult.augmentedPrompt.length > 50);
console.log('Skills injected:', injectionResult.injectedSkills.length);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Context Compaction
// ─────────────────────────────────────────────────────────────────────────────

const compactor = new ContextCompactor({
  threshold: 0.7, // Compact when 70% full
  maxSummaryTokens: 500,
  // Optional: LLM-powered pre-flush summarization
  llmCall: async (prompt, _systemPrompt) => {
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
});
console.log(`Context utilization: ${(utilization.utilization * 100).toFixed(1)}%`);
console.log(`Should compact: ${utilization.shouldCompact}`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Session Management
// ─────────────────────────────────────────────────────────────────────────────

const sessions = new SessionManager();

// Create a session with trust-level tool policy
const session = await sessions.create({
  agentId: 'my-autonomous-agent',
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
  executor: async (taskConfig, _context) => {
    const start = Date.now();
    console.log(`Executing scheduled task: ${taskConfig.name}`);
    // Your task logic here
    return { success: true, durationMs: Date.now() - start };
  },
});

// Schedule a daily health check at 9 AM
scheduler.schedule('0 9 * * *', {
  name: 'daily-health-check',
  description: 'Run daily workspace health check',
  metadata: { priority: 'medium' },
});

// Register a webhook endpoint for CI/CD triggers (requires a secret)
scheduler.webhook('/webhook/deploy', {
  name: 'deploy-trigger',
  description: 'Triggered by CI/CD pipeline',
}, process.env.WEBHOOK_SECRET ?? 'change-me-in-production');

// Subscribe to events for reactive automation (pass null to match all payloads)
scheduler.subscribe('pr.merged', null, {
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
// 8. MCP Registry (connect to MCP servers and discover tools)
// ─────────────────────────────────────────────────────────────────────────────

const mcpRegistry = new MCPRegistry({
  servers: [
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '' },
    },
  ],
});

// List all registered MCP servers
const mcpServers = mcpRegistry.getAllServers();
console.log(`Registered MCP servers: ${mcpServers.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

scheduler.stop();
gateway.dispose();
// @expected-output: Autonomous agent example complete.
console.log('Autonomous agent example complete.');
