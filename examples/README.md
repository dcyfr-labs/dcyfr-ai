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

- Basic usage: `npx tsx examples/basic-usage.ts`
- Plugin system: `npx tsx examples/plugin-system.ts`
- Configuration: `npx tsx examples/configuration.ts`
- Autonomous runtime: `npx tsx examples/autonomous-agent.ts`

## Expected Output

Each example logs step-by-step progress with numbered sections and ends with a success-style completion message.

## Authoring Notes

- Prefer descriptive names (for example: `example-basic-agent.ts` style when adding new files).
- Add inline comments at setup boundaries, decision points, and cleanup sections.
- Keep examples deterministic (avoid network calls unless explicitly required by the scenario).
