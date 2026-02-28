# Changelog

## 2.1.3

### Patch Changes

- [`c000856`](https://github.com/dcyfr/dcyfr-ai/commit/c0008565690dd929b6a8bda55200138f3f692c40) Thanks [@dcyfr](https://github.com/dcyfr)! - Remove workspace-relative import that broke production builds. The `generateDcyfrCapabilityManifests()` function now throws an error instead of attempting to import from workspace paths. Use `generateCapabilityManifest()` directly instead.

## 2.1.2

### Patch Changes

- Remove workspace-relative import that broke production builds. The `generateDcyfrCapabilityManifests()` function now throws an error instead of attempting to import from workspace paths. Use `generateCapabilityManifest()` directly instead.

## 2.1.1

### Patch Changes

- fix: Remove workspace-specific export that broke production builds

  Removed `generateDcyfrCapabilityManifests()` from public API exports. This function contained hardcoded workspace-relative paths that caused Next.js/Turbopack build failures when @dcyfr/ai was installed as an npm package in other projects. The function remains available in source for workspace use but is no longer part of the public API.

  This hotfix resolves the production deployment blocking issue in dcyfr-labs and other consumer projects.

## 2.1.0

### Minor Changes

- [`7660a35`](https://github.com/dcyfr/dcyfr-ai/commit/7660a35224e577cd61ec002949ea0328c5d67891) Thanks [@dcyfr](https://github.com/dcyfr)! - Delegation framework improvements

  - Fixed 584 TypeScript errors to 0 across the workspace
  - Added SQLite-based delegation contract persistence with better-sqlite3
  - Implemented delegation telemetry module for monitoring agent performance
  - Enhanced capability registry with bulk operations and improved search
  - Achieved 75.3% delegation test pass rate (332/441 tests passing)
  - Added comprehensive delegation documentation and examples

  This represents a major stability and functionality improvement to the delegation framework.

- [`45e3e87`](https://github.com/dcyfr/dcyfr-ai/commit/45e3e87320ac85d21320c01ed2b7d1d8d2e0b2dd) Thanks [@dcyfr](https://github.com/dcyfr)! - Ralph Loop V2: prompt rewriting, pattern learning, and token budget management

  - Added `DelegationManager.rewritePrompt()` with four failure-aware strategies: `wrong_direction`, `missing_context`, `wrong_format`, and `stuck_on_complexity` — each queries the memory layer for relevant context before rewriting
  - Added `DelegationManager.runWithRetry()` for automatic retry with exponential backoff, rewriting on each attempt; emits structured `RetryResult` with per-attempt logs and Telegram escalation on persistent failure
  - Added `DelegationManager.learnPattern()` and `queryHighConfidencePattern()` for persistent prompt pattern storage; high-confidence patterns (5+ successes) are applied as shortcuts before full rewrite
  - Added token budget management: `estimateTokens()`, `TokenBudgetInfo` interface, automatic trimming to 80% of the model context window, and verbatim preservation of the 3 most recent injected blocks
  - Exported `TokenBudgetInfo`, `PromptPattern`, `PatternLearningOptions`, `RetryOptions`, `RetryAttempt`, `RetryResult`, `RewriteTask`, `RewriteResult`, `FailureAnalysis` from `@dcyfr/ai`
  - 111 new tests across 5 test files covering all new delegation manager capabilities

### Patch Changes

- [`486b11b`](https://github.com/dcyfr/dcyfr-ai/commit/486b11bee8c4abb88f9eacc2bd16daa72e15c437) Thanks [@dcyfr](https://github.com/dcyfr)! - # Security Update

  Upgrade @qdrant/js-client-rest from 1.13.0 to 1.16.2 to fix 3 moderate-severity undici vulnerabilities:

  - GHSA-g9mf-h72j-4rw9 (unbounded decompression in HTTP responses)
  - GHSA-cxrh-j4jr-qwg3 (DoS via bad certificate data)

  This is a minor version bump with no breaking API changes.

- [`29cd73f`](https://github.com/dcyfr/dcyfr-ai/commit/29cd73fccd4771f52367667bb117bd47f78293d7) Thanks [@dcyfr](https://github.com/dcyfr)! - security: upgrade fastmcp 3.30.1→3.33.0 and downgrade mem0ai 2.2.2→1.0.39 to fix axios vulnerabilities

  Fixed 3 high-severity axios vulnerabilities (GHSA-jr5f-v2jv-69x6 SSRF, GHSA-4hjh-wcwx-xvwj DoS, GHSA-43fc-jf86-j433 DoS) by downgrading mem0ai which had pinned axios@1.7.7. Also upgraded fastmcp to latest version (3.33.0) to improve MCP server performance.

  Security improvements:

  - Removed axios@1.7.7 (vulnerable) from mem0ai dependency tree
  - All axios instances now at 1.13.5+ (safe versions)
  - Workspace vulnerability count reduced from 22 → 18
  - High-severity vulnerabilities reduced from 7 → 5

  Breaking changes:

  - mem0ai downgraded from 2.2.2 → 1.0.39 (MAJOR version downgrade)
  - Limited API compatibility risk due to custom abstraction layer in packages/ai/memory/mem0-client.ts
  - All tests passing (921/921)

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
