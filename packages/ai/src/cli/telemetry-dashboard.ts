#!/usr/bin/env node

/**
 * DCYFR Telemetry Dashboard CLI
 * 
 * Provides command-line interface for viewing telemetry data,
 * cost summaries, and model usage breakdowns.
 * 
 * Usage:
 *   npx dcyfr telemetry --agent <name> --period today
 *   npx dcyfr telemetry --breakdown models
 *   npx dcyfr telemetry --export data.csv
 */

import { Command } from 'commander';
import sqlite3 from 'sqlite3';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ProviderRegistry } from '../../core/provider-registry.js';
import type { ProviderType } from '../../types/index.js';

const { Database } = sqlite3;
type DatabaseInstance = InstanceType<typeof Database>;

// Types for telemetry data
interface TelemetryRecord {
  sessionId: string;
  agentType: string;
  taskType: string;
  description: string;
  startTime: string;
  endTime: string;
  status: 'success' | 'failed' | 'timeout';
  modelUsed?: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  duration: number;
}

interface CostSummary {
  taskCount: number;
  totalCost: number;
  avgLatency: number;
  successRate: number;
}

interface ModelBreakdown {
  model: string;
  totalTokens: number;
  totalCost: number;
  callCount: number;
}

/**
 * Runtime validation tool
 */
export class RuntimeValidator {
  
  /**
   * Validate the complete runtime environment
   */
  public async validateRuntime(): Promise<{
    valid: boolean;
    providers: { configured: number; available: number; total: number };
    memory: { configured: boolean };
    telemetry: { configured: boolean };
    issues: string[];
  }> {
    const issues: string[] = [];
    
    console.log('🔍 Validating DCYFR Runtime Environment...\n');

    // 1. Validate Provider Configuration
    console.log('📡 Checking Provider Configuration...');
    const providerRegistry = new ProviderRegistry({
      primaryProvider: 'openai',
      fallbackChain: ['anthropic', 'ollama'],
      autoReturn: false,
      healthCheckInterval: 60000
    });

    const providerValidation = await providerRegistry.validate();
    const envVars = ProviderRegistry.discoverEnvironmentVariables();
    
    console.log(`   ✓ Found ${providerValidation.configured.length} configured providers`);
    console.log(`   ✓ ${providerValidation.available.length} providers available`);
    
    if (providerValidation.configured.length === 0) {
      issues.push('No providers configured - set API keys for OpenAI, Anthropic, or setup Ollama');
    }

    if (providerValidation.available.length === 0) {
      issues.push('No providers available - check API keys and network connectivity');
    }

    // Display provider status
    console.log('\n📊 Provider Status:');
    const setupInstructions = ProviderRegistry.getProviderSetupInstructions();
    
    for (const provider of Object.keys(envVars) as ProviderType[]) {
      const env = envVars[provider];
      const available = providerValidation.available.includes(provider);
      const configured = providerValidation.configured.includes(provider);
      
      const status = available ? '🟢' : configured ? '🟡' : '🔴';
      const statusText = available ? 'Available' : configured ? 'Configured' : 'Not configured';
      
      console.log(`   ${status} ${provider}: ${statusText}`);
      
      if (!configured && setupInstructions[provider]) {
        console.log(`      Missing: ${setupInstructions[provider].environmentVariables.join(', ')}`);
      }
    }

    if (providerValidation.errors.length > 0) {
      console.log('\n⚠️  Provider Errors:');
      for (const error of providerValidation.errors) {
        console.log(`   • ${error.provider}: ${error.error}`);
      }
    }

    // 2. Validate Memory Configuration
    console.log('\n🧠 Checking Memory Configuration...');
    let memoryConfigured = false;
    
    try {
      const memoryEnvVars = [
        'UPSTASH_REDIS_REST_URL',
        'UPSTASH_REDIS_REST_TOKEN',
        'MEM0_API_KEY'
      ];
      
      const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
      const hasMem0 = process.env.MEM0_API_KEY;
      
      if (hasUpstash) {
        console.log('   ✓ Upstash Redis configured');
        memoryConfigured = true;
      } else {
        console.log('   🔴 Upstash Redis not configured');
      }
      
      if (hasMem0) {
        console.log('   ✓ Mem0 AI configured');
        memoryConfigured = true;
      } else {
        console.log('   🔴 Mem0 AI not configured');
      }
      
      if (!memoryConfigured) {
        issues.push('Memory system not configured - set up Upstash Redis or Mem0 AI');
        console.log('   ⚠️  No memory providers configured');
      }
    } catch (error) {
      issues.push(`Memory validation failed: ${error instanceof Error ? error.message : error}`);
    }

    // 3. Validate Telemetry Configuration
    console.log('\n📈 Checking Telemetry Configuration...');
    let telemetryConfigured = true;
    
    const telemetryPath = join(homedir(), '.dcyfr', 'telemetry.db');
    
    try {
      await fs.access(telemetryPath);
      console.log(`   ✓ Telemetry database found: ${telemetryPath}`);
    } catch {
      console.log(`   🟡 Telemetry database not found: ${telemetryPath}`);
      console.log(`   ℹ️  Database will be created on first use`);
    }

    // 4. Summary
    console.log('\n📋 Validation Summary:');
    const valid = issues.length === 0;
    
    if (valid) {
      console.log('   🎉 Runtime environment is properly configured!');
    } else {
      console.log('   ⚠️  Issues found:');
      for (const issue of issues) {
        console.log(`      • ${issue}`);
      }
    }

    return {
      valid,
      providers: {
        configured: providerValidation.configured.length,
        available: providerValidation.available.length,
        total: Object.keys(envVars).length
      },
      memory: { configured: memoryConfigured },
      telemetry: { configured: telemetryConfigured },
      issues
    };
  }

