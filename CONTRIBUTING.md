# Contributing to @dcyfr/ai

Thank you for your interest in contributing to @dcyfr/ai! This document provides guidelines and information for contributors.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## Licensing & Contributions

### Your Contributions

By contributing to @dcyfr/ai, you agree that:
- Your contributions will be licensed under the MIT License (personal/non-commercial)
- Commercial use of @dcyfr/ai requires a paid tier (see [LICENSE](./LICENSE))
- You have the right to submit the contribution under this license
- You grant DCYFR Labs perpetual rights to use, modify, and distribute your contribution

### Trademark

Do not use "DCYFR" trademarks in ways that imply endorsement without permission. See [TRADEMARK.md](../TRADEMARK.md) for usage guidelines.

### Commercial Contributors

If you're contributing while working for a company using @dcyfr/ai commercially, ensure your company has the appropriate commercial license tier (Developer tier or higher).

**Questions?** Contact licensing@dcyfr.ai

---

## How to Contribute

### Reporting Bugs

1. Check existing issues first
2. Create detailed bug report with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS, etc.)
   - Code samples if applicable

### Suggesting Features

1. Check existing feature requests
2. Create detailed proposal with:
   - Use case description
   - Proposed API/interface
   - Alternative approaches considered

### Pull Requests

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Update documentation as needed
7. Commit with clear message
8. Push and create PR

## Development Setup

```bash
# Clone repository
git clone https://github.com/dcyfr-labs/dcyfr-ai.git
cd dcyfr-ai

# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Lint
npm run lint
```

## Project Structure

```
dcyfr-ai/
├── packages/ai/          # Core harness code
│   ├── config/          # Configuration system
│   ├── telemetry/       # Telemetry engine
│   ├── providers/       # Provider registry
│   ├── plugins/         # Plugin loader
│   ├── validation/      # Validation harness
│   └── __tests__/       # Tests
├── bin/                 # CLI tools
├── docs/                # Documentation
├── examples/            # Example projects
└── config/              # Config templates
```

## Coding Standards

### TypeScript

- Use strict mode
- Provide type annotations for public APIs
- Avoid `any` types
- Use interfaces for public contracts

### Testing

- Write tests for new features
- Maintain >80% code coverage
- Use descriptive test names
- Test edge cases and error conditions

### Documentation

- Update docs for API changes
- Include JSDoc comments for public APIs
- Add examples for new features
- Keep README current

### Commit Messages

Use conventional commits:

```
feat: Add multi-provider fallback
fix: Resolve config loading issue
docs: Update API reference
test: Add plugin loader tests
chore: Update dependencies
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- config.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

## Building

```bash
# Build TypeScript
npm run build

# Type check only
npm run typecheck
```

## Documentation

Update relevant docs when making changes:

- [Getting Started](./docs/GETTING-STARTED.md) - For user-facing changes
- [API Reference](./docs/API.md) - For API modifications
- [Plugin Guide](./docs/PLUGINS.md) - For plugin system changes
- [README](./README.md) - For major features

## Examples

The `examples/` directory is a first-class test surface. All examples must compile and run without errors.

### Adding a new example

1. Create `examples/<name>.ts` with the standard JSDoc header:
   ```typescript
   /**
    * @example ExampleName
    * @description What this example demonstrates.
    *
    * Prerequisites:
    * - Node.js >= 20
    * - @dcyfr/ai installed
    *
    * Usage:
    *   npx tsx examples/<name>.ts
    *
    * @license MIT
    * @copyright DCYFR Labs (https://www.dcyfr.ai)
    */
   ```
2. Add `// @expected-output: <text>` comments before key `console.log` calls that signal success.
3. Verify it compiles: `npm run examples:check`
4. Add it to the example index table in `examples/README.md`.

### When API signatures change

If a public API is renamed, removed, or its signature changes:

1. Search for affected imports in `examples/`: `grep -r 'MyChangedThing' examples/`
2. Update every affected example to use the new API.
3. Re-run `npm run examples:check` — all examples must pass with zero errors.
4. Update `@expected-output` markers if output text changed.

The `validate-examples` CI workflow will catch any regressions on every PR.

## Release Process

**IMPORTANT:** @dcyfr/ai uses [release-please](https://github.com/googleapis/release-please) for automated versioning and publishing. Version bumps are derived from your PR titles — **NEVER manually run `npm publish` or update version numbers.**

### For Contributors

Your PR title is the only release artifact. Make it a [conventional commit](https://www.conventionalcommits.org/):

```
<type>(<optional-scope>): <subject>
```

| Type | Bump | Example |
|---|---|---|
| `fix:` | patch | `fix(memory): correct mem0 client retry semantics` |
| `deps:` | patch | `deps: bump @anthropic-ai/sdk to 0.95.2` |
| `perf:` | patch | `perf(provider-registry): cache provider capabilities lookup` |
| `feat:` | minor | `feat(provider-registry): add GitHub Models provider` |
| `feat!:` or footer `BREAKING CHANGE:` | major | `feat!: drop CommonJS export surface` |
| `chore:`, `docs:`, `test:`, `ci:`, `build:`, `style:`, `refactor:` | no release | n/a |

Squash-merge is required so the PR title becomes the single commit message on `main` — which is what release-please reads.

### For Maintainers

1. **Merge feature PRs** to `main`. Each merge triggers `.github/workflows/release.yml`.

2. **release-please opens a "Release PR"** automatically when there are unreleased commits:
   - Updates `package.json` version (based on commit types since last release)
   - Updates `CHANGELOG.md` (grouped by `feat` / `fix` / `deps` / `perf` / `refactor`)
   - Updates `.release-please-manifest.json`

3. **Review and merge the Release PR.** On merge:
   - GitHub Release is created with the changelog
   - npm publish runs via OIDC Trusted Publishing (no `NPM_TOKEN` secret needed)
   - Provenance attestation is generated

**Configuration:**
- Release-please config: `.release-please-config.json`
- Version manifest: `.release-please-manifest.json`
- Release workflow: `.github/workflows/release.yml`

**Why release-please instead of changesets?**
- Single source of truth — the PR title *is* the release artifact, nothing to forget
- Works for Dependabot and agent-authored PRs without extra coordination
- Same Release-PR-as-human-gate model preserved
- Trusted Publishing via OIDC (no stored npm token)

## Questions?

- Open an issue for discussion
- Check existing documentation
- Review examples

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
