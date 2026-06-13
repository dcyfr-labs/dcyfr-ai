<!-- TLP:GREEN -->
# Delegation Execution Modes — Rollback Guide

**Information Classification:** TLP:GREEN (Internal)  
**Last Updated:** 2026-02-26  
**Version:** 1.0.0

---

## Overview

This document describes how to roll back the delegation execution modes feature if
breaking changes (Phase 8 tasks 8.4, 8.5, 8.9) cause production issues.

A stable rollback point is tagged in the `dcyfr-ai` repository before any breaking
changes are applied:

```text
v1.4.0-pre-breaking-changes
```

This tag contains the fully-functional non-breaking execution modes infrastructure
(Phase 1–7 + tasks 8.2–8.3) without the mandatory `execution_mode` parameter
enforcement or agent-manifest `supported_execution_modes` requirements.

---

## Rollback Scenarios

| Scenario | Recommended Action |
| -------- | ------------------ |
| Breaking contract creation (task 8.4 regression) | Roll back to `v1.4.0-pre-breaking-changes` |
| Agent manifest validation failures (task 8.5) | Disable `execution_modes` feature flag (see below) |
| Monitoring alert storms (task 8.7) | Disable `execution_modes` feature flag |
| Session handoff hangs in production (task 8.9) | Disable feature flag; escalate to Phase 9 rollback |

---

## Option 1: Feature Flag Disable (Fastest — No Downtime)

The `execution_modes` feature flag defaults to `true`. Set the environment variable to
disable it without redeploying:

```bash
export ENABLE_EXECUTION_MODES=false
# Restart the delegation service / worker process
```

This disables all execution-mode logic, including:

- `selectExecutionMode()` routing
- Background queue management
- Session handoff
- Per-mode monitoring metrics

> **Note:** The `execution_mode` field on `DelegationContract` remains in the type system
> but is effectively ignored by the `ContractManager` when the flag is off.

---

## Option 2: Revert to Stable Tag

If the feature flag is insufficient (e.g., the flag itself is broken), revert to the
stable pre-breaking-changes tag:

```bash
# In dcyfr-ai repo
git checkout v1.4.0-pre-breaking-changes

# Rebuild and redeploy
npm run build
npm run test:run  # Should be ≥1155 tests passing, 0 failing
```

Consumer packages (`dcyfr-ai-agents`, `dcyfr-labs`) will need to pin to the tagged
version in their `package.json`:

```json
{
  "dependencies": {
    "@dcyfr/ai": "github:dcyfr/dcyfr-ai#v1.4.0-pre-breaking-changes"
  }
}
```

---

## Option 3: Full Feature Rollback (Nuclear)

If both options above are insufficient, roll back to the last stable release tag:

```bash
# List all release tags
cd /path/to/dcyfr-ai
git tag -l "v*" | sort -V

# Roll back to last stable release (typically v1.0.4 or latest v1.x.x)
git checkout v1.0.4
npm run build && npm run test:run
```

---

## Verifying Rollback Success

After any rollback, verify:

```bash
# 1. Tests pass
cd dcyfr-ai && npm run test:run
# Expected: all tests passing, 0 failing

# 2. TypeScript compiles clean
npm run typecheck
# Expected: 0 errors

# 3. Feature flag state (if using Option 1)
node -e "
const { isExecutionModesEnabled } = require('./packages/ai/dist/delegation/feature-flags.js');
console.log('execution_modes enabled:', isExecutionModesEnabled());
"
# Expected: false (if ENABLE_EXECUTION_MODES=false is set)
```

---

## Related Documentation

- [Security Middleware Guide](./delegation-security-middleware.md)

---

## Escalation

If rollback fails or causes additional issues, escalate to the DCYFR platform team:

- **Slack:** `#dcyfr-platform-alerts`
- **Email:** <hello@dcyfr.ai>
- **GitHub:** Create a `type:incident` issue in `dcyfr-ai` repository

TLP:GREEN — share within DCYFR organization and authorized clients only.
