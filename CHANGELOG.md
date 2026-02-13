# Changelog

## [1.0.4] - 2026-02-12

### Added

#### Version Compatibility Protection

- **Version Skew Protection**: AgentRuntime now performs automatic version compatibility checking during initialization
- **Version Mismatch Warnings**: Clear warning logs when @dcyfr/ai and @dcyfr/ai-agents versions may be incompatible
- **Compatibility Rules**: 
  - Major versions must match (1.x.x with 1.x.x)
  - Runtime can be newer minor version than agents
  - Warnings for agents more than 2 minor versions ahead of runtime

#### Upgrade Paths

When upgrading from older versions, follow these compatibility guidelines:

**Same Major Version (Recommended)**
```bash
# For @dcyfr/ai-agents v1.0.x projects
npm install @dcyfr/ai@^1.0.4

# Check compatibility
npm list @dcyfr/ai @dcyfr/ai-agents
```

**Version Mismatch Resolution**
- If you see "Version Mismatch Warning" logs, upgrade both packages to latest:
  ```bash
  npm install @dcyfr/ai@latest @dcyfr/ai-agents@latest
  ```
- For major version differences, check migration guides in documentation

**Enterprise Environments**
- Pin exact versions in package-lock.json for consistent deployments
- Test version combinations in staging before production deployment
- Monitor AgentRuntime initialization logs for version warnings

### Breaking Changes

None. This release maintains full backward compatibility.

### Migration Guide

No migration required. Version checking is automatic and non-breaking.
If you encounter version warnings:
1. Update both @dcyfr/ai and @dcyfr/ai-agents to latest versions
2. Test your agents with the new versions
3. Update peer dependency constraints if needed

## 1.0.3

### Patch Changes

- [`1d6f12e`](https://github.com/dcyfr/dcyfr-ai/commit/1d6f12ed981054fcb0b26beac4be452926ba793f) Thanks [@dcyfr](https://github.com/dcyfr)! - Automated release management and CI improvements

  - Added automated release workflows with changesets
  - Fixed glob TypeScript compatibility issues
  - Improved integration test handling for CI environments
  - Added canary release workflow for pre-release testing
  - Comprehensive CI pipeline with type checking, linting, and tests

All notable changes to @dcyfr/ai will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-26

### Added

#### Core Framework

- Configuration system with three-layer merge (defaults → project → env)
- Support for YAML, JSON, and package.json configuration formats
- Environment variable overrides for all configuration options
- Zod-based runtime validation for type safety
- Telemetry engine for tracking AI usage and quality metrics
- Provider registry with automatic fallback between AI providers
- Plugin loader with dynamic loading and validation
- Validation framework with parallel/serial execution modes

#### Plugin System

- Plugin manifest validation
- Lifecycle hooks (onLoad, onValidate, onComplete, onUnload)
- Error isolation and recovery
- Configurable failure modes (error, warn, skip)
- Plugin timeout support

#### Telemetry

- Session management with context tracking
- Metric recording (compliance, test pass rate, costs)
- Agent statistics aggregation
- Time-based analytics (7d, 30d, 90d)
- File-based storage with JSON serialization
- Memory storage adapter for testing

#### Provider Support

- Claude (Anthropic)
- Groq
- Ollama
- GitHub Copilot
- OpenAI
- Generic provider interface

#### CLI Tools

- `init` - Initialize new project
- `config:init` - Create configuration file
- `config:validate` - Validate configuration
- `config:schema` - Show configuration schema
- `plugin:create` - Generate plugin template

#### Documentation

- Comprehensive getting started guide
- Complete API reference
- Plugin development guide
- Standalone Next.js example project
- Migration documentation

#### Configuration Templates

- Default YAML configuration
- Default JSON configuration
- Minimal configuration templates

### Quality

- 49 passing tests (100% pass rate)
- Full TypeScript strict mode
- ~200KB bundle size
- <2s build time
- Zero breaking changes in API surface

### Developer Experience

- Type-safe configuration with Zod
- ESM modules with .d.ts declarations
- Comprehensive error messages
- CLI with helpful output and examples
- Hot module replacement support

## [Unreleased]

### Planned

- Redis storage adapter for telemetry
- Database storage adapter
- Additional validation gates
- Performance profiling tools
- Cloud-hosted validation service
- Multi-language bindings

---

[1.0.0]: https://github.com/dcyfr/dcyfr-ai/releases/tag/v1.0.0
