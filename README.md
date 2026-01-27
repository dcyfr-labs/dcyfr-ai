# @dcyfr/ai

Portable AI agent framework with plugin architecture.

## Features

- 🔌 **Plugin System** - Extensible validation and tool architecture
- 📊 **Telemetry Engine** - Track AI usage, costs, and performance
- 🔄 **Provider Registry** - Multi-provider AI with automatic fallback
- ⚙️ **Configuration as Code** - YAML/JSON with schema validation
- 🧪 **Test Coverage** - ≥95% coverage with comprehensive test suites
- 📦 **Lightweight** - <200KB bundle size (gzipped)

## Installation

```bash
npm install @dcyfr/ai
```

## Quick Start

```typescript
import { AgentManager } from "@dcyfr/ai";

// Load configuration
const config = await loadConfig(".dcyfr/config.yaml");

// Initialize framework
const manager = new AgentManager(config);

// Start telemetry session
const session = manager.telemetry.startSession("claude", {
  taskType: "feature",
  projectName: "my-project",
});

// Use agent
// ... your code here ...

// End session
session.complete({ success: true });
```

## Documentation

- [Getting Started](https://dcyfr.github.io/dcyfr-ai/getting-started)
- [API Reference](https://dcyfr.github.io/dcyfr-ai/api)
- [Plugin Development](https://dcyfr.github.io/dcyfr-ai/plugins)
- [Configuration Guide](https://dcyfr.github.io/dcyfr-ai/configuration)

## License

MIT © DCYFR Labs

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.