  /**
   * Display provider setup help
   */
  public displayProviderSetup(): void {
    console.log('🔧 Provider Setup Instructions\n');
    
    const instructions = ProviderRegistry.getProviderSetupInstructions();
    
    for (const [provider, info] of Object.entries(instructions) as [ProviderType, any][]) {
      console.log(`📡 ${provider.toUpperCase()}`);
      console.log(`   ${info.description}`);
      
      if (info.environmentVariables.length > 0) {
        console.log(`   Environment Variables: ${info.environmentVariables.join(', ')}`);
      }
      
      console.log('   Setup Steps:');
      for (const step of info.instructions) {
        console.log(`      ${step}`);
      }
      console.log('');
    }
  }
}

/**
 * Telemetry Dashboard CLI
 */
export class TelemetryDashboard {
  private dbPath: string;

  constructor() {
    // Default telemetry database location
    this.dbPath = join(homedir(), '.dcyfr', 'telemetry.db');
  }

  /**
   * Set custom database path
   */
  setDatabasePath(path: string): void {
    this.dbPath = path;
  }

  /**
   * Connect to SQLite telemetry database
   */
  private async connectDatabase(): Promise<DatabaseInstance> {
    return new Promise((resolve, reject) => {
      const db = new Database(this.dbPath, (err: Error | null) => {
        if (err) {
          reject(new Error(`Failed to connect to telemetry database at ${this.dbPath}: ${err.message}`));
        } else {
          resolve(db);
        }
      });
    });
  }

