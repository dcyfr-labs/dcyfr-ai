# Changelog

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
