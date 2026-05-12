<div align="center">
  <img src="https://raw.githubusercontent.com/dcyfr-labs/dcyfr-labs/main/public/images/dcyfr-avatar.svg" alt="DCYFR Logo" width="120" height="120" />
  <h1>@dcyfr/ai</h1>
  <p><em>Portable AI agent harness with plugin architecture for multi-provider integration, telemetry tracking, and quality validation.</em></p>
</div>

<!-- README-META
  tlp_clearance: GREEN
  status: active
  name: dcyfr-ai
  description: Portable AI agent harness with plugin architecture
  last_validated: 2026-03-29
-->

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/dcyfr/dcyfr-ai)

[![npm](https://img.shields.io/npm/v/@dcyfr/ai?logo=npm&logoColor=white)](https://www.npmjs.com/package/@dcyfr/ai)
[![Downloads](https://img.shields.io/npm/dm/@dcyfr/ai?logo=npm&logoColor=white)](https://www.npmjs.com/package/@dcyfr/ai)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@dcyfr/ai?label=Bundle%20Size&logo=webpack)](https://bundlephobia.com/package/@dcyfr/ai)

Portable AI agent harness with plugin architecture for managing multiple AI providers, tracking telemetry, and ensuring quality compliance.

## About DCYFR

`@dcyfr/ai` is maintained by **DCYFR Labs** as part of the DCYFR AI tooling portfolio.

- **DCYFR** is a registered trademark of DCYFR Labs.
- Primary domain: [www.dcyfr.ai](https://www.dcyfr.ai)
- Trademark guidance: [../TRADEMARK.md](../TRADEMARK.md)
- Licensing details: [LICENSE](./LICENSE)

## 🔍 @dcyfr/ai vs. Alternatives

| Feature        | @dcyfr/ai                      | LangChain  | Vercel AI SDK | AutoGPT |
| -------------- | ------------------------------ | ---------- | ------------- | ------- |
| Multi-Provider | ✅                             | ✅         | ✅            | ❌      |
| Plugin System  | ✅ Custom                      | ✅ Complex | ❌            | ❌      |
| Telemetry      | ✅ Built-in                    | ❌         | ❌            | ❌      |
| Zero Config    | ✅                             | ❌         | ✅            | ❌      |
| Bundle Size    | [![](https://img.shields.io/bundlephobia/minzip/@dcyfr/ai)](https://bundlephobia.com/package/@dcyfr/ai) | ~2.3MB     | ~450KB        | N/A     |
| TypeScript     | ✅ Strict                      | Partial    | ✅            | ❌      |
| Quality Gates  | ✅                             | ❌         | ❌            | ❌      |
| Config System  | YAML/JSON/package              | Code-only  | Code-only     | JSON    |
| Learning Curve | Low                            | High       | Low           | High    |

---

## 📊 npm Statistics

[![npm](https://img.shields.io/npm/v/@dcyfr/ai?logo=npm&logoColor=white)](https://www.npmjs.com/package/@dcyfr/ai)
[![Downloads](https://img.shields.io/npm/dm/@dcyfr/ai?logo=npm&logoColor=white)](https://www.npmjs.com/package/@dcyfr/ai)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@dcyfr/ai?logo=webpack)](https://bundlephobia.com/package/@dcyfr/ai)

- **Weekly Downloads:** Check [npm stats](https://www.npmjs.com/package/@dcyfr/ai)
- **Dependencies:** 28 production dependencies
- **Bundle Size:** See badge above ([![minzip](https://img.shields.io/bundlephobia/minzip/@dcyfr/ai)](https://bundlephobia.com/package/@dcyfr/ai))
- **TypeScript:** Full type definitions included
- **ESM Support:** ✅ Full ESM modules with tree shaking

---

## Table of Contents

<details>
<summary>📑 Table of Contents</summary>

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [File Formats](#file-formats)
  - [Three-Layer Merge](#three-layer-merge)
  - [Environment Overrides](#environment-overrides)
- [Architecture](#architecture)
- [Plugin System](#plugin-system)
  - [Built-in Agents](#built-in-agents)
  - [Custom Plugins](#custom-plugins)
- [CLI Commands](#cli-commands)
- [Examples](#examples)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Troubleshooting](#-troubleshooting)
  - [Installation Issues](#installation-issues)
  - [Configuration Issues](#configuration-issues)
  - [Plugin Issues](#plugin-issues)
  - [CLI Issues](#cli-issues)
- [FAQ](#-faq)
- [Performance Benchmarks](#-performance-benchmarks)
- [Security](#-security)
- [Known Limitations](#️-known-limitations)
- [License & Sponsorship](#-license--sponsorship)

</details>

## Features

- 🔌 **Plugin Architecture** - Extensible validation system with custom agents
- 🔄 **Multi-Provider Support** - OpenAI, Anthropic, Ollama, Msty Vibe CLI Proxy, GitHub Copilot
- 🎯 **Msty Vibe Integration** - Unified multi-model routing with local OpenAI-compatible endpoint
- ⚙️ **Configuration System** - YAML/JSON config with three-layer merge
- 📊 **Comprehensive Telemetry** - Track usage, costs, quality metrics, performance
- ✅ **Validation Harness** - Quality gates with parallel/serial execution

## Installation

```bash
npm install @dcyfr/ai
```

## Quick Start

### 1. Initialize Configuration

```bash
npx @dcyfr/ai config:init
```

This creates a `.dcyfr.yaml` configuration file:

```yaml
version: "1.0.0"
projectName: my-app

agents:
  designTokens:
    enabled: true
    compliance: 0.90
  barrelExports:
    enabled: true
  pageLayout:
    enabled: true
    targetUsage: 0.90
  testData:
    enabled: true
```

### 2. Load and Use Configuration

```typescript
import { loadConfig, ValidationFramework } from "@dcyfr/ai";

// Load configuration (auto-detects .dcyfr.yaml, .dcyfr.json, package.json)
const config = await loadConfig();

// Create validation framework
const framework = new ValidationFramework({
  gates: config.validation.gates,
  parallel: config.validation.parallel,
});

// Run validation
const report = await framework.validate({
  projectRoot: config.project.root,
  files: config.project.include,
  config: config.agents,
});

console.log(`Validation: ${report.valid ? "PASS" : "FAIL"}`);
```

### 3. Validate Configuration

```bash
# Validate current project config
npx @dcyfr/ai config:validate

# Show full configuration
npx @dcyfr/ai config:validate --verbose
```

---

## 🔄 Migration Guides

### Migrating from LangChain

**Why migrate:** Smaller bundle footprint than LangChain (see [bundlephobia](https://bundlephobia.com/package/@dcyfr/ai)), built-in telemetry, simpler API

```typescript
// LangChain (before)
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage } from "langchain/schema";

const model = new ChatOpenAI({ temperature: 0.9 });
const response = await model.call([new HumanMessage("Hello")]);

// @dcyfr/ai (after)
import { AgentRuntime } from "@dcyfr/ai";

const runtime = new AgentRuntime({
  provider: "openai",
  model: "gpt-4",
  temperature: 0.9,
});

const response = await runtime.chat({
  messages: [{ role: "user", content: "Hello" }],
});
```

**Key Differences:**

- Simpler configuration (YAML/JSON vs code-only)
- Built-in telemetry tracking (no additional setup)
- Smaller bundle size than LangChain (see [bundlephobia](https://bundlephobia.com/package/@dcyfr/ai))
- Type-safe validation with Zod
- Quality gates included out of the box

### Migrating from Vercel AI SDK

**Why migrate:** Quality gates, telemetry, multi-provider validation harness

```typescript
// Vercel AI SDK (before)
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const { text } = await generateText({
  model: openai("gpt-4-turbo"),
  prompt: "Hello",
});

// @dcyfr/ai (after)
import { AgentRuntime, ValidationFramework } from "@dcyfr/ai";

const runtime = new AgentRuntime({
  provider: "openai",
  model: "gpt-4-turbo",
});

const response = await runtime.chat({
  messages: [{ role: "user", content: "Hello" }],
});

// Bonus: Built-in validation
const validator = new ValidationFramework();
const report = await validator.validate({
  /* config */
});
```

**Key Differences:**

- Configuration system (YAML/JSON files)
- Validation harness with quality gates
- Comprehensive telemetry tracking
- Plugin system for custom validators
- Zero-config startup option

**Full Migration Docs:** See [docs/migrations/](./docs/migrations/) for detailed guides

---

## Getting Started with AgentRuntime (Phase 0 Autonomous Operations)

### Prerequisites

```bash
# Node.js 24+ required
node --version

# Install @dcyfr/ai
npm install @dcyfr/ai

# Optional: Configure LLM providers
export OPENAI_API_KEY=your_openai_key
export ANTHROPIC_API_KEY=your_anthropic_key
```

### 1. Basic AgentRuntime Setup

```typescript
import {
  AgentRuntime,
  ProviderRegistry,
  TelemetryEngine,
  DCYFRMemory,
} from "@dcyfr/ai";

// Initialize components
const providerRegistry = new ProviderRegistry();
const telemetryEngine = new TelemetryEngine({ storage: "sqlite" });
const memory = new DCYFRMemory({ storage: "memory" });

// Create runtime
const runtime = new AgentRuntime({
  providerRegistry,
  memory,
  telemetry: telemetryEngine,
});

// Verify setup
console.log(`Runtime ready: ${runtime.isReady()}`);
```

### 2. Execute Autonomous Tasks

```typescript
// Simple task execution
const result = await runtime.executeTask("Explain quantum computing briefly");

if (result.success) {
  console.log("Output:", result.output);
  console.log("Memory used:", result.memoryRetrievalUsed);
} else {
  console.error("Error:", result.error);
}
```

### 3. Memory-Enhanced Execution

```typescript
// Task with memory context
const result = await runtime.executeTask(
  "Continue the quantum computing explanation",
  {
    timeout: 30000,
    memoryConfig: {
      maxResults: 10, // Maximum context entries
      minScore: 0.7, // Relevance threshold (0.0-1.0)
    },
  },
);

// Memory is automatically retrieved, injected, and persisted
console.log("Previous context used:", result.memoryRetrievalUsed);
```

### 4. Working Memory for Multi-Step Tasks

```typescript
// Access working memory for ephemeral state
const workingMemory = runtime.getWorkingMemory();

// Step 1: Research overview
workingMemory.set("research-topic", "AI ethics");
const overviewResult = await runtime.executeTask(
  "Provide overview of AI ethics and key considerations",
);

// Step 2: Deep dive (with context from step 1)
workingMemory.set("overview-complete", overviewResult.output);
const deepDiveResult = await runtime.executeTask(
  "Analyze specific ethical challenges in AI deployment",
);

console.log("Working memory keys:", Array.from(workingMemory.keys()));
```

### 5. Hook System for Extensions

```typescript
// Add before-execution hook
runtime.addHook("beforeExecute", async (task: string) => {
  console.log(`🚀 Starting task: ${task}`);

  // Custom validation
  if (task.includes("sensitive")) {
    return { approved: false, reason: "Sensitive content detected" };
  }

  return { approved: true };
});

// Add after-execution hook
runtime.addHook("afterExecute", async (task, result, success) => {
  console.log(`✅ Task completed: ${success ? "SUCCESS" : "FAILED"}`);

  // Custom telemetry
  if (success) {
    await customAnalytics.track({
      task: task.substring(0, 50),
      duration: result.duration,
      memoryUsed: result.memoryRetrievalUsed,
    });
  }
});
```

### 6. Provider Configuration & Fallback

```typescript
// Multi-provider setup with fallback
const runtime = new AgentRuntime({
  providerRegistry: new ProviderRegistry(),
  memory,
  telemetry,
});

// Providers automatically fallback: OpenAI → Anthropic → Ollama
const result = await runtime.executeTask("Analyze market trends");

// Check which provider was used
const events = await telemetryEngine.getEvents();
const lastExecution = events.filter((e) => e.type === "start").pop();
console.log("Provider used:", lastExecution?.provider);
```

### 7. Telemetry Monitoring & Analysis

```typescript
// Get telemetry engine for analytics
const telemetry = runtime.getTelemetryEngine();

// Get recent events
const events = await telemetry.getEvents();
console.log(`Total events: ${events.length}`);

// Filter memory events
const memoryEvents = events.filter((e) => e.type === "memory_retrieval");
const hitRate =
  memoryEvents.length > 0
    ? memoryEvents.filter((e) => e.memoriesRelevant > 0).length /
      memoryEvents.length
    : 0;
console.log(`Memory hit rate: ${(hitRate * 100).toFixed(1)}%`);
```

### 8. CLI Dashboard Commands

```bash
# View telemetry dashboard
npx @dcyfr/ai telemetry

# Show recent activity
npx @dcyfr/ai telemetry --recent 20

# Cost analysis
npx @dcyfr/ai telemetry --costs

# Provider summary
npx @dcyfr/ai telemetry --providers

# Runtime validation
npx @dcyfr/ai validate-runtime

# Export data
npx @dcyfr/ai telemetry --export usage_data.csv
```

### 9. Provider Setup

**OpenAI:**

```bash
export OPENAI_API_KEY=sk-your-key-here
# Supports: gpt-4, gpt-4o, gpt-3.5-turbo
```

**Anthropic:**

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
# Supports: claude-3-5-sonnet, claude-3-haiku, claude-3-opus
```

**Ollama (Local):**

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Install a model
ollama pull llama2
# OR: ollama pull codellama, qwen2.5, etc.

# Optional: Custom host
export OLLAMA_HOST=localhost:11434
```

### 10. Configuration Examples

**Development:**

```typescript
const devConfig = {
  providerRegistry: new ProviderRegistry(),
  memory: new DCYFRMemory({
    storage: "memory",
    maxEntries: 100,
  }),
  telemetry: new TelemetryEngine({
    storage: "memory", // No persistence for dev
  }),
};
```

**Production:**

```typescript
const prodConfig = {
  providerRegistry: new ProviderRegistry(),
  memory: new DCYFRMemory({
    storage: "file",
    filePath: "./data/memory.json",
  }),
  telemetry: new TelemetryEngine({
    storage: "sqlite",
    dbPath: "./data/telemetry.db",
  }),
};
```

### 11. Real-World Example

See our comprehensive example: **[Autonomous Research Agent](../dcyfr-ai-agents/examples/autonomous-research-agent/)**

```bash
cd dcyfr-ai-agents/examples/autonomous-research-agent
npm run demo -- --topic "quantum computing applications"
```

This example demonstrates:

- 5-step autonomous research pipeline
- Memory context integration
- Working memory coordination
- Hook system extensions
- Telemetry monitoring
- Provider fallback handling
- Configuration management

---

## Autonomous Agent Runtime

Build agents that operate independently with persistent memory, scheduled execution, platform messaging, and dynamic skill injection.

### Subpath Imports

```typescript
import {
  FileMemoryAdapter,
  SQLiteIndex,
  flushWorkingMemory,
} from "@dcyfr/ai/memory";
import { ContextCompactor, MemoryCompaction } from "@dcyfr/ai/compaction";
import { SkillRegistry } from "@dcyfr/ai/skills";
import { MCPToolBridge } from "@dcyfr/ai/mcp";
import { SessionManager } from "@dcyfr/ai/session";
import { AgentScheduler } from "@dcyfr/ai/scheduler";
import { MessageGateway, TelegramAdapter, CLIAdapter } from "@dcyfr/ai/gateway";
```

### Key Capabilities

| Module                 | Description                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **File Memory**        | Markdown-based persistent memory with SHA-256 dedup and optional SQLite FTS5 hybrid search |
| **Context Compaction** | LLM-powered pre-flush summarization to prevent context overflow                            |
| **Skill Injection**    | BM25-powered matching of `.md` skill files to inject relevant knowledge                    |
| **MCP Tool Bridge**    | Bridges MCP server tool discovery → AgentRuntime tools                                     |
| **Session Management** | Trust-level tool policies (full/sandboxed/readonly), session lifecycle                     |
| **Agent Scheduler**    | Built-in cron parser, webhooks, event subscriptions, quiet hours                           |
| **Messaging Gateway**  | Telegram/CLI/HTTP adapters, input sanitization, rate limiting                              |
| **Memory Compaction**  | Cross-backend dedup, monthly conversation summarization, stale fact archival               |
| **Working Memory**     | Persist `Map<string, unknown>` as human-readable Markdown                                  |

### Quick Example

```typescript
import { MessageGateway, TelegramAdapter } from "@dcyfr/ai/gateway";
import { SessionManager } from "@dcyfr/ai/session";
import { AgentScheduler } from "@dcyfr/ai/scheduler";

// Create a messaging gateway with platform adapters
const gateway = new MessageGateway({
  adapters: [new TelegramAdapter({ sendFn: telegramBot.sendMessage })],
  trustRules: [
    { name: "admin", userIds: ["admin-id"], trustLevel: "full", priority: 10 },
  ],
});

// Schedule daily tasks
const scheduler = new AgentScheduler({
  executor: async (task) => runAgent(task),
});
scheduler.schedule("0 9 * * *", { name: "morning-report" });
scheduler.start();
```

> **Full guide:** See [docs/guides/autonomous-agent-guide.md](docs/guides/autonomous-agent-guide.md)  
> **Complete example:** See [examples/autonomous-agent.ts](examples/autonomous-agent.ts)

---

## Architecture

The DCYFR AI harness follows a layered architecture with clear separation of concerns:

```mermaid
graph TB
    A[Configuration Files] -->|Load & Merge| B[Config Loader]
    B -->|Initialize| C[Plugin Registry]
    C -->|Register| D[Validation Engine]
    C -->|Register| E[Telemetry Engine]
    D -->|Execute| F[Quality Gates]
    E -->|Track| G[Storage Adapters]
    B -->|Configure| H[CLI Interface]
    H -->|Commands| I[User]

    style A fill:#e1f5ff
    style B fill:#fff3cd
    style C fill:#d4edda
    style D fill:#d4edda
    style E fill:#d4edda
    style H fill:#cfe2ff
    style I fill:#f8d7da
```

### Key Components

- **Config Loader**: Three-layer merge system (defaults → project config → env vars)
- **Plugin Registry**: Manages custom and built-in validation agents
- **Validation Engine**: Executes quality gates in parallel or serial mode
- **Telemetry Engine**: Tracks usage, costs, quality metrics with pluggable storage
- **CLI Interface**: User-facing commands for config management and validation

[⬆️ Back to top](#dcyfr-ai)

---

## Configuration

### File Formats

Supports multiple configuration formats (auto-detected):

- `.dcyfr.yaml` / `.dcyfr.yml` - YAML format (recommended)
- `.dcyfr.json` / `dcyfr.config.json` - JSON format
- `package.json` - Under `dcyfr` key

### Three-Layer Merge

Configuration is merged from three sources:

```
Framework Defaults → Project Config → Environment Variables
    (built-in)         (.dcyfr.yaml)      (DCYFR_* vars)
```

### Environment Overrides

Override any config value with environment variables:

```bash
DCYFR_TELEMETRY_ENABLED=false
DCYFR_PROVIDERS_PRIMARY=groq
DCYFR_AGENTS_DESIGNTOKENS_COMPLIANCE=0.95
```

## Plugin System

### Built-in Agents

DCYFR comes with specialized validation agents:

- **Design Token Validator** - Enforces design system compliance
- **Barrel Export Checker** - Ensures import conventions
- **PageLayout Enforcer** - Validates layout usage patterns
- **Test Data Guardian** - Prevents production data in tests

See `@dcyfr/agents` for specialized DCYFR agents.

### Custom Plugins

```typescript
import { PluginLoader } from "@dcyfr/ai";

const customPlugin = {
  manifest: {
    name: "my-validator",
    version: "1.0.0",
    description: "Custom validation logic",
  },
  async onValidate(context) {
    // Your validation logic
    return {
      valid: true,
      violations: [],
      warnings: [],
    };
  },
};

const loader = new PluginLoader();
await loader.loadPlugin(customPlugin);
```

[⬆️ Back to top](#dcyfr-ai)

---

## CLI Commands

```bash
# Initialize configuration
npx @dcyfr/ai config:init
npx @dcyfr/ai config:init --format json
npx @dcyfr/ai config:init --minimal

# Validate configuration
npx @dcyfr/ai config:validate
npx @dcyfr/ai config:validate --verbose
npx @dcyfr/ai config:validate --config custom.yaml

# Show schema
npx @dcyfr/ai config:schema

# Help
npx @dcyfr/ai help
```

[⬆️ Back to top](#dcyfr-ai)

---

## Examples

See [examples/](./examples/) directory:

- [Examples index](./examples/README.md) - prerequisites and run commands

- `basic-usage.ts` - Getting started
- `plugin-system.ts` - Plugin development
- `configuration.ts` - Configuration usage

## Documentation

- [Getting Started](./docs/GETTING-STARTED.md)
- [Provider Integrations](./docs/PROVIDER_INTEGRATIONS.md) - **OpenAI, Anthropic, Ollama, Msty Vibe CLI Proxy**
- [Memory Setup](./docs/MEMORY_SETUP.md) - Vector database and memory configuration
- [Plugin Development](./docs/PLUGINS.md)
- [API Reference](./docs/API.md)
- [TUI Dashboard](./docs/TUI.md)
- [Release Management](./docs/RELEASE_MANAGEMENT.md) - Publishing and versioning
- [Quick Release Guide](./docs/RELEASE_QUICK_START.md) - TL;DR for releases

### Plugin Marketplace Security

- [GVISOR_SETUP.md](./docs/guides/GVISOR_SETUP.md) - gVisor runtime sandboxing for untrusted plugins
- [BEHAVIORAL_ANOMALY_DETECTION.md](./docs/guides/BEHAVIORAL_ANOMALY_DETECTION.md) - Behavioral anomaly detection system
- [CERTIFICATION_PROGRAM.md](./docs/guides/CERTIFICATION_PROGRAM.md) - Plugin Certification Program (Bronze/Silver/Gold tiers)
- [WASM_PLUGIN_STARTER.md](./docs/guides/WASM_PLUGIN_STARTER.md) - WebAssembly plugin starter template
- [WASM_MIGRATION_GUIDE.md](./docs/guides/WASM_MIGRATION_GUIDE.md) - Migrate Docker plugins to WASM

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

### Release Process

We use [release-please](https://github.com/googleapis/release-please) for automated versioning and publishing. Version bumps are derived from PR titles using [conventional commits](https://www.conventionalcommits.org/).

**For contributors:**

Make your PR title a conventional commit (`feat:` minor, `fix:`/`deps:`/`perf:` patch, `feat!:` major). Squash-merge is required so the PR title becomes the commit on `main`.

```
fix(memory): correct mem0 client retry semantics
feat(provider-registry): add GitHub Models provider
deps: bump @anthropic-ai/sdk to 0.95.2
```

**For maintainers:**

- release-please opens a Release PR aggregating unreleased commits
- Merging the Release PR publishes to npm via OIDC Trusted Publishing
- See [CONTRIBUTING.md](./CONTRIBUTING.md#release-process) for the full release flow

[⬆️ Back to top](#dcyfr-ai)

---

## 🔧 Troubleshooting

### Installation Issues

**Issue: `npm install @dcyfr/ai` fails with 404**

- **Cause:** Package may not be published yet or npm registry issue
- **Solution:** Verify package exists: `npm view @dcyfr/ai`, or install from GitHub: `npm install git+https://github.com/dcyfr/dcyfr-ai.git`
- **Check:** Visit https://www.npmjs.com/package/@dcyfr/ai to confirm publication status

**Issue: "Cannot find module '@dcyfr/ai'"**

- **Cause:** Package not in `node_modules` or incorrect import path
- **Solution:** Run `npm install`, verify import: `import { loadConfig } from '@dcyfr/ai'`
- **TypeScript:** Ensure `moduleResolution: "bundler"` or `"node16"` in tsconfig.json

### Configuration Issues

**Issue: `.dcyfr.yaml` not detected**

- **Cause:** File in wrong location or invalid YAML syntax
- **Solution:**
  1. Place `.dcyfr.yaml` in project root (same directory as package.json)
  2. Validate YAML syntax with `npx @dcyfr/ai config:validate`
  3. Check for tabs (use spaces), missing colons, incorrect indentation
- **Alternative:** Use `.dcyfr.json` or add `dcyfr` key to `package.json`

**Issue: "Invalid configuration schema"**

- **Cause:** Missing required fields or incorrect types
- **Solution:**
  1. Run `npx @dcyfr/ai config:schema` to see full schema
  2. Ensure required fields present: `version`, `projectName`
  3. Check types match (strings in quotes, booleans without quotes, arrays with brackets)
- **Example:** Valid config minimum:

```yaml
version: "1.0.0"
projectName: my-app
```

**Issue: Environment variables not overriding config**

- **Cause:** Incorrect env var naming or precedence
- **Solution:** Use `DCYFR_` prefix with nested path: `DCYFR_AGENTS_DESIGNTOKENS_COMPLIANCE=0.95`
- **Format:** `DCYFR_<SECTION>_<SUBSECTION>_<KEY>=<value>` (uppercase, underscores)
- **Debug:** Log final config to see what values are being used

### Plugin Issues

**Issue: Custom plugin not loading**

- **Cause:** Plugin doesn't implement required interface or missing manifest
- **Solution:** Ensure plugin exports:
  1. `manifest` object with `name`, `version`, `description`
  2. `onValidate` method (async function)
  3. Proper TypeScript types if using TypeScript
- **Example:** See [examples/plugin-system.ts](./examples/plugin-system.ts)

**Issue: Validation fails with "No plugins loaded"**

- **Cause:** Plugins not registered with PluginLoader before validation
- **Solution:**

```typescript
import { PluginLoader } from "@dcyfr/ai";
const loader = new PluginLoader();
await loader.loadPlugin(myPlugin);
await loader.runValidation();
```

### CLI Issues

**Issue: `npx @dcyfr/ai` command not found**

- **Cause:** Package not installed or PATH issue
- **Solution:**
  - Local: Add to devDependencies: `npm install --save-dev @dcyfr/ai`
  - Global: `npm install -g @dcyfr/ai`
  - npx: Use full package name: `npx @dcyfr/ai@latest`

**Issue: CLI commands hang or timeout**

- **Cause:** Large project or slow file system operations
- **Solution:**
  1. Use `--files` flag to target specific files: `npx @dcyfr/ai validate --files "src/**/*.ts"`
  2. Increase timeout in config: `timeout: 60000` (60 seconds)
  3. Check for infinite loops in custom plugins

[⬆️ Back to top](#dcyfr-ai)

---

## 📚 FAQ

**Q: Is @dcyfr/ai published to npm?**

A: Yes, it's published as a public package on npm. Install with `npm install @dcyfr/ai`. Check https://www.npmjs.com/package/@dcyfr/ai for latest version and stats.

**Q: Can I use @dcyfr/ai with JavaScript (no TypeScript)?**

A: Yes, but TypeScript is strongly recommended for better type safety and IDE support. The harness provides full TypeScript support with Zod validation for runtime type checking. If using JavaScript, you'll miss compile-time type checking but runtime validation still works.

**Q: How do I create a custom validation plugin?**

A: Implement the `Plugin` interface with `manifest` and `onValidate` method:

```typescript
export const myPlugin = {
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom validation",
  },
  async onValidate(context) {
    // Your validation logic here
    return { passed: true, issues: [] };
  },
};
```

See [docs/plugins.md](./docs/plugins.md) and [examples/plugin-system.ts](./examples/plugin-system.ts) for complete guide.

**Q: What's the difference between @dcyfr/ai and @dcyfr/agents?**

A: `@dcyfr/ai` is the **public harness** (plugin architecture, config management, telemetry engine, validation harness). `@dcyfr/agents` is a **private package** with DCYFR-specific validation agents (design tokens, barrel exports, PageLayout enforcement). Think of @dcyfr/ai as the engine, @dcyfr/agents as pre-built plugins.

**Q: Can I use this with other AI providers (non-Claude)?**

A: Yes! The harness supports multi-provider integration including Claude, GitHub Copilot, Groq, Ollama, OpenAI, Anthropic. Configure providers in `.dcyfr.yaml`:

```yaml
providers:
  - name: openai
    apiKey: ${OPENAI_API_KEY}
  - name: anthropic
    apiKey: ${ANTHROPIC_API_KEY}
```

**Q: How do I track telemetry and costs?**

A: Use the `TelemetryEngine` with storage adapters:

```typescript
import { TelemetryEngine, FileStorageAdapter } from "@dcyfr/ai";
const telemetry = new TelemetryEngine({
  storage: new FileStorageAdapter("./telemetry"),
});
```

Telemetry tracks: API calls, token usage, costs, latency, quality scores.

**Q: Is this harness production-ready?**

A: Yes! @dcyfr/ai is used in production at dcyfr-labs and other projects. It has comprehensive test coverage, semantic versioning, automated releases via release-please, and follows best practices for package publishing.

[⬆️ Back to top](#dcyfr-ai)

---

## 📊 Performance Benchmarks

### Framework Performance

- **Config Loading:** ~10ms (cached), ~50ms (first load with file I/O)
- **Validation Framework:** Parallel execution 2-5x faster than serial (depends on plugin count)
- **Plugin System:** Minimal overhead ~5ms per plugin registration
- **Bundle Size:** See [bundlephobia.com/@dcyfr/ai](https://bundlephobia.com/package/@dcyfr/ai) for current minzip size

### Recommended Usage Patterns

- **Use parallel validation** for independent checks (faster): `mode: 'parallel'`
- **Cache config loading** (use singleton pattern): Load once, reuse across app
- **Batch telemetry writes** (reduce I/O overhead): Buffer writes, flush periodically
- **Lazy load plugins** (faster startup): Only load plugins you need for current validation

### Comparison with Alternatives

- **vs. Custom Scripts:** 10-20x faster due to optimized plugin execution
- **vs. Serial Validation:** 2-5x faster with parallel execution mode
- **vs. LangChain:** Smaller bundle footprint ([bundlephobia](https://bundlephobia.com/package/@dcyfr/ai))

[⬆️ Back to top](#dcyfr-ai)

---

## 🔒 Security

### Reporting Vulnerabilities

Found a security issue? Report it privately:

- **GitHub Security Advisories:** [dcyfr-ai/security](https://github.com/dcyfr/dcyfr-ai/security/advisories/new)
- **Expected Response:** Within 48 hours

### Security Considerations

- **No API keys stored:** Use environment variables for sensitive data (Zod validates but doesn't store)
- **Zod validation:** All inputs validated with schemas before processing
- **No remote code execution:** Plugins run in local environment only (no sandboxing yet - see limitations)
- **Telemetry privacy:** Optional, disable with `DCYFR_TELEMETRY_ENABLED=false`
- **Dependencies:** Regular Dependabot updates, npm audit on CI

### Best Practices

- Never commit `.env` files (use `.env.example`)
- Use environment variables for API keys: `${OPENAI_API_KEY}`
- Review plugin code before loading (plugins have full access to filesystem)
- Keep dependencies updated: `npm outdated`, `npm update`
- Enable GitHub security scanning in your repository

[⬆️ Back to top](#dcyfr-ai)

---

## ⚙️ Known Limitations

### Current Constraints

- **Plugin isolation:** Plugins run in same process (no sandboxing yet) - trust plugin code before loading
- **File-based telemetry only:** No database storage adapter yet (planned for v2.0)
- **Config caching:** Requires manual cache invalidation on config changes (no hot-reload yet)
- **Provider-specific features:** Some providers may have limited support (e.g., streaming not supported for all)
- **TypeScript required for development:** JavaScript works at runtime but TypeScript recommended for development

### Platform-Specific Issues

- **Windows:** Path separators handled automatically but some plugins may have issues
- **Node.js version:** Requires ≥24.13.0 (uses native fetch, modern APIs)
- **ESM-only:** Package is ESM (ECMAScript Modules) - CommonJS require() not supported

### Planned Improvements

- [ ] Database storage adapter for telemetry (PostgreSQL, SQLite)
- [ ] Plugin sandboxing for security (worker threads or VM isolation)
- [ ] Hot-reload config watching (auto-reload on file changes)
- [ ] Web UI for telemetry dashboard (view costs, usage, quality over time)
- [ ] Enhanced provider feature parity (streaming, function calling, vision)
- [ ] CommonJS compatibility mode (for legacy projects)

See [GitHub Issues](https://github.com/dcyfr/dcyfr-ai/issues) for tracked feature requests and bugs.

[⬆️ Back to top](#dcyfr-ai)

---

## 📄 License & Sponsorship

**License:** MIT for personal/non-commercial use. Commercial use requires a paid tier.

### Commercial Use

This package is dual-licensed:

- **MIT License** for personal, educational, and non-commercial use (free)
- **Commercial License** for business and revenue-generating use (paid)

**Commercial use includes:**

- Using @dcyfr/ai in SaaS products or revenue-generating services
- Deploying in companies with >5 employees
- Providing paid consulting/services using @dcyfr/ai
- Distributing as part of commercial products

### Sponsorship Tiers

- 🌍 **Community** ($5/mo) - Signal community access (DCYFR.NET, Quantum Flux)
- 💚 **Sponsors** ($10/mo) - Bio on dcyfr.ai website + private channels
- 👨‍💻 **Developer** ($20/mo) - Limited commercial license + pre-release builds + portfolio support
- 🚀 **Founder** ($2,400/yr) - Full commercial license + 1hr consultation/mo
- 💼 **Executive** ($4,800/yr) - Business license + 2hr consultation/mo + 50 employees
- 🏢 **Enterprise** ($9,600/yr) - Enterprise license + 4hr consultation/mo + unlimited scale

**Learn more:** [SPONSORS.md](../SPONSORS.md)
**Join:** [GitHub Sponsors](https://github.com/sponsors/dcyfr)
**Contact:** licensing@dcyfr.ai

### Trademark

"DCYFR" is a trademark of DCYFR Labs. See [TRADEMARK.md](../TRADEMARK.md) for usage guidelines.

---

**Made with ❤️ by [DCYFR Labs](https://dcyfr.ai)**
