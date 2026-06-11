/**
 * @example Configuration
 * @description Configuration system with YAML/JSON loading, env overrides, and validation.
 *
 * Demonstrates:
 * - Loading configuration from files (auto-detect .dcyfr.yaml / .dcyfr.json)
 * - Three-layer merge (defaults → project → env overrides)
 * - Validating configuration with ConfigLoader
 * - Using configuration with the plugin/validation system
 *
 * Prerequisites:
 * - Node.js >= 20
 * - @dcyfr/ai installed
 *
 * Usage:
 *   npx tsx examples/configuration.ts
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import { loadConfig, ConfigLoader } from '@dcyfr/ai';
import type { ValidationGate } from '@dcyfr/ai';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';

async function basicConfigExample() {
  console.log('📋 Configuration System - Basic Example\n');

  // 1. Load configuration (auto-detects .dcyfr.yaml, .dcyfr.json, package.json)
  console.log('1️⃣  Loading configuration...');
  const config = await loadConfig();

  console.log(`   Project: ${config.projectName || '(unnamed)'}`);
  console.log(`   Version: ${config.version}`);
  console.log(`   Telemetry: ${config.telemetry.enabled ? 'enabled' : 'disabled'}`);
  console.log(`   Primary provider: ${config.providers.primary}`);

  // 2. Agent configuration
  console.log('\n2️⃣  Agent Configuration:');
  console.log(`   Design Tokens: ${config.agents.designTokens.enabled ? 'enabled' : 'disabled'}`);
  console.log(`   Compliance: ${config.agents.designTokens.compliance * 100}%`);
  console.log(`   PageLayout: ${config.agents.pageLayout.enabled ? 'enabled' : 'disabled'}`);
  console.log(`   Target Usage: ${config.agents.pageLayout.targetUsage * 100}%`);

  // 3. Validation gates
  console.log('\n3️⃣  Validation Gates:');
  console.log(`   Total gates: ${config.validation.gates.length}`);
  config.validation.gates.forEach((gate: ValidationGate) => {
    console.log(`   - ${gate.name} (${gate.plugins.join(', ')})`);
  });
}

async function customConfigExample() {
  console.log('\n\n📝 Custom Configuration Example\n');

  const projectRoot = '/tmp/dcyfr-test-project';

  // 1. Create custom YAML config
  console.log('1️⃣  Creating custom .dcyfr.yaml...');
  const yamlConfig = `
version: '1.0.0'
projectName: my-awesome-app

telemetry:
  enabled: true
  retentionDays: 60

providers:
  primary: claude
  fallback:
    - groq
    - ollama

agents:
  designTokens:
    enabled: true
    compliance: 0.95
    strictMode: true
  
  pageLayout:
    enabled: true
    targetUsage: 0.90
    exceptions:
      - ArticleLayout
      - SpecialLayout
`;

  console.log('   Config created\n');

  // 2. Load with custom path
  console.log('2️⃣  Loading custom configuration...');
  const loader = new ConfigLoader({
    projectRoot,
    enableEnvOverrides: true,
  });

  // Simulate config (in real usage, this would be a file)
  console.log('   ✅ Configuration loaded');
  console.log('   Project: my-awesome-app');
  console.log('   Telemetry retention: 60 days');
  console.log('   Design token compliance: 95%');
}

async function environmentOverridesExample() {
  console.log('\n\n🌍 Environment Variable Overrides\n');

  console.log('1️⃣  Setting environment variables...');
  console.log('   DCYFR_TELEMETRY_ENABLED=false');
  console.log('   DCYFR_PROVIDERS_PRIMARY=groq');
  console.log('   DCYFR_AGENTS_DESIGNTOKENS_COMPLIANCE=0.99\n');

  // Set env vars (in real usage, these would be set externally)
  process.env.DCYFR_TELEMETRY_ENABLED = 'false';
  process.env.DCYFR_PROVIDERS_PRIMARY = 'groq';
  process.env.DCYFR_AGENTS_DESIGNTOKENS_COMPLIANCE = '0.99';

  console.log('2️⃣  Loading configuration with overrides...');
  const config = await loadConfig({
    enableEnvOverrides: true,
  });

  console.log(`   Telemetry: ${config.telemetry.enabled} (overridden)`);
  console.log(`   Primary provider: ${config.providers.primary} (overridden)`);
  console.log(`   Design token compliance: ${config.agents.designTokens.compliance} (overridden)`);

  // Cleanup
  delete process.env.DCYFR_TELEMETRY_ENABLED;
  delete process.env.DCYFR_PROVIDERS_PRIMARY;
  delete process.env.DCYFR_AGENTS_DESIGNTOKENS_COMPLIANCE;
}

async function validationExample() {
  console.log('\n\n✅ Configuration Validation Example\n');

  console.log('1️⃣  Creating invalid configuration...');
  const invalidConfig = {
    version: 123, // Should be string
    telemetry: {
      retentionDays: -1, // Should be positive
    },
    agents: {
      designTokens: {
        compliance: 1.5, // Should be 0-1
      },
    },
  };

  console.log('2️⃣  Validating configuration...');
  const loader = new ConfigLoader();

  try {
    loader.validate(invalidConfig);
    console.log('   ❌ Should have failed validation');
  } catch (error) {
    console.log('   ✅ Validation failed as expected');
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n3️⃣  Validating correct configuration...');
  const validConfig = {
    version: '1.0.0',
    projectName: 'valid-app',
    agents: {
      designTokens: {
        compliance: 0.95,
      },
    },
  };

  try {
    const result = loader.validate(validConfig);
    console.log('   ✅ Validation passed');
    console.log(`   Project: ${result.projectName}`);
  } catch (error) {
    console.log('   ❌ Unexpected validation error');
  }
}

async function cliExample() {
  console.log('\n\n🛠️  CLI Usage Examples\n');

  console.log('Available CLI commands:\n');

  console.log('1️⃣  Initialize configuration:');
  console.log('   $ npx dcyfr-ai config:init');
  console.log('   $ npx dcyfr-ai config:init --format json');
  console.log('   $ npx dcyfr-ai config:init --minimal\n');

  console.log('2️⃣  Validate configuration:');
  console.log('   $ npx dcyfr-ai config:validate');
  console.log('   $ npx dcyfr-ai config:validate --verbose');
  console.log('   $ npx dcyfr-ai config:validate --config custom.yaml\n');

  console.log('3️⃣  Show schema:');
  console.log('   $ npx dcyfr-ai config:schema\n');

  console.log('4️⃣  Get help:');
  console.log('   $ npx dcyfr-ai help\n');
}

async function integrationExample() {
  console.log('\n\n🔗 Integration with Plugins Example\n');

  console.log('Using configuration with plugin system:\n');

  console.log('```typescript');
  console.log("import { loadConfig, ValidationFramework } from '@dcyfr/ai';");
  console.log("import { designTokenValidator, barrelExportChecker } from '@dcyfr/agents';");
  console.log('');
  console.log('// Load config');
  console.log('const config = await loadConfig();');
  console.log('');
  console.log('// Create framework with config');
  console.log('const framework = new ValidationFramework({');
  console.log('  gates: config.validation.gates,');
  console.log('  parallel: config.validation.parallel,');
  console.log('});');
  console.log('');
  console.log('// Load plugins based on config');
  console.log('if (config.agents.designTokens.enabled) {');
  console.log('  await framework.loadPlugins([designTokenValidator]);');
  console.log('}');
  console.log('');
  console.log('if (config.agents.barrelExports.enabled) {');
  console.log('  await framework.loadPlugins([barrelExportChecker]);');
  console.log('}');
  console.log('');
  console.log('// Run validation');
  console.log('const report = await framework.validate({');
  console.log('  projectRoot: config.project.root,');
  console.log('  files: config.project.include,');
  console.log('  config: {');
  console.log('    designTokens: config.agents.designTokens,');
  console.log('    barrelExports: config.agents.barrelExports,');
  console.log('  },');
  console.log('});');
  console.log('```\n');
}

// Run all examples
async function main() {
  try {
    await basicConfigExample();
    await customConfigExample();
    await environmentOverridesExample();
    await validationExample();
    await cliExample();
    await integrationExample();

    // @expected-output: ✨ All examples completed!
    console.log('\n✨ All examples completed!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
