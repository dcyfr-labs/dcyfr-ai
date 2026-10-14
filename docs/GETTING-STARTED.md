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
npm install @dcyfr/ai @dcyfr/workspace-agents
```

## Quick Start

### 1. Initialize Configuration

Create a configuration file in your project root:

```bash
npx dcyfr-ai config:init
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
  basePath: config.telemetry.storagePath,
});

// Start tracking
const session = telemetry.startSession('anthropic', {
  taskType: 'feature',
  description: 'Implement dark mode',
});

// Your code here...

// Complete session
await session.end('success');
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

// Load the plugins the gates name (see docs/PLUGINS.md)
await framework.loadPlugins([/* your eslint and typescript validator plugins */]);

// Run validation
const report = await framework.validate({
  projectRoot: process.cwd(),
  files: ['src/**/*.ts'],
  config: {},
});

console.log(`Validation: ${report.valid ? 'PASS' : 'FAIL'}`);
console.log(`Gates passed: ${report.summary.passedGates}/${report.summary.totalGates}`);
console.log(`Gates skipped: ${report.summary.skippedGates}`);
```

A gate whose plugins aren't loaded (or are disabled) runs nothing and is marked `skipped`. A skipped `required` gate fails the report with a `gate-skipped` violation, and a report in which no gate ran is never `valid`.

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
import { Plugin, PluginLoader } from '@dcyfr/ai';

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
import { TelemetryEngine } from '@dcyfr/ai';

const engine = new TelemetryEngine({
  storage: 'file',
  basePath: '.dcyfr/telemetry',
});

// Start session
const session = engine.startSession('anthropic', {
  taskType: 'feature',
  description: 'Add authentication',
});

// Record metrics
session.recordMetric('tokenCompliance', 0.95);
session.recordMetric('testPassRate', 1.0);

// Complete
await session.end('success');

// Get analytics
const stats = await engine.getAgentStats('anthropic', '30d');
console.log(`Total sessions: ${stats.totalSessions}`);
console.log(`Successes: ${stats.outcomes.success}`);
```

### 4. Provider Registry

Multi-provider AI with automatic fallback:

```typescript
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  primaryProvider: 'anthropic',
  fallbackChain: ['github-models', 'ollama'],
  autoReturn: true,
  healthCheckInterval: 60000,
});

// Execute with fallback
const result = await registry.executeWithFallback(
  {
    description: 'Implement feature',
    phase: 'implementation',
    filesInProgress: ['src/app.ts'],
  },
  async (provider) => {
    // Your AI execution logic
    return await callAI(provider);
  }
);

// Stop health monitoring when you are done
registry.destroy();
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

# DCYFR-specific agents (requires @dcyfr/workspace-agents)
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
} from '@dcyfr/workspace-agents';

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
import { TelemetryEngine } from '@dcyfr/ai';

const engine = new TelemetryEngine({
  storage: 'file',
  basePath: '.dcyfr/telemetry',
});

// Start session
const session = engine.startSession('anthropic', {
  taskType: 'refactor',
  description: 'Extract shared utilities',
});

// Record various metrics
session.recordMetric('tokenCompliance', 0.92);
session.recordMetric('testPassRate', 0.98);
session.recordMetric('lintViolations', 3);
session.recordMetric('executionTime', 45000);

// Complete with outcome
await session.end('success');
```

### Analytics & Reporting

```typescript
// Get agent statistics
const stats = await engine.getAgentStats('anthropic', '30d');
console.log('Anthropic statistics (30 days):');
console.log(`- Total sessions: ${stats.totalSessions}`);
console.log(`- Successes: ${stats.outcomes.success}`);
console.log(`- Avg token compliance: ${stats.quality.averageTokenCompliance * 100}%`);
console.log(`- Total cost: $${stats.cost.totalCost}`);

// Compare all agents over a period
const comparison = await engine.compareAgents('7d');
comparison.recommendations.forEach((rec) => console.log(rec));
```

## Multi-Provider AI

### Basic Provider Usage

```typescript
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  primaryProvider: 'anthropic',
  fallbackChain: ['github-models', 'ollama'],
  autoReturn: true,
  healthCheckInterval: 60000,
});

// Execute with automatic fallback
const result = await registry.executeWithFallback(
  {
    description: 'Generate API documentation',
    phase: 'implementation',
    filesInProgress: ['src/api/docs.ts'],
  },
  async (provider) => {
    console.log(`Executing with ${provider}`);
    // Your AI call here
    return await myAIFunction(provider);
  }
);

console.log(result.provider, result.fallbackUsed);
```

### Checking Provider State

```typescript
// Currently active provider
console.log(registry.getCurrentProvider());

// Health of every provider (a Map keyed by provider name)
for (const [provider, health] of registry.getHealthStatus()) {
  console.log(`${provider}: ${health.available ? 'available' : 'unavailable'}`);
}

// Stop health monitoring
registry.destroy();
```

Valid provider names are `local`, `ollama`, `workbench`, `github-models` and `anthropic`. Switching happens automatically on failure or rate limit; there is no public manual switch method.

## Examples

See the [examples/](../examples/) directory for complete examples:

- **basic-usage.ts** - Telemetry, provider fallback and analytics
- **plugin-system.ts** - Creating and using plugins
- **configuration.ts** - Configuration management
- **autonomous-agent.ts** - Autonomous agent example

## CLI Commands

### Initialize Configuration

```bash
# Create default .dcyfr.yaml
npx dcyfr-ai config:init

# Create JSON format
npx dcyfr-ai config:init --format json

# Create minimal config
npx dcyfr-ai config:init --minimal
```

### Validate Configuration

```bash
# Validate current config
npx dcyfr-ai config:validate

# Show full configuration
npx dcyfr-ai config:validate --verbose

# Use custom config file
npx dcyfr-ai config:validate --config custom.yaml
```

### View Schema

```bash
# Show configuration schema
npx dcyfr-ai config:schema
```

## Next Steps

### For New Users
1. ✅ Install the package
2. ✅ Initialize configuration
3. ✅ Try basic telemetry example
4. 📖 Read the [API Reference](./API.md)
5. 🔌 Explore [Plugin Development](./PLUGINS.md)

### For DCYFR Projects
1. ✅ Install both `@dcyfr/ai` and `@dcyfr/workspace-agents`
2. ✅ Configure specialized agents
3. ✅ Run validation gates
4. 📊 Monitor telemetry
5. 🎯 Optimize quality metrics

### Advanced Topics
- [Plugin Development Guide](./PLUGINS.md)
- [API Reference](./API.md)
- [Migration Guide](./migrations/README.md)

## Support

- 📚 [Documentation](../README.md)
- 💬 [GitHub Issues](https://github.com/dcyfr-labs/dcyfr-ai/issues)
- 🔗 [Examples](../examples/)

## License

MIT © DCYFR Labs
