<!-- TLP:CLEAR -->
# Documentation Index

Documentation for `@dcyfr/ai`. For an overview, installation, and a quick start, see the [root README](../README.md). Release history is in [CHANGELOG.md](../CHANGELOG.md).

## Getting started

- [GETTING-STARTED.md](GETTING-STARTED.md): installation, quick start, core concepts, configuration, plugins, telemetry, multi-provider use, examples, and CLI commands.
- [migrations/README.md](migrations/README.md): guides for moving to `@dcyfr/ai` from LangChain, the Vercel AI SDK, and the OpenAI SDK, with a complexity and time estimate for each.

## Configuration and providers

- [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md): the top-level keys of the framework configuration (`FrameworkConfigSchema`), with pointers to the JSON Schema and the templates in `config/`.
- [PROVIDER_INTEGRATIONS.md](PROVIDER_INTEGRATIONS.md): connecting to LLM providers, including cloud APIs, local models, and multi-model routing proxies, through the unified configuration system.
- [guides/github-models-quickstart.md](guides/github-models-quickstart.md): using GitHub Models through a `GITHUB_TOKEN`.

## Memory

- [MEMORY_SETUP.md](MEMORY_SETUP.md): setting up the mem0 powered memory layer.
- [MEMORY.md](MEMORY.md): integration guide for the memory layer, covering the quick start, core concepts, configuration, API, error handling, advanced usage, and migration.

## Plugins and security

- [PLUGINS.md](PLUGINS.md): building custom validation plugins, including the plugin interface and basics.
- [guides/PLUGIN_DEVELOPMENT_GUIDE.md](guides/PLUGIN_DEVELOPMENT_GUIDE.md): building secure plugins for the marketplace, written for plugin developers and marketplace contributors.
- [guides/WASM_PLUGIN_STARTER.md](guides/WASM_PLUGIN_STARTER.md): a starter template for plugins compiled to WebAssembly.
- [guides/WASM_MIGRATION_GUIDE.md](guides/WASM_MIGRATION_GUIDE.md): migrating Docker based plugins to WebAssembly.
- [security/PLUGIN_SECURITY_POLICY.md](security/PLUGIN_SECURITY_POLICY.md): the plugin security policy, covering the trust model, permission requirements, runtime isolation, scanning requirements, incident response, and auditing.
- [security/dependabot-accepted-risks.md](security/dependabot-accepted-risks.md): open Dependabot alerts that have no fix available, with the reason each is accepted and the condition that ends it.

## Agents and delegation

- [guides/autonomous-agent-guide.md](guides/autonomous-agent-guide.md): the autonomous agent runtime, covering scheduling, cross-platform conversations, file-based memory, and dynamic skill injection.
- [guides/agent-capability-development-guide.md](guides/agent-capability-development-guide.md): the capability manifest schema, creating manifests, confidence calibration, verification, and testing, for agent developers.
- [guides/capability-bootstrap-integration.md](guides/capability-bootstrap-integration.md): integrating the Capability Bootstrap system with other DCYFR AI components, external systems, and development workflows.
- [guides/delegation-migration-v3.md](guides/delegation-migration-v3.md): migrating the delegation framework from v2.x to v3.0, which adds the Session Handoff Protocol as backwards-compatible optional fields.
- [guides/delegation-execution-modes-rollback.md](guides/delegation-execution-modes-rollback.md): rolling back the delegation execution modes feature if its breaking changes cause production issues.
- [guides/delegation-security-middleware.md](guides/delegation-security-middleware.md): the architecture of the delegation security middleware, for engineers building on `@dcyfr/ai`.
- [guides/brand-voice-hooks.md](guides/brand-voice-hooks.md): the brand voice hook system that injects brand voice and agent guidance before LLM calls.

## API reference

