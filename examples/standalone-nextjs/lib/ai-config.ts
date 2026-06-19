/**
 * AI Framework Configuration
 *
 * This file demonstrates how to set up @dcyfr/ai in a Next.js application.
 */

import { loadConfig, TelemetryEngine, ProviderRegistry } from '@dcyfr/ai';
import type {
  AgentType,
  ProviderType,
  TaskType,
  TaskOutcome,
  TaskContext,
} from '@dcyfr/ai';

/**
 * Load and validate framework configuration.
 *
 * The return type is derived from `loadConfig` itself rather than the package's
 * exported `FrameworkConfig`: the two are structurally different in `@dcyfr/ai`
 * (the exported `FrameworkConfig` is a slimmed-down shape, while `loadConfig`
 * resolves the full validated config this example reads from, e.g.
 * `config.providers` and `config.telemetry.storagePath`). Tracking
 * `loadConfig`'s actual return keeps this type-safe without a cast.
 */
export async function getFrameworkConfig(): ReturnType<typeof loadConfig> {
  const config = await loadConfig({
    projectRoot: process.cwd(),
    enableEnvOverrides: true,
  });

  return config;
}

/**
 * Initialize the telemetry engine for tracking AI usage.
 */
export async function initializeTelemetry(): Promise<TelemetryEngine> {
  const config = await getFrameworkConfig();

  // The engine is constructed with the storage backend and base path; the
  // `enabled` / `retentionDays` config knobs are applied by the engine itself.
  const engine = new TelemetryEngine({
    storage: config.telemetry.storage,
    basePath: config.telemetry.storagePath,
  });

  console.log('✅ Telemetry engine initialized');
  return engine;
}

/**
 * Initialize the provider registry for multi-provider AI with fallback.
 */
export async function initializeProviders(): Promise<ProviderRegistry> {
  const config = await getFrameworkConfig();

  // `config.providers.primary` / `.fallback` are typed as plain strings by the
  // config schema; narrow them to the provider union the registry expects.
  const registry = new ProviderRegistry({
    primaryProvider: config.providers.primary as ProviderType,
    fallbackChain: config.providers.fallback as ProviderType[],
    autoReturn: true,
    healthCheckInterval: 60_000,
  });

  console.log('✅ Provider registry initialized');
  console.log(`   Primary: ${config.providers.primary}`);
  console.log(`   Fallback: ${config.providers.fallback.join(' → ')}`);

  return registry;
}

/**
 * Example: execute an AI task with telemetry and automatic provider fallback.
 */
export async function executeAITask<T>(
  taskName: string,
  taskType: TaskType,
  executor: (provider: ProviderType) => Promise<T>
): Promise<T> {
  const telemetry = await initializeTelemetry();
  const providers = await initializeProviders();

  const config = await getFrameworkConfig();
  const primaryProvider = (config.providers.primary || 'claude') as ProviderType;

  // Start a telemetry session. `startSession` tracks against an agent (a subset
  // of providers), so the primary provider doubles as the session agent.
  const session = telemetry.startSession(primaryProvider as AgentType, {
    taskType,
    description: taskName,
  });

  // Describe the work for the provider-fallback executor.
  const task: TaskContext = {
    description: taskName,
    phase: 'implementation',
    filesInProgress: [],
  };

  // Record the outcome exactly once, on every exit path.
  let outcome: TaskOutcome = 'failed';
  try {
    const result = await providers.executeWithFallback(task, executor);

    if (result.success && result.data !== undefined) {
      outcome = 'success';
      return result.data;
    }

    throw result.error ?? new Error(`AI task "${taskName}" produced no result`);
  } finally {
    await session.end(outcome);
  }
}
