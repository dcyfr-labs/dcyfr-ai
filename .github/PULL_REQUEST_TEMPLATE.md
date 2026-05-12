## Description

<!-- Describe your changes in detail -->

## Type of Change

<!-- Releases are driven by your PR title, not a checklist. Make it a
     conventional commit so release-please can bump the right version. -->

- [ ] `fix:` — bug fix (patch bump)
- [ ] `feat:` — new feature (minor bump)
- [ ] `feat!:` or `BREAKING CHANGE:` footer — breaking change (major bump)
- [ ] `deps:` / `perf:` / `refactor:` — patch bump
- [ ] `docs:` / `test:` / `ci:` / `chore:` / `build:` / `style:` — no release

### PR title format

```
<type>(<optional-scope>): <subject>
```

Examples:
- `fix(memory): correct mem0 client retry semantics`
- `feat(provider-registry): add GitHub Models provider`
- `deps: bump @anthropic-ai/sdk to 0.95.2`
- `feat!: drop CommonJS export surface`

## Testing

- [ ] Tests pass locally (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Types check (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)

## Documentation

- [ ] Updated relevant documentation
- [ ] Updated examples if API changed

## Additional Notes

<!-- Any additional information, context, or screenshots -->
