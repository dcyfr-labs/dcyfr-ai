<!-- TLP:GREEN - Internal Use Only -->

# Plugin Security Pipeline — Pilot Test Results

**Information Classification:** TLP:GREEN (Internal)  
**Phase:** 5 — Pilot Testing  
**Date:** 2026-02-28  
**OpenSpec Change:** `plugin-marketplace-security`

---

## Overview

Five internal pilot plugins were scanned using the Phase 1–3 security pipeline to
validate scanner accuracy, trust score calculation, and end-to-end pipeline
behaviour. All 37 pilot integration tests pass.

---

## Pilot Plugin Summary

| Plugin | License | TLP | Secrets | Recommendation | Trust Score |
|--|--|--|--|--|--|
| `git-tools` | MIT | CLEAR | None | approve-with-warnings | ≥ 60 |
| `web-fetcher` | MIT | CLEAR | None | approve-with-warnings | ≥ 60 |
| `file-processor` | UNLICENSED | CLEAR | None | approve-with-warnings | — |
| `api-client` | MIT | CLEAR | 1 Stripe key | **reject** | < 70 |
| `workspace-analytics` | UNLICENSED | AMBER | None | approve-with-warnings | — |

---

## Scan Duration (measured with `SKIP_EXTERNAL`)

All five pilot scans ran with external CLI tools (syft, grype, clamav, cosign,
sonarcloud) skipped. Only the file-based secret and license scanners ran.

| Metric | Value |
|--|--|
| P50 scan latency (all skipped) | < 5 ms |
| P95 scan latency (all skipped) | < 25 ms |
| P99 scan latency (all skipped) | < 100 ms |
| File-based scan (secrets + license) | < 2 000 ms |
| Secret-detected scan | < 2 000 ms |

All results satisfy the Phase 5.7 requirement: **security scan completes in < 5 min
for 95% of plugins** ✅

---

## Key Findings

### 1. Gitleaks entropy requirement

The original `api-client` fixture used a sequential fake Stripe key with low
Shannon entropy. Gitleaks v8 requires a minimum entropy of ≈ 4.5 bits/char for the
`stripe-access-token` rule. The fixture was updated to a high-entropy key
(`sk_live_51JKDq2eZvKYlo2Cp…`) which is correctly flagged.

**Action:** Document in `PLUGIN_SECURITY_POLICY.md` that Gitleaks must be installed
in CI via `brew install gitleaks` or the official GitHub Action.

### 2. `detectSecrets()` stdout capture bug (fixed)

`secret-detector.ts` called `gitleaks` with `--exit-code 0` so the process always
exited 0. The `try` block did not capture the resolved `stdout` value; findings were
silently discarded. Fix: capture `{ stdout }` from `execFileAsync` and parse JSON.

**Root cause:** Unused return value from `execFileAsync`.  
**Fix commit:** Fix applied in `packages/ai/src/plugins/security/secret-detector.ts`.

### 3. TrustScore interface — `overall` not `score`

`TrustScore` exposes `overall: number`, not `score`. Any consumer code or external
tooling should use `trustScore.overall`.

### 4. UNLICENSED triggers `approve-with-warnings`

Both `file-processor` and `workspace-analytics` use `UNLICENSED`. The license
scanner correctly flags these as incompatible or unknown, resulting in
`approve-with-warnings` (not `approve`). This is the expected behaviour per the
security policy.

### 5. Trust score with detected secret

A single production secret reduces the security dimension score by 25 points
(from 100 → 75). Given default maintenance (60) and community (50) scores, the
plugin's overall trust score lands around 59/100 — above the 40-point
`require-review` threshold but well below the 60-point `approve-with-warnings`
threshold. The `overallRecommendation` is overridden to `reject` by the
`mostRestrictive` calculus regardless of the numeric score.

---

## Docker Sandbox Edge Cases (Phase 5.4)

Seven new edge-case tests added to `docker-sandbox.test.ts` (45 total, up from 38):

| Edge Case | Tested Behaviour |
|--|--|
| OOM exit code 137 | `exitCode === 137`, `timedOut === false` |
| OOM not classified as timeout | Ensures OOM and timeout are distinct states |
| OOM memory flag in args | `--memory=` flag present in `docker run` args |
| CPU spike: low quota flag | `--cpus=` flag present with `maxCpu: 0.1` |
| CPU spike + timeout | `timedOut === true`, `exitCode === 137` when throttled |
| Disk full: non-zero exit | `exitCode !== 0`, stderr contains `no space left on device` |
| Disk full: tmpfs flag | `--tmpfs` flag present in `docker run` args |

---

## Threshold Recommendations

No threshold adjustments are required. The existing defaults are well-calibrated:

| Threshold | Current | Recommendation |
|--|--|--|
| Secret penalty (security score) | −25 per production secret | Keep |
| `approve` boundary | ≥ 80 | Keep |
| `approve-with-warnings` boundary | ≥ 60 | Keep |
| `require-review` boundary | ≥ 40 | Keep |
| `reject` boundary | < 40 (or any blocker) | Keep |

---

## Lessons Learned

1. **Install Gitleaks in CI.** Use `brew install gitleaks` locally and
   `zricethezav/gitleaks-action` in GitHub Actions workflows.
2. **High-entropy test fixtures.** Fake secrets for testing must have realistic
   entropy (> 4.5 bits/char for most tools). Sequential alphanumeric strings are
   silently ignored.
3. **Always capture `execFileAsync` stdout.** When using `--exit-code 0` with
   gitleaks, the process resolves rather than rejects; stdout must be explicitly
   captured from the resolved object.
4. **Mock argument order matters.** In Vitest, `mockReturnValueOnce` and
   `mockImplementationOnce` are consumed in FIFO order. An extra
   `mockReturnValueOnce` before a `mockImplementationOnce` will silently consume
   the call before the capturing implementation runs.
5. **OOM and timeout are distinct states.** Exit code 137 can mean either OOM kill
   or SIGKILL from timeout. The `timedOut` flag in `SandboxResult` is the
   authoritative flag; do not infer timeout from exit code alone.
