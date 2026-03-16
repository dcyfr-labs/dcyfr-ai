---
"@dcyfr/ai": patch
---

Bump runtime SDK dependencies to latest major versions:
- groq-sdk 0.3.0 → 1.1.1 (used via OpenAI-compatible API, no callsite changes)
- cloudflare 4.5.0 → 5.2.0 (Cloudflare v5 binding types)
- better-sqlite3 11.10.0 → 12.6.2 (reputation engine; no BigInt columns, no .safeIntegers() needed)
- Fix z.record() key type in container/types.ts for Zod 4 compatibility
