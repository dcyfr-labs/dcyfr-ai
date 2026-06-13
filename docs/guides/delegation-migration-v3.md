<!-- TLP:CLEAR -->
# Delegation Framework: Migration Guide — v2.x → v3.0

**Information Classification:** TLP:CLEAR (Public)  
**Applies to:** `@dcyfr/ai` v3.0.0+  
**Minimum breaking change:** None — all v3.0.0 additions are **backwards-compatible optional fields**

---

## Overview

`@dcyfr/ai` v3.0.0 introduces the **Session Handoff Protocol**: a mechanism for chaining
delegation contracts so that context produced by one contract is automatically carried
forward into the next. This eliminates the need to manually re-establish context for
sequential agent tasks.

Two new optional fields are added to `DelegationContract` and `CreateDelegationContractRequest`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `handoff_context` | `object \| undefined` | `undefined` | Prior session context snapshot |
| `requires_confirmation` | `boolean \| undefined` | `undefined` | Require explicit user confirmation |
| `schema_version` | `'2.0' \| '3.0' \| undefined` | `undefined` | Contract schema version tag |

---

## Backwards Compatibility

**No breaking changes.** All three fields are optional and default to `undefined`.

Contracts created with v2.x SDKs continue to work without modification. When reading a
contract that lacks `schema_version`, treat it as if `schema_version === '2.0'`.

```typescript
// v2.x contract — still valid in v3.0
const contract = await manager.createContract({
  delegator,
  delegatee,
  task_id: 'my-task',
  task_description: 'Do something',
  verification_policy: 'automated_test',
  success_criteria: {},
  timeout_ms: 60_000,
});
// contract.handoff_context === undefined ✅
// contract.requires_confirmation === undefined ✅
// contract.schema_version === undefined (treat as '2.0') ✅
```

---

## New Feature: Session Handoff Context

### What it solves

Without handoff context, a second contract that depends on the output of a first contract
must either:
1. Re-fetch the first contract's result from storage, or
2. Re-establish all context from scratch (expensive, error-prone)

With `handoff_context`, the completing contract's relevant outputs are embedded directly
into the dependent contract, enabling a seamless "hand-off" analogous to human knowledge
transfer between shifts.

### How to use it

#### 1. Simple two-contract chain

```typescript
import { DelegationContractManager } from '@dcyfr/ai/delegation/contract-manager.js';

const manager = new DelegationContractManager({ db });

// Step 1: Create contract A (research task)
const contractA = await manager.createContract({
  delegator,
  delegatee: researchAgent,
  task_id: 'research-auth',
  task_description: 'Research OAuth 2.0 implementation options',
  verification_policy: 'automated_test',
  success_criteria: {},
  timeout_ms: 30 * 60_000, // 30 minutes
});

// ... agent completes contract A ...

// Step 2: Create contract B with handoff from A
const contractB = await manager.createContract({
  delegator,
  delegatee: implementationAgent,
  task_id: 'implement-auth',
  task_description: 'Implement OAuth 2.0 based on research findings',
  verification_policy: 'automated_test',
  success_criteria: {},
  timeout_ms: 60 * 60_000, // 60 minutes
  parent_contract_id: contractA.contract_id,
  // ✨ NEW in v3.0.0
  handoff_context: {
    source_contract_id: contractA.contract_id,
    timestamp: new Date().toISOString(),
    context_summary: 'Research complete: recommend Auth0 SDK; see artifact_snapshot for decision matrix',
    artifact_snapshot: contractA.verification_result?.artifacts?.decision_matrix
      ? [contractA.verification_result.artifacts.decision_matrix]
      : [],
  },
});

// contractB.handoff_context.source_contract_id === contractA.contract_id ✅
```

#### 2. Three-contract chain (A → B → C)

```typescript
// Aggregate context from multiple completed dependencies
const contractC = await manager.createContract({
  delegator,
  delegatee: reviewAgent,
  task_id: 'review-auth',
  task_description: 'Review the OAuth implementation for security issues',
  verification_policy: 'human_review',
  success_criteria: { required_checks: ['security', 'completeness'] },
  timeout_ms: 45 * 60_000,
  handoff_context: {
    source_contract_id: contractB.contract_id, // most recent dependency
    timestamp: new Date().toISOString(),
    context_summary: [
      `Research (${contractA.contract_id}): Auth0 SDK selected`,
      `Implementation (${contractB.contract_id}): OAuth endpoints created, tests passing`,
    ].join('\n'),
    // Merge artifacts from both prior contracts
    artifact_snapshot: [
      ...(contractA.verification_result?.artifacts?.decision_matrix
        ? [contractA.verification_result.artifacts.decision_matrix]
        : []),
      ...(contractB.verification_result?.artifacts
        ? Object.values(contractB.verification_result.artifacts)
        : []),
    ],
  },
});
```

