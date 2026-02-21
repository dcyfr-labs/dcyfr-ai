#!/usr/bin/env node

/**
 * Telemetry Report Generator
 * 
 * Demonstrates using @dcyfr/ai telemetry for analytics
 */

import { TelemetryEngine, loadConfig } from '@dcyfr/ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Format duration in human-readable format
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format percentage
 */
function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Print statistics block for one agent.
 */
async function printAgentBlock(agent, agentSessions, engine) {
  const stats = await engine.getAgentStats(agent, '30d');

  console.log(`\n${agent.toUpperCase()}`);
  console.log(`  Total Sessions: ${stats.totalSessions}`);
  console.log(`  Success Rate: ${formatPercent(stats.successRate)}`);
  console.log(`  Avg Quality: ${formatPercent(stats.avgQuality)}`);
  console.log(`  Total Cost: $${stats.totalCost.toFixed(2)}`);

  const byTaskType = agentSessions.reduce((acc, s) => {
    acc[s.taskType] = (acc[s.taskType] || 0) + 1;
    return acc;
  }, {});

  console.log(`  Task Types:`);
  for (const [type, count] of Object.entries(byTaskType)) {
    console.log(`    - ${type}: ${count}`);
  }
}

/**
 * Print one recent session line.
 */
function printRecentSession(session) {
  const duration = session.endTime
    ? session.endTime - session.startTime
    : Date.now() - session.startTime;

  let status;
  if (session.outcome === 'success') status = '✅';
  else if (session.outcome === 'failed') status = '❌';
  else status = '⏳';

  console.log(`${status} [${session.agent}] ${session.taskDescription}`);
  console.log(`   Type: ${session.taskType} | Duration: ${formatDuration(duration)}`);

  if (session.metrics) {
    console.log(`   Quality: ${formatPercent(session.metrics.tokenCompliance || 0)}`);
  }
  console.log('');
}

/**
 * Generate telemetry report
 */
async function generateReport() {
  console.log('📊 Generating Telemetry Report...\n');
  
  try {
    // Load configuration
    const config = await loadConfig({ projectRoot });
    
    // Initialize telemetry engine
    const engine = new TelemetryEngine({
      storage: config.telemetry.storage,
      storagePath: config.telemetry.storagePath,
      enabled: true,
    });
    
    // Get all sessions
    const sessions = await engine.getAllSessions();
    
    if (sessions.length === 0) {
      console.log('ℹ️  No telemetry sessions found.');
      console.log('   Run some AI tasks to generate data.\n');
      return;
    }
    
    console.log('='.repeat(60));
    console.log('TELEMETRY REPORT');
    console.log('='.repeat(60) + '\n');
    
    console.log(`Project: ${config.projectName}`);
    console.log(`Total Sessions: ${sessions.length}\n`);
    
    // Group sessions by agent
    const byAgent = sessions.reduce((acc, session) => {
      acc[session.agent] = acc[session.agent] || [];
      acc[session.agent].push(session);
      return acc;
    }, {});
    
    // Print agent statistics
    console.log('Agent Statistics:');
    console.log('-'.repeat(60));
    
    for (const [agent, agentSessions] of Object.entries(byAgent)) {
      await printAgentBlock(agent, agentSessions, engine);
    }
    
    // Recent sessions
    console.log('\n' + '-'.repeat(60));
    console.log('Recent Sessions (last 10):');
    console.log('-'.repeat(60) + '\n');
    
    const recent = sessions
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 10);
    
    for (const session of recent) {
      printRecentSession(session);
    }
    
    // Quality trends
    console.log('-'.repeat(60));
    console.log('Quality Metrics:');
    console.log('-'.repeat(60) + '\n');
    
    const completedSessions = sessions.filter(s => s.endTime);
    if (completedSessions.length > 0) {
      const avgTokenCompliance = completedSessions.reduce((sum, s) => 
        sum + (s.metrics?.tokenCompliance || 0), 0
      ) / completedSessions.length;
      
      const avgTestPassRate = completedSessions.reduce((sum, s) => 
        sum + (s.metrics?.testPassRate || 0), 0
      ) / completedSessions.length;
      
      console.log(`Average Token Compliance: ${formatPercent(avgTokenCompliance)}`);
      console.log(`Average Test Pass Rate: ${formatPercent(avgTestPassRate)}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Report generation failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReport();
}
