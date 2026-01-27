/**
 * AI Framework Configuration
 * 
 * This file demonstrates how to set up @dcyfr/ai in a Next.js application
 */

import { loadConfig, TelemetryEngine, ProviderRegistry } from '@dcyfr/ai';
import type { FrameworkConfig } from '@dcyfr/ai';

/**
 * Load and validate framework configuration
 */
export async function getFrameworkConfig(): Promise<FrameworkConfig> {
  const config = await loadConfig({
    projectRoot: process.cwd(),
    enableEnvOverrides: true,
  });
  
  return config;
}

/**
 * Initialize telemetry engine for tracking AI usage
 */
export async function initializeTelemetry(): Promise<TelemetryEngine> {
  const config = await getFrameworkConfig();
  
  const engine = new TelemetryEngine({
    storage: config.telemetry.storage,
    enabled: config.telemetry.enabled,
    storagePath: config.telemetry.storagePath,
    retentionDays: config.telemetry.retentionDays,
  });
  
  console.log('✅ Telemetry engine initialized');
  return engine;
}

/**
 * Initialize provider registry for multi-provider AI
 */
export async function initializeProviders(): Promise<ProviderRegistry> {
  const config = await getFrameworkConfig();
  
  const registry = new ProviderRegistry({
    providers: config.providers.providers,
    fallbackOrder: config.providers.fallback || [],
    timeout: config.providers.timeout,
    retries: config.providers.retries,
  });
  
  console.log('✅ Provider registry initialized');
  console.log(`   Primary: ${config.providers.primary}`);
  console.log(`   Fallback: ${config.providers.fallback?.join(' → ')}`);
  
  return registry;
}

/**
 * Example: Execute AI task with telemetry and fallback
 */
export async function executeAITask<T>(
  taskName: string,
  taskType: 'feature' | 'bug' | 'refactor',
  executor: (provider: string) => Promise<T>
): Promise<T> {
  const telemetry = await initializeTelemetry();
  const providers = await initializeProviders();
  
  const config = await getFrameworkConfig();
  const primaryProvider = config.providers.primary || 'claude';
  
  // Start telemetry session
  const session = telemetry.startSession(primaryProvider, {
    taskType,
    taskDescription: taskName,
    projectName: config.projectName,
  });
  
  try {
    // Execute with provider fallback
    const result = await providers.executeWithFallback(
      primaryProvider,
      { taskType, taskDescription: taskName },
      executor
    );
    
    // Record success metrics
    session.complete({
      success: true,
      outcome: 'success',
    });
    
    return result;
  } catch (error) {
    // Record failure
    session.complete({
      success: false,
      outcome: 'failed',
    });
    
    throw error;
  }
}
