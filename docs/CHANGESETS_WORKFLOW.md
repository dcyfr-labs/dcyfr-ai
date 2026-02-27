<!-- TLP:CLEAR -->
# Changesets Workflow - Quick Reference

**Information Classification:** TLP:CLEAR (Public)
**Audience:** Contributors & AI Agents
**Last Updated:** February 27, 2026

---

## ⚠️ CRITICAL RULE

**NEVER manually run `npm publish` or `npm version` for @dcyfr/ai.**

This package uses [Changesets](https://github.com/changesets/changesets) for automated versioning and publishing.

---

## Contributors: Adding a Change

When implementing a feature or fix:

```bash
# 1. Create changeset
npx changeset
# Select: @dcyfr/ai
# Select: major | minor | patch
# Describe: Brief summary of changes

# 2. Commit with your code
git add .changeset/*.md
git commit -m "feat: your feature"
git push origin main
```

That's it! The changeset file goes through normal PR review.

---

## What Happens Next (Automated)

1. **Changesets bot creates "Version Packages" PR:**
   - Updates `package.json` version
   - Updates `CHANGELOG.md`
   - Consumes changeset files

2. **Maintainer merges the PR**

3. **GitHub Actions publishes automatically:**
   - `.github/workflows/release.yml` triggers
   - Builds package
   - Publishes to npm (using `NPM_TOKEN` secret)
   - Creates GitHub release

---

## Why Changesets?

| Benefit | Description |
|---------|-------------|
| **No version conflicts** | Bot manages all version numbers |
| **Accurate CHANGELOG** | Auto-generated from changesets |
| **No local npm auth** | GitHub Actions uses org token |
| **Audit trail** | All changes go through PRs |
| **npm provenance** | Supply chain security signatures |

---

## Common Mistakes (DON'T DO THIS)

❌ `npm version minor` - Manual version bump  
❌ `npm publish` - Manual publish  
❌ Edit `package.json` version directly  
❌ Attempt to `npm login` locally  

**If you do these, you'll create version conflicts that break the workflow.**

---

## Troubleshooting

**Q: I forgot to create a changeset before pushing**  
A: Create one in a follow-up commit: `npx changeset && git add .changeset/*.md && git commit -m "chore: add changeset" && git push`

**Q: My changeset description is wrong**  
A: Edit `.changeset/*.md` file and commit the fix

**Q: The Version Packages PR hasn't appeared**  
A: Wait 1-2 minutes for the bot, or check if changeset file is malformed

**Q: Publishing failed in GitHub Actions**  
A: Check workflow logs - usually npm authentication or build errors

---

## Configuration Files

- `.changeset/config.json` - Changesets configuration
- `.github/workflows/release.yml` - Automated publish workflow
- `CONTRIBUTING.md` - Full release process documentation

---

## For AI Agents

**Mandatory behavior:**
- ✅ Create changeset files when implementing version-bumping changes
- ✅ Let changesets bot handle version numbers
- ✅ Let GitHub Actions handle publishing

**Prohibited actions:**
- ❌ Run `npm version` or `npm publish`
- ❌ Manually edit `package.json` version
- ❌ Bypass changesets workflow
- ❌ Attempt local npm authentication

See `AGENTS.md` Package Publishing section for full governance rules.

---

## Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)

---

**Questions?** Open an issue or check [CONTRIBUTING.md](../CONTRIBUTING.md)
