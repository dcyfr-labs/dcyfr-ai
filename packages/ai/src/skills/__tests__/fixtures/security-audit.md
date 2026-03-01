---
name: security-audit
description: Security auditing procedures and vulnerability assessment
tags:
  - security
  - audit
  - vulnerability
  - owasp
priority: 8
requires_tools:
  - code-scanner
  - dependency-checker
trust_level: restricted
---

# Security Audit Procedures

## OWASP Top 10 Checklist

1. **Injection** - Validate all user inputs, use parameterized queries
2. **Broken Authentication** - Enforce MFA, session timeouts
3. **Sensitive Data Exposure** - Encrypt at rest and in transit
4. **XML External Entities** - Disable DTD processing
5. **Broken Access Control** - Implement RBAC, verify permissions
6. **Security Misconfiguration** - Harden default configs
7. **Cross-Site Scripting** - Sanitize outputs, use CSP headers
8. **Insecure Deserialization** - Validate serialized data
9. **Using Components with Known Vulnerabilities** - Audit dependencies
10. **Insufficient Logging** - Log security events, monitor alerts

## Dependency Scanning

```bash
npm audit --production
npx snyk test
```

## Secret Detection

```bash
gitleaks detect --source . --verbose
```
