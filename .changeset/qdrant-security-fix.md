---
"@dcyfr/ai": patch
---

# Security Update

Upgrade @qdrant/js-client-rest from 1.13.0 to 1.16.2 to fix 3 moderate-severity undici vulnerabilities:

- GHSA-g9mf-h72j-4rw9 (unbounded decompression in HTTP responses)
- GHSA-cxrh-j4jr-qwg3 (DoS via bad certificate data)

This is a minor version bump with no breaking API changes.
