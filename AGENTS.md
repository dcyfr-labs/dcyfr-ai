# AGENTS.md - @dcyfr/ai

**Portable AI agent harness**

Type: Public npm package (`@dcyfr/ai`, current version in [package.json](package.json))
License: MIT

For the full API surface see [docs/API.md](docs/API.md) and [docs/api/index.md](docs/api/index.md). Those files are the source of truth; this file is a map for agents working in the repository.

---

## Project Overview

`@dcyfr/ai` is a plugin-based harness for validation, telemetry, provider fallback and agent definitions:

- **Plugin system:** `PluginLoader` loads plugins that implement `onValidate` and lifecycle hooks.
- **Validation:** `ValidationFramework` runs plugins grouped into gates.
- **Telemetry:** `TelemetryEngine` records sessions, metrics, violations and handoffs.
- **Providers:** `ProviderRegistry` handles provider health checks and fallback.
- **Config:** `ConfigLoader` / `loadConfig` read `.dcyfr.yaml` (or `.dcyfr.json`, `dcyfr.config.*`) and validate it with Zod.
- **Agents:** `agents/` holds the agent loader, registry and router; `agents-builtin/` ships generic agent definitions.
- **Other entry points:** `@dcyfr/ai/mcp`, `/memory`, `/compaction`, `/skills`, `/session`, `/scheduler`, `/gateway` (see the `exports` map in `package.json`).

---

## Architecture Patterns

### 1. Plugin System

A plugin is an object with a `manifest` and optional hooks (`onLoad`, `onUnload`, `onValidate`, `onComplete`):

```typescript
import { PluginLoader, type Plugin } from '@dcyfr/ai';

const myPlugin: Plugin = {
  manifest: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'Example validator',
  },
  async onValidate(context) {
    return { valid: true, violations: [], warnings: [] };
  },
};

const loader = new PluginLoader();
await loader.loadPlugin(myPlugin);
const result = await loader.validateAll({
  projectRoot: process.cwd(),
  files: [],
  config: {},
});
```

### 2. Validation Gates

```typescript
import { ValidationFramework } from '@dcyfr/ai';

const framework = new ValidationFramework({
  gates: [{ name: 'quality', plugins: ['my-plugin'], required: true, failureMode: 'error' }],
});
await framework.loadPlugins(['my-plugin']);
const report = await framework.validate({ projectRoot: process.cwd(), files: [], config: {} });
```

### 3. Provider Fallback

```typescript
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  primaryProvider: 'anthropic',
  fallbackChain: ['github-models', 'workbench'],
  autoReturn: true,
  healthCheckInterval: 60000,
});
```

Valid `ProviderType` values are `local`, `ollama`, `workbench`, `github-models` and `anthropic`.

### 4. Configuration

```yaml
# .dcyfr.yaml
version: "1.0.0"
projectName: my-app
validation:
  enabled: true
  parallel: true
telemetry:
  enabled: true
```

Templates are in [config/](config/); the key reference is [docs/CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md).

---

## Package Structure

```
packages/ai/
├── agents/            # Agent loader, registry, router, types
├── agents-builtin/    # Generic built-in agent definitions
├── config/            # ConfigLoader and Zod schemas
├── core/              # TelemetryEngine, ProviderRegistry
├── plugins/           # PluginLoader
├── validation/        # ValidationFramework
├── mcp/  memory/      # MCP client and memory subsystems
├── src/               # compaction, skills, session, scheduler, gateway, cli
├── types/             # Shared types
├── utils/             # Storage adapters, safe fs helpers
└── index.ts           # Public entry point
bin/                   # dcyfr-ai CLI (cli.js) and dcyfr-ai-tui (tui.js)
config/                # default.yaml, default.json, minimal.yaml, schema.json
docs/                  # Guides and API reference
examples/              # Runnable examples
```

---

## Built-In Agents

`@dcyfr/ai/agents-builtin` exports generic agent definitions: `fullstackDeveloper`, `frontendDeveloper`, `backendArchitect`, `typescriptPro`, `testEngineer`, `debugger`, `securityEngineer`, `architectureReviewer`, `databaseArchitect`, `cloudArchitect`, `performanceProfiler`, `devopsEngineer`, `dataScientist`, `technicalWriter` and `researchOrchestrator`. `loadBuiltinAgents()` returns them all. They are definitions (manifest plus prompt), not classes to instantiate.

Private, organization-specific agents live in `@dcyfr/workspace-agents`, not here.

---

## Development

```bash
npm run build        # tsc + import fix-up (runs gen-version first)
npm run test         # vitest run
npm run test:watch   # vitest watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # eslint packages/
npm run check:parity # doc-parity gates (version, exports, env, config)
```

Tests use [vitest](https://vitest.dev/) and live next to the code in `__tests__/` directories:

```typescript
import { describe, it, expect } from 'vitest';
import { PluginLoader } from '../plugin-loader';

describe('PluginLoader', () => {
  it('starts empty', () => {
    expect(new PluginLoader().getPluginCount()).toBe(0);
  });
});
```

---

## CLI & TUI

```bash
npx dcyfr-ai config:init       # create a starter .dcyfr.yaml
npx dcyfr-ai config:validate   # validate the current config
npx dcyfr-ai config:schema     # print the config schema
npx dcyfr-ai --help

npx dcyfr-ai-tui dashboard     # interactive validation dashboard
npx dcyfr-ai-tui wizard        # configuration wizard
```

Run `npx dcyfr-ai --help` for the authoritative command list. In a checkout, `npm run cli` and `npm run tui` run the same entry points.

---

## Security

- **API keys:** never commit them. Use environment variables.
- **Input validation:** validate user input before passing it to LLMs.
- **Rate limiting:** `ProviderRegistry` detects rate limits and falls back; add your own limits for user-facing calls.
- **Sandboxing:** plugins run in the host process. Review plugin code before loading it, and run generated code in an isolated environment.

---

## Publishing

Releases are automated with release-please from conventional-commit PR titles. Do not run `npm publish` by hand. See [docs/RELEASE_MANAGEMENT.md](docs/RELEASE_MANAGEMENT.md) and [CONTRIBUTING.md](CONTRIBUTING.md#release-process).

---

## Related Packages

- **@dcyfr/workspace-agents**: private, organization-specific agents
- **@dcyfr/ai-nodejs-starter**: Node.js starter template using this framework (not yet published to npm)
- **@dcyfr/ai-sandbox**: examples and experimentation sandbox (not yet published to npm)

---

## Documentation

- [docs/API.md](docs/API.md): API reference
- [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md): tutorial
- [docs/PLUGINS.md](docs/PLUGINS.md): plugin authoring
- [examples/](examples/): usage examples
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution guidelines

---

**Maintained By:** DCYFR Labs
**NPM:** [@dcyfr/ai](https://www.npmjs.com/package/@dcyfr/ai)

## Quality Gates

- TypeScript: 0 errors (`npm run typecheck`)
- Tests: passing (`npm run test`)
- Lint: 0 errors (`npm run lint`)