#### 3. Automated handoff via SessionManager

When using `SessionManager.register()`, pass `handoffContext` as the fifth argument:

```typescript
import { SessionManager } from '@dcyfr/ai/delegation/session-manager.js';

const sessionManager = new SessionManager();

// Register a session that carries forward context from a completed contract
const session = sessionManager.register(
  sessionId,
  contractB.contract_id,
  executionMode,
  initialState,
  // ✨ NEW in v3.0.0
  contractA.handoff_context ?? {
    source_contract_id: contractA.contract_id,
    timestamp: new Date().toISOString(),
    context_summary: 'Prior session context',
  },
);

// session.handoffContext is populated ✅
```

#### 4. Listening for completed contracts with handoff context

The `contract_completed` event includes the full contract object, which now contains
`handoff_context` if it was set:

```typescript
manager.on('contract_completed', (contract) => {
  if (contract.handoff_context) {
    console.log(`Contract ${contract.contract_id} completed with handoff context from ${contract.handoff_context.source_contract_id}`);
    console.log('Summary:', contract.handoff_context.context_summary);
  }
});
```

---

## New Feature: Confirmation Gates

For destructive or irreversible tasks, set `requires_confirmation: true` on the contract.
The executing agent is responsible for checking this flag and pausing for confirmation
before proceeding.

```typescript
const dangerousContract = await manager.createContract({
  delegator,
  delegatee: deployAgent,
  task_id: 'deploy-to-production',
  task_description: 'Deploy release candidate to production',
  verification_policy: 'human_review',
  success_criteria: {},
  timeout_ms: 30 * 60_000,
  // ✨ NEW in v3.0.0
  requires_confirmation: true,
});

// Executing agent checks flag before acting:
if (dangerousContract.requires_confirmation) {
  const confirmed = await requestUserConfirmation(
    `About to execute: "${dangerousContract.task_description}". Proceed?`
  );
  if (!confirmed) {
    await manager.updateContractStatus(dangerousContract.contract_id, 'cancelled');
    return;
  }
}
```

---

## Schema Version Detection

The `schema_version` field can be used by migration tools and SDK consumers to
identifycontracts from specific SDK generations:

```typescript
function isV3Contract(contract: DelegationContract): boolean {
  return contract.schema_version === '3.0';
}

// Currently, schema_version is NOT automatically set by createContract().
// You must set it explicitly if needed:
const contract = await manager.createContract({
  // ...
  metadata: { schema_version: '3.0' }, // stored in metadata for consumers
});
```

> **Note:** `schema_version` is informational. The delegation framework does not
> branch behaviour based on it. It is intended for consumers that need to handle
> contracts from multiple SDK generations.

---

## Changeset

A changeset should be created for downstream packages before upgrading to v3.0.0:

```bash
cd dcyfr-ai
npx changeset
# Select: @dcyfr/ai
# Version bump: minor (all changes are additive)
# Description: "feat(delegation): session handoff protocol v3.0 (handoff_context, requires_confirmation, schema_version)"
```

---

## Troubleshooting

### `handoff_context` is `undefined` on retrieved contract

The field is stored in the contract's `metadata` blob. If you create a contract with
`handoff_context` and then retrieve it but see `undefined`:

1. **Check the manager version**: `rowToContract` in `contract-manager.ts` must be v3.0.0+
   to recover `handoff_context` from metadata.
2. **Check persistence**: `handoff_context` is stored under `metadata['handoff_context']`.
   You can inspect it directly: `JSON.parse(row.metadata)['handoff_context']`.

### Contract fails to create when `handoff_context` is set

`handoff_context` is passed through the same validation middleware as the rest of the
contract. There are no additional validation rules specific to `handoff_context`. If
creation fails, check the standard security and validation logs.

### `requires_confirmation: true` but agent proceeds without confirming

The delegation framework records the field but does not enforce the pause. Enforcement
is the executing agent's responsibility. Audit logs can help identify which agent
processed the contract and whether it read `requires_confirmation`.

---

## See Also

- [Delegation Security Middleware Guide](./delegation-security-middleware.md)
- [AGENTS.md — Prompt Injection Security](../../AGENTS.md)
