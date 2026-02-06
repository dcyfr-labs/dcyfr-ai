<!-- TLP:CLEAR -->
# Getting Started with @dcyfr/ai

Welcome to @dcyfr/ai - a portable AI agent framework with plugin architecture for multi-provider AI integration, telemetry tracking, and quality validation.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Configuration](#configuration)
- [Using Plugins](#using-plugins)
- [Telemetry & Analytics](#telemetry--analytics)
- [Multi-Provider AI](#multi-provider-ai)
- [Examples](#examples)
- [Next Steps](#next-steps)

## Installation

### For New Projects

```bash
npm install @dcyfr/ai
```

### For DCYFR Projects (with specialized agents)

```bash
npm install @dcyfr/ai @dcyfr/agents
```

## Quick Start

### 1. Initialize Configuration

Create a configuration file in your project root:

```bash
npx @dcyfr/ai config:init
```

This creates `.dcyfr.yaml`:

```yaml
version: '1.0.0'
projectName: my-app

agents:
  designTokens:
    enabled: true
    compliance: 0.90
  barrelExports:
    enabled: true
  pageLayout:
    enabled: true
  testData:
    enabled: true
```

### 2. Basic Usage

```typescript
import { loadConfig, TelemetryEngine } from '@dcyfr/ai';

// Load configuration
const config = await loadConfig();

// Initialize telemetry
const telemetry = new TelemetryEngine({
  storage: config.telemetry.storage,
  enabled: config.telemetry.enabled,
});

// Start tracking
const sessionManager = new TelemetrySessionManager(telemetry);
const session = sessionManager.startSession('claude', {
  taskType: 'feature',
  taskDescription: 'Implement dark mode',
});

// Your code here...

// Complete session
session.complete({ success: true });
```

### 3. Using Validation Framework

```typescript
import { ValidationFramework } from '@dcyfr/ai';

// Create framework
const framework = new ValidationFramework({
  gates: [
    {
      name: 'code-quality',
      plugins: ['eslint', 'typescript'],
      required: true,
      failureMode: 'error',
    },
  ],
  parallel: true,
});

// Run validation
const report = await framework.validate({
  projectRoot: process.cwd(),
  files: ['src/**/*.ts'],
  config: {},
});

console.log(`Validation: ${report.valid ? 'PASS' : 'FAIL'}`);
console.log(`Gates passed: ${report.summary.passedGates}/${report.summary.totalGates}`);
```

## Core Concepts

### 1. Configuration System

The framework uses a three-layer configuration merge:

```
Framework Defaults → Project Config (.dcyfr.yaml) → Environment Variables
```

**Supported formats:**
- `.dcyfr.yaml` / `.dcyfr.yml` (recommended)
- `.dcyfr.json`
- `package.json` (under `dcyfr` key)

**Environment overrides:**
```bash
DCYFR_TELEMETRY_ENABLED=false
DCYFR_PROVIDERS_PRIMARY=groq
DCYFR_AGENTS_DESIGNTOKENS_COMPLIANCE=0.95
```

### 2. Plugin System

Plugins extend the framework with custom validation logic:

```typescript
import { Plugin } from '@dcyfr/ai';

const myPlugin: Plugin = {
  manifest: {
    name: 'my-validator',
    version: '1.0.0',
    description: 'Custom validation',
  },
  
  async onLoad() {
    console.log('Plugin loaded');
  },
  
  async onValidate(context) {
    // Validation logic
    return {
      valid: true,
      violations: [],
      warnings: [],
    };
  },
};

// Load plugin
const loader = new PluginLoader();
await loader.loadPlugin(myPlugin);
```

### 3. Telemetry Engine

Track AI usage, costs, and quality metrics:

```typescript
import { TelemetryEngine, TelemetrySessionManager } from '@dcyfr/ai';

const engine = new TelemetryEngine({
  storage: 'file',
  storagePath: '.dcyfr/telemetry',
  retentionDays: 30,
});

const manager = new TelemetrySessionManager(engine);

// Start session
const session = manager.startSession('claude', {
  taskType: 'feature',
  taskDescription: 'Add authentication',
  projectName: 'my-app',
});

// Record metrics
session.recordMetric('tokenCompliance', 0.95);
session.recordMetric('testPassRate', 1.0);

// Complete
session.complete({ success: true });

// Get analytics
const stats = await engine.getAgentStats('claude', '30d');
console.log(`Total sessions: ${stats.totalSessions}`);
console.log(`Success rate: ${stats.successRate * 100}%`);
```

### 4. Provider Registry

Multi-provider AI with automatic fallback:

```typescript
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  providers: {
    claude: { enabled: true },
    groq: { enabled: true },
    ollama: { enabled: true },
  },
  fallbackOrder: ['claude', 'groq', 'ollama'],
});

// Execute with fallback
const result = await registry.executeWithFallback(
  'claude',
  { taskType: 'feature' },
  async (provider) => {
    // Your AI execution logic
    return await callAI(provider);
  }
);
```

## Configuration

### Full Configuration Example

```yaml
version: '1.0.0'
projectName: my-awesome-app

# Telemetry settings
telemetry:
  enabled: true
  storage: file
  storagePath: .dcyfr/telemetry
  retentionDays: 30
  sampling: 1.0

# AI Provider configuration
providers:
  enabled: true
  primary: claude
  fallback:
    - groq
    - ollama
  timeout: 30000
  retries: 3
  providers:
    claude:
      enabled: true
      model: claude-3-5-sonnet-20241022
    groq:
      enabled: true
      model: llama-3.3-70b-versatile
    ollama:
      enabled: true
      baseUrl: http://localhost:11434

# Validation configuration
validation:
  enabled: true
  parallel: true
  failFast: false
  gates:
    - name: typescript
      plugins: [typescript-compiler]
      required: true
      failureMode: error
    - name: linting
      plugins: [eslint]
      required: true
      failureMode: error

# DCYFR-specific agents (requires @dcyfr/agents)
agents:
  designTokens:
    enabled: true
    compliance: 0.90
    tokenFile: src/lib/design-tokens.ts
  barrelExports:
    enabled: true
    barrelPaths:
      - '@/components'
      - '@/lib'
  pageLayout:
    enabled: true
    targetUsage: 0.90
  testData:
    enabled: true

# Project settings
project:
  root: .
  include:
    - src/**/*.ts
    - src/**/*.tsx
  exclude:
    - node_modules/**
    - dist/**
    - .next/**
```

### Minimal Configuration

```yaml
version: '1.0.0'
projectName: my-app

agents:
  designTokens:
    enabled: true
  testData:
    enabled: true
```

## Using Plugins

### Built-in Plugin Loader

```typescript
import { PluginLoader } from '@dcyfr/ai';

const loader = new PluginLoader({
  failureMode: 'warn',
  timeout: 30000,
});

// Load multiple plugins
await loader.loadPlugins([
  myValidator,
  anotherValidator,
]);

// Run validation
const result = await loader.validateAll({
  projectRoot: process.cwd(),
  files: ['src/**/*.ts'],
  config: {},
});
```

### Using DCYFR Agents

```typescript
import { PluginLoader } from '@dcyfr/ai';
import {
  designTokenValidator,
  barrelExportChecker,
  pageLayoutEnforcer,
  testDataGuardian,
} from '@dcyfr/agents';

const loader = new PluginLoader();

// Load DCYFR specialized validators
await loader.loadPlugins([
  designTokenValidator,
  barrelExportChecker,
  pageLayoutEnforcer,
  testDataGuardian,
]);

// Run validation with config
const result = await loader.validateAll({
  projectRoot: process.cwd(),
  files: ['src/**/*.{ts,tsx}'],
  config: {
    designTokens: { compliance: 0.90 },
    pageLayout: { targetUsage: 0.90 },
  },
});
```

### Creating Custom Plugins

```typescript
import { Plugin, ValidationContext, ValidationResult } from '@dcyfr/ai';

export const myCustomValidator: Plugin = {
  manifest: {
    name: 'import-validator',
    version: '1.0.0',
    description: 'Validates import statements',
    author: 'Your Name',
  },

  async onLoad() {
    console.log('Import validator loaded');
  },

  async onValidate(context: ValidationContext): Promise<ValidationResult> {
    const violations = [];

    for (const file of context.files) {
      // Read file and check imports
      if (file.includes('import * from')) {
        violations.push({
          type: 'import',
          severity: 'warning',
          message: 'Avoid wildcard imports',
          file,
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings: [],
    };
  },
};
```

## Telemetry & Analytics

### Session Management

```typescript
import { TelemetryEngine, TelemetrySessionManager } from '@dcyfr/ai';

const engine = new TelemetryEngine({
  storage: 'file',
  storagePath: '.dcyfr/telemetry',
});

const manager = new TelemetrySessionManager(engine);

// Start session
const session = manager.startSession('claude', {
  taskType: 'refactor',
  taskDescription: 'Extract shared utilities',
  projectName: 'my-app',
});

// Record various metrics
session.recordMetric('tokenCompliance', 0.92);
session.recordMetric('testPassRate', 0.98);
session.recordMetric('lintViolations', 3);
session.recordMetric('executionTime', 45000);

// Complete with outcome
session.complete({
  success: true,
  outcome: 'success',
});
```

### Analytics & Reporting

```typescript
// Get agent statistics
const stats = await engine.getAgentStats('claude', '30d');
console.log('Claude Statistics (30 days):');
console.log(`- Total sessions: ${stats.totalSessions}`);
console.log(`- Success rate: ${stats.successRate * 100}%`);
console.log(`- Avg quality: ${stats.avgQuality * 100}%`);
console.log(`- Total cost: $${stats.totalCost}`);

// Get all sessions
const sessions = await engine.getAllSessions();
console.log(`Total sessions across all agents: ${sessions.length}`);

// Filter by date range
const recentSessions = sessions.filter(s => 
  s.startTime > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
);
```

## Multi-Provider AI

### Basic Provider Usage

```typescript
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  providers: {
    claude: { enabled: true },
    groq: { enabled: true },
    ollama: { enabled: true },
  },
  fallbackOrder: ['claude', 'groq', 'ollama'],
});

// Execute with automatic fallback
const result = await registry.executeWithFallback(
  'claude',
  { taskType: 'feature', projectName: 'my-app' },
  async (provider) => {
    console.log(`Executing with ${provider}`);
    // Your AI call here
    return await myAIFunction(provider);
  }
);
```

### Manual Provider Switching

```typescript
// Check provider health
const health = registry.getProviderHealth('claude');
console.log(`Claude status: ${health.available ? 'available' : 'unavailable'}`);

// Switch providers manually
await registry.switchProvider('claude', 'groq', 'rate-limit');
```

## Examples

See the [examples/](../examples/) directory for complete examples:

- **basic-usage.ts** - Getting started with the framework
- **plugin-system.ts** - Creating and using plugins
- **configuration.ts** - Configuration management
- **telemetry-example.ts** - Telemetry and analytics
- **multi-provider.ts** - Provider fallback patterns

## CLI Commands

### Initialize Configuration

```bash
# Create default .dcyfr.yaml
npx @dcyfr/ai config:init

# Create JSON format
npx @dcyfr/ai config:init --format json

# Create minimal config
npx @dcyfr/ai config:init --minimal
```

### Validate Configuration

```bash
# Validate current config
npx @dcyfr/ai config:validate

# Show full configuration
npx @dcyfr/ai config:validate --verbose

# Use custom config file
npx @dcyfr/ai config:validate --config custom.yaml
```

### View Schema

```bash
# Show configuration schema
npx @dcyfr/ai config:schema
```

## Next Steps

### For New Users
1. ✅ Install the package
2. ✅ Initialize configuration
3. ✅ Try basic telemetry example
4. 📖 Read the [API Reference](./API.md)
5. 🔌 Explore [Plugin Development](./PLUGINS.md)

### For DCYFR Projects
1. ✅ Install both `@dcyfr/ai` and `@dcyfr/agents`
2. ✅ Configure specialized agents
3. ✅ Run validation gates
4. 📊 Monitor telemetry
5. 🎯 Optimize quality metrics

### Advanced Topics
- [Plugin Development Guide](./PLUGINS.md)
- [API Reference](./API.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Migration Guide](./MIGRATION.md)
- [Performance Tuning](./PERFORMANCE.md)

## Support

- 📚 [Documentation](./README.md)
- 💬 [GitHub Issues](https://github.com/dcyfr/dcyfr-ai/issues)
- 🔗 [Examples](../examples/)

## License

MIT © DCYFR Labs
