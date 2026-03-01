<!-- TLP:CLEAR -->
# Autonomous Agent Runtime Guide

**Version:** 2.2.0  
**Package:** `@dcyfr/ai`  
**Audience:** Developers building autonomous agents with DCYFR

---

## Overview

The Autonomous Agent Runtime extends `@dcyfr/ai` with capabilities for agents that operate independently — scheduling tasks, managing conversations across platforms, persisting memory to files, and injecting dynamic skills based on context.

### What's Included

| Module | Import | Purpose |
|--------|--------|---------|
| **File Memory** | `@dcyfr/ai/memory` | Markdown-based persistent memory with SQLite hybrid search |
| **Context Compaction** | `@dcyfr/ai/compaction` | LLM-powered context summarization before window overflow |
| **Skill Injection** | `@dcyfr/ai/skills` | BM25-powered dynamic skill matching and system prompt augmentation |
| **MCP Tool Bridge** | `@dcyfr/ai/mcp` | Bridge MCP server tools into AgentRuntime tool system |
| **Session Management** | `@dcyfr/ai/session` | Trust-level tool policies, session lifecycle, overlay memory |
| **Agent Scheduler** | `@dcyfr/ai/scheduler` | Cron, webhook, and event-based task scheduling |
| **Messaging Gateway** | `@dcyfr/ai/gateway` | Platform-agnostic messaging with sanitization and trust assignment |
| **Memory Compaction** | `@dcyfr/ai/compaction` | Cross-backend dedup, conversation summarization, stale fact archival |

---

## Quick Start

```bash
npm install @dcyfr/ai
```

```typescript
import { FileMemoryAdapter } from '@dcyfr/ai/memory';
import { AgentScheduler } from '@dcyfr/ai/scheduler';
import { MessageGateway, TelegramAdapter } from '@dcyfr/ai/gateway';
import { SessionManager } from '@dcyfr/ai/session';
import { SkillRegistry } from '@dcyfr/ai/skills';
```

See [examples/autonomous-agent.ts](../../examples/autonomous-agent.ts) for a complete working example.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Messaging Gateway                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Telegram  │  │   CLI    │  │   HTTP   │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │                 │
│       └──────────────┼──────────────┘                 │
│                      │                                │
│    ┌─────────────────▼──────────────────┐            │
│    │        Input Sanitization           │            │
│    │  (prompt injection, Unicode, etc.)   │            │
│    └─────────────────┬──────────────────┘            │
│                      │                                │
│    ┌─────────────────▼──────────────────┐            │
│    │      Trust Level Assignment         │            │
│    │  (full / sandboxed / readonly)      │            │
│    └─────────────────┬──────────────────┘            │
└──────────────────────┼───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│                 Session Manager                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Session 1 │  │ Session 2 │  │ Session N │          │
│  │ (full)    │  │(sandboxed)│  │(readonly) │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │                 │
│    ┌──▼──────────────▼──────────────▼──┐             │
│    │       Tool Policy Enforcement      │             │
│    └────────────────┬──────────────────┘             │
└─────────────────────┼────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│                 Agent Runtime                         │
│                                                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │   Skills    │  │  MCP Tools  │  │  Compactor  │    │
│  │  Registry   │  │   Bridge    │  │             │    │
│  └─────┬──────┘  └─────┬──────┘  └──────┬─────┘     │
│        │               │                │             │
│  ┌─────▼───────────────▼────────────────▼──────┐     │
│  │              Task Execution                  │     │
│  └──────────────────┬──────────────────────────┘     │
└─────────────────────┼────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│                  Memory Layer                         │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │  File-First   │  │  SQLite FTS5  │                 │
│  │  (Markdown)   │  │  (Hybrid)     │                 │
│  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                           │
│  ┌──────▼─────────────────▼──────────┐               │
│  │     Working Memory Persistence     │               │
│  │     Memory Compaction/Dedup        │               │
│  └───────────────────────────────────┘               │
└──────────────────────────────────────────────────────┘
```

---

## Feature Deep Dives

### File-First Memory

Memory is persisted as human-readable Markdown files, designed for both agent and human consumption:

```
~/.dcyfr/memory/my-agent/
├── user-memories.md       # User facts and preferences
├── agent-state.md         # Agent's learned knowledge
├── facts.md               # Verified facts
├── facts-archived.md      # Contradicted/stale facts
├── conversations/         # Per-session conversation logs
│   ├── 2026-03-01-session.md
│   └── archive/           # Compacted old conversations
├── summaries/             # Monthly conversation summaries
│   └── 2026-02-summary.md
└── working/               # Task working memory snapshots
    └── 2026-03-01-task-123.md
