#!/usr/bin/env node

/**
 * DCYFR AI Framework CLI
 * Extended tool for initialization, validation, and management
 */

import { ConfigLoader } from '../dist/ai/config/loader.js';
import { FrameworkConfigSchema, DEFAULT_CONFIG } from '../dist/ai/config/schema.js';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
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
      const parts = arg.substring(2).split('=');
      const key = parts[0];
      if (parts.length > 1) {
        flags[key] = parts[1];
      } else {
        flags[key] = args[i + 1];
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          i++; // Skip next arg if it was used as value
        }
      }
    } else if (arg.startsWith('-')) {
      flags[arg.substring(1)] = true;
    } else {
      positional.push(arg);
    }
  }

  return { command, args: positional, flags };
}

/**
 * Initialize new project
 */
async function initProject(options) {
  const name = options.flags.name || 'my-app';
  const type = options.flags.type || 'vanilla';
  
  console.log(`🚀 Initializing ${type} project: ${name}\n`);
  
  // Create package.json
  const packageJson = {
    name,
    version: '1.0.0',
    description: `${name} - powered by @dcyfr/ai`,
    type: 'module',
    scripts: {
      validate: 'dcyfr-ai validate',
      report: 'dcyfr-ai report',
    },
    dependencies: {
      '@dcyfr/ai': '^1.0.0',
    },
    dcyfr: {
      version: '1.0.0',
      projectName: name,
      telemetry: {
        enabled: true,
        storage: 'file',
      },
    },
  };
  
  if (!existsSync('package.json')) {
    writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    console.log('✅ Created package.json');
  } else {
    console.log('ℹ️  package.json already exists, skipping');
  }
  
  // Create config file
  await initConfig(options);
  
  console.log('\n✨ Project initialized!');
  console.log('\nNext steps:');
  console.log('  1. npm install');
  console.log('  2. dcyfr-ai config:validate');
  console.log('  3. dcyfr-ai validate\n');
}

/**
 * Initialize configuration file
 */
