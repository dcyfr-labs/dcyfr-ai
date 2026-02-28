---
"@dcyfr/ai": patch
---

Remove workspace-relative import that broke production builds. The `generateDcyfrCapabilityManifests()` function now throws an error instead of attempting to import from workspace paths. Use `generateCapabilityManifest()` directly instead.
