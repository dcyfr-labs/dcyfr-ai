# Metacognitive Improvement Runtime — Governance Review Packet

TLP:AMBER — Internal Use Only
Date: 2026-03-24
Prepared by: hyperagents-metacognitive-improvement change implementation

---

## 1. Change summary

This change adds a governed metacognitive improvement runtime to `@dcyfr/ai`.
The runtime executes an improvement lifecycle (`propose → evaluate → approve → apply → rollback`)
for versioned improvement-policy documents with explicit verification-policy enforcement.

**Packages modified:**
- `@dcyfr/ai` — runtime, ledger, transfer evaluation, telemetry, governance guards
- `@dcyfr/ai-agents` — policy binding interface
- `dcyfr-labs` — dashboard metrics endpoint

**Feature flag:** `ENABLE_METACOG_RUNTIME` — disabled by default (no behavior change unless enabled)

---

## 2. Governance invariants enforced

| Rule | Enforcement point | Test evidence |
|------|-------------------|---------------|
| `production_direct` → min `third_party_audit` | `approve()` + `checkProductionPromotionPolicy()` | `governance.test.ts`: "blocks direct_inspection for production_direct scope" |
| TLP:RED → `human_required` | `approve()` + `checkTlpRedGate()` | `governance.test.ts`: "blocks third_party_audit for TLP:RED" |
| Governance config invariants at construction | `assertGovernanceInvariants()` | `runtime.test.ts`: "throws at construction if..." |
| Schema version compatibility before processing | `assertSchemaCompatible()` | `runtime.test.ts`: schema compatibility suite |
| Valid state transitions only | `assertValidTransition()` | `runtime.test.ts`: invalid transition guards suite |

---

## 3. Transfer evaluation evidence

Transfer evaluation pipeline validated against two baseline domains:

### Domain: `scoring_strategy`
| Benchmark | Baseline params (threshold=0.7) | Score |
|-----------|----------------------------------|-------|
| `precision_at_threshold` | threshold=0.7 | 0.88 |
| `recall_at_threshold` | threshold=0.7 | ~0.93 (normalized) |
| `f1_balance` | threshold=0.7 | ~0.90 |

### Domain: `delegation_thresholds`
| Benchmark | Baseline params | Score |
|-----------|-----------------|-------|
| `min_confidence_gate` | min_confidence=0.6 | 0.71 |
| `max_depth_safety` | max_depth=3 | 1.00 |
| `blast_radius_limit` | blast_radius=10 | 0.83 |

**Transfer evaluation tests:** `transfer.test.ts` — 17 tests covering:
- Source-domain fail → target evaluation skipped
- Regression budget exceeded → not promotable
- Score below minimum → not promotable
- All domains pass → promotable

---

## 4. Rollback drill evidence

The `runtime.test.ts` suite includes a full `applied → rolled_back` drill:

```
"rollback: transitions applied → rolled_back"
  ✓ entry.state === 'rolled_back'
  ✓ payload.reason === 'regression detected'
  ✓ payload.restored_snapshot_id === 'snap-original'
```

The `ledger.test.ts` suite validates lineage traceability:

```
"extractRollbackTrail: returns applied and rolled_back pair with restored_snapshot_id"
  ✓ applied entry linked
  ✓ rolled_back entry references applied entry via previous_entry_id
  ✓ restored_snapshot_id correctly extracted
```

---

## 5. Test suite summary

| Package | Test files | Tests | Pass rate |
|---------|-----------|-------|-----------|
| `@dcyfr/ai` — metacognition | 6 | 115 | 100% |
| `@dcyfr/ai-agents` | 9 | 166 | 100% |
| `dcyfr-labs` — metacog route | 1 | 5 | 100% |
| **Total (new)** | **16** | **286** | **100%** |

Pre-existing failures in `@dcyfr/ai` delegation suite (19 files, ~294 tests) are
unrelated to this change and tracked separately.

---

## 6. Safety check results

```
npm run check:safety — PASSED
  ✓ verify-safety-defaults.mjs
  ✓ check-prompt-injection-risk.mjs
  ✓ validate-context-files.mjs
```

---

## 7. Sign-off record

| Role | Requirement | Status |
|------|-------------|--------|
| Implementation review | All tasks 1.1–6.1 complete | ✓ |
| Transfer metrics present | ≥ 2 domains, baselines documented | ✓ |
| Rollback drill evidence | `applied → rolled_back` test passing | ✓ |
| Governance guards tested | 4.2 + 4.3 guard tests passing | ✓ |
| Feature flag default | `ENABLE_METACOG_RUNTIME` defaults to disabled | ✓ |
| Staged rollout doc | `docs/METACOG_STAGED_ROLLOUT.md` present | ✓ |

**Governance sign-off:** Pending human reviewer approval before production-direct apply mode is enabled.

---

*Packet version: 1.0.0 | Change: hyperagents-metacognitive-improvement*
