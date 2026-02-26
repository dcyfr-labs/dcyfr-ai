<!-- TLP:AMBER - Internal Use Only -->
# Delegation Security Middleware Architecture

**Information Classification:** TLP:AMBER (Limited Distribution)  
**Audience:** Internal engineering team  
**Last Updated:** 2026-02-26  
**Version:** 1.0.0

---

## Overview

The DCYFR delegation framework uses a composable **security middleware chain** to enforce
comprehensive protection against the adversarial scenarios identified in the
"Agents of Chaos" research paper (CS2–CS10).

Every call to `DelegationContractManager.createContract()` runs all enabled middleware in
order before the contract is persisted.  Any middleware may:

- **allow** — pass through to the next middleware
- **warn** — record a warning but continue (soft block)
- **block** — immediately reject the request with an error

```
createContract()
  │
  ▼
SecurityMiddlewareChain.evaluate(context)
  │
  ├─ 1. IdentityMiddleware         (feature: identity_verification)
  ├─ 2. TLPMiddleware              (feature: tlp_enforcement)
  ├─ 3. ThreatValidatorMiddleware  (feature: threat_detection)
  ├─ 4. ContentPolicyMiddleware    (feature: content_security)
  ├─ 5. PermissionsMiddleware      (feature: permission_attenuation)
  ├─ 6. ChainDepthMiddleware       (feature: chain_tracking)
  ├─ 7. RateLimiterMiddleware      (feature: security_monitoring)
  ├─ 8. ReputationMiddleware       (feature: reputation_tracking)
  │
  ▼
Contract persisted to SQLite  (only if all middleware allow/warn)
```

---

## SecurityMiddlewareChain

**File:** `packages/ai/delegation/security-middleware-chain.ts`

The chain is a thin orchestrator.  It:

1. Iterates registered middleware in insertion order
2. Skips any middleware whose `featureFlag` is disabled in `FeatureFlagManager`
3. Short-circuits on the first `block` verdict
4. Collects all `warn` verdicts and bubbles them up to the caller

```typescript
import { SecurityMiddlewareChain } from '@dcyfr/ai/delegation';

const chain = new SecurityMiddlewareChain();
chain.register(new IdentityMiddleware(registry));
chain.register(new ThreatValidatorMiddleware());
// …
const result = await chain.evaluate(context);
```

`DelegationContractManager` builds and owns the chain internally — you do not need to
construct it manually unless writing custom tests.

---

## Middleware Reference

### 1. IdentityMiddleware

**Feature flag:** `identity_verification`  
**File:** `middleware/identity-middleware.ts`  
**Mitigates:** CS8 (Identity hijack / impersonation)

Requires the delegator and delegatee to present a valid HMAC-SHA256 `auth_token`
signed with the key registered in `AgentRegistry`.  Tokens expire after 60 seconds.

**Activation:** Only active when `DelegationContractManager` is constructed with an
`agentRegistry` option.

```typescript
import { AgentRegistry } from '@dcyfr/ai/delegation';

const registry = new AgentRegistry();
const { key } = registry.registerAgent('my-agent');

const manager = new DelegationContractManager({ agentRegistry: registry });
```

**Token generation:**
```typescript
const { auth_token, auth_timestamp, key_id } = registry.signToken('my-agent');
// Pass auth_token, auth_timestamp, key_id in the CreateDelegationContractRequest
// under delegator / delegatee fields.
```

---

### 2. TLPMiddleware

**Feature flag:** `tlp_enforcement`  
**File:** `middleware/tlp-middleware.ts`  
**Mitigates:** TLP clearance violations — agents accessing contracts above their classification

Validates that the delegatee's TLP clearance is ≥ the contract's TLP level.
Clearances that have expired are treated as `TLP:CLEAR`.

| Contract TLP | Required clearance |
|---|---|
| CLEAR | Any |
| GREEN | GREEN or higher |
| AMBER | AMBER or higher |
| RED | RED |

Default clearances are seeded at startup; extras can be injected via
`additionalTLPClearances` on `DelegationContractManagerConfig`.

