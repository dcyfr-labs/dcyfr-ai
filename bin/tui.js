#!/usr/bin/env node

/**
 * DCYFR AI Framework TUI (Terminal UI)
 * Interactive dashboard using chalk and inquirer
 */

import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { ConfigLoader } from '../dist/ai/config/loader.js';
import { ValidationFramework } from '../dist/ai/validation/framework.js';
import { renderValidationDashboard } from './tui/validation-dashboard.js';
import { runConfigWizard } from './tui/config-wizard.js';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Run interactive validation dashboard
 */
async function runDashboard(options) {
  const projectRoot = options.root || process.cwd();
  const configFile = options.config;

  try {
    // Load configuration
    const spinner = ora('Loading configuration...').start();
    
    const loader = new ConfigLoader({
      projectRoot,
      configFile,
      validate: true,
    });

    const config = await loader.load();
    spinner.succeed('Configuration loaded');

    // Run validation
    spinner.start('Running validation...');
    
    const framework = new ValidationFramework({
      gates: config.validation.gates,
      parallel: config.validation.parallel,
    });

    const report = await framework.validate({
      projectRoot: config.project.root,
      files: config.project.include,
      config: config.agents,
    });
    
    spinner.succeed('Validation complete');

    // Display dashboard
    console.clear();
    console.log(renderValidationDashboard(config, report));

    // Setup keyboard input for interactive mode
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    console.log(chalk.gray('\nPress Q to quit, R to refresh...\n'));

    process.stdin.on('keypress', async (str, key) => {
      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        console.log(chalk.yellow('\n👋 Exiting dashboard...\n'));
        process.exit(0);
      } else if (key.name === 'r') {
        // Refresh
        console.clear();
        const spinner = ora('Refreshing validation...').start();
        const newReport = await framework.validate({
          projectRoot: config.project.root,
          files: config.project.include,
          config: config.agents,
        });
        spinner.succeed('Validation refreshed');
        console.log(renderValidationDashboard(config, newReport));
        console.log(chalk.gray('\nPress Q to quit, R to refresh...\n'));
      }
    });
  } catch (error) {
    console.error(chalk.red('❌ Failed to run dashboard:'), error.message);
    process.exit(1);
  }
}

/**
 * Run interactive configuration wizard
 */
async function runWizard(options) {
  const projectRoot = options.root || process.cwd();

  try {
    const config = await runConfigWizard();
    
    // Create config file
    await createConfigFile(config, projectRoot);
  } catch (error) {
    if (error.isTTYError) {
      console.error(chalk.red('❌ Prompt couldn\'t be rendered in the current environment'));
    } else {
      console.error(chalk.red('❌ Failed to run wizard:'), error.message);
    }
    process.exit(1);
  }
}

/**
 * Create configuration file from wizard state
 */
async function createConfigFile(state, projectRoot) {
  const configFile = state.format === 'json' ? '.dcyfr.json' : '.dcyfr.yaml';
  const configPath = join(projectRoot, configFile);

  if (existsSync(configPath)) {
    console.error(chalk.red(`\n❌ Config file already exists: ${configPath}`));
    console.error(chalk.yellow('Delete it first or use --force flag'));
    process.exit(1);
  }

  // Build config object
  const config = {
    version: '1.0.0',
    projectName: state.projectName || 'my-project',
    telemetry: {
      enabled: state.telemetryEnabled,
    },
    validation: {
      enabled: state.validationEnabled,
      parallel: state.parallelExecution,
      gates: Object.entries(state.agents)
        .filter(([_, cfg]) => cfg.enabled)
        .map(([name]) => name),
    },
    agents: state.agents,
  };

  // Write file
  const content =
    state.format === 'json'
      ? JSON.stringify(config, null, 2)
      : Object.entries(config)
          .map(([key, val]) => `${key}: ${JSON.stringify(val)}`)
          .join('\n');

  await writeFile(configPath, content, 'utf-8');

  console.log(chalk.green(`\n✅ Created ${configPath}`));
  console.log(chalk.cyan('\nNext steps:'));
  console.log('  1. Review and customize the configuration');
  console.log('  2. Run ' + chalk.bold('npx @dcyfr/ai tui:dashboard') + ' to test');
  console.log('  3. Integrate into your CI/CD pipeline\n');
}

/**
 * Show TUI help
 */
function showHelp() {
  console.log(`
DCYFR AI Framework - Interactive TUI

Usage:
  npx @dcyfr/ai tui:<command> [options]

Commands:
  tui:dashboard           Interactive validation dashboard
  tui:wizard              Interactive configuration wizard
  tui:help                Show this help message

Options:
  --root <path>           Project root directory (default: current directory)
  --config <file>         Custom config file path (dashboard only)
  --format <json|yaml>    Config format for wizard (default: yaml)

Examples:
  # Run interactive validation dashboard
  npx @dcyfr/ai tui:dashboard

  # Run configuration wizard
  npx @dcyfr/ai tui:wizard

  # Dashboard with custom config
  npx @dcyfr/ai tui:dashboard --config custom.yaml

Keyboard Shortcuts:
  Q           Quit
  R           Refresh (dashboard)
  V           Verbose mode
  Ctrl+C      Exit

Documentation:
  https://github.com/dcyfr/dcyfr-ai/blob/main/docs/TUI.md
`);
  process.exit(0);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (value !== undefined) {
        flags[key] = value;
      } else {
        flags[key] = args[i + 1]?.startsWith('--') ? true : args[++i] || true;
      }
    }
  }

  return { command, flags };
}

/**
 * Main CLI entry point
 */
async function main() {
  const { command, flags } = parseArgs();

  switch (command) {
    case 'tui:dashboard':
    case 'dashboard':
      await runDashboard(flags);
      break;

    case 'tui:wizard':
    case 'wizard':
      await runWizard(flags);
      break;

    case 'tui:help':
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      console.error(`❌ Unknown command: ${command}\n`);
      showHelp();
  }
}

// Run CLI
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
