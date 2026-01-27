/**
 * Basic Example - Getting Started with DCYFR AI
 * 
 * This example demonstrates the core features of the framework:
 * - Telemetry tracking
 * - Provider fallback
 * - Storage adapters
 */

import { TelemetryEngine, ProviderRegistry } from '@dcyfr/ai';

async function basicExample() {
  console.log('🚀 DCYFR AI Framework - Basic Example\n');

  // 1. Initialize Telemetry
  console.log('1️⃣  Initializing telemetry engine...');
  const telemetry = new TelemetryEngine({ storage: 'memory' });

  // 2. Start a session
  console.log('2️⃣  Starting telemetry session...');
  const session = telemetry.startSession('claude', {
    taskType: 'feature',
    description: 'Implement user authentication',
  });

  console.log(`   Session ID: ${session.getSession().sessionId}`);

  // 3. Record metrics during execution
  console.log('3️⃣  Recording metrics...');
  session.recordMetric('tokenCompliance', 0.98);
  session.recordMetric('testPassRate', 0.995);
  session.recordMetric('filesModified', 3);
  session.recordMetric('linesChanged', 127);

  // 4. Record validations
  console.log('4️⃣  Recording validations...');
  session.recordValidation('typescript', 'pass');
  session.recordValidation('eslint', 'pass');
  session.recordValidation('tests', 'pass');

  // 5. Record cost
  console.log('5️⃣  Updating cost estimate...');
  session.updateCost(15000, 8000); // 15K input, 8K output tokens

  // 6. End session
  console.log('6️⃣  Ending session...');
  const result = await session.end('success');

  console.log(`\n✅ Session completed:`);
  console.log(`   Execution time: ${result.metrics.executionTime}ms`);
  console.log(`   Tokens used: ${result.metrics.tokensUsed}`);
  console.log(`   Estimated cost: $${result.cost.estimatedCost.toFixed(4)}`);

  // 7. Get agent statistics
  console.log('\n7️⃣  Fetching agent statistics...');
  const stats = await telemetry.getAgentStats('claude', '1d');

  console.log(`   Total sessions: ${stats.totalSessions}`);
  console.log(`   Success rate: ${((stats.outcomes.success / stats.totalSessions) * 100).toFixed(1)}%`);
  console.log(`   Avg token compliance: ${(stats.quality.averageTokenCompliance * 100).toFixed(1)}%`);
}

async function providerFallbackExample() {
  console.log('\n\n🔄 Provider Fallback Example\n');

  // 1. Initialize provider registry
  console.log('1️⃣  Initializing provider registry...');
  const registry = new ProviderRegistry({
    primaryProvider: 'claude',
    fallbackChain: ['groq', 'ollama'],
    autoReturn: true,
    healthCheckInterval: 60000,
  });

  console.log(`   Primary provider: ${registry.getCurrentProvider()}`);

  // 2. Execute with automatic fallback
  console.log('2️⃣  Executing task with fallback support...');
  
  try {
    const result = await registry.executeWithFallback(
      {
        description: 'Generate API documentation',
        phase: 'implementation',
        filesInProgress: ['src/api/docs.ts'],
      },
      async (provider) => {
        console.log(`   Using provider: ${provider}`);
        
        // Simulate AI call
        return {
          provider,
          output: 'API documentation generated successfully',
          tokens: 5000,
        };
      }
    );

    console.log(`\n✅ Task completed:`);
    console.log(`   Provider: ${result.provider}`);
    console.log(`   Fallback used: ${result.fallbackUsed}`);
    console.log(`   Execution time: ${result.executionTime}ms`);
  } catch (error) {
    console.error(`❌ Error:`, error instanceof Error ? error.message : error);
  } finally {
    // Clean up
    registry.destroy();
  }
}

async function analyticsExample() {
  console.log('\n\n📊 Analytics Example\n');

  const telemetry = new TelemetryEngine({ storage: 'memory' });

  // Simulate multiple sessions
  console.log('1️⃣  Simulating multiple sessions...');
  
  for (let i = 0; i < 5; i++) {
    const agent = i % 2 === 0 ? 'claude' : 'groq';
    const session = telemetry.startSession(agent, {
      taskType: i % 2 === 0 ? 'feature' : 'bug',
      description: `Task ${i + 1}`,
    });

    session.recordMetric('tokenCompliance', 0.9 + Math.random() * 0.1);
    session.recordMetric('testPassRate', 0.95 + Math.random() * 0.05);
    session.updateCost(5000 + Math.random() * 10000, 2000 + Math.random() * 5000);

    await session.end(i % 3 === 0 ? 'success' : i % 3 === 1 ? 'escalated' : 'success');
  }

  // 2. Compare agents
  console.log('2️⃣  Comparing agent performance...\n');
  const comparison = await telemetry.compareAgents('1d');

  console.log('Recommendations:');
  comparison.recommendations.forEach((rec, i) => {
    console.log(`   ${i + 1}. ${rec}`);
  });

  // 3. Get detailed stats
  console.log('\n3️⃣  Detailed statistics:\n');
  
  for (const [agent, stats] of Object.entries(comparison.agents)) {
    if (stats.totalSessions > 0) {
      console.log(`   ${agent.toUpperCase()}:`);
      console.log(`     Sessions: ${stats.totalSessions}`);
      console.log(`     Success: ${stats.outcomes.success}, Escalated: ${stats.outcomes.escalated}`);
      console.log(`     Avg compliance: ${(stats.quality.averageTokenCompliance * 100).toFixed(1)}%`);
      console.log(`     Total cost: $${stats.cost.totalCost.toFixed(4)}\n`);
    }
  }
}

// Run all examples
async function main() {
  try {
    await basicExample();
    await providerFallbackExample();
    await analyticsExample();
    console.log('\n✨ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

main();
