#!/usr/bin/env node

/**
 * DCYFR AI Framework CLI
 * Configuration validation and management tool
 */

import { ConfigLoader } from '../dist/ai/config/loader.js';
import { FrameworkConfigSchema } from '../dist/ai/config/schema.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      flags[key] = value || true;
    } else if (arg.startsWith('-')) {
      flags[arg.substring(1)] = true;
    } else {
      positional.push(arg);
    }
  }

  return { command, args: positional, flags };
}

/**
 * Validate configuration
 */
async function validateConfig(options) {
  console.log('🔍 Validating DCYFR configuration...\n');

  const projectRoot = options.flags.root || process.cwd();
  const configFile = options.flags.config;

  try {
    // Load configuration
    const loader = new ConfigLoader({
      projectRoot,
      configFile,
      validate: true,
    });

    const config = await loader.load();
    const configPath = await loader.getConfigFilePath();

    // Display results
    console.log('✅ Configuration is valid!\n');
    console.log(`📂 Project root: ${projectRoot}`);
    
    if (configPath) {
      console.log(`📄 Config file: ${configPath}`);
    } else {
      console.log('📄 Config file: None (using defaults)');
    }
    
    console.log(`🎯 Project: ${config.projectName || '(unnamed)'}`);
    console.log(`📊 Version: ${config.version}`);

    // Feature summary
    console.log('\n🔌 Features:');
    console.log(`  Telemetry: ${config.telemetry.enabled ? '✅' : '❌'}`);
    console.log(`  Validation: ${config.validation.enabled ? '✅' : '❌'}`);
    console.log(`  Plugins: ${config.plugins.length} configured`);
    console.log(`  Gates: ${config.validation.gates.length} configured`);

    // Agent summary
    console.log('\n🤖 Agents:');
    Object.entries(config.agents).forEach(([name, agentConfig]) => {
      const enabled = 'enabled' in agentConfig ? agentConfig.enabled : true;
      console.log(`  ${name}: ${enabled ? '✅' : '❌'}`);
    });

    // Verbose mode
    if (options.flags.verbose || options.flags.v) {
      console.log('\n📋 Full Configuration:');
      console.log(JSON.stringify(config, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Configuration validation failed!\n');
    console.error(error instanceof Error ? error.message : String(error));
    
    if (options.flags.verbose || options.flags.v) {
      console.error('\n📚 Stack trace:');
      console.error(error);
    }
    
    process.exit(1);
  }
}

/**
 * Show configuration schema
 */
async function showSchema() {
  console.log('📋 DCYFR Configuration Schema\n');
  console.log('The configuration supports the following structure:\n');
  console.log(FrameworkConfigSchema.description || 'Framework configuration schema');
  console.log('\nFor detailed documentation, visit:');
  console.log('https://github.com/dcyfr/dcyfr-ai/blob/main/docs/configuration.md');
  process.exit(0);
}

/**
 * Initialize configuration file
 */
async function initConfig(options) {
  const projectRoot = options.flags.root || process.cwd();
  const format = options.flags.format || 'yaml';
  const minimal = options.flags.minimal || false;

  const configFile = format === 'json' ? '.dcyfr.json' : '.dcyfr.yaml';
  const configPath = join(projectRoot, configFile);

  if (existsSync(configPath)) {
    console.error(`❌ Config file already exists: ${configPath}`);
    console.error('Use --force to overwrite');
    
    if (!options.flags.force) {
      process.exit(1);
    }
  }

  console.log(`📝 Creating ${configFile}...\n`);

  // Read template
  const templateName = minimal ? 'minimal.yaml' : `default.${format}`;
  const templatePath = join(__dirname, '../config', templateName);

  if (!existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templateName}`);
    process.exit(1);
  }

  // Copy template
  const { copyFile } = await import('fs/promises');
  await copyFile(templatePath, configPath);

  console.log(`✅ Created ${configPath}`);
  console.log('\nNext steps:');
  console.log('  1. Edit the configuration file to match your project');
  console.log('  2. Run `npx @dcyfr/ai config:validate` to verify');
  console.log('  3. Start using DCYFR AI Framework in your project\n');

  process.exit(0);
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
DCYFR AI Framework CLI

Usage:
  npx @dcyfr/ai <command> [options]

Commands:
  config:validate         Validate configuration file
  config:init             Initialize new configuration file
  config:schema           Show configuration schema
  help                    Show this help message

Options:
  --root <path>           Project root directory (default: current directory)
  --config <file>         Custom config file path
  --format <json|yaml>    Config file format for init (default: yaml)
  --minimal               Create minimal config (init only)
  --force                 Overwrite existing config (init only)
  --verbose, -v           Show detailed output

Examples:
  # Validate current project configuration
  npx @dcyfr/ai config:validate

  # Validate with custom config file
  npx @dcyfr/ai config:validate --config custom.yaml

  # Initialize new YAML configuration
  npx @dcyfr/ai config:init

  # Initialize minimal JSON configuration
  npx @dcyfr/ai config:init --format json --minimal

  # Show full configuration with validation
  npx @dcyfr/ai config:validate --verbose

Documentation:
  https://github.com/dcyfr/dcyfr-ai
`);
  process.exit(0);
}

/**
 * Main CLI entry point
 */
async function main() {
  const options = parseArgs();

  switch (options.command) {
    case 'config:validate':
    case 'validate':
      await validateConfig(options);
      break;

    case 'config:init':
    case 'init':
      await initConfig(options);
      break;

    case 'config:schema':
    case 'schema':
      await showSchema();
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      console.error(`❌ Unknown command: ${options.command}\n`);
      showHelp();
  }
}

// Run CLI
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
