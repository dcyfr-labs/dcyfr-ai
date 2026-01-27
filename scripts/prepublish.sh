#!/bin/bash

# Pre-publish checklist for @dcyfr/ai

set -e

echo "🔍 Pre-publish Checklist for @dcyfr/ai v1.0.0"
echo "=============================================="
echo ""

# 1. Clean build
echo "1️⃣  Cleaning previous build..."
rm -rf dist/
echo "✅ Clean complete"
echo ""

# 2. Build TypeScript
echo "2️⃣  Building TypeScript..."
npm run build
if [ $? -eq 0 ]; then
  echo "✅ Build successful"
else
  echo "❌ Build failed"
  exit 1
fi
echo ""

# 3. Run tests
echo "3️⃣  Running tests..."
npm test
if [ $? -eq 0 ]; then
  echo "✅ Tests passed"
else
  echo "❌ Tests failed"
  exit 1
fi
echo ""

# 4. Type check
echo "4️⃣  Type checking..."
npm run typecheck
if [ $? -eq 0 ]; then
  echo "✅ Type check passed"
else
  echo "❌ Type check failed"
  exit 1
fi
echo ""

# 5. Check package.json
echo "5️⃣  Validating package.json..."
node -e "const pkg = require('./package.json'); console.log('Package: ' + pkg.name); console.log('Version: ' + pkg.version); console.log('License: ' + pkg.license);"
echo "✅ Package validated"
echo ""

# 6. Check required files
echo "6️⃣  Checking required files..."
required_files=(
  "README.md"
  "LICENSE"
  "CHANGELOG.md"
  "dist/index.js"
  "dist/index.d.ts"
  "bin/dcyfr-ai.js"
  "config/default.yaml"
  "config/default.json"
)

for file in "${required_files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ Missing: $file"
    exit 1
  fi
done
echo ""

# 7. Check dist exports
echo "7️⃣  Validating exports..."
if [ -f "dist/ai/config/loader.js" ] && \
   [ -f "dist/ai/config/schema.js" ] && \
   [ -f "dist/ai/telemetry/engine.js" ] && \
   [ -f "dist/ai/providers/registry.js" ] && \
   [ -f "dist/ai/plugins/plugin-loader.js" ] && \
   [ -f "dist/ai/validation/validation-framework.js" ]; then
  echo "✅ All exports present"
else
  echo "❌ Missing exports"
  exit 1
fi
echo ""

# 8. Test CLI
echo "8️⃣  Testing CLI..."
node bin/dcyfr-ai.js help > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ CLI functional"
else
  echo "❌ CLI broken"
  exit 1
fi
echo ""

# 9. Check bundle size
echo "9️⃣  Checking bundle size..."
size=$(du -sh dist/ | awk '{print $1}')
echo "📦 Bundle size: $size"
echo "✅ Size check complete"
echo ""

# 10. Dry run npm publish
echo "🔟  Testing npm pack..."
npm pack --dry-run > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Package ready for publish"
else
  echo "❌ Package validation failed"
  exit 1
fi
echo ""

echo "=============================================="
echo "✨ All checks passed! Ready to publish."
echo ""
echo "To publish:"
echo "  npm publish"
echo ""
echo "To create git tag:"
echo "  git tag v1.0.0"
echo "  git push --tags"
echo ""
