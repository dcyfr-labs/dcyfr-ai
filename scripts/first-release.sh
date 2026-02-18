#!/bin/bash

# First Release Helper Script
# This script guides you through creating your first automated release

set -e

echo "🚀 First Release Setup Helper"
echo "=============================="
echo ""

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
  echo "❌ Error: package.json not found"
  echo "Please run this script from the dcyfr-ai root directory"
  exit 1
fi

# Check if changesets is installed
if ! npm list @changesets/cli > /dev/null 2>&1; then
  echo "❌ Error: @changesets/cli not installed"
  echo "Run: npm install --save-dev @changesets/cli"
  exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Step 1: Check for NPM_TOKEN
echo "Step 1: NPM Authentication"
echo "--------------------------"
echo ""
echo "To publish to npm, you need to configure an NPM_TOKEN secret in GitHub."
echo ""
echo "1. Go to https://www.npmjs.com/settings/~/tokens"
echo "2. Create a new 'Automation' token"
echo "3. Add it to GitHub:"
echo "   - Go to: https://github.com/dcyfr/dcyfr-ai/settings/secrets/actions"
echo "   - Click 'New repository secret'"
echo "   - Name: NPM_TOKEN"
echo "   - Value: [paste your npm token]"
echo ""
read -p "Have you configured NPM_TOKEN in GitHub? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "⚠️  Please configure NPM_TOKEN before proceeding"
  echo "Then run this script again"
  exit 0
fi

echo "✅ NPM_TOKEN configured"
echo ""

# Step 2: Create test changeset
echo "Step 2: Create Test Changeset"
echo "------------------------------"
echo ""
echo "We'll create a test changeset to verify the automation works."
echo ""
read -p "Create a test changeset now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "Running: npm run changeset"
  echo ""
  echo "When prompted:"
  echo "  - Select: patch (use spacebar to select)"
  echo "  - Summary: Test automated release setup"
  echo ""
  read -p "Press Enter to continue..." 
  
  npm run changeset
  
  echo ""
  echo "✅ Changeset created!"
  echo ""
fi

# Step 3: Review what will happen
echo "Step 3: What Happens Next"
echo "------------------------"
echo ""
echo "When you commit and push this changeset:"
echo ""
echo "1. GitHub Actions will detect the changeset"
echo "2. Changesets bot will create a 'Release PR'"
echo "3. The Release PR will:"
echo "   - Bump version in package.json (1.0.2 → 1.0.3)"
echo "   - Update CHANGELOG.md"
echo "   - List all changes from changesets"
echo ""
echo "4. When you merge the Release PR:"
echo "   - Tests will run"
echo "   - Package will build"
echo "   - Publish to npm automatically"
echo "   - Git tag created (v1.0.3)"
echo "   - GitHub release created"
echo ""

# Step 4: Commit and push
echo "Step 4: Commit and Push"
echo "----------------------"
echo ""
echo "Changesets to commit:"
ls -la .changeset/*.md 2>/dev/null | grep -v README.md || echo "  None found"
echo ""
read -p "Commit and push changesets now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  
  # Check for uncommitted changesets
  if [[ -n "$(ls -A .changeset/*.md 2>/dev/null | grep -v README.md)" ]]; then
    git add .changeset/*.md
    git add .github/workflows/*.yml
    git add docs/RELEASE*.md
    git add AUTOMATED_RELEASE_SETUP.md
    git add scripts/first-release.sh
    git add package.json
    git add README.md
    
    echo "Files staged for commit:"
    git status --short
    echo ""
    
    git commit -m "chore: set up automated release management with changesets

- Add changesets for version management
- Configure GitHub Actions for npm publishing
- Add release documentation
- Configure canary release workflow"
    
    echo ""
    echo "✅ Committed!"
    echo ""
    
    read -p "Push to GitHub now? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git push origin main
      echo ""
      echo "✅ Pushed to GitHub!"
      echo ""
    fi
  else
    echo "⚠️  No changesets found to commit"
  fi
fi

# Step 5: Monitor
echo "Step 5: Monitor Release PR"
echo "-------------------------"
echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "1. Watch for the Release PR:"
echo "   https://github.com/dcyfr/dcyfr-ai/pulls"
echo ""
echo "2. Review the Release PR:"
echo "   - Check version bump is correct"
echo "   - Review CHANGELOG.md updates"
echo ""
echo "3. Merge the Release PR when ready"
echo ""
echo "4. Monitor the publish workflow:"
echo "   https://github.com/dcyfr/dcyfr-ai/actions"
echo ""
echo "5. Verify package published:"
echo "   https://www.npmjs.com/package/@dcyfr/ai"
echo ""
echo "📚 Full documentation:"
echo "   - docs/RELEASE_MANAGEMENT.md (comprehensive guide)"
echo "   - docs/RELEASE_QUICK_START.md (quick reference)"
echo ""
echo "Happy releasing! 🚀"