```

### Trust Levels

Three trust levels control tool access:

| Level | Tools Allowed | Use Case |
|-------|--------------|----------|
| `full` | All tools | Authenticated owner, admin users |
| `sandboxed` | Allowlisted only | DMs, known users |
| `readonly` | Read-only tools | Group chats, unknown users |

### Input Sanitization

The messaging gateway detects and neutralizes:

- `[SYSTEM OVERRIDE]`, `[ADMIN]`, `[ROOT]` tag injection
- "Ignore previous instructions" prompts
- Base64-encoded system overrides
- Unicode direction override characters (U+202A, etc.)
- Role injection attempts ("You are now...")
- DAN mode / jailbreak phrases

### Scheduling

Three trigger types with built-in cron parser (no external dependencies):

```typescript
// Cron: runs daily at 9 AM
scheduler.schedule('0 9 * * *', { name: 'morning-check' });

// Webhook: HTTP-triggered
scheduler.webhook('/deploy', { name: 'deploy' });

// Event: reactive to application events
scheduler.subscribe('pr.merged', {}, { name: 'post-merge' });
```

---

## Configuration Reference

### FileMemoryAdapter

```typescript
new FileMemoryAdapter({
  rootDir: string;       // Memory root directory
  agentId: string;       // Agent namespace
  sqliteIndex?: SQLiteIndex; // Optional hybrid search
  coexistMode?: boolean; // Read from both file and mem0
  watchFiles?: boolean;  // Watch for external file changes
  debounceMs?: number;   // File watcher debounce (default: 1500ms)
});
```

### ContextCompactor

```typescript
new ContextCompactor({
  maxContextTokens: number; // Context window size
  compactionThreshold?: number; // Trigger at this % (default: 0.7)
  retainSystemPrompt?: boolean; // Keep system prompt (default: true)
  llmCall?: (prompt, system) => Promise<string>; // LLM for summarization
});
```

### SkillRegistry

```typescript
new SkillRegistry({
  skillsDir: string;      // Directory of .md skill files
  maxResults?: number;     // Max skills to inject (default: 3)
  minRelevance?: number;   // BM25 threshold (default: 0.1)
  sessionTrustLevel?: 'full' | 'sandboxed' | 'readonly';
});
```

### SessionManager

```typescript
new SessionManager({
  maxSessions?: number;    // Max concurrent sessions (default: 1000)
  sessionTtlMs?: number;  // Session TTL (default: 24h)
});
```

### AgentScheduler

```typescript
new AgentScheduler({
  executor: (config) => Promise<any>; // Task execution function
  tickIntervalMs?: number;            // Check interval (default: 60000)
  quietHours?: { start: number; end: number }; // No-execute window
});
```

### MessageGateway

```typescript
new MessageGateway({
  adapters: PlatformAdapter[];     // Platform adapters
  trustRules?: TrustRule[];        // Trust assignment rules
  defaultTrustLevel?: TrustLevel;  // Default: 'sandboxed'
  rateLimitMaxMessages?: number;   // Per-user rate limit
  rateLimitWindowMs?: number;      // Rate limit window
});
```

---

## Security Considerations

1. **Input sanitization** is applied to ALL incoming messages before processing
2. **Trust levels** enforce least-privilege tool access
3. **Rate limiting** prevents abuse from any single user
4. **Session isolation** ensures one user's context doesn't leak to another
5. **Memory deduplication** uses SHA-256 hashes for tamper detection
6. **ContentPolicyMiddleware patterns** are reused from the delegation security framework

---

## Integration with @dcyfr/ai-agents

The autonomous runtime integrates with the `Agent` class via two optional constructor parameters:

```typescript
import { Agent } from '@dcyfr/agents';
import { SkillRegistry } from '@dcyfr/ai/skills';

const skills = new SkillRegistry({ skillsDir: './.claude/skills' });
await skills.initialize();

const agent = new Agent({
  name: 'my-agent',
  description: 'An autonomous agent',
  sessionId: 'persistent-session-123',  // Correlate across runs
  skillRegistry: skills,                 // Dynamic skill injection
  tools: [/* ... */],
});

const result = await agent.run('Create a new OpenSpec change');
```

---

## Migration from v2.1.x

All new modules are additive — existing code continues to work unchanged:

- `AgentRuntime` API is fully backward compatible
- New subpath exports (`@dcyfr/ai/memory`, etc.) don't affect existing `@dcyfr/ai` import
- `Agent` class in `@dcyfr/ai-agents` accepts but doesn't require `sessionId` or `skillRegistry`
- SQLite dependency (`better-sqlite3`) is optional and only loaded when `SQLiteIndex` is used

---

**Last Updated:** March 2026  
**Maintained By:** DCYFR Labs
