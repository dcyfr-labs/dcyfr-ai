<!-- TLP:GREEN - Limited distribution to organization and trusted contributors -->

# Plugin Security Policy

**Information Classification:** TLP:GREEN (Organization + Contributors)  
**Effective Date:** 2026-03-01  
**Last Updated:** 2026-03-01  
**Owner:** DCYFR Security Team  
**Contact:** <security@dcyfr.ai>

---

## Overview

The DCYFR plugin marketplace enforces a defense-in-depth security model to protect users from malicious or vulnerable plugins. This document defines the trust model, permission requirements, runtime isolation guarantees, and incident response procedures.

---

## Trust Model

### TLP Classification Levels

Every plugin is assigned a Traffic Light Protocol (TLP) classification that controls its distribution and required isolation level.

| Classification | Description | Isolation | Distribution |
|---|---|---|---|
| **TLP:CLEAR** | Public data access only, no filesystem write, no network | Standard Docker sandbox | Unrestricted |
| **TLP:GREEN** | Read-only workspace access, external API calls to allowlisted domains | Standard Docker sandbox | Organization + contributors |
| **TLP:AMBER** | Internal file access or internal service API calls | Standard Docker sandbox + audit logging | Organization members only |
| **TLP:RED** | Access to secrets, PII, or financial data | gVisor (`--runtime=runsc`) + human review | Individual approval required |

### Trust Score Requirements

Plugins must maintain a minimum trust score (0–100) to remain available in the marketplace:

| Status | Score Range | Effect |
|---|---|---|
| **Trusted** | 80–100 | Available for installation |
| **Provisional** | 60–79 | Available with user warning |
| **Flagged** | 40–59 | Requires manual review before install |
| **Blocked** | 0–39 | Removed from marketplace immediately |

**Trust score components:**

- **Security score (40%):** Vulnerability scan results (Grype, Syft, Gitleaks)
- **License score (25%):** License compatibility assessment
- **Maintenance score (20%):** Recency of updates, author responsiveness
- **Reputation score (15%):** Community reports, incident history

**Decay policy:** Plugins with no releases in 90 days lose 5 maintenance score points per 90-day period.

---

## Permission Requirements

### Manifest Declaration