  /**
   * Close database connection
   */
  private async closeDatabase(db: DatabaseInstance): Promise<void> {
    return new Promise((resolve, reject) => {
      db.close((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Convert period string to SQL date filter
   */
  private getDateFilter(period: string): string {
    const now = new Date();
    
    switch (period.toLowerCase()) {
      case 'today':
        const today = now.toISOString().split('T')[0];
        return `DATE(start_time) = '${today}'`;
      
      case 'yesterday':
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return `DATE(start_time) = '${yesterdayStr}'`;
      
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return `start_time >= '${weekAgo.toISOString()}'`;
      
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return `start_time >= '${monthAgo.toISOString()}'`;
      
      default:
        throw new Error(`Unsupported period: ${period}. Use: today, yesterday, week, month`);
    }
  }

  /**
   * Get telemetry records for specific agent and period
   */
  async getAgentTelemetry(agentName?: string, period?: string): Promise<TelemetryRecord[]> {
    const db = await this.connectDatabase();
    
    try {
      let whereClause = '';
      const conditions: string[] = [];
      
      if (agentName) {
        conditions.push(`agent_type = '${agentName}'`);
      }
      
      if (period) {
        conditions.push(this.getDateFilter(period));
      }
      
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      const query = `
        SELECT 
          session_id as sessionId,
          agent_type as agentType,
          task_type as taskType,
          description,
          start_time as startTime,
          end_time as endTime,
          status,
          model_used as modelUsed,
          input_tokens as inputTokens,
          output_tokens as outputTokens,
          total_cost as totalCost,
          duration
        FROM telemetry_sessions 
        ${whereClause}
        ORDER BY start_time DESC
      `;

      return new Promise((resolve, reject) => {
        db.all(query, (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows as TelemetryRecord[]);
          }
        });
      });
    } finally {
      await this.closeDatabase(db);
    }
  }

  /**
   * Calculate cost summary from telemetry records
   */
  calculateCostSummary(records: TelemetryRecord[]): CostSummary {
    if (records.length === 0) {
      return {
        taskCount: 0,
        totalCost: 0,
        avgLatency: 0,
        successRate: 0
      };
    }

    const totalCost = records.reduce((sum, record) => sum + record.totalCost, 0);
    const avgLatency = records.reduce((sum, record) => sum + record.duration, 0) / records.length;
    const successCount = records.filter(record => record.status === 'success').length;
    const successRate = (successCount / records.length) * 100;

    return {
      taskCount: records.length,
      totalCost,
      avgLatency,
      successRate
    };
  }

  /**
   * Get model usage breakdown
   */
  async getModelBreakdown(): Promise<ModelBreakdown[]> {
    const db = await this.connectDatabase();
    
    try {
      const query = `
        SELECT 
          model_used as model,
          SUM(input_tokens + output_tokens) as totalTokens,
          SUM(total_cost) as totalCost,
          COUNT(*) as callCount
        FROM telemetry_sessions 
        WHERE model_used IS NOT NULL
        GROUP BY model_used
        ORDER BY totalCost DESC
      `;

      return new Promise((resolve, reject) => {
        db.all(query, (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows as ModelBreakdown[]);
          }
        });
      });
    } finally {
      await this.closeDatabase(db);
    }
  }

  /**
   * Display cost summary table
   */
  displayCostSummary(summary: CostSummary): void {
    console.log('\n📊 Cost Summary');
    console.log('=' .repeat(60));
    console.log(`Tasks:        ${summary.taskCount.toLocaleString()}`);
    console.log(`Total Cost:   $${summary.totalCost.toFixed(4)}`);
    console.log(`Avg Latency:  ${summary.avgLatency.toFixed(0)}ms`);
    console.log(`Success Rate: ${summary.successRate.toFixed(1)}%`);
    console.log('=' .repeat(60));
  }

  /**
   * Display model breakdown table
   */
  displayModelBreakdown(breakdowns: ModelBreakdown[]): void {
    console.log('\n🤖 Model Usage Breakdown');
    console.log('=' .repeat(80));
    console.log('Model'.padEnd(20) + 'Total Tokens'.padEnd(15) + 'Total Cost'.padEnd(12) + 'Call Count');
    console.log('-' .repeat(80));
    
    for (const breakdown of breakdowns) {
      const model = breakdown.model.padEnd(20);
      const tokens = breakdown.totalTokens.toLocaleString().padEnd(15);
      const cost = `$${breakdown.totalCost.toFixed(4)}`.padEnd(12);
      const calls = breakdown.callCount.toLocaleString();
      
      console.log(`${model}${tokens}${cost}${calls}`);
    }
    console.log('=' .repeat(80));
  }

  /**
   * Export telemetry data to CSV file
   */
  async exportToCsv(filename: string, agentName?: string, period?: string): Promise<void> {
    const records = await this.getAgentTelemetry(agentName, period);
    
    if (records.length === 0) {
      console.log('No telemetry data found to export.');
      return;
    }

    // CSV headers
    const headers = [
      'Session ID',
      'Agent Type', 
      'Task Type',
      'Description',
      'Start Time',
      'End Time',
      'Status',
      'Model Used',
      'Input Tokens',
      'Output Tokens',
      'Total Cost',
      'Duration (ms)'
    ];

    // CSV rows
    const rows = records.map(record => [
      this.escapeCsvField(record.sessionId),
      this.escapeCsvField(record.agentType),
      this.escapeCsvField(record.taskType),
      this.escapeCsvField(record.description),
      this.escapeCsvField(record.startTime),
      this.escapeCsvField(record.endTime),
      this.escapeCsvField(record.status),
      this.escapeCsvField(record.modelUsed || ''),
      record.inputTokens.toString(),
      record.outputTokens.toString(),
      record.totalCost.toString(),
      record.duration.toString()
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Write to file
    await fs.writeFile(filename, csvContent, 'utf-8');
    console.log(`✅ Exported ${records.length} records to ${filename}`);
  }

  /**
   * Escape CSV field (handle commas, quotes, newlines)
   */
  private escapeCsvField(field: string | null | undefined): string {
    if (!field) {
      return '';
    }
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  /**
   * Display agent telemetry data
   */
  async displayAgentTelemetry(agentName?: string, period?: string): Promise<void> {
    try {
      const records = await this.getAgentTelemetry(agentName, period);
      
      if (records.length === 0) {
        console.log('No telemetry data found for the specified criteria.');
        return;
      }

      // Display summary
      const summary = this.calculateCostSummary(records);
      this.displayCostSummary(summary);

      // Display recent records (limit to 10)
      console.log('\n📋 Recent Activity');
      console.log('=' .repeat(100));
      const recentRecords = records.slice(0, 10);
      
      for (const record of recentRecords) {
        const time = new Date(record.startTime).toLocaleString();
        const cost = `$${record.totalCost.toFixed(4)}`;
        const status = record.status === 'success' ? '✅' : '❌';
        const duration = `${record.duration}ms`;
        
        console.log(`${status} ${time} | ${record.agentType} | ${cost} | ${duration}`);
        console.log(`   ${record.description.substring(0, 80)}${record.description.length > 80 ? '...' : ''}`);
        console.log('');
      }
      
      if (records.length > 10) {
        console.log(`... and ${records.length - 10} more records`);
      }
      console.log('=' .repeat(100));
    } catch (error) {
      console.error(`❌ Error retrieving telemetry data: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }
}

/**
 * Main CLI program
 */
async function main() {
  const program = new Command();
  const dashboard = new TelemetryDashboard();
  const validator = new RuntimeValidator();

  program
    .name('dcyfr')
    .description('DCYFR Telemetry Dashboard - View agent performance metrics')
    .version('1.0.0');

  // Telemetry command
  program
    .command('telemetry')
    .description('Display telemetry data and cost analysis')
    .option('--agent <name>', 'Filter by agent name')
    .option('--period <period>', 'Time period (today, yesterday, week, month)', 'week')
    .option('--breakdown <type>', 'Show breakdown by type (models)')
    .option('--export <file>', 'Export data to CSV file')
    .option('--db <path>', 'Custom database path')
    .action(async (options) => {
      // Set custom database path if provided
      if (options.db) {
        dashboard.setDatabasePath(options.db);
      }

      try {
        if (options.breakdown) {
          if (options.breakdown === 'models') {
            const breakdown = await dashboard.getModelBreakdown();
            dashboard.displayModelBreakdown(breakdown);
          } else {
            console.error(`❌ Unsupported breakdown type: ${options.breakdown}`);
            process.exit(1);
          }
        } else if (options.export) {
          await dashboard.exportToCsv(options.export, options.agent, options.period);
        } else {
          await dashboard.displayAgentTelemetry(options.agent, options.period);
        }
      } catch (error) {
        console.error(`❌ Command failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Validate runtime command
  program
    .command('validate-runtime')
    .description('Validate DCYFR runtime environment and provider configuration')
    .option('--setup-help', 'Show provider setup instructions')
    .action(async (options) => {
      try {
        if (options.setupHelp) {
          validator.displayProviderSetup();
        } else {
          const result = await validator.validateRuntime();
          
          if (!result.valid) {
            process.exit(1);
          }
        }
      } catch (error) {
        console.error(`❌ Validation failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Parse command line arguments
  program.parse();
}

// Run CLI if executed directly
import { fileURLToPath } from 'url';
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1])) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}