# Quick Release Guide

## For Contributors

### Making Changes

1. **Make your code changes**
2. **Add a changeset:**
   ```bash
   npm run changeset
   ```
3. **Select version bump type:**
   - `patch` - Bug fixes (1.0.0 → 1.0.1)
   - `minor` - New features (1.0.0 → 1.1.0)
   - `major` - Breaking changes (1.0.0 → 2.0.0)

4. **Write a clear summary**
5. **Commit everything:**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push
   ```

## For Maintainers

### Standard Release

1. **Review and merge PRs to `main`**
   - Changesets bot will create a "Release PR"

2. **Review the Release PR**
   - Check version bump is correct
   - Review CHANGELOG.md updates

3. **Merge the Release PR**
   - Package automatically publishes to npm
   - Git tag created automatically
   - GitHub release created

### Canary Release (Pre-release Testing)

1. **Go to GitHub Actions**
2. **Select "Publish Canary" workflow**
3. **Click "Run workflow"**
4. **Choose tag:** `canary`, `beta`, `alpha`, or `next`
5. **Package published as:** `@dcyfr/ai@canary`

### Emergency Hotfix

```bash
# Make fix
git commit -m "fix: critical bug"

# Quick version bump
npm run version:patch

# Push with tag
git push && git push --tags

# Manual publish
npm run build
npm publish
```

## Common Commands

```bash
# Create changeset
npm run changeset

# Build package
npm run build

# Test
npm run test

# Type check
npm run typecheck

# Lint
npm run lint
```

## Installation

```bash
# Latest stable
npm install @dcyfr/ai

# Specific version
npm install @dcyfr/ai@1.0.2

# Canary/pre-release
npm install @dcyfr/ai@canary
npm install @dcyfr/ai@beta
```

## Links

- **Full Documentation:** [RELEASE_MANAGEMENT.md](./RELEASE_MANAGEMENT.md)
- **npm Package:** https://www.npmjs.com/package/@dcyfr/ai
- **GitHub:** https://github.com/dcyfr/dcyfr-ai
