/**
 * @example PluginSystem
 * @description Validation plugin system with dynamic loading and gate orchestration.
 *
 * Demonstrates:
 * - Loading plugins dynamically with PluginLoader
 * - Running validations with custom plugin logic
 * - Multi-plugin aggregation with ValidationFramework gates
 *
 * Prerequisites:
 * - Node.js >= 20
 * - @dcyfr/ai installed
 *
 * Usage:
 *   npx tsx examples/plugin-system.ts
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import { PluginLoader, ValidationFramework } from '@dcyfr/ai';
import type { ValidationContext, ValidationViolation } from '@dcyfr/ai';

async function basicPluginExample() {
  console.log('🔌 Plugin System - Basic Example\n');

  // 1. Create a plugin loader
  console.log('1️⃣  Creating plugin loader...');
  const loader = new PluginLoader({
    failureMode: 'warn',
    timeout: 30000,
  });

  // 2. Create a simple validator plugin
  console.log('2️⃣  Creating custom validator plugin...');
  const customPlugin = {
    manifest: {
      name: 'custom-validator',
      version: '1.0.0',
      description: 'Custom validation logic',
      author: 'Your Team',
    },
    async onLoad() {
      console.log('   📦 Custom validator loaded!');
    },
    async onValidate(context: ValidationContext) {
      console.log(`   🔍 Validating ${context.files.length} files...`);
      
      const violations = [];
      
      // Example: Check for console.log statements
      for (const file of context.files) {
        if (file.includes('.ts') || file.includes('.tsx')) {
          // In real implementation, read file and check content
          const hasConsoleLogs = Math.random() > 0.7; // Simulate detection
          
          if (hasConsoleLogs) {
            violations.push({
              type: 'code-quality',
              severity: 'warning',
              message: `Remove console.log statements before committing`,
              file,
            });
          }
        }
      }

      return {
        valid: violations.length === 0,
        violations,
        warnings: [],
      };
    },
  };

  // 3. Load the plugin
  await loader.loadPlugin(customPlugin);
  console.log(`   ✅ Loaded ${loader.getPluginCount()} plugin(s)\n`);

  // 4. Run validation
  console.log('3️⃣  Running validation...');
  const result = await loader.validateAll({
    projectRoot: process.cwd(),
    files: ['src/app.ts', 'src/utils.ts', 'src/components.tsx'],
    config: {},
  });

  console.log(`\n   Result: ${result.valid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Violations: ${result.violations.length}`);
  console.log(`   Warnings: ${result.warnings.length}`);

  if (result.violations.length > 0) {
    console.log('\n   Issues found:');
    result.violations.forEach((v: ValidationViolation, i: number) => {
      console.log(`     ${i + 1}. [${v.severity}] ${v.message} (${v.file})`);
    });
  }

  // 5. Cleanup
  await loader.clearAll();
  console.log('\n4️⃣  Cleanup complete\n');
}

async function multiPluginExample() {
  console.log('🎯 Multi-Plugin Validation Example\n');

  // 1. Create a PluginLoader with multiple inline plugins
  console.log('1️⃣  Loading multiple inline plugins...');
  const loader = new PluginLoader({ failureMode: 'warn', timeout: 30000 });

  await loader.loadPlugins([
    {
      manifest: { name: 'quality-checker', version: '1.0.0', description: 'Code quality checks' },
      async onValidate() {
        return {
          valid: true,
          violations: [],
          warnings: [{ type: 'complexity', severity: 'warning', message: 'Function complexity is high, consider refactoring' }],
        };
      },
    },
    {
      manifest: { name: 'security-scanner', version: '1.0.0', description: 'Security vulnerability scanner' },
      async onValidate() {
        return { valid: true, violations: [], warnings: [] };
      },
    },
    {
      manifest: { name: 'perf-analyzer', version: '1.0.0', description: 'Performance analyzer' },
      async onValidate() {
        return {
          valid: false,
          violations: [{ type: 'performance', severity: 'warning', message: 'Large bundle size detected (2.5MB)' }],
          warnings: [],
        };
      },
    },
  ]);
  console.log(`   ✅ Loaded ${loader.getPluginCount()} plugins\n`);

  // 2. Run all plugins
  console.log('2️⃣  Running all plugins...');
  const result = await loader.validateAll({
    projectRoot: process.cwd(),
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    config: { strict: true },
  });

  // 3. Display results
  console.log(`\n📊 Combined Result:`);
  console.log(`   Overall: ${result.valid ? '✅ PASS' : '⚠️  ISSUES FOUND'}`);
  console.log(`   Violations: ${result.violations.length}`);
  console.log(`   Warnings: ${result.warnings.length}\n`);

  // 4. Show how ValidationFramework adds gate-level orchestration (named plugin packages)
  console.log('3️⃣  ValidationFramework gates (for named plugin packages):');
  const framework = new ValidationFramework({
    gates: [
      { name: 'quality', plugins: ['@dcyfr/agents/quality-checker'], required: true, failureMode: 'error' },
      { name: 'security', plugins: ['@dcyfr/agents/security-scanner'], required: true, failureMode: 'error' },
    ],
    parallel: true,
  });
  console.log(`   📋 Configured ${framework.getGates().length} gates (plugins resolved at validate() time)\n`);

  await loader.clearAll();
}

async function dcyfrAgentsExample() {
  console.log('\n\n🎨 DCYFR Agents Example (Preview)\n');
  
  console.log('Once @dcyfr/agents is installed, you can use specialized validators:\n');
  
  console.log('```typescript');
  console.log("import { PluginLoader } from '@dcyfr/ai';");
  console.log("import { designTokenValidator, barrelExportChecker } from '@dcyfr/agents';");
  console.log('');
  console.log('const loader = new PluginLoader();');
  console.log('');
  console.log('// Load DCYFR specialized agents');
  console.log('await loader.loadPlugins([');
  console.log('  designTokenValidator,    // Enforces design token usage');
  console.log('  barrelExportChecker,     // Enforces barrel exports');
  console.log('  pageLayoutEnforcer,      // Enforces 90% PageLayout rule');
  console.log('  testDataGuardian,        // Prevents production data in tests');
  console.log(']);');
  console.log('');
  console.log('// Run validation');
  console.log('const result = await loader.validateAll({');
  console.log('  projectRoot: process.cwd(),');
  console.log("  files: ['src/**/*.{ts,tsx}'],");
  console.log('  config: {');
  console.log('    designTokens: { compliance: 0.90 },');
  console.log('    pageLayout: { targetUsage: 0.90 },');
  console.log('  },');
  console.log('});');
  console.log('```\n');
  
  console.log('Available DCYFR agents:');
  console.log('  🎨 design-token-validator - Design system compliance');
  console.log('  📦 barrel-export-checker - Import conventions');
  console.log('  📄 pagelayout-enforcer - PageLayout usage rules');
  console.log('  🛡️  test-data-guardian - Test data safety');
}

// Run all examples
async function main() {
  try {
    await basicPluginExample();
    await multiPluginExample();
    await dcyfrAgentsExample();
    // @expected-output: ✨ All examples completed!
    console.log('\n✨ All examples completed!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