---

### 3. ThreatValidatorMiddleware

**Feature flag:** `threat_detection`  
**File:** `middleware/threat-validator-middleware.ts`  
**Mitigates:** All 7 threat vectors from `SecurityThreatValidator`

Delegates to the existing `SecurityThreatValidator` engine.  `CRITICAL` severity produces
a **block** verdict; `WARNING` produces a **warn** verdict.

Threat vectors detected:
- `prompt_injection` — embedded instructions in untrusted context
- `privilege_escalation` — requesting permissions not granted by delegator
- `resource_exhaustion` — extreme timeout / resource requests
- `chain_manipulation` — forged chain depth values
- `auth_bypass` — missing or malformed authentication tokens
- `data_exfiltration` — patterns indicating credential harvesting
- `permission_scope_creep` — permissions expanding beyond parent scope

---

### 4. ContentPolicyMiddleware

**Feature flag:** `content_security`  
**File:** `middleware/content-policy-middleware.ts`  
**Mitigates:** CS3 (Semantic reframing), CS10 (Corrupted constitution / direction-override chars)

Scans `task_content.context` (the *untrusted* portion of a task) for injection patterns.
`task_content.instruction` (the *trusted* portion) is exempt from scanning.

**Policy levels** (based on contract TLP):
- `strict` (TLP:RED) — blocks most ambiguous content
- `standard` (TLP:AMBER) — blocks known injection patterns
- `permissive` (TLP:CLEAR) — warns only

Block patterns include:
- `[SYSTEM OVERRIDE]`, `[ADMIN]`, `[ROOT]` — authority impersonation tags
- Base64-encoded override instructions
- XML/JSON role injection (`<role>system</role>`, `"role":"system"`)
- Unicode direction-override characters (U+202A–U+202E, U+2066–U+2069)
- Credential exfiltration patterns

`task_description` strings are sanitised (null bytes and direction-overrides stripped)
before being passed to this middleware.

---

### 5. PermissionsMiddleware

**Feature flag:** `permission_attenuation`  
**File:** `middleware/permissions-middleware.ts`  
**Mitigates:** Permission escalation — child agents claiming more access than their parent

Validates `PermissionToken` hierarchies via `PermissionAttenuationEngine`.  A child token
must be a strict subset of its parent.  Any escalation is **blocked**.

---

### 6. ChainDepthMiddleware

**Feature flag:** `chain_tracking`  
**File:** `middleware/chain-depth-middleware.ts`  
**Mitigates:** CS4 (Infinite loop / chain depth exhaustion)

Enforces two limits:

| Limit | Default | Config key |
|---|---|---|
| Maximum delegation depth | 5 | `maxDelegationDepth` on `DelegationContractManagerConfig` |
| Maximum fan-out per delegator per session | 10 | — |

The fan-out counter is incremented on each successful `createContract()` and decremented
when a contract reaches a terminal state (`completed`, `failed`, `cancelled`, `revoked`).

---

### 7. RateLimiterMiddleware

**Feature flag:** `security_monitoring`  
**File:** `middleware/rate-limiter-middleware.ts`  
**Mitigates:** CS5 (Resource exhaustion via volume flooding)

Implements a per-`agent_id` sliding-window rate limiter.

| Parameter | Default |
|---|---|
| `maxOps` | 50 requests |
| `windowMs` | 3,600,000 ms (1 hour) |

Override at construction time via `rateLimiterOptions`:

```typescript
const manager = new DelegationContractManager({
  rateLimiterOptions: { maxOps: 200, windowMs: 60_000 },
});
```

Per-agent overrides can also be declared in the agent capability manifest via
`rate_limit_override`.

---

### 8. ReputationMiddleware

**Feature flag:** `reputation_tracking`  
**File:** `middleware/reputation-middleware.ts`  
**Mitigates:** Low-quality agents being assigned sensitive tasks

**Activation:** Only active when `reputationEngine` is passed to
`DelegationContractManagerConfig`.

