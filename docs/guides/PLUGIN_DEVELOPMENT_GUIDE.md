<!-- TLP:GREEN — Limited Distribution: DCYFR Organization and Partners -->

# Plugin Development Guide

**Information Classification:** TLP:GREEN (Limited Distribution)
**Audience:** Plugin Developers, Marketplace Contributors
**Version:** 1.0.0
**Last Updated:** 2026-02-28

---

## Overview

This guide covers how to build secure, production-ready plugins for `@dcyfr/ai`. All plugins
must comply with the security model described here before they can be accepted into the
marketplace.

---

## Table of Contents

- [Plugin Manifest](#plugin-manifest)
- [Permission Declarations](#permission-declarations)
- [TLP Classification](#tlp-classification)
- [Security Requirements](#security-requirements)
- [Resource Limits](#resource-limits)
- [Local Sandbox Testing](#local-sandbox-testing)
- [Trust Score](#trust-score)
- [Submission Checklist](#submission-checklist)

---

## Plugin Manifest

Every plugin must include a `plugin.json` manifest at its root. This file declares the plugin
identity, version, entry point, and all required permissions.

### Minimal Example

```json
{
  "name": "@your-org/dcyfr-plugin-name",
  "version": "1.0.0",
  "description": "Short description of what this plugin does",
  "main": "dist/index.js",
  "dcyfr": {
    "pluginVersion": "1",
    "permissions": {}
  }
}
```

### Full Example with All Permission Types

```json
{
  "name": "@your-org/dcyfr-plugin-git-tools",
  "version": "1.2.0",
  "description": "Git workflow utilities for AI-assisted development",
  "main": "dist/index.js",
  "dcyfr": {
    "pluginVersion": "1",
    "tlp": "GREEN",
    "permissions": {
      "filesystem": {
        "read": ["src/**", "docs/**", ".git/**"],
        "write": ["dist/**"],
        "delete": []
      },
      "network": {
        "allowed": true,
        "allowedDomains": ["api.github.com", "*.dcyfr.ai"],
        "maxRequests": 100
      },
      "execution": {
        "allowShellCommands": true,
        "allowedCommands": ["git", "npm"],
        "maxProcesses": 5
      },
      "mcp": {
        "allowedServers": ["github", "filesystem"]
      }
    },
    "resources": {
      "maxMemory": "256MB",
      "maxCpu": 0.25,
      "maxExecutionTime": "2m"
    }
  }
}
```

---

## Permission Declarations

Permissions are **deny-by-default**. Any capability not explicitly declared in `plugin.json`
will be blocked at runtime.

### Filesystem Permissions

Control which files and directories your plugin can read, write, or delete.

```json
"filesystem": {
  "read": ["src/**", "docs/**"],
  "write": ["dist/**", "tmp/**"],
  "delete": []
}
```

**Rules:**

- Use glob patterns relative to the project root
- Path traversal patterns (`../../`) are rejected during validation
- Declare the minimum set of paths needed (principle of least privilege)
- Empty arrays (`[]`) disable the operation entirely

### Network Permissions

Control outbound HTTP/S access.

```json
"network": {
  "allowed": true,
  "allowedDomains": ["api.github.com", "*.dcyfr.ai"],
  "maxRequests": 100
}
```

**Rules:**

- Network is disabled by default; declare `"allowed": true` to enable
- `allowedDomains` supports wildcard subdomains (`*.domain.com`)
- `maxRequests` is enforced per hour per plugin instance
- Exceeding the rate limit returns HTTP 429 and logs a violation

### Execution Permissions

Control shell command execution.

```json
"execution": {
  "allowShellCommands": true,
  "allowedCommands": ["git", "npm"],
  "maxProcesses": 5
}
```

**Rules:**

- Shell execution is disabled by default
- `allowedCommands` is an exact-match allowlist (no patterns)
- Blocked commands throw `CommandNotAllowed` before shell invocation
- `maxProcesses` caps concurrent child processes

### MCP Server Permissions

Control which MCP servers the plugin can call.

```json
"mcp": {
  "allowedServers": ["github", "filesystem"],
  "deniedServers": []
}
```

### Data and Secret Access

Control access to environment variables and secrets.

```json
"data": {
  "allowEnvironmentVars": true,
  "allowedVars": ["NODE_ENV", "DCYFR_*"],
  "allowSecretAccess": false
}
```

**Rules:**

- `process.env` returns an empty object unless `allowEnvironmentVars: true`
- `allowedVars` supports exact names and prefix patterns (`DCYFR_*`)
- Secret vault access requires `allowSecretAccess: true` and security team review

---

## TLP Classification

Every plugin must declare a TLP (Traffic Light Protocol) classification in its manifest.
This classification determines the isolation level and distribution restrictions.

| TLP Level | Use Case | Runtime Isolation | Distribution |
|-----------|----------|-------------------|--------------|
| TLP:CLEAR | Open source, public plugins | Standard sandbox | Public marketplace |
| TLP:GREEN | Org-internal tooling | Enhanced sandbox | Private registry |
| TLP:AMBER | Sensitive data handlers | Full Docker isolation | Restricted install |
| TLP:RED | PII, financial, credentials | Docker + gVisor | Highly restricted |

### Choosing the Right Level

Use TLP:CLEAR when:

- Plugin handles only public data
- Source code is open source
- No credentials, PII, or internal information handled

Use TLP:GREEN when:

- Plugin is internal to your organization
- Accesses company-internal APIs
- Not intended for public distribution

Use TLP:AMBER when:

- Plugin reads customer data or configuration
- Needs secret access
- Handles access tokens or API keys

Use TLP:RED when:

- Plugin handles PII or financial data
- Accesses credential stores
- Requires human-review verification before install

### Impact on Runtime

Higher TLP levels use more restrictive sandbox configurations:

- **CLEAR/GREEN:** Docker with `--network=none`, read-only filesystem
- **AMBER:** Adds `--cap-drop=ALL`, isolated tmpfs per execution
- **RED:** Adds gVisor runtime (`--runtime=runsc`), no shared tmpfs

---

## Security Requirements

All plugins must pass the full security scanner before submission. The scanner runs seven
checks:

| Check | What It Tests | Required Pass |
|-------|---------------|---------------|
| Dependency audit | Known CVEs in npm dependencies | 0 critical/high |
| Secrets scan | Hardcoded credentials or tokens | 0 findings |
| Code patterns | OWASP Top 10, injection risks | 0 critical |
| SBOM generation | Software bill of materials | Must produce valid SBOM |
| Permission validation | Manifest permission correctness | All valid |
| TLP compliance | Classification header present | Required |
| License check | OSI-approved or proprietary clearance | Must pass |

### Dependency Security

Keep dependencies minimal and up-to-date:

```bash
# Audit your dependencies before submission
npm audit --audit-level=moderate

# Fix automatically where possible
npm audit fix
```

Do not vendor dependencies with known CVEs. The scanner will reject packages with
critical or high severity vulnerabilities.

### No Hardcoded Secrets

The secrets scanner checks for:

- AWS/GCP/Azure credential patterns
- GitHub tokens (`ghp_`, `gho_`, `ghs_`)
- Generic API key patterns
- Private keys and certificates

Use environment variables or the DCYFR secret vault instead.

### Code Pattern Rules

The static analyzer flags:

- `eval()` and `Function()` — use explicit function definitions
- Unvalidated `require()` with dynamic paths
- `child_process.exec()` without command validation (use allowedCommands)
- Path traversal vulnerabilities

---

## Resource Limits

Declare realistic resource requirements in your manifest. The defaults are conservative;
increase them only when needed and with justification.

| Resource | Default | Maximum | Setting |
|----------|---------|---------|---------|
| Memory | 512 MB | 2 GB | `maxMemory` |
| CPU | 0.5 cores | 2 cores | `maxCpu` |
| Execution time | 5 minutes | 30 minutes | `maxExecutionTime` |
| Disk space | 1 GB (tmpfs) | 4 GB | `maxDiskSpace` |

### Tuning Recommendations

Start with defaults, then profile actual usage:

```bash
# Run with resource metrics collection
DCYFR_SANDBOX_METRICS=true npx dcyfr-ai plugin run --plugin ./

# Check reported peak usage
cat .dcyfr/run-metrics.json
```

Declare resources that match your 95th percentile usage, not theoretical maximums.
Excessive resource declarations lower your trust score.

---

## Local Sandbox Testing

Test your plugin inside the Docker sandbox before submission to catch runtime permission
errors early.

### Prerequisites

- Docker 20.10+ installed and running
- `@dcyfr/ai-cli` installed (`npm install -g @dcyfr/ai-cli`)

### Run in Sandbox

```bash
# Build your plugin
npm run build

# Run inside Docker sandbox (matches production environment)
dcyfr sandbox run --plugin ./--verbose

# Run with a specific TLP isolation level
dcyfr sandbox run --plugin ./ --tlp AMBER
```

### Inspect Sandbox Behavior

```bash
# Check which permissions were actually used at runtime
dcyfr sandbox inspect --plugin ./ --show-permissions

# View any blocked operations
dcyfr sandbox inspect --plugin ./ --show-violations
```

### Common Runtime Errors

**PermissionDenied: filesystem.write**
Plugin attempted to write to a path outside declared write globs. Add the path to
`filesystem.write` or refactor to avoid the write.

**NetworkPermissionDenied**
Plugin made an HTTP request to a domain not in `allowedDomains`. Add the domain or
check for accidental outbound calls in dependencies.

**CommandNotAllowed**
Plugin called a shell command not in `allowedCommands`. Add the command to the
allowlist or replace with a Node.js API equivalent.

---

## Trust Score

Published plugins receive a trust score (0–100) based on post-publication metrics.
A higher trust score enables faster approval for version updates and higher resource limits.

### Score Components

| Dimension | Weight | What Builds It |
|-----------|--------|----------------|
| Security | 40% | Clean scan history, no CVEs found post-publish |
| Stability | 30% | Low error rates, no crashes in production runs |
| Accuracy | 20% | User ratings, task completion rates |
| Speed | 10% | Execution time vs declared limits |

### Maintaining Your Score

- Respond to security advisories within 48 hours (critical CVE) or 7 days (high)
- Keep dependencies updated monthly
- Address user-reported bugs within reasonable SLAs
- Do not over-declare resource limits (inflates expected vs actual cost)

### Score Thresholds

Scores below 70 trigger warnings. Below 50, the plugin is auto-disabled from new
installations pending review. Below 30, the plugin is removed from the marketplace.

---

## Submission Checklist

Before opening a submission PR, verify all items:

- [ ] `plugin.json` manifest is valid (run `dcyfr plugin validate ./`)
- [ ] TLP classification is declared and appropriate
- [ ] All permissions follow the principle of least privilege
- [ ] Resource limits match actual usage (profile before declaring)
- [ ] `npm audit` returns 0 critical/high vulnerabilities
- [ ] No hardcoded secrets in code or dependencies
- [ ] All seven security scanner checks pass (`dcyfr plugin scan ./`)
- [ ] Plugin runs cleanly inside local Docker sandbox
- [ ] SBOM is generated (`dcyfr plugin sbom ./`)
- [ ] README documents what the plugin does and what permissions it needs
- [ ] CHANGELOG is present for version updates

---

## Related Documentation

- [Plugin Security Policy](../security/PLUGIN_SECURITY_POLICY.md)
