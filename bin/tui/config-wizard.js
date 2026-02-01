/**
 * Interactive Configuration Wizard
 * Uses inquirer for interactive prompts
 */

import inquirer from 'inquirer';
import chalk from 'chalk';

/**
 * Run configuration wizard
 */
export async function runConfigWizard() {
  console.log(chalk.cyan.bold('\n⚙️  DCYFR Configuration Wizard\n'));
  console.log(chalk.gray('Configure your AI agent framework\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: 'my-project',
    },
    {
      type: 'list',
      name: 'format',
      message: 'Config format:',
      choices: [
        { name: 'YAML (Recommended)', value: 'yaml' },
        { name: 'JSON', value: 'json' },
      ],
      default: 'yaml',
    },
    {
      type: 'confirm',
      name: 'telemetryEnabled',
      message: 'Enable telemetry?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'validationEnabled',
      message: 'Enable validation?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'parallelExecution',
      message: 'Enable parallel execution?',
      default: true,
    },
    {
      type: 'number',
      name: 'designTokenCompliance',
      message: 'Design token compliance threshold (%):',
      default: 90,
      when: (answers) => answers.validationEnabled,
    },
    {
      type: 'number',
      name: 'pageLayoutUsage',
      message: 'PageLayout usage threshold (%):',
      default: 90,
      when: (answers) => answers.validationEnabled,
    },
    {
      type: 'checkbox',
      name: 'agents',
      message: 'Select agents to enable:',
      choices: [
        { name: 'Design Tokens', value: 'designTokens', checked: true },
        { name: 'Barrel Exports', value: 'barrelExports', checked: true },
        { name: 'Page Layout', value: 'pageLayout', checked: true },
        { name: 'Test Data', value: 'testData', checked: true },
        { name: 'API Pattern', value: 'apiPattern', checked: false },
      ],
    },
  ]);

  return {
    projectName: answers.projectName,
    format: answers.format,
    telemetryEnabled: answers.telemetryEnabled,
    validationEnabled: answers.validationEnabled,
    parallelExecution: answers.parallelExecution,
    designTokenCompliance: answers.designTokenCompliance || 90,
    pageLayoutUsage: answers.pageLayoutUsage || 90,
    agents: {
      designTokens: {
        enabled: answers.agents.includes('designTokens'),
        compliance: (answers.designTokenCompliance || 90) / 100,
      },
      barrelExports: {
        enabled: answers.agents.includes('barrelExports'),
      },
      pageLayout: {
        enabled: answers.agents.includes('pageLayout'),
        targetUsage: (answers.pageLayoutUsage || 90) / 100,
      },
      testData: {
        enabled: answers.agents.includes('testData'),
      },
      apiPattern: {
        enabled: answers.agents.includes('apiPattern'),
      },
    },
  };
}
