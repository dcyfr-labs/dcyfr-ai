/**
 * Terminal Validation Dashboard
 * Interactive terminal UI for displaying validation results using chalk and cli-table3
 */

import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Status icon helper
 */
export function getStatusIcon(status) {
  const icons = {
    pass: chalk.green.bold('✓'),
    fail: chalk.red.bold('✗'),
    warn: chalk.yellow.bold('⚠'),
    pending: chalk.gray.bold('○'),
  };

  return icons[status] || icons.pending;
}

/**
 * Progress bar helper
 */
export function renderProgressBar(value, max = 100, width = 30) {
  const percentage = Math.min(100, (value / max) * 100);
  const filledWidth = Math.floor((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);

  let colorFn = chalk.green;
  if (percentage < 50) colorFn = chalk.red;
  else if (percentage < 90) colorFn = chalk.yellow;

  return `${colorFn(filled)}${chalk.gray(empty)} ${chalk.cyan(percentage.toFixed(1) + '%')}`;
}

/**
 * Render gate status row
 */
export function renderGateRow(gate) {
  const status = gate.passed ? 'pass' : 'fail';
  const compliance = gate.compliance || 0;
  const icon = getStatusIcon(status);
  const progressBar = renderProgressBar(compliance, 100, 20);
  const issues = gate.violations > 0 ? chalk.red(`${gate.violations} issues`) : chalk.gray('0 issues');
  
  const name = gate.name.padEnd(20);
  
  return `${icon} ${name} ${progressBar} ${issues}`;
}

/**
 * Render agent summary
 */
export function renderAgentSummary(agents) {
  const lines = [chalk.cyan.bold('🤖 Agents'), ''];
  
  Object.entries(agents).forEach(([name, config]) => {
    const enabled = 'enabled' in config ? config.enabled : true;
    const icon = enabled ? chalk.green('✓') : chalk.gray('✗');
    const agentName = enabled ? chalk.white(name) : chalk.gray(name);
    lines.push(`  ${icon} ${agentName}`);
  });
  
  return lines.join('\n');
}

/**
 * Main validation dashboard
 */
export function renderValidationDashboard(config, report) {
  const hasReport = report && report.gates;
  const passed = report?.valid || false;
  
  const lines = [];
  
  // Header
  const status = passed ? chalk.green.bold('PASS') : chalk.red.bold('FAIL');
  lines.push('');
  lines.push(chalk.cyan.bold('🔍 DCYFR Validation Dashboard') + '                    ' + status);
  lines.push('─'.repeat(80));
  lines.push('');
  
  // Project info
  lines.push(`${chalk.gray('📂 Project:')} ${chalk.white(config.projectName || '(unnamed)')}`);
  lines.push(`${chalk.gray('📊 Version:')} ${chalk.white(config.version)}`);
  lines.push('');
  
  // Validation gates
  if (hasReport) {
    lines.push(chalk.cyan.bold('🎯 Validation Gates'));
    lines.push('');
    report.gates.forEach((gate) => {
      lines.push(renderGateRow(gate));
    });
    lines.push('');
    
    // Overall metrics
    lines.push('─'.repeat(80));
    const gatesPassed = report.gates.filter((g) => g.passed).length;
    const totalViolations = report.gates.reduce((sum, g) => sum + (g.violations || 0), 0);
    const avgCompliance = (report.gates.reduce((sum, g) => sum + (g.compliance || 0), 0) / report.gates.length).toFixed(1);
    
    lines.push('');
    lines.push(`${chalk.gray('Gates Passed:')} ${chalk.green.bold(gatesPassed)}/${report.gates.length}    ${chalk.gray('Total Violations:')} ${chalk.red.bold(totalViolations)}    ${chalk.gray('Avg Compliance:')} ${chalk.cyan.bold(avgCompliance + '%')}`);
    lines.push('');
  }
  
  // Agent summary
  lines.push(renderAgentSummary(config.agents));
  lines.push('');
  
  // Footer
  lines.push('─'.repeat(80));
  lines.push(chalk.gray.italic('Press Q to quit, R to refresh, V for verbose mode'));
  lines.push('');
  
  return lines.join('\n');
}
