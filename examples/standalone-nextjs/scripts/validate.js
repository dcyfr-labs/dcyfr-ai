#!/usr/bin/env node

/**
 * Custom Validation Runner
 * 
 * Demonstrates using @dcyfr/ai validation framework in a standalone project
 */

import { ValidationFramework, PluginLoader, loadConfig } from '@dcyfr/ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Custom TypeScript Validator Plugin
 */
const typescriptValidator = {
  manifest: {
    name: 'typescript-compiler',
    version: '1.0.0',
    description: 'Validates TypeScript compilation',
  },
  
  async onValidate(context) {
    console.log('🔍 Running TypeScript validation...');
    
    const violations = [];
    const warnings = [];
    
    // Check for .ts/.tsx files
    const tsFiles = context.files.filter(f => 
      f.endsWith('.ts') || f.endsWith('.tsx')
    );
    
    if (tsFiles.length === 0) {
      warnings.push({
        type: 'typescript',
        severity: 'warning',
        message: 'No TypeScript files found',
      });
    } else {
      console.log(`   Found ${tsFiles.length} TypeScript files`);
    }
    
    // Check for tsconfig.json
    const { existsSync } = await import('fs');
    if (!existsSync(join(context.projectRoot, 'tsconfig.json'))) {
      violations.push({
        type: 'typescript',
        severity: 'error',
        message: 'Missing tsconfig.json',
      });
    }
    
    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  },
};

/**
 * Custom Next.js Validator Plugin
 */
const nextjsValidator = {
  manifest: {
    name: 'nextjs-validator',
    version: '1.0.0',
    description: 'Validates Next.js project structure',
  },
  
  async onValidate(context) {
    console.log('🔍 Running Next.js validation...');
    
    const violations = [];
    const warnings = [];
    
    // Check for required files
    const { existsSync } = await import('fs');
    const requiredFiles = [
      'next.config.ts',
      'package.json',
    ];
    
    for (const file of requiredFiles) {
      if (!existsSync(join(context.projectRoot, file))) {
        violations.push({
          type: 'nextjs',
          severity: 'error',
          message: `Missing required file: ${file}`,
          file,
        });
      }
    }
    
    // Check for app directory
    if (!existsSync(join(context.projectRoot, 'app'))) {
      warnings.push({
        type: 'nextjs',
        severity: 'warning',
        message: 'No app directory found (using pages router?)',
      });
    }
    
    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  },
};

/**
 * Main validation function
 */
async function runValidation() {
  console.log('🚀 Starting validation...\n');
  
  try {
    // Load configuration
    const config = await loadConfig({ projectRoot });
    console.log(`📋 Project: ${config.projectName}`);
    console.log(`📁 Root: ${projectRoot}\n`);
    
    // Find all relevant files
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: projectRoot,
      ignore: [
        'node_modules/**',
        '.next/**',
        'dist/**',
        '**/*.d.ts',
      ],
      absolute: true,
    });
    
    console.log(`📄 Found ${files.length} files to validate\n`);
    
    // Create validation framework
    const framework = new ValidationFramework({
      gates: config.validation.gates,
      parallel: config.validation.parallel,
      failFast: config.validation.failFast,
    });
    
    // Load plugins
    const loader = new PluginLoader({
      failureMode: 'warn',
      timeout: 30000,
    });
    
    await loader.loadPlugins([
      typescriptValidator,
      nextjsValidator,
    ]);
    
    // Run validation
    const report = await framework.validate({
      projectRoot,
      files,
      config: config.agents || {},
    });
    
    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60) + '\n');
    
    console.log(`Overall Status: ${report.valid ? '✅ PASS' : '❌ FAIL'}\n`);
    
    console.log('Gates:');
    for (const gate of report.gates) {
      const status = gate.valid ? '✅' : '❌';
      console.log(`  ${status} ${gate.name} (${gate.validPlugins}/${gate.totalPlugins} passed)`);
    }
    
    const summary = report.summary;
    console.log(`\nSummary:`);
    console.log(`  Gates passed: ${summary.passedGates}/${summary.totalGates}`);
    console.log(`  Plugins passed: ${summary.passedPlugins}/${summary.totalPlugins}`);
    console.log(`  Total violations: ${summary.totalViolations}`);
    console.log(`  Total warnings: ${summary.totalWarnings}`);
    console.log(`  Duration: ${summary.duration}ms`);
    
    // Exit with appropriate code
    process.exit(report.valid ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidation();
}
