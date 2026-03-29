# @dcyfr/ai Examples

This directory contains runnable examples for core `@dcyfr/ai` capabilities.

## Prerequisites

- Node.js `>=20`
- Install dependencies from this package directory: `npm install`
- Optional provider credentials for examples that call external models:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GITHUB_TOKEN` (for MCP bridge usage)

## Example Index

| File                  | Demonstrates                                                          | Notes                                         |
| --------------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| `basic-usage.ts`      | telemetry sessions, provider fallback, analytics reporting            | safe default starting point                   |
| `plugin-system.ts`    | plugin loading and validation framework gates                         | includes custom plugin examples               |
| `configuration.ts`    | config loading and runtime configuration patterns                     | good for setup/debug flows                    |
| `autonomous-agent.ts` | autonomous runtime modules (memory, session, gateway, scheduler, MCP) | advanced flow; some integrations are optional |

## How to Run

Run examples from the `dcyfr-ai/` directory.

```bash
npx tsx examples/basic-usage.ts       # Getting started
npx tsx examples/plugin-system.ts     # Plugin development
npx tsx examples/configuration.ts     # Configuration usage
npx tsx examples/autonomous-agent.ts  # Full autonomous runtime
```

## Compile Check (CI)

All examples are validated by the TypeScript compiler:

```bash
npm run examples:check
```

This runs `tsc -p tsconfig.examples.json` with `noEmit: true`. It is also enforced in the `validate-examples` CI workflow on every PR.

## Expected Output Markers

Each example uses `// @expected-output: <text>` comments before key `console.log` calls. These serve as smoke-test anchors for the CI `validate-examples` workflow, which verifies the marked strings appear in stdout when the example runs.

## Authoring Notes

- Use the standard JSDoc header: `@example`, `@description`, `Prerequisites:`, `Usage:`, `@license`, `@copyright`.
- Add `// @expected-output: <text>` before any `console.log` that signals successful completion.
- Keep examples deterministic — avoid live network calls unless the scenario requires them.
- Run `npm run examples:check` before committing example changes.