For `TLP:AMBER` or higher contracts, the delegatee's overall reputation score must be
≥ 0.5.  Lower-reputation agents are **blocked** for sensitive tasks but can still be
assigned `TLP:CLEAR` work.

Security violations (triggered by `ThreatValidatorMiddleware` blocking) apply a permanent
reputation penalty via a slower-recovery α=0.1 coefficient.

```typescript
import { ReputationEngine } from '@dcyfr/ai/reputation';

const reputationEngine = new ReputationEngine();
const manager = new DelegationContractManager({ reputationEngine });
```

---

## Feature Flag Control

All middleware are individually gated by feature flags managed by `FeatureFlagManager`.
Flags can be toggled without restarting the process:

```typescript
import { getFeatureFlagManager } from '@dcyfr/ai/delegation';

const flags = getFeatureFlagManager();

// Disable identity verification globally (e.g. in local dev)
flags.setFlag('identity_verification', false);

// Re-enable rate limiting after maintenance
flags.setFlag('security_monitoring', true);
```

**Default flag states** (all enabled in production):

| Flag | Middleware | Default |
|---|---|---|
| `identity_verification` | IdentityMiddleware | `true` (requires `agentRegistry`) |
| `tlp_enforcement` | TLPMiddleware | `true` |
| `threat_detection` | ThreatValidatorMiddleware | `true` |
| `content_security` | ContentPolicyMiddleware | `true` |
| `permission_attenuation` | PermissionsMiddleware | `true` |
| `chain_tracking` | ChainDepthMiddleware | `true` |
| `security_monitoring` | RateLimiterMiddleware | `true` |
| `reputation_tracking` | ReputationMiddleware | `true` (requires `reputationEngine`) |

---

## SecurityContext

The middleware chain receives a `SecurityContext` assembled by `DelegationContractManager`
before each `createContract()` call.

```typescript
interface SecurityContext {
  /** Partial contract being created */
  contract: Partial<DelegationContract>;
  /** Delegator making the request */
  delegator: DelegationAgent | AuthenticatedAgent;
  /** Delegatee being assigned the task */
  delegatee: DelegationAgent;
  /** Optional structured task content */
  task_content?: TaskContent;
  /** Timestamp of the request (ISO string) */
  request_timestamp: string;
}
```

`TaskContent` separates trusted `instruction` (caller-supplied, exempt from scanning)
from untrusted `context` (external data scanned by `ContentPolicyMiddleware`):

```typescript
interface TaskContent {
  instruction: string;       // Trusted — not scanned
  context?: string;          // Untrusted — scanned by content policy
  content_policy?: 'strict' | 'standard' | 'permissive';
}
```

---

## Performance

Benchmark (P99, n=1,000, in-memory SQLite, macOS M-series):

| Metric | Value |
|---|---|
| P50 | 0.040 ms |
| P95 | 0.060 ms |
| **P99** | **0.099 ms** |
| P99.9 | 2.571 ms |

The middleware chain adds negligible overhead compared to the I/O cost of contract
persistence.  Total `createContract()` overhead (median) is under 0.1 ms.

---

## Testing

All middleware have dedicated unit test files:

```bash
# Run all delegation tests including security middleware
npx vitest run --reporter=verbose --project dcyfr-ai packages/ai/__tests__/delegation/

# Run agents-of-chaos regression suite specifically
npx vitest run --reporter=verbose packages/ai/__tests__/delegation/agents-of-chaos.test.ts

# Run integration tests
npx vitest run --reporter=verbose packages/ai/__tests__/integration/delegation-security.integration.test.ts

# Run latency benchmark
npx vitest run --reporter=verbose packages/ai/__tests__/delegation/contract-manager.benchmark.test.ts
```

---

## Related Documentation

- [Agent Capability Development Guide](agent-capability-development-guide.md) — how to author agent manifests
- [Capability Bootstrap Integration](capability-bootstrap-integration.md) — loading manifests at startup
- [Delegation Framework User Guide](../../docs/guides/delegation-framework-user-guide.md) — end-user delegation guide
- [Execution Modes Guide](../../docs/guides/delegation-execution-modes.md) — background/async/interactive modes
