---
"@dcyfr/ai": major
---

feat!: Session handoff chain protocol, requires-confirmation workflow, user context files API (v3.0)

### Breaking Changes

**DelegationContract** now requires `handoff_context?: HandoffContext` in the type definition.
Existing contracts without this field remain valid (optional), but downstream TypeScript consumers
using strict type checking may see new optional property warnings.

**SessionHandoffChain** replaces single-session handoff with a chain protocol supporting
multi-hop handoffs with full context preservation across agent sessions.

### New Features

#### Session Handoff Chain (`@dcyfr/ai/session`)
- `SessionHandoffChain` class: chain multiple session handoffs without losing conversation history
- `HandoffContext` type: structured context snapshot passed between sessions
- `createHandoffChain(sessions)`: factory for creating handoff chains from session arrays
- Full integration test coverage (14 tests, `session-handoff-chain.integration.test.ts`)

#### Requires-Confirmation Workflow (`@dcyfr/ai/delegation`)
- `requiresConfirmation: boolean` flag on `DelegationContract`
- `ConfirmationWorkflow` class: structured pause-and-log confirmation protocol
- `pendingConfirmation` contract status for tasks awaiting human approval
- Confirmation timestamp logging for audit trails

#### User Context Files API (`@dcyfr/ai/context`)
- `UserContextFiles` class: progressive disclosure loader for workspace user context files
- `loadContextFile(name)`: lazy-load individual context files (about-me, brand-voice, etc.)
- `getAvailableContextFiles()`: list available context files without loading content
- Template validation against `nexus/context/user/templates/`

### Summary

These additions implement the cowork-inspired improvements inspired by validated practices
from human-AI collaboration research (January–February 2026 cowork sessions). The session
handoff chain prevents context loss during long-running multi-agent workflows. The confirmation
workflow enforces human oversight for destructive or high-stakes operations. User context files
enable personalized agent behavior without hardcoding user preferences.

All new APIs are fully tested. No existing APIs removed.
