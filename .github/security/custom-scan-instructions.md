# DCYFR AI Framework Custom Security Scan Instructions

<!-- TLP:AMBER -->
<!-- Referenced by .github/workflows/security-review.yml via custom-security-scan-instructions -->
<!-- Provides stack context and focus areas so analysis is precise rather than generic. -->

## Tech Stack Context

- **Package type**: Public TypeScript npm library (`@dcyfr/ai`). Consumed by
  `dcyfr-labs`, `dcyfr-ai-api`, `dcyfr-ai-agents`, and external developers.
  Security issues here have the widest blast radius of any repo in the
  workspace.
- **Core subsystems**: Delegation framework (`packages/ai/src/delegation/`),
  capability registry (`capability-registry.ts`), MCP auto-configuration
  (`mcp-auto-configuration.ts`), batch processor, telemetry, and runtime.
- **LLM integrations**: Vercel AI SDK, Anthropic SDK, OpenAI SDK, Google
  Generative AI. API keys are passed as constructor arguments or read from
  environment variables — the library does not store them.
- **No server runtime**: The library runs in the calling application's runtime
  (Node.js or edge). It does not open ports or listen for connections directly.
- **MCP (Model Context Protocol)**: `mcp-auto-configuration.ts` can spawn or
  connect to MCP servers. Any code that reads MCP server configuration from
  user-supplied input must be audited for command injection.
- **Delegation contracts**: Framework allows agents to delegate tasks to other
  agents with attenuated permissions. Verify contract permission checks in
  `packages/ai/src/delegation/`.
- **SQLite (better-sqlite3)**: Used internally for delegation state and
  reputation storage. Parameterised queries are expected — flag any raw string
  interpolation into SQL.

## High-Priority Areas to Focus On

1. **MCP server auto-configuration** (`src/mcp-auto-configuration.ts`):
   Any code path that accepts a user-supplied MCP server `command` or `args`
   and passes it to `child_process.spawn` or similar is a potential command
   injection. Verify all server launch parameters come from a trusted, validated
   configuration source.

2. **Delegation contract permission enforcement** (`src/delegation/`):
   Verify that child delegation contracts cannot claim capabilities beyond what
   the parent grants. Look for missing attenuation checks when creating
   sub-contracts. Also check the security middleware chain enforces TLP
   clearance correctly.

3. **Prototype pollution in utility functions**: Any exported function that
   does deep merge, Object.assign, or recursive property setting on
   user-supplied objects is a prototype pollution risk. Check
   `capability-manifest-generator.ts` and any merge utilities.

4. **Dynamic imports or require calls**: Flag any `import()` or `require()`
   where the module path is constructed from user-supplied data (e.g., a
   capability name or plugin path).

5. **API key exposure in telemetry or logs** (`src/telemetry/`): Verify that
   telemetry event payloads do not inadvertently include API keys, tokens, or
   full capability manifest objects containing credentials.

6. **SQLite query construction** (delegation state, reputation engine):
   Flag any `db.prepare()` or `db.exec()` call that interpolates a variable
   into the SQL string rather than using parameterised bindings.

7. **Insecure defaults in exported configuration**: Check that exported factory
   functions and class constructors use secure defaults (TLS validation on,
   sandboxing on, permission attenuation enforced).

## Severity Calibration Guidance

- **Critical**: Command injection via MCP server config, SQL injection in
  delegation state store, prototype pollution in core exported utilities,
  hardcoded secrets, RCE via dynamic import with user-controlled path.
- **High**: Privilege escalation in delegation contracts, API key leakage
  through telemetry or logs, insecure default that disables TLS or security
  middleware.
- **Medium**: Information disclosure in error messages, ReDoS on user-
  controlled input, missing input validation in exported functions that handle
  untrusted data.
- **Low / Informational**: Verbose logging of internal state, best-practice
  deviations without a direct exploitability path, missing JSDoc `@security`
  annotations on dangerous function parameters.

## Out of Scope

- `node_modules/` — dependency scanning handled by Dependabot and `npm audit`.
- `coverage/` and `dist/` — generated artifacts.
- `examples/` — demo scripts, not production library code.
- `scripts/` — build and release tooling.
- Capability manifest JSON files (`manifests/**/*.json`) — configuration data.
- Test files (`__tests__/`, `*.test.ts`) — infrastructure code; note issues
  but do not block PRs on low-severity test-only findings.
