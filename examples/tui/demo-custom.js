#!/usr/bin/env node

/**
 * Custom TUI Component Demo
 * Shows how to build custom dashboards with chalk and cli-table3
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import readline from 'readline';
import { getStatusIcon, renderProgressBar } from '../../bin/tui/validation-dashboard.js';

/**
 * Render metric card
 */
function renderMetricCard(title, value, trend) {
  const trendIcon = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  let trendColor = chalk.gray;
  if (trend > 0) trendColor = chalk.green;
  else if (trend < 0) trendColor = chalk.red;

  return [
    chalk.gray(title),
    chalk.cyan.bold(value.toString()),
    trendColor(`${trendIcon} ${Math.abs(trend)}%`),
  ];
}

/**
 * Render custom dashboard
 */
function renderDashboard(metrics) {
  console.clear();
  
  const lines = [];
  
  // Header
  lines.push('');
  lines.push(chalk.cyan.bold('📊 Custom TUI Dashboard') + ' '.repeat(40) + chalk.gray(new Date().toLocaleTimeString()));
  lines.push('─'.repeat(80));
  lines.push('');
  
  // Metrics table
  const metricsTable = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Value'), chalk.cyan('Trend')],
    colWidths: [25, 20, 20],
    style: {
      head: [],
      border: ['gray'],
    },
  });

  metrics.forEach((metric) => {
    metricsTable.push(renderMetricCard(metric.title, metric.value, metric.trend));
  });

  lines.push(metricsTable.toString());
  lines.push('');
  
  // System Resources
  lines.push(chalk.cyan.bold('⚙️  System Resources'));
  lines.push('');
  lines.push(`  CPU    ${renderProgressBar(45, 100, 40)}`);
  lines.push(`  Memory ${renderProgressBar(72, 100, 40)}`);
  lines.push(`  Disk   ${renderProgressBar(33, 100, 40)}`);
  lines.push('');
  
  // Services Status
  lines.push('─'.repeat(80));
  lines.push('');
  lines.push(chalk.cyan.bold('🔧 Services'));
  lines.push('');
  lines.push(`  ${getStatusIcon('pass')} API Server`);
  lines.push(`  ${getStatusIcon('pass')} Database`);
  lines.push(`  ${getStatusIcon('warn')} Cache`);
  lines.push('');
  
  // Footer
  lines.push('─'.repeat(80));
  lines.push(chalk.gray.italic('Press Q to quit, R to refresh with random data'));
  lines.push('');
  
  console.log(lines.join('\n'));
}

/**
 * Run demo
 */
async function runDemo() {
  console.log(chalk.cyan.bold('🎨 Starting Custom TUI Component Demo...\n'));
  console.log(chalk.gray('This demonstrates custom CLI dashboards with chalk and cli-table3.'));
  console.log(chalk.gray('Press Q to quit, R to refresh with random data\n'));

  // Initial metrics
  let metrics = [
    { title: 'Requests/sec', value: 1234, trend: 5 },
    { title: 'Avg Latency', value: '45ms', trend: -3 },
    { title: 'Error Rate', value: '0.1%', trend: 0 },
    { title: 'Active Users', value: 847, trend: 12 },
  ];

  // Initial render
  await new Promise(resolve => setTimeout(resolve, 1000));
  renderDashboard(metrics);

  // Setup keyboard input
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      console.log(chalk.cyan('\n👋 Thanks for trying the custom TUI demo!\n'));
      process.exit(0);
    } else if (key.name === 'r') {
      // Refresh with random data
      metrics = [
        {
          title: 'Requests/sec',
          value: Math.floor(Math.random() * 2000),
          trend: Math.floor(Math.random() * 20 - 10),
        },
        {
          title: 'Avg Latency',
          value: `${Math.floor(Math.random() * 100)}ms`,
          trend: Math.floor(Math.random() * 20 - 10),
        },
        {
          title: 'Error Rate',
          value: `${(Math.random() * 2).toFixed(1)}%`,
          trend: Math.floor(Math.random() * 10 - 5),
        },
        {
          title: 'Active Users',
          value: Math.floor(Math.random() * 1000),
          trend: Math.floor(Math.random() * 30 - 15),
        },
      ];

      renderDashboard(metrics);
    }
  });
}

// Run demo
runDemo().catch((error) => {
  console.error(chalk.red('❌ Demo failed:'), error);
  process.exit(1);
});
