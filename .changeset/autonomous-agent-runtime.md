---
"@dcyfr/ai": minor
---

feat: Autonomous Agent Runtime — persistent memory, messaging, sessions, skills, scheduling

New subpath exports bring autonomous agent capabilities to @dcyfr/ai:

**@dcyfr/ai/memory** — File-first persistent memory with Markdown files, SHA-256 dedup,
optional SQLite FTS5 hybrid search (BM25 + vector RRF), and working memory persistence.

**@dcyfr/ai/compaction** — LLM-powered context compaction (pre-flush summarization),
plus memory compaction (cross-backend dedup, monthly conversation summarization,
stale fact archival).

**@dcyfr/ai/skills** — Dynamic skill injection with BM25 search over .md skill files,
YAML frontmatter parsing, and trust-level filtering.

**@dcyfr/ai/mcp** — MCP Tool Bridge that discovers tools from MCP servers and converts
them to AgentRuntime-compatible tool definitions with retry and timeout support.

**@dcyfr/ai/session** — Session manager with trust-level tool policies (full/sandboxed/
readonly), overlay memory, idle session tracking, and configurable middleware.

**@dcyfr/ai/scheduler** — Agent scheduler with built-in cron parser, webhook endpoints,
event subscriptions, quiet hours, and concurrent execution limits.

**@dcyfr/ai/gateway** — Platform-agnostic messaging gateway with Telegram, CLI, and HTTP
adapters, input sanitization, rate limiting, and trust-based access control.

All modules are tree-shakeable, fully tested (420+ new tests), and backward compatible
with existing AgentRuntime usage.