- [API.md](API.md): hand-written API reference covering configuration, telemetry, providers, plugins, validation, types, error classes, utilities, and constants.
- [api/README.md](api/README.md): index of the generated per-module reference pages below.
- [api/index.md](api/index.md): generated reference for the main `@dcyfr/ai` entry point.
- [api/mcp.md](api/mcp.md): generated reference for `@dcyfr/ai/mcp`.
- [api/memory.md](api/memory.md): generated reference for `@dcyfr/ai/memory`.
- [api/compaction.md](api/compaction.md): generated reference for `@dcyfr/ai/compaction`.
- [api/skills.md](api/skills.md): generated reference for `@dcyfr/ai/skills`.
- [api/session.md](api/session.md): generated reference for `@dcyfr/ai/session`.
- [api/scheduler.md](api/scheduler.md): generated reference for `@dcyfr/ai/scheduler`.
- [api/gateway.md](api/gateway.md): generated reference for `@dcyfr/ai/gateway`.
- [api/security-prompt-scan-worker.md](api/security-prompt-scan-worker.md): generated reference for `@dcyfr/ai/security/prompt-scan-worker`.
- [api/capability-bootstrap-api.md](api/capability-bootstrap-api.md): reference for the `@dcyfr/ai/capability-bootstrap` module, which generates capability manifests for new agent onboarding.
- [capabilities.json](capabilities.json): the machine-readable capability list that the README's capability tables are generated from.

## Terminal UI

- [OPENTUI_INTEGRATION.md](OPENTUI_INTEGRATION.md): the terminal UI integration built on chalk, ora, cli-table3, and inquirer, and why the project moved away from OpenTUI.
- [TUI_IMPLEMENTATION.md](TUI_IMPLEMENTATION.md): the final terminal UI implementation using those libraries instead of OpenTUI.

## Releases

- [RELEASE_MANAGEMENT.md](RELEASE_MANAGEMENT.md): how `@dcyfr/ai` is versioned and published to npm with release-please.
- [RELEASE_QUICK_START.md](RELEASE_QUICK_START.md): the short version of the release process, starting from a conventional commit PR title.

## Backlog

- [backlog/SLACK_INTEGRATION_2026-02-05.md](backlog/SLACK_INTEGRATION_2026-02-05.md): a medium priority feature request, dated 2026-02-05, for talking to DCYFR AI agents through Slack.
- [backlog/DISCORD_INTEGRATION_2026-02-05.md](backlog/DISCORD_INTEGRATION_2026-02-05.md): a medium priority feature request, dated 2026-02-05, for a Discord integration.

## Possibly outdated

- [TUI.md](TUI.md): describes the OpenTUI integration and the `@opentui/core` module. `package.json` has no `@opentui` dependency and `bin/tui.js` imports `chalk` and `ora`, which matches `OPENTUI_INTEGRATION.md` and `TUI_IMPLEMENTATION.md` recording the move away from OpenTUI.
- [archive/README.md](archive/README.md): says the files in `archive/` are v1.0.0 launch-era reports from January 2026, kept for reference, while the package is now at 3.7.8.
- [archive/LAUNCH-SUMMARY.md](archive/LAUNCH-SUMMARY.md): launch summary for the v1.0.0 release of `@dcyfr/ai`.
- [archive/POST-LAUNCH-STATUS.md](archive/POST-LAUNCH-STATUS.md): the v1.0.0 release summary, published January 27, 2026.
- [archive/RELEASE-NOTES-v1.0.0.md](archive/RELEASE-NOTES-v1.0.0.md): release notes for the first public release, v1.0.0.
- [archive/OPTIONAL-NEXT-STEPS-COMPLETE.md](archive/OPTIONAL-NEXT-STEPS-COMPLETE.md): completion report for the optional steps after the v1.0.0 launch.
- [archive/CHANGESETS_WORKFLOW.md](archive/CHANGESETS_WORKFLOW.md): a Changesets quick reference. The project releases with release-please now, per `RELEASE_MANAGEMENT.md`.
- [archive/AUTOMATED_RELEASE_SETUP.md](archive/AUTOMATED_RELEASE_SETUP.md): the Changesets and GitHub Actions release setup, replaced by release-please.
