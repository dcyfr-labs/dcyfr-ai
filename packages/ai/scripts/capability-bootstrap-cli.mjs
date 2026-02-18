#!/usr/bin/env node

/**
 * DCYFR Agent Capability Bootstrap CLI
 * TLP:CLEAR
 * 
 * Command-line tool for automated agent capability manifest generation.
 * 
 * Usage:
 *   dcyfr-bootstrap <agent-file> [options]
 *   dcyfr-bootstrap --batch <directory> [options]
 * 
 * @version 1.0.0
 * @date 2026-02-14
 */

import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import {
  CapabilityBootstrap,
  type AgentSource,
  type CapabilityDetectionConfig,
  type ConfidenceInitConfig,
} from '../src/capability-bootstrap.js';

interface CLIOptions {
  agent?: string;
  batch?: string;
  output?: string;
  tier?: 'workspace' | 'production' | 'generic';
  confidence?: number;
  gradual?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--batch':
      case '-b':
        options.batch = args[++i];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--tier':
      case '-t':
        options.tier = args[++i] as 'workspace' | 'production' | 'generic';
        break;
      case '--confidence':
      case '-c':
        options.confidence = parseFloat(args[++i]);
        break;
      case '--gradual':
      case '-g':
        options.gradual = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          options.agent = arg;
        }
    }
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
DCYFR Agent Capability Bootstrap CLI
=====================================

Generate capability manifests for AI agents automatically.

USAGE:
  dcyfr-bootstrap <agent-file> [options]
  dcyfr-bootstrap --batch <directory> [options]

OPTIONS:
  -h, --help              Show this help message
  -b, --batch <dir>       Process all agent files in directory
  -o, --output <dir>      Output directory for manifests (default: ./manifests)
  -t, --tier <tier>       Agent tier: workspace|production|generic (default: generic)
  -c, --confidence <num>  Initial confidence level 0-1 (default: 0.50)
  -g, --gradual           Enable gradual validation approach
  -v, --verbose           Show detailed output
  -d, --dry-run           Preview without writing files

EXAMPLES:
  # Bootstrap single agent
  dcyfr-bootstrap ./agents/my-agent.md
  
  # Bootstrap all agents in directory
  dcyfr-bootstrap --batch ./agents --output ./manifests
  
  # Bootstrap with production tier and gradual validation
  dcyfr-bootstrap agent.md --tier production --gradual
  
  # Preview capability detection without writing
  dcyfr-bootstrap agent.md --dry-run --verbose

MORE INFO:
  https://github.com/dcyfr/dcyfr-ai#capability-bootstrap