All plugins MUST declare permissions explicitly in `plugin.json`. Undeclared capabilities are blocked at runtime.

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "permissions": {
    "filesystem": {
      "read": ["src/**", "docs/**"],
      "write": [],
      "delete": []
    },
    "network": {
      "allowed": false,
      "allowedDomains": [],
      "maxRequests": 0
    },
    "execution": {
      "allowShellCommands": false,
      "allowedCommands": [],
      "maxProcesses": 1
    },
    "mcp": {
      "allowedServers": [],
      "deniedServers": []
    },
    "data": {
      "allowEnvironmentVars": false,
      "sensitiveKeys": []
    }
  }
}
```

### Permission Validation Rules

| Permission | Validation | Rejection Reason |
|---|---|---|
| `filesystem.read` glob | Must not contain `../` or absolute paths | "Path traversal not allowed" |
| `filesystem.write` glob | Must be subset of `read` paths | "Write scope exceeds read scope" |
| `network.allowedDomains` | Must not include `localhost`, `127.0.0.1`, `169.254.*` | "SSRF risk: internal address blocked" |
| `execution.allowedCommands` | Must be in DCYFR-approved command list | "Command not in approved list" |
| `data.sensitiveKeys` | Requires TLP:AMBER or higher clearance | "Insufficient clearance for sensitive data access" |

---

## Runtime Isolation

### Docker Sandbox (Standard — TLP:CLEAR/GREEN/AMBER)

All plugins run inside an isolated Docker container derived from `dcyfr-plugin-sandbox:latest`.

**Default security constraints:**

```
--rm                                    # Auto-remove container on exit
--name dcyfr-plugin-<uuid>             # Unique, scoped container name
--memory <limit>                        # Default: 512MB
--cpus <limit>                          # Default: 0.5 vCPUs
--network none                          # Default: no network (unless networkPermitted=true)
--read-only                             # Default: read-only root filesystem
--tmpfs /tmp:rw,noexec,nosuid,size=1g  # Writable /tmp only
--cap-drop ALL                          # Drop all Linux capabilities
--security-opt no-new-privileges        # Prevent privilege escalation
--user 65534:65534                      # Run as unprivileged user (nobody)
```

**Resource defaults (overridable per plugin manifest):**

| Resource | Default | Maximum |
|---|---|---|
| Memory | 512 MB | 4 GB |
| CPU | 0.5 vCPU | 2 vCPU |
| Execution time | 5 minutes | 30 minutes |
| Disk space (tmpfs) | 1 GB | 10 GB |

### gVisor Sandbox (Enhanced — TLP:RED)

Plugins with TLP:RED classification use gVisor (`runsc` runtime) for kernel-level isolation via a user-space kernel.

```
--runtime=runsc      # gVisor user-space kernel
```

**Requirement:** gVisor must be installed on the host (`runsc` in PATH). The system verifies availability via `DockerPluginRunner.isGVisorAvailable()` before scheduling TLP:RED plugins.

---

## Security Scanning Requirements

Every plugin submission MUST pass all of the following scans before publication:

| Scanner | Purpose | Failure Threshold |
|---|---|---|
| **Grype** | CVE vulnerability detection in dependencies | Any CRITICAL or HIGH severity |
| **Syft** | SBOM (Software Bill of Materials) generation | Scan failure |
| **Gitleaks** | Hardcoded secret detection | Any secret detected |
| **SonarCloud** | Code quality + security hotspot analysis | Any blocker-severity finding |
| **ClamAV** | Malware signature detection | Any positive match |
| **cosign** | Container image signature verification | Unsigned images blocked |
| **License checker** | OSS license compatibility | GPL/AGPL in non-GPL context |

---

## Incident Response

### Severity Levels and SLAs

| Severity | Trigger | Acknowledgment | Resolution |
|---|---|---|---|
| **P0 — Critical** | CVSS ≥ 9.0, active exploitation | 2 hours | 24 hours |
| **P1 — High** | CVSS 7.0–8.9, no active exploitation | 24 hours | 7 days |
| **P2 — Medium** | CVSS 4.0–6.9 | 48 hours | 30 days |
| **P3 — Low** | CVSS < 4.0, informational | 5 business days | 90 days |

### Auto-Disable on Critical Vulnerability

When a CVSS ≥ 9.0 vulnerability is detected in an active plugin dependency:

1. Plugin is **immediately disabled** across all installations
2. Users receive in-app notification: "Plugin disabled due to critical security vulnerability (CVE-XXXX-XXXXX)"
3. Plugin author is notified via GitHub issue on their plugin repository
4. Security advisory is drafted for publication

### Emergency Kill Switch

Security team can execute an emergency shutdown:

```bash
dcyfr plugin emergency-disable <plugin-id>
```

Effect: Immediately uninstalls the plugin from all workspaces, blocks reinstallation, and notifies all affected users.

### Coordinated Disclosure

For privately reported vulnerabilities:

1. Researcher reports via GitHub Security Advisories or <security@dcyfr.ai>
2. DCYFR security team acknowledges within 24 hours
3. Plugin author coordinated with for **90-day patch window**
4. If no patch within 90 days, advisory is published regardless
5. CVE requested from MITRE if applicable

### Reporting a Plugin Security Issue

To report a security vulnerability in a DCYFR plugin:

1. **Preferred:** [DCYFR Security Advisories](https://github.com/dcyfr-labs/dcyfr-ai/security/advisories/new)
2. **Email:** <security@dcyfr.ai>
3. **Do not** open a public GitHub issue for security vulnerabilities

---

## Compliance and Auditing

### SBOM Requirements

All published plugins MUST include a Software Bill of Materials (SBOM) in CycloneDX or SPDX format. SBOMs are:

- Generated automatically by Syft during the review workflow
- Published to the DCYFR SBOM registry (Cloudflare R2)
- Retained for a minimum of 3 years

### Audit Logging

All plugin permission violations are logged to Axiom (`dcyfr-agents` dataset) with:

- Plugin ID and version
- User ID (hashed)
- Attempted operation and target path
- Timestamp and sandbox container ID
- Permission model enforcement decision

### Compliance References

- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [NIST SP 800-190 — Application Container Security Guide](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-190.pdf)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)

---

## Related Documentation

- [Plugin Development Guide](../guides/PLUGIN_DEVELOPMENT_GUIDE.md) — How to build compliant plugins
- [DCYFR SECURITY.md](../../SECURITY.md) — Vulnerability reporting for the DCYFR framework itself
