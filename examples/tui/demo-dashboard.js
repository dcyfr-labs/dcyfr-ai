#!/usr/bin/env node

/**
 * TUI Dashboard Demo
 * Demonstrates terminal dashboard with mock data using chalk
 */

import chalk from 'chalk';
import readline from 'readline';
import { renderValidationDashboard } from '../../bin/tui/validation-dashboard.js';

// Mock configuration
const mockConfig = {
  version: '1.0.0',
  projectName: 'dcyfr-labs',
  telemetry: {
    enabled: true,
  },
  validation: {
    enabled: true,
    parallel: true,
  },
  agents: {
    designTokens: { enabled: true, compliance: 0.9 },
    barrelExports: { enabled: true },
    pageLayout: { enabled: true, targetUsage: 0.9 },
    testData: { enabled: true },
    apiPattern: { enabled: false },
  },
};

// Mock validation report
const mockReport = {
  valid: true,
  gates: [
    {
      name: 'designTokens',
      passed: true,
      compliance: 92.5,
      violations: 2,
      details: 'Found 2 hardcoded spacing values in components/ui/card.tsx',
    },
    {
      name: 'barrelExports',
      passed: true,
      compliance: 100,
      violations: 0,
      details: 'All component directories have proper barrel exports',
    },
    {
      name: 'pageLayout',
      passed: true,
      compliance: 85.0,
      violations: 8,
      details: '8 pages missing PageLayout wrapper',
    },
    {
      name: 'testData',
      passed: true,
      compliance: 99.8,
      violations: 1,
      details: '1 test file missing data validation',
    },
  ],
  timestamp: Date.now(),
  duration: 1234,
};

/**
 * Run demo
 */
async function runDemo() {
  console.log(chalk.cyan.bold('🎨 Starting Terminal Dashboard Demo...\n'));
  console.log('This demonstrates the interactive validation dashboard.');
  console.log(chalk.gray('Press Q to quit, R to simulate refresh\n'));

  // Display dashboard
  console.clear();
  console.log(renderValidationDashboard(mockConfig, mockReport));

  // Setup keyboard input
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      console.log(chalk.yellow('\n\n👋 Thanks for trying the TUI dashboard!\n'));
      process.exit(0);
    } else if (key.name === 'r') {
      // Simulate refresh with updated data
      mockReport.gates[0].compliance = Math.random() * 100;
      mockReport.gates[2].compliance = Math.random() * 100;
      mockReport.gates[0].violations = Math.floor(Math.random() * 5);
      mockReport.gates[2].violations = Math.floor(Math.random() * 10);
      mockReport.valid = mockReport.gates.every((g) => g.passed);

      console.clear();
      console.log(renderValidationDashboard(mockConfig, mockReport));
    }
  });
}

// Run demo
runDemo().catch((error) => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});
