<!-- TLP:CLEAR -->
# Release Notes for @dcyfr/ai v1.0.0

## 🎉 Initial Public Release

We're excited to announce the first public release of @dcyfr/ai - a portable AI agent framework with plugin architecture for multi-provider integration, telemetry tracking, and quality validation.

## ✨ Features

### Core Framework
- **Configuration System** - Three-layer merge (defaults → project → environment) with YAML/JSON support
- **Telemetry Engine** - Track AI usage, costs, quality metrics, and performance
- **Provider Registry** - Multi-provider AI with automatic fallback (Claude, Groq, Ollama, OpenAI, Anthropic)
- **Plugin Loader** - Dynamic plugin loading with manifest validation and lifecycle hooks
- **Validation Framework** - Quality gates with parallel/serial execution modes

### Plugin System
- Dynamic ESM module loading
- Lifecycle hooks: `onLoad`, `onValidate`, `onComplete`, `onUnload`
- Manifest validation with Zod
- Error isolation and configurable failure modes
- Timeout support

### CLI Tools
Eight commands for project management:
- `init` - Initialize new project
- `config:init` - Create configuration file
- `config:validate` - Validate configuration
- `config:schema` - Show configuration schema
- `plugin:create` - Generate plugin template
- `validate` - Run validation checks
- `report` - Generate telemetry reports
- `help` - Show comprehensive help

### Developer Experience
- Full TypeScript support with strict mode
- ESM modules with complete type definitions
- Zod-based runtime validation
- Comprehensive error messages
- ~200KB bundle size
- <2s build time

## 📦 Installation

```bash
npm install @dcyfr/ai
```

## 🚀 Quick Start

```typescript
import { loadConfig, TelemetryEngine } from '@dcyfr/ai';

// Load configuration
const config = await loadConfig();

// Initialize telemetry
const telemetry = new TelemetryEngine({
  storage: 'file',
  enabled: true,
});

// Start tracking
const session = telemetry.startSession('claude', {
  taskType: 'feature',
  taskDescription: 'Implement authentication',
});

// Your code here...

// Complete session
session.complete({ success: true });
```

## 📚 Documentation

- [Getting Started Guide](./GETTING-STARTED.md) - Complete tutorial (450 lines)
- [API Reference](./API.md) - Full API documentation (550 lines)
- [Plugin Development](./PLUGINS.md) - Plugin creation guide (620 lines)
- [Standalone Example](../examples/standalone-nextjs/) - Working Next.js app

## 🎯 What's Included

### Configuration
- YAML/JSON/package.json support
- Environment variable overrides
- Zod validation
- Template files

### Providers
- Claude (Anthropic)
- Groq
- Ollama
- GitHub Copilot
- OpenAI
- Anthropic
- Generic provider interface

### Storage Adapters
- Memory storage
- File-based storage
- Extensible adapter interface

### Example Projects
- Standalone Next.js application
- Custom validation scripts
- Telemetry reporting
- Plugin templates

## 🔧 Technical Specifications

- **Bundle Size:** 55.1 KB (published), 222.5 KB (unpacked)
- **Dependencies:** 2 (zod, yaml)
- **Test Coverage:** 49/49 tests passing (100%)
- **TypeScript:** 5.3+ with strict mode
- **Node.js:** ≥18.0.0
- **License:** MIT

## 📊 Package Metrics

- 41 files published
- 3,000+ lines of code
- 1,620+ lines of documentation
- 8 CLI commands
- 4 specialized validators (via @dcyfr/agents)

## 🌟 Why @dcyfr/ai?

1. **Portable** - Works with any Node.js project (Next.js, Express, vanilla)
2. **Extensible** - Plugin architecture for custom validators
3. **Resilient** - Multi-provider fallback for high availability
4. **Observable** - Built-in telemetry and analytics
5. **Type-Safe** - Full TypeScript support with Zod validation
6. **Well-Documented** - 1,620+ lines of comprehensive documentation

## 🛠️ Use Cases

- **AI Agent Development** - Multi-provider framework with fallback
- **Quality Engineering** - Custom validation plugins
- **DevOps** - Telemetry and cost tracking
- **Framework Integration** - Works with Next.js, Express, etc.
- **Plugin Development** - Extensible validation system

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## 📝 License

MIT © DCYFR Labs

## 🔗 Links

- **npm:** https://www.npmjs.com/package/@dcyfr/ai
- **GitHub:** https://github.com/dcyfr/dcyfr-ai
- **Documentation:** [docs/](./)
- **Examples:** [examples/](../examples/)
- **Issues:** https://github.com/dcyfr/dcyfr-ai/issues

## 🙏 Acknowledgments

Built with ❤️ by DCYFR Labs as part of the DCYFR modularization initiative to create portable, reusable AI tooling for the community.

---

**Full Changelog:** https://github.com/dcyfr/dcyfr-ai/blob/main/CHANGELOG.md
