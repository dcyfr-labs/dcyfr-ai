<!-- TLP:CLEAR — Public Distribution -->

# Security policy

This policy covers `@dcyfr/ai`: the core framework, the delegation and
permission system, and the plugin marketplace. It follows the
[DCYFR Labs default policy](https://github.com/dcyfr-labs/.github/blob/main/SECURITY.md)
and adds the plugin reporting path.

## Supported versions

| Version | Security fixes |
| ------- | -------------- |
| Latest major (3.x) | Yes |
| Previous major | Critical fixes only |
| Older | No |

## Reporting a vulnerability

**Do not open a public issue.** Report privately instead.

### Framework vulnerabilities

For the core framework, the delegation system, or permission enforcement:

1. **Preferred:** open a
   [private security advisory](https://github.com/dcyfr-labs/dcyfr-ai/security/advisories/new).
2. **Or email** [security@dcyfr.ai](mailto:security@dcyfr.ai) with the subject
   `[Security] dcyfr-ai: <short description>`.

Include the affected version (or commit), steps to reproduce, and the impact
you expect. A proof of concept helps.

### Plugin vulnerabilities

For a published marketplace plugin:

1. Report to the plugin's maintainer first (see that plugin's own `SECURITY.md`).
2. If the maintainer hasn't responded within 5 business days, email
   [security@dcyfr.ai](mailto:security@dcyfr.ai) with the subject
   `[PLUGIN SECURITY] <plugin-name>`.
3. A plugin with a high-risk finding can be disabled in the marketplace while
   it is fixed.

If the problem is that `@dcyfr/ai`'s permission enforcement or sandbox failed
to contain a malicious plugin, that is a framework vulnerability: use the
framework path above.

## What to expect

DCYFR Labs is a small team, so these are targets rather than guarantees:

- Acknowledgement within 3 business days.
- An initial assessment, and a fix plan for confirmed issues, within 10
  business days.
- Credit in the published advisory, unless you ask to stay anonymous.

We publish a GitHub security advisory once a fix is released.

## Plugin security

Marketplace plugins run sandboxed, with deny-by-default permissions declared
in `plugin.json`, and pass automated security checks before publication.

- Trust model, sandbox specification and incident response:
  [docs/security/PLUGIN_SECURITY_POLICY.md](docs/security/PLUGIN_SECURITY_POLICY.md)
- Building a plugin that fits the permission model:
  [docs/guides/PLUGIN_DEVELOPMENT_GUIDE.md](docs/guides/PLUGIN_DEVELOPMENT_GUIDE.md)

## Using @dcyfr/ai safely

- Keep it current: `npm audit` and `npm update @dcyfr/ai`.
- Load provider keys from the environment or a secret manager, never from
  source.
- Validate user input before it reaches an agent (a Zod schema with length
  limits is a good start).
- Rate-limit any endpoint that calls a model.

## Contributing securely

No secrets in code, tests or fixtures; use `.env.example` for templates. CodeQL
and Semgrep run on every pull request.

Questions about this policy: [security@dcyfr.ai](mailto:security@dcyfr.ai).
