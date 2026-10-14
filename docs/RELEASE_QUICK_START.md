<!-- TLP:CLEAR -->
# Quick Release Guide

## For Contributors

1. Make your code changes.
2. Open a PR whose title is a [conventional commit](https://www.conventionalcommits.org/):
   - `fix:` or `deps:` or `perf:`: patch bump
   - `feat:`: minor bump
   - `feat!:` or a `BREAKING CHANGE:` footer: major bump
   - `docs:`, `test:`, `ci:`, `chore:`, `refactor:`: no release
3. Squash-merge. The PR title becomes the commit message release-please reads.

There is nothing else to add: no changeset files and no version edits.

## For Maintainers

1. Merge PRs to `main`.
2. Review the Release PR release-please opens (version, `CHANGELOG.md`, `.release-please-manifest.json`).
3. Merge it. The release workflow tags, creates the GitHub Release and publishes to npm with provenance.

For canary builds, emergency handling and troubleshooting, see [RELEASE_MANAGEMENT.md](./RELEASE_MANAGEMENT.md).
