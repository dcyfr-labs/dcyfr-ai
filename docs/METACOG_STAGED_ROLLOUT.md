# Metacognitive Improvement Runtime — Staged Rollout

TLP:AMBER — Internal Use Only

This document defines the go/no-go criteria for each rollout stage of the
metacognitive improvement runtime. The runtime graduates through two stages
before reaching production-apply mode:

1. **Shadow mode** — the runtime runs in parallel with the current system
   and records what it *would* do, but applies nothing.
2. **Non-production apply mode** — the runtime applies approved improvements
   to non-production policy domains only; production domains remain unchanged.

---

## Stage 1: Shadow Mode

### Activation

```bash
# Enable shadow mode (runtime runs but DOES NOT apply)
ENABLE_METACOG_RUNTIME=false  # flag stays off; pipeline runs manually for observation
```

In shadow mode, the `TransferEvaluationPipeline` and `MetacogTelemetryEmitter`
are exercised against real proposals, but `runtime.apply()` is never called.

### Go criteria (all must pass before advancing to Stage 2)

| Criterion | Target | Validation method |
|-----------|--------|-------------------|
| Zero `SchemaIncompatibleError` rejections | 100% schema compatibility | Telemetry: `metacog.proposal.submitted` success rate |
| Governance guard pass rate | ≥ 95% of proposals pass `checkGovernance()` | Metrics: `approval_ratio` ≥ 0.95 in shadow log |
| Ledger lineage reconstruction | 100% of proposals reconstruct without `LedgerLineageError` | Run `reconstructLineage()` against shadow ledger |
| Transfer score distribution | mean ≥ 0.75 across ≥ 10 proposals | Telemetry: `metacog.transfer.evaluated.transfer_score` |
| No regressions in existing test suite | 100% pass rate | `npm run test:all` in `dcyfr-ai` and `dcyfr-ai-agents` |

### No-go triggers (halt and investigate)

- Any `GovernanceViolationError` bypassed or swallowed
- `rollback_rate` > 0 in shadow mode (indicates simulation errors)
- `LedgerLineageError` on any proposal chain
- Telemetry sink errors > 1% of events

---

## Stage 2: Non-Production Apply Mode

### Activation

```bash
# Enable the runtime for non-production domains only
ENABLE_METACOG_RUNTIME=true
```

Governance config remains at defaults:
```typescript
{
  production_direct_min_policy: 'third_party_audit',
  tlp_red_policy: 'human_required',
  default_policy: 'direct_inspection',
}
```

Only proposals with `scope: 'non_production'` or `scope: 'production_indirect'`
are applied. `production_direct` proposals are evaluated but not applied (require
manual promotion from governance review).

### Go criteria (all must pass before enabling production apply)

| Criterion | Target | Validation method |
|-----------|--------|-------------------|
| Non-prod apply success rate | ≥ 99% (no unexpected rollbacks) | Metrics: `rollback_rate ≤ 0.01` over 14 days |
| TLP:RED gate enforced | 0 TLP:RED proposals approved without `human_required` | Security audit of ledger |
| Dashboard visibility | `/api/metacog/metrics` returns correct values | Manual dashboard check + route tests |
| Policy snapshot integrity | All snapshots pass content_hash verification | Ledger audit |
| Transfer evaluation coverage | ≥ 2 domains evaluated per proposal | Telemetry: `target_domain_ids.length ≥ 1` |
| Workspace safety check | `npm run check:safety` passes | CI gate |

### No-go triggers

- Any `production_direct` improvement applied without explicit governance approval
- `rollback_rate` > 5% over any 48-hour window
- `LedgerDeserializationError` in production ledger file
- Metrics endpoint returning stale data (timestamp > 5 minutes old)

---

## Stage 3: Production Apply (Future)

Production-direct improvements require a separate governance review packet
(task 6.2) including:

- Transfer metrics from ≥ 30 proposals across both stages
- Rollback drill evidence (task 2.3 test suite output)
- Sign-off from at least one `third_party_audit` verifier per domain

---

## Rollback procedure

If a no-go trigger fires in either stage:

1. Call `runtime.rollback(proposalId, reason, restoredSnapshotId, actor)`.
2. The ledger entry transitions `applied → rolled_back` and references the
   original snapshot for audit continuity.
3. File an incident in the project tracker referencing the `proposal_id` and
   the `rolled_back` ledger `entry_id`.
4. Re-run `npm run test:all` to confirm no regression in surrounding code.
5. Reset the telemetry emitter window: `emitter.resetMetrics()`.

---

*Document version: 1.0.0 | Created: 2026-03-24*
