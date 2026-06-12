# Publish runbook — `dcyfr-ai` launcher

**Status: PREPARED, NOT PUBLISHED.** Publishing is a deliberate operator
action (needs npm rights on the dcyfr-labs side and a decision to hold the
unscoped name). This file is the checklist for doing it. It is excluded from
the npm tarball (`files` allowlist ships only `bin/` + the auto-included
`package.json`/`README.md`/`LICENSE`).

## Why (context)

- The `@dcyfr/ai` README's primary CLI instruction is `npx dcyfr-ai <command>`
  (README.md ~line 114 and ~20 other places). For users **without** a local
  install, npx resolves `dcyfr-ai` as a **registry package name** — the exact
  failure users hit in
  [#253](https://github.com/dcyfr-labs/dcyfr-ai/issues/253).
- The registry packument for `dcyfr-ai` shows it was published (1.0.0) and
  fully unpublished within 3 minutes on 2026-01-27 (created
  `2026-01-27T07:04Z`, unpublished `07:07Z`). Per npm's unpublish policy the
  name has been re-claimable by **anyone** since 2026-01-28. A squatter would
  get code execution on every machine that runs `npx dcyfr-ai …` cold.
- Publishing this launcher closes the squat window **and** makes the
  documented `npx dcyfr-ai config:init` work with no prior install.

## Pre-flight (do all of these the same day you publish)

1. **Confirm the name is still unclaimed** (if this returns real versions,
   STOP — the name was squatted; escalate to npm support / security@npmjs.com
   instead of publishing):

   ```bash
   curl -s https://registry.npmjs.org/dcyfr-ai | jq '{versions: (.versions // {} | keys), unpublished: .time.unpublished.time}'
   # expected: versions [] / null, unpublished "2026-01-27T07:07:05.377Z"
   ```

2. **Check the dependency floor is current**: `launcher/package.json` pins
   `@dcyfr/ai: ^3.2.4` and `version: 3.2.4`. If the harness has moved, bump
   both to the latest release (`npm view @dcyfr/ai version`).

3. **Account checks**: `npm whoami`; account has 2FA enabled; you're
   publishing from a clean checkout of `main`.

## Publish

```bash
cd launcher

# 1. Pack and inspect — expect EXACTLY these four files:
#    package/package.json, package/README.md, package/LICENSE,
#    package/bin/forward.js
npm pack
tar -tzf dcyfr-ai-*.tgz

# 2. Verify the tarball end-to-end as a cold consumer (installs the real
#    @dcyfr/ai from the registry):
TARBALL="$PWD/$(ls dcyfr-ai-*.tgz)"
cd "$(mktemp -d)" && npm init -y >/dev/null
npm install --no-audit --no-fund "$TARBALL"
node -p "require('./node_modules/@dcyfr/ai/package.json').version"  # expect latest 3.x
./node_modules/.bin/dcyfr-ai --help   # expect the "@dcyfr/ai CLI" banner, exit 0
# (the CLI has no version/--version command as of 3.2.4 — --help is the
#  smoke signal; verified 2026-06-12)
cd - >/dev/null

# 3. Publish the exact tarball you inspected (unscoped = public by default).
#    NEVER publish as 1.0.0 — that version was burned by the 2026-01-27
#    unpublish and the registry will reject it anyway.
npm publish "$TARBALL" --otp=<code>
```

## Post-publish

1. `npm view dcyfr-ai` — sanity-check version, repository, dist.tarball.
2. Cold-cache check from any machine: `npx -y dcyfr-ai@latest --help`.
3. **Ownership**: add a second owner / org team so the name doesn't depend on
   one account: `npm owner add <user> dcyfr-ai` (or grant a dcyfr-labs team
   read-write on npmjs.com → package → Settings).
4. On npmjs.com → `dcyfr-ai` → Settings → Publishing access: require 2FA (or
   Trusted Publishing/OIDC if the org adopts it).
5. Docs follow-up (optional): README.md line ~114's workaround note
   (`npx -p @dcyfr/ai dcyfr-ai …`) can be simplified, and #253 can get a
   closing comment that cold `npx dcyfr-ai` now works.
6. Consider wiring the launcher into `release.yml` later for `--provenance`
   publishes (provenance requires CI; a manual laptop publish can't attest).

## Maintenance policy

- The caret range (`^3.x`) means npx users automatically get every new
  @dcyfr/ai **minor/patch** at install time — no launcher republish needed.
  This is deliberate: an exact pin would silently serve stale CLI behavior
  (the #253 failure mode in a new costume), and the floating range adds no
  third-party exposure since the dependency is DCYFR-owned.
- On a **major** release of @dcyfr/ai (4.0.0): bump the launcher's `version`
  and dependency range to match, republish.
- **Never unpublish** this package — a publish/unpublish cycle is exactly
  what created this window.

## Related name exposures (checked 2026-06-12)

| Name | Registry state | Exposure |
| --- | --- | --- |
| `dcyfr-ai` | Unpublished 2026-01-27, claimable; 1.0.0 burned | **This package.** Primary documented command of @dcyfr/ai. |
| `dcyfr` | 404, never published | **Real and HIGH.** `@dcyfr/ai-cli@1.0.5` ships a `dcyfr` bin, and the ai-cli README instructs bare `npx dcyfr --help` / `npx dcyfr status` in at least 5 places — cold runs resolve the unclaimed registry name. (@dcyfr/ai removed its own colliding `dcyfr` bin in 3.2.x; `scripts/smoke-test-bins.mjs` guards it stays gone.) |
| `dcyfr-ai-tui` | 404, never published | Lower traffic. `@dcyfr/ai` ships a `dcyfr-ai-tui` bin; docs mention running it, and a cold `npx dcyfr-ai-tui` resolves the unclaimed name. |

**Recommendation for `dcyfr`:** replicate this launcher in
[dcyfr-labs/dcyfr-ai-cli](https://github.com/dcyfr-labs/dcyfr-ai-cli) —
copy `launcher/`, set `name: "dcyfr"`, `bin: {"dcyfr": "bin/forward.js"}`,
dependency `@dcyfr/ai-cli@^1.0.5`, and change `TARGET_PACKAGE`/`TARGET_BIN`
in `forward.js` to `@dcyfr/ai-cli`/`dcyfr` (the manifest-scan resolution works
regardless of that package's `exports`). Same pre-flight/publish steps; no
burned versions on that name.

**Recommendation for `dcyfr-ai-tui`:** either publish a third forwarder the
same way (target bin `dcyfr-ai-tui`), or change docs to
`npx -p @dcyfr/ai dcyfr-ai-tui`. Claiming it is cheap insurance.
