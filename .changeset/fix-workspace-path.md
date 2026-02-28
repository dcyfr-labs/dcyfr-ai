---
'@dcyfr/ai': patch
---

fix: Remove workspace-specific export that broke production builds

Removed `generateDcyfrCapabilityManifests()` from public API exports. This function contained hardcoded workspace-relative paths that caused Next.js/Turbopack build failures when @dcyfr/ai was installed as an npm package in other projects. The function remains available in source for workspace use but is no longer part of the public API.

This hotfix resolves the production deployment blocking issue in dcyfr-labs and other consumer projects.
