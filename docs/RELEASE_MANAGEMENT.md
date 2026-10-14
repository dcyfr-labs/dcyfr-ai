<!-- TLP:CLEAR -->
# Release Management Guide

This document describes how `@dcyfr/ai` is versioned and published to npm. Releases are automated with [release-please](https://github.com/googleapis/release-please). The contributor-facing summary is in [CONTRIBUTING.md](../CONTRIBUTING.md#release-process).

## Overview

- Version bumps come from conventional-commit PR titles merged to `main` (squash-merge).
- `.github/workflows/release.yml` runs release-please on every push to `main`.
- release-please keeps a "Release PR" open that updates `package.json`, `CHANGELOG.md` and `.release-please-manifest.json`.
- Merging the Release PR creates the GitHub Release and tag, then the `publish` job builds, runs the bin smoke test and tests, and publishes to npm with provenance (OIDC Trusted Publishing, no stored npm token).
- Configuration: `.release-please-config.json` and `.release-please-manifest.json`.

## Release Types

### 1. Standard Release (Main Branch)

1. Merge PRs to `main` with conventional-commit titles (`feat:`, `fix:`, `deps:`, `perf:`, `feat!:`).
2. Review the Release PR that release-please opens or updates.
3. Merge the Release PR.
4. The `publish` job publishes the package to npm.

`docs:`, `test:`, `ci:`, `build:`, `style:`, `refactor:` and `chore:` titles do not trigger a release on their own.

### 2. Canary Release (Pre-release Testing)

Manual trigger for testing versions. In GitHub: **Actions > Publish Canary > Run workflow**, then pick a tag (`canary`, `beta`, `alpha` or `next`). The workflow builds, runs the bin smoke test and tests, and publishes `<current-version>-<tag>.<timestamp>` under that npm dist-tag.

Install a canary with:

```bash
npm install @dcyfr/ai@canary
```

## Manual Version Bumps

Do not run `npm publish` or edit version numbers by hand. If an emergency release is unavoidable, get a maintainer to:

1. Fix the problem on a branch and merge it with a `fix:` title.
2. Merge the resulting Release PR.
3. If the publish job failed, re-run it from the Actions tab rather than publishing from a laptop.

## Troubleshooting

- **No Release PR appears:** only `feat`, `fix`, `deps`, `perf` and breaking-change commits count. Check the PR title that landed on `main`.
- **Tag missing after a Release PR merge:** the release job falls back to `GITHUB_TOKEN` when the org release App token cannot be minted, and that token cannot push tags on commits touching `.github/workflows/*`. Check the `release-please` job logs.
- **Publish job fails on npm version:** the job pins `npm@^11.5` for Trusted Publishing. See the comment in `release.yml` before changing it.
