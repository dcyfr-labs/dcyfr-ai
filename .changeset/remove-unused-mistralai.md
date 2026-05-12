---
"@dcyfr/ai": patch
---

Remove unused `@mistralai/mistralai` dependency.

The Mistral SDK is not imported anywhere in the codebase — only a description string in `packages/ai/core/provider-registry.ts` references Mistral models served via the GitHub Models API, which doesn't require this SDK.

Clears downstream Dependabot alert [GHSA-3q49-cfcf-g5fm](https://github.com/advisories/GHSA-3q49-cfcf-g5fm) (malware in `@mistralai/mistralai` 2.2.2 / 2.2.3 / 2.2.4 with an overbroad `>= 0` blanket range that flags safe versions too) for downstream consumers like `dcyfr-labs/dcyfr-labs`.
