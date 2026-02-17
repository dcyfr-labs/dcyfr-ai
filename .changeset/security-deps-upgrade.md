---
"@dcyfr/ai": patch
---

security: upgrade fastmcp 3.30.1→3.33.0 and downgrade mem0ai 2.2.2→1.0.39 to fix axios vulnerabilities

Fixed 3 high-severity axios vulnerabilities (GHSA-jr5f-v2jv-69x6 SSRF, GHSA-4hjh-wcwx-xvwj DoS, GHSA-43fc-jf86-j433 DoS) by downgrading mem0ai which had pinned axios@1.7.7. Also upgraded fastmcp to latest version (3.33.0) to improve MCP server performance.

Security improvements:
- Removed axios@1.7.7 (vulnerable) from mem0ai dependency tree
- All axios instances now at 1.13.5+ (safe versions)
- Workspace vulnerability count reduced from 22 → 18
- High-severity vulnerabilities reduced from 7 → 5

Breaking changes:
- mem0ai downgraded from 2.2.2 → 1.0.39 (MAJOR version downgrade)
- Limited API compatibility risk due to custom abstraction layer in packages/ai/memory/mem0-client.ts
- All tests passing (921/921)
