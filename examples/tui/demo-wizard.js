#!/usr/bin/env node

/**
 * TUI Wizard Demo
 * Demonstrates interactive configuration wizard using inquirer
 */

import chalk from 'chalk';
import ora from 'ora';
import { runConfigWizard } from '../../bin/tui/config-wizard.js';

/**
 * Run demo
 */
async function runDemo() {
  console.log(chalk.cyan.bold('🧙 Starting Configuration Wizard Demo...\n'));
  console.log(chalk.gray('This demonstrates the interactive configuration wizard.'));
  console.log(chalk.gray('Use arrow keys to navigate, space to select, enter to confirm\n'));

  const spinner = ora('Initializing wizard...').start();
  
  // Simulate initialization
  await new Promise(resolve => setTimeout(resolve, 500));
  spinner.succeed('Wizard ready');

  try {
    // Run the wizard
    const config = await runConfigWizard();

    // Display results
    console.log(chalk.green.bold('\n✅ Configuration completed!\n'));
    console.log(chalk.cyan('Generated configuration:'));
    console.log(chalk.gray(JSON.stringify(config, null, 2)));
    console.log(chalk.yellow('\nIn a real scenario, this would create a .dcyfr.yaml file\n'));
    
  } catch (error) {
    if (error.isTtyError) {
      console.log(chalk.red('\n❌ Prompt couldn\'t be rendered in the current environment'));
    } else {
      console.log(chalk.red('\n❌ Configuration cancelled\n'));
    }
    process.exit(1);
  }
}

// Run demo
runDemo().catch((error) => {
  console.error(chalk.red('❌ Demo failed:'), error);
  process.exit(1);
});
