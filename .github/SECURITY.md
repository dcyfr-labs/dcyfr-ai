<!-- TLP:CLEAR — Public Distribution -->

# Security Policy

This document covers the security policy for `@dcyfr/ai` including both the core
framework and the plugin marketplace.

## Supported Versions

| Version | Security Support |
| ------- | ---------------- |
| Latest major | Supported |
| Previous major | Critical patches only |
| Pre-1.0 | Current minor only |

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

### Framework Vulnerabilities

Vulnerabilities in the core `@dcyfr/ai` framework, delegation system, or permission
enforcement:

1. Go to the [Security Advisories](https://github.com/dcyfr-labs/dcyfr-ai/security/advisories/new) page
2. Click **Report a vulnerability**
3. Fill in the private advisory form

Or email **security@dcyfr.ai** with:

- Description of the vulnerability
- Impact and affected versions
- Steps to reproduce (if applicable)
- Any suggested mitigations

Response SLAs:

- Critical (CVSS 9.0+): Acknowledged within **24 hours**, patch within **72 hours**
- High (CVSS 7.0–8.9): Acknowledged within **48 hours**, patch within **7 days**
- Medium/Low: Acknowledged within **7 days**, patch within **30 days**

### Plugin Vulnerabilities

Vulnerabilities in a published marketplace plugin:

1. **First**, report directly to the plugin maintainer (see the plugin's own `SECURITY.md`)
2. If the maintainer is unresponsive within 5 business days, escalate to
   **security@dcyfr.ai** with subject `[PLUGIN SECURITY] plugin-name`
3. The marketplace team will auto-disable the plugin if risk is high

For plugins where the vulnerability lies in how the `@dcyfr/ai` permission enforcement
or sandbox failed to protect against a malicious plugin, report directly to the framework
team via the process above.

## Plugin Security Policy

Detailed security requirements for marketplace plugins, including trust model, TLP
classification, Docker sandbox specifications, and incident response procedures:

**See:** [docs/security/PLUGIN_SECURITY_POLICY.md](../docs/security/PLUGIN_SECURITY_POLICY.md)

### Quick Summary

- All plugins are sandboxed by default (no host access without explicit permission)
- Permissions are deny-by-default (declare what you need in `plugin.json`)
- All submissions pass seven automated security checks before publication
- Plugins are auto-disabled if critical CVEs are found post-publication
- Trust scores track security, stability, accuracy, and speed

## Plugin Development Security

For guidance on building secure plugins that comply with the permission model:

**See:** [docs/guides/PLUGIN_DEVELOPMENT_GUIDE.md](../docs/guides/PLUGIN_DEVELOPMENT_GUIDE.md)

## Full Framework Security Policy

For the complete framework security policy including vulnerability disclosure, supported
versions, and security contacts:

**See:** [SECURITY.md](../SECURITY.md)

## Security Hall of Fame

We recognize researchers who responsibly disclose security vulnerabilities. See
[SECURITY.md](../SECURITY.md) for our acknowledgments policy.
