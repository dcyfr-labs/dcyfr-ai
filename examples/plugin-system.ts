/**
 * Plugin System Example - Using validation plugins
 * 
 * This example demonstrates:
 * - Loading plugins dynamically
 * - Creating validation gates
 * - Running validations with custom configuration
 */

import { PluginLoader, ValidationFramework } from '@dcyfr/ai';

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
    async onValidate(context) {
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
    result.violations.forEach((v, i) => {
      console.log(`     ${i + 1}. [${v.severity}] ${v.message} (${v.file})`);
    });
  }

  // 5. Cleanup
  await loader.clearAll();
  console.log('\n4️⃣  Cleanup complete\n');
}

async function validationFrameworkExample() {
  console.log('🎯 Validation Framework Example\n');

  // 1. Create framework with custom gates
  console.log('1️⃣  Creating validation framework with gates...');
  const framework = new ValidationFramework({
    gates: [
      {
        name: 'code-quality',
        plugins: ['quality-checker'],
        required: true,
        failureMode: 'error',
      },
      {
        name: 'security',
        plugins: ['security-scanner'],
        required: true,
        failureMode: 'error',
      },
      {
        name: 'performance',
        plugins: ['perf-analyzer'],
        required: false,
        failureMode: 'warn',
      },
    ],
    parallel: true,
  });

  console.log(`   📋 Configured ${framework.getGates().length} validation gates\n`);

  // 2. Load plugins
  console.log('2️⃣  Loading validation plugins...');
  
  const qualityPlugin = {
    manifest: {
      name: 'quality-checker',
      version: '1.0.0',
      description: 'Code quality checks',
    },
    async onValidate() {
      return {
        valid: true,
        violations: [],
        warnings: [
          {
            type: 'complexity',
            severity: 'warning',
            message: 'Function complexity is high, consider refactoring',
          },
        ],
      };
    },
  };

  const securityPlugin = {
    manifest: {
      name: 'security-scanner',
      version: '1.0.0',
      description: 'Security vulnerability scanner',
    },
    async onValidate() {
      return {
        valid: true,
        violations: [],
        warnings: [],
      };
    },
  };

  const perfPlugin = {
    manifest: {
      name: 'perf-analyzer',
      version: '1.0.0',
      description: 'Performance analyzer',
    },
    async onValidate() {
      return {
        valid: false,
        violations: [
          {
            type: 'performance',
            severity: 'warning',
            message: 'Large bundle size detected (2.5MB)',
          },
        ],
        warnings: [],
      };
    },
  };

  await framework.loadPlugins([qualityPlugin, securityPlugin, perfPlugin]);
  console.log('   ✅ All plugins loaded\n');

  // 3. Run validation
  console.log('3️⃣  Running validation framework...');
  const report = await framework.validate({
    projectRoot: process.cwd(),
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    config: {
      strict: true,
    },
  });

  // 4. Display results
  console.log(`\n📊 Validation Report:`);
  console.log(`   Overall: ${report.valid ? '✅ PASS' : '⚠️  ISSUES FOUND'}`);
  console.log(`   Gates passed: ${report.summary.passedGates}/${report.summary.totalGates}`);
  console.log(`   Total violations: ${report.summary.totalViolations}`);
  console.log(`   Total warnings: ${report.summary.totalWarnings}`);
  console.log(`   Execution time: ${report.summary.executionTime}ms\n`);

  console.log('   Gate Details:');
  report.gates.forEach(gate => {
    const status = gate.passed ? '✅' : '❌';
    console.log(`     ${status} ${gate.name} (${gate.executionTime}ms)`);
    
    if (gate.violations.length > 0) {
      gate.violations.forEach(v => {
        console.log(`        - [${v.severity}] ${v.message}`);
      });
    }
    
    if (gate.warnings.length > 0) {
      gate.warnings.forEach(w => {
        console.log(`        - [warning] ${w.message}`);
      });
    }
  });
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
    await validationFrameworkExample();
    await dcyfrAgentsExample();
    console.log('\n✨ All examples completed!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