async function initConfig(options) {
  const format = options.flags.format || 'yaml';
  const minimal = options.flags.minimal;
  const outputPath = options.flags.output || (format === 'json' ? '.dcyfr.json' : '.dcyfr.yaml');
  
  console.log(`📝 Creating ${outputPath}...\n`);
  
  if (existsSync(outputPath)) {
    console.log(`❌ File ${outputPath} already exists`);
    console.log('   Use --output to specify different file');
    process.exit(1);
  }
  
  // Load templates
  const templateDir = join(__dirname, '..', 'config');
  const templateFile = minimal 
    ? `minimal.${format}`
    : `default.${format}`;
  const templatePath = join(templateDir, templateFile);
  
  try {
    const { readFileSync } = await import('fs');
    const template = readFileSync(templatePath, 'utf-8');
    writeFileSync(outputPath, template);
    console.log(`✅ Created ${outputPath}`);
  } catch (error) {
    console.error(`❌ Failed to create config: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Validate configuration
 */
async function validateConfig(options) {
  console.log('🔍 Validating DCYFR configuration...\n');

  const projectRoot = options.flags.root || process.cwd();
  const configFile = options.flags.config;

  try {
    const loader = new ConfigLoader({
      projectRoot,
      configFile,
      enableEnvOverrides: true,
    });

    const config = await loader.load();
    const validated = FrameworkConfigSchema.parse(config);

    console.log('✅ Configuration is valid!\n');
    console.log(`📋 Project: ${validated.projectName}`);
    console.log(`📁 Version: ${validated.version}`);
    console.log(`📊 Telemetry: ${validated.telemetry.enabled ? 'enabled' : 'disabled'}`);
    console.log(`🔌 Providers: ${validated.providers.enabled ? 'enabled' : 'disabled'}`);
    console.log(`✓  Validation: ${validated.validation.enabled ? 'enabled' : 'disabled'}`);
    
    if (options.flags.verbose || options.flags.v) {
      console.log('\n📄 Full Configuration:');
      console.log(JSON.stringify(validated, null, 2));
    }

  } catch (error) {
    console.error('❌ Configuration validation failed:\n');
    console.error(error.message);
    
    if (error.errors) {
      console.error('\nValidation errors:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    
    process.exit(1);
  }
}

/**
 * Show configuration schema
 */
function showSchema() {
  console.log('📋 DCYFR Configuration Schema\n');
  console.log(JSON.stringify(DEFAULT_CONFIG, null, 2));
}

/**
 * Create plugin template
 */
async function createPlugin(options) {
  const name = options.flags.name;
  
  if (!name) {
    console.error('❌ Plugin name is required');
    console.log('Usage: dcyfr-ai plugin:create --name <name>');
    process.exit(1);
  }
  
  const outputDir = options.flags.output || 'plugins';
  const pluginFile = `${name}.ts`;
  const outputPath = join(outputDir, pluginFile);
  
  // Create directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const pluginTemplate = `/**
 * ${name} Plugin
 * 
 * Custom validation plugin for @dcyfr/ai framework
 */

import type { Plugin, ValidationContext, ValidationResult } from '@dcyfr/ai';

export const ${toCamelCase(name)}: Plugin = {
  manifest: {
    name: '${name}',
    version: '1.0.0',
    description: 'Custom validation plugin',
    author: 'Your Name',
  },
  
  async onLoad() {
    console.log('${name} plugin loaded');
  },
  
  async onValidate(context: ValidationContext): Promise<ValidationResult> {
    const violations = [];
    const warnings = [];
    
    console.log(\`Validating \${context.files.length} files...\`);
    
    // TODO: Implement your validation logic here
    for (const file of context.files) {
      // Check something about the file
    }
    
    return {
      valid: violations.length === 0,
      violations,
      warnings,
      metadata: {
        filesChecked: context.files.length,
      },
    };
  },
  
  async onComplete() {
    console.log('${name} plugin validation complete');
  },
};
`;
  
  writeFileSync(outputPath, pluginTemplate);
  
  console.log(`✅ Plugin created: ${outputPath}`);
  console.log('\nNext steps:');
  console.log(`  1. Edit ${outputPath} to implement validation logic`);
  console.log('  2. Import and load the plugin in your validation script\n');
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
@dcyfr/ai CLI - AI Agent Framework

USAGE:
  dcyfr-ai <command> [options]

COMMANDS:
  init             Initialize new project with @dcyfr/ai
  config:init      Create a new configuration file
  config:validate  Validate current configuration
  config:schema    Show configuration schema
  plugin:create    Create a new plugin template
  validate         Run validation checks
  test             Alias for validate
  report           Generate telemetry report
  telemetry        View telemetry data, costs, and model usage
  validate-runtime Validate runtime environment and provider config
  help             Show this help message

INIT OPTIONS:
  --name <name>    Project name
  --type <type>    Project type (nextjs, express, vanilla) [default: vanilla]

CONFIG:INIT OPTIONS:
  --format <type>  Configuration format (yaml, json) [default: yaml]
  --minimal        Generate minimal configuration
  --output <path>  Output file path [default: .dcyfr.yaml]

CONFIG:VALIDATE OPTIONS:
  --verbose, -v    Show full configuration
  --config <path>  Path to config file
  --root <path>    Project root directory

PLUGIN:CREATE OPTIONS:
  --name <name>    Plugin name (required)
  --output <path>  Output directory [default: plugins]

VALIDATE OPTIONS:
  --config <path>  Path to config file
  --files <glob>   File pattern to validate [default: src/**/*.ts]

REPORT OPTIONS:
  --period <time>  Time period (7d, 30d, 90d) [default: 30d]
  --agent <name>   Filter by agent

EXAMPLES:
  dcyfr-ai init --name my-app --type nextjs
  dcyfr-ai config:init
  dcyfr-ai config:validate --verbose
  dcyfr-ai plugin:create --name my-validator
  dcyfr-ai validate --files "src/**/*.{ts,tsx}"
  dcyfr-ai report --period 7d --agent claude
  dcyfr-ai telemetry --period week --agent claude
  dcyfr-ai telemetry --breakdown models
  dcyfr-ai validate-runtime
  dcyfr-ai telemetry --help   # full telemetry / validate-runtime options

For more information, visit: https://github.com/dcyfr-labs/dcyfr-ai
  `);
}

/**
 * Utility: Convert to camelCase
 */
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Main CLI handler
 */
async function main() {
  const options = parseArgs();
  const { command } = options;
  
  try {
    switch (command) {
      case 'init':
        await initProject(options);
        break;
      case 'config:init':
        await initConfig(options);
        break;
      case 'config:validate':
        await validateConfig(options);
        break;
      case 'config:schema':
        showSchema();
        break;
      case 'plugin:create':
        await createPlugin(options);
        break;
      case 'validate':
      case 'test':
        console.log('🔍 Validation runner');
        console.log('ℹ️  Use PluginLoader and ValidationFramework in your code');
        console.log('See: https://github.com/dcyfr-labs/dcyfr-ai/blob/main/docs/GETTING-STARTED.md\n');
        break;
      case 'report':
        console.log('📊 Telemetry report generator');
        console.log('ℹ️  Use TelemetryEngine API to generate reports');
        console.log('See: https://github.com/dcyfr-labs/dcyfr-ai/blob/main/examples/standalone-nextjs/scripts/telemetry-report.js\n');
        break;
      case 'telemetry':
      case 'validate-runtime': {
        // Folded-in telemetry CLI (commander-based). Delegate by importing the
        // built module and letting it re-parse process.argv, where argv[2] is
        // already the subcommand name ('telemetry' | 'validate-runtime').
        const { main: runTelemetryCli } = await import('../dist/ai/src/cli/telemetry-dashboard.js');
        await runTelemetryCli();
        break;
      }
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run "dcyfr-ai help" for usage information.');
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run CLI
main();
