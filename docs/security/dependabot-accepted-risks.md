<!-- TLP:CLEAR -->

# Dependabot Accepted Risks

**Information Classification:** TLP:CLEAR (Public)  
**Last Updated:** 2026-10-28

Open Dependabot alerts that have no fix available, with the reason each one is accepted and the condition that ends it. An alert listed here stays open on GitHub on purpose: it is the reminder to re-check.

## zod 3.x under mem0ai (1 HIGH severity advisory, accepted 2026-10-28)

- **Advisory:** [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), memory exhaustion while validating an oversized array: `$ZodArray` collects an issue per failing element with no cap (CVSS 7.5)
- **Alerts:** one per lockfile, `package-lock.json` and `examples/standalone-nextjs/package-lock.json`
- **Affected:** `zod < 4.6.6`. The direct `zod` is 4.6.7 (patched); each lockfile also holds one nested copy of zod 3.25.76
- **Patch status:** none on the 3.x line. mem0ai 3.3.1 (latest) still depends on `zod ^3.24.1`, so no upgrade clears it. Forcing zod 4 under mem0ai by override would break its zod 3 API use

**Dependency chains:**

```text
@dcyfr/ai (dependency) -> mem0ai 3.3.1 -> zod 3.25.76
examples/standalone-nextjs: @dcyfr/ai -> mem0ai 3.3.1 -> zod 3.25.76
```

**Impact:** not reachable from request input. `packages/ai/memory/mem0-client.ts` loads `mem0ai/oss` with a dynamic `import()`, and only when a caller creates a client through `createMem0Client()` or `getMem0Client()`. mem0ai's zod 3 schemas parse its own LLM fact-extraction output (fact and memory-id arrays), not caller-supplied bodies, so an attacker would need to control the model's response to reach the array validator. This is the same chain dcyfr-labs accepted in its own `docs/security/dependabot-accepted-risks.md`.

**Enforcement:** this repo has no npm audit gate, so nothing in CI fails on the alert. The acceptance **expires 2026-11-27**, matching dcyfr-labs and dcyfr-ai-workspace. On that date, re-check whether mem0ai has moved to zod 4: if it has, bump it and delete this entry; if not, renew the date here.