`);
}

function displayBootstrapResults(result, verbose) {
  console.log(`\n✅ ${result.agentId}`);
  console.log(`   Capabilities detected: ${result.detectedCapabilities.length}`);
  console.log(`   Overall confidence: ${result.manifest.overall_confidence?.toFixed(2)}`);

  if (verbose) {
    console.log(`\n📋 Detected Capabilities:`);
    for (const detected of result.detectedCapabilities) {
      console.log(`   • ${detected.capabilityId} (${(detected.detectionConfidence * 100).toFixed(0)}%)`);
      if (detected.matchedKeywords.length > 0) {
        console.log(`     Keywords: ${detected.matchedKeywords.slice(0, 3).join(', ')}${detected.matchedKeywords.length > 3 ? '...' : ''}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings:`);
    result.warnings.forEach(w => console.log(`   ${w}`));
  }

  if (result.suggestions.length > 0 && verbose) {
    console.log(`\n💡 Suggestions:`);
    result.suggestions.forEach(s => console.log(`   ${s}`));
  }
}

async function bootstrapSingleAgent(
  filePath,
  options,
) {
  const verbose = options.verbose || false;
  const dryRun = options.dryRun || false;
  
  if (verbose) {
    console.log(`\n🔍 Analyzing agent: ${filePath}`);
  }
  
  // Configure bootstrap
  const detectionConfig = {
    agentTier: options.tier || 'generic',
    minimumKeywordMatches: 2,
    fuzzyMatching: true,
  };
  
  const confidenceConfig = {
    initialConfidence: options.confidence || 0.50,
    gradualValidation: options.gradual || false,
  };
  
  const bootstrap = new CapabilityBootstrap(detectionConfig, confidenceConfig);
  
  // Bootstrap the agent
  const source = { type: 'file', filePath };
  const result = await bootstrap.bootstrap(source);
  
  // Display results
  displayBootstrapResults(result, verbose);
  
  // Write manifest
  if (!dryRun) {
    const outputDir = options.output || './manifests';
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }
    
    const manifestPath = join(outputDir, `${result.agentId}.json`);
    await writeFile(manifestPath, JSON.stringify(result.manifest, null, 2));
    console.log(`\n📦 Manifest written to: ${manifestPath}`);
  } else {
    console.log(`\n📦 [DRY RUN] Would write to: ${options.output || './manifests'}/${result.agentId}.json`);
  }
}

async function bootstrapBatch(
  directory: string,
  options: CLIOptions,
): Promise<void> {
  const verbose = options.verbose || false;
  const dryRun = options.dryRun || false;
  
  console.log(`\n🚀 Batch bootstrapping agents from: ${directory}\n`);
  
  // Find all agent files
  const files = await readdir(directory);
  const agentFiles = files.filter(f => 
    f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.ts')
  );
  
  if (agentFiles.length === 0) {
    console.log(`⚠️  No agent files found in ${directory}`);
    return;
  }
  
  console.log(`📋 Found ${agentFiles.length} agent files\n`);
  
  // Configure bootstrap
  const detectionConfig: CapabilityDetectionConfig = {
    agentTier: options.tier || 'generic',
    minimumKeywordMatches: 2,
    fuzzyMatching: true,
  };
  
  const confidenceConfig: ConfidenceInitConfig = {
    initialConfidence: options.confidence || 0.50,
    gradualValidation: options.gradual || false,
  };
  
  const bootstrap = new CapabilityBootstrap(detectionConfig, confidenceConfig);
  
  // Process each agent
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of agentFiles) {
    try {
      const filePath = join(directory, file);
      const source: AgentSource = { type: 'file', filePath };
      const result = await bootstrap.bootstrap(source);
      
      console.log(`✅ ${result.agentId} - ${result.detectedCapabilities.length} capabilities`);
      
      if (!dryRun) {
        const outputDir = options.output || './manifests';
        if (!existsSync(outputDir)) {
          await mkdir(outputDir, { recursive: true });
        }
        
        const manifestPath = join(outputDir, `${result.agentId}.json`);
        await writeFile(manifestPath, JSON.stringify(result.manifest, null, 2));
      }
      
      successCount++;
    } catch (error) {
      console.error(`❌ ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      errorCount++;
    }
  }
  
  // Summary
  console.log(`\n🎉 Batch Bootstrap Complete!`);
  console.log(`✅ Success: ${successCount}`);
  if (errorCount > 0) {
    console.log(`❌ Errors: ${errorCount}`);
  }
  
  if (!dryRun) {
    console.log(`📦 Manifests written to: ${options.output || './manifests'}`);
  } else {
    console.log(`📦 [DRY RUN] Would write to: ${options.output || './manifests'}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  if (options.help || args.length === 0) {
    printHelp();
    process.exit(0);
  }
  
  try {
    if (options.batch) {
      await bootstrapBatch(options.batch, options);
    } else if (options.agent) {
      await bootstrapSingleAgent(options.agent, options);
    } else {
      console.error('❌ Error: Must specify either <agent-file> or --batch <directory>');
      console.log('   Run with --help for usage information');
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Bootstrap failed:`, error);
    process.exit(1);
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as runCLI };
