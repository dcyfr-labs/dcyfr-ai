# @dcyfr/ai

> Portable AI agent framework with plugin architecture for multi-provider integration, telemetry tracking, and quality validation.

[![npm package](https://img.shields.io/npm/v/@dcyfr/ai.svg)](https://www.npmjs.com/package/@dcyfr/ai)
[![npm downloads](https://img.shields.io/npm/dm/@dcyfr/ai.svg)](https://www.npmjs.com/package/@dcyfr/ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

Portable AI agent framework with plugin architecture for managing multiple AI providers, tracking telemetry, and ensuring quality compliance.

## Features

- 🔌 **Plugin Architecture** - Extensible validation system with custom agents
- 🔄 **Multi-Provider Support** - Claude, Copilot, Groq, Ollama, OpenAI, Anthropic
- ⚙️ **Configuration System** - YAML/JSON config with three-layer merge
- 📊 **Comprehensive Telemetry** - Track usage, costs, quality metrics, performance
- ✅ **Validation Framework** - Quality gates with parallel/serial execution
- 💾 **Pluggable Storage** - Memory, file-based, or custom adapters
- ⚡ **Type-Safe** - Full TypeScript support with Zod validation
- 📦 **Lightweight** - ~200KB gzipped bundle size
- 🛠️ **CLI Tools** - Config validation and initialization

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
    targetUsage: 0.90
  testData:
    enabled: true
```

### 2. Load and Use Configuration

```typescript
import { loadConfig, ValidationFramework } from '@dcyfr/ai';

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

console.log(`Validation: ${report.valid ? 'PASS' : 'FAIL'}`);
```

### 3. Validate Configuration

```bash
# Validate current project config
npx @dcyfr/ai config:validate

# Show full configuration
npx @dcyfr/ai config:validate --verbose
```

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
import { PluginLoader } from '@dcyfr/ai';

const customPlugin = {
  manifest: {
    name: 'my-validator',
    version: '1.0.0',
    description: 'Custom validation logic',
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

## Examples

See [examples/](./examples/) directory:
- `basic-usage.ts` - Getting started
- `plugin-system.ts` - Plugin development
- `configuration.ts` - Configuration usage

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Configuration Guide](./docs/configuration.md)
- [Plugin Development](./docs/plugins.md)
- [API Reference](./docs/api.md)
- [Release Management](./docs/RELEASE_MANAGEMENT.md) - Publishing and versioning
- [Quick Release Guide](./docs/RELEASE_QUICK_START.md) - TL;DR for releases

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

### Release Process

We use [Changesets](https://github.com/changesets/changesets) for automated versioning and publishing.

**For contributors:**
```bash
# Add a changeset describing your changes
npm run changeset

# Commit the changeset with your PR
git add .changeset/*.md
git commit -m "feat: your feature"
```

**For maintainers:**
- Changesets automatically creates Release PRs
- Merging a Release PR publishes to npm
- See [Release Management](./docs/RELEASE_MANAGEMENT.md) for full details
