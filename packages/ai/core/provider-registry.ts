/**
 * Provider Registry & Fallback Manager
 * 
 * Automatically detects rate limits and failures in primary providers and falls back to
 * secondary providers with session state preservation.
 * 
 * Features:
 * - Rate limit detection
 * - Automatic session state save/restore
 * - Provider health monitoring
 * - Configurable fallback chain
 * - Context preservation across providers
 * 
 * @module @dcyfr/ai/core/provider-registry
 * @example
 * ```typescript
 * import { ProviderRegistry } from '@dcyfr/ai/core/provider-registry';
 * 
 * const registry = new ProviderRegistry({
 *   primaryProvider: 'claude',
 *   fallbackChain: ['workbench', 'github-models', 'anthropic'],
 *   autoReturn: true,
 *   healthCheckInterval: 60000,
 * });
 * 
 * const result = await registry.executeWithFallback(task, async (provider) => {
 *   // Your execution logic
 *   return { data: 'result' };
 * });
 * ```
 */

import type {
  ProviderType,
  ProviderConfig,
  ProviderHealth,
  TaskContext,
  ExecutionResult,
} from '../types';

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public provider: ProviderType,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Provider unavailable error
 */
export class ProviderUnavailableError extends Error {
  constructor(message: string, public provider: ProviderType) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * Provider Registry configuration
 */
export interface ProviderRegistryConfig {
  primaryProvider: ProviderType;
  fallbackChain: ProviderType[];
  autoReturn: boolean; // Return to primary when available
  healthCheckInterval: number; // ms
  sessionStatePath?: string;
  validationLevel?: 'standard' | 'enhanced' | 'strict';
}

/**
 * Provider Registry - manages multiple AI providers with automatic fallback
 */
export class ProviderRegistry {
  private config: ProviderRegistryConfig;
  private providerConfigs: Map<ProviderType, ProviderConfig>;
  private healthStatus: Map<ProviderType, ProviderHealth>;
  private currentProvider: ProviderType;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: ProviderRegistryConfig) {
    this.config = config;
    this.currentProvider = config.primaryProvider;
    this.providerConfigs = new Map();
    this.healthStatus = new Map();

    // Initialize default provider configurations
    this.initializeProviderConfigs();

    // Start health monitoring if auto-return enabled
    if (config.autoReturn) {
      this.startHealthMonitoring();
    }
  }

  private initializeProviderConfigs(): void {
    const localUrl = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11973/v1';
    const workbenchUrl = process.env.WORKBENCH_BASE_URL;

    const defaultConfigs: ProviderConfig[] = [
      // Tier 0 — Local (local, private, low perf)
      {
        name: 'local',
        apiEndpoint: localUrl,
        healthCheckUrl: `${localUrl}/models`,
        maxRetries: 1,
        retryDelay: 100,
        timeout: 60000,
        enabled: true,
      },
      {
        name: 'ollama',
        apiEndpoint: process.env.OLLAMA_HOST || 'http://localhost:11434',
        healthCheckUrl: `${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/tags`,
        maxRetries: 1,
        retryDelay: 100,
        timeout: 60000,
        enabled: true,
      },
      // Tier 1 — Workbench (networked, private, medium perf)
      {
        name: 'workbench',
        apiEndpoint: workbenchUrl || '',
        healthCheckUrl: workbenchUrl ? `${workbenchUrl}/models` : '',
        maxRetries: 2,
        retryDelay: 500,
        timeout: 120000,
        enabled: !!workbenchUrl,
      },
      // Tier 2 — GitHub Models (remote, included, limited daily use)
      {
        name: 'github-models',
        apiEndpoint: 'https://models.inference.ai.azure.com',
        healthCheckUrl: 'https://models.inference.ai.azure.com/models',
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        enabled: !!process.env.GITHUB_TOKEN,
      },
      // Tier 3 — Anthropic (remote, high perf, high cost)
      {
        name: 'anthropic',
        healthCheckUrl: 'https://api.anthropic.com/v1/models',
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 60000,
        enabled: !!process.env.ANTHROPIC_API_KEY,
      },
    ];

    defaultConfigs.forEach(config => {
      this.providerConfigs.set(config.name, config);
      this.healthStatus.set(config.name, {
        provider: config.name,
        available: true,
        lastChecked: new Date(),
      });
    });
  }

  /**
   * Check provider health status
   */
  private async checkProviderHealth(provider: ProviderType): Promise<ProviderHealth> {
    const config = this.providerConfigs.get(provider);
    if (!config) {
      return {
        provider,
        available: false,
        lastChecked: new Date(),
        error: 'Provider configuration not found',
      };
    }

    if (!config.enabled) {
      return {
        provider,
        available: false,
        lastChecked: new Date(),
        error: 'Provider disabled',
      };
    }

    const startTime = Date.now();

    try {
      if (!config.healthCheckUrl) {
        // For providers without health check URL, assume available
        return {
          provider,
          available: true,
          responseTime: 0,
          lastChecked: new Date(),
        };
      }

      // Simple HEAD request to check availability
      const response = await fetch(config.healthCheckUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(config.timeout),
      });

      const responseTime = Date.now() - startTime;

      // Extract rate limit info from headers (if available)
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
        ? parseInt(response.headers.get('x-ratelimit-remaining')!, 10)
        : undefined;

      const rateLimitReset = response.headers.get('x-ratelimit-reset')
        ? new Date(parseInt(response.headers.get('x-ratelimit-reset')!, 10) * 1000)
        : undefined;

      return {
        provider,
        available: response.ok,
        responseTime,
        lastChecked: new Date(),
        rateLimitRemaining,
        rateLimitReset,
      };
    } catch (error) {
      return {
        provider,
        available: false,
        responseTime: Date.now() - startTime,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      // Check primary provider health
      const primaryHealth = await this.checkProviderHealth(this.config.primaryProvider);
      this.healthStatus.set(this.config.primaryProvider, primaryHealth);

      // If current provider is fallback and primary is healthy, switch back
      if (this.currentProvider !== this.config.primaryProvider && primaryHealth.available) {
        console.warn(
          `✅ Primary provider ${this.config.primaryProvider} available again, switching back...`
        );
        await this.switchProvider(this.config.primaryProvider);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Switch to a different provider
   */
  private async switchProvider(targetProvider: ProviderType): Promise<void> {
    if (this.currentProvider === targetProvider) {
      return;
    }

    console.warn(`🔄 Switching provider: ${this.currentProvider} → ${targetProvider}`);

    // Update current provider
    this.currentProvider = targetProvider;

    console.warn(`✅ Provider switched to ${targetProvider}`);
  }

  /**
   * Execute task with a specific provider
   */
  private async executeWithProvider<T>(
    provider: ProviderType,
    task: TaskContext,
    executor: (provider: ProviderType) => Promise<T>
  ): Promise<ExecutionResult<T>> {
    const config = this.providerConfigs.get(provider);
    if (!config) {
      throw new Error(`Provider configuration not found: ${provider}`);
    }

    const startTime = Date.now();
    let lastError: Error | undefined;

    // Retry logic
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        console.warn(`🔄 Executing with ${provider} (attempt ${attempt}/${config.maxRetries})`);

        const data = await executor(provider);
        const executionTime = Date.now() - startTime;

        return {
          success: true,
          data,
          provider,
          fallbackUsed: provider !== this.config.primaryProvider,
          executionTime,
          validationsPassed: [],
          validationsFailed: [],
        };
      } catch (error) {
        lastError = error as Error;

        // Check if rate limit error
        if (
          error instanceof Error &&
          (error.message.includes('rate limit') || error.message.includes('429'))
        ) {
          throw new RateLimitError(`Rate limit exceeded for ${provider}`, provider);
        }

        // Retry with delay if not last attempt
        if (attempt < config.maxRetries) {
          console.warn(
            `⏳ Retrying in ${config.retryDelay}ms (attempt ${attempt}/${config.maxRetries})...`
          );
          await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        }
      }
    }

    // All retries failed
    throw new ProviderUnavailableError(
      `Provider ${provider} unavailable after ${config.maxRetries} attempts: ${lastError?.message}`,
      provider
    );
  }

  /**
   * Try executing with a single provider
   */
  private async tryProviderExecution<T>(
    provider: ProviderType,
    task: TaskContext,
    executor: (provider: ProviderType) => Promise<T>
  ): Promise<ExecutionResult<T> | null> {
    // Check provider health first
    const health = await this.checkProviderHealth(provider);
    this.healthStatus.set(provider, health);

    if (!health.available) {
      console.warn(`⚠️  Provider ${provider} not available, skipping...`);
      return null;
    }

    // Attempt execution
    const result = await this.executeWithProvider(provider, task, executor);

    // Update current provider if fallback was used
    if (result.fallbackUsed && provider !== this.currentProvider) {
      await this.switchProvider(provider);
    }

    return result;
  }

  /**
   * Execute a task with automatic fallback on failure
   */
  public async executeWithFallback<T>(
    task: TaskContext,
    executor: (provider: ProviderType) => Promise<T>
  ): Promise<ExecutionResult<T>> {
    const providers = [this.currentProvider, ...this.config.fallbackChain];
    let lastError: Error | undefined;

    for (const provider of providers) {
      try {
        const result = await this.tryProviderExecution(provider, task, executor);
        if (result) return result;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof RateLimitError) {
          console.warn(`⏱️  Rate limit hit on ${provider}, trying next provider...`);
          continue;
        }

        if (error instanceof ProviderUnavailableError) {
          console.warn(`❌ Provider ${provider} unavailable, trying next provider...`);
          continue;
        }

        // Unknown error, try next provider
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Error with ${provider}: ${errorMessage}, trying next provider...`);
        continue;
      }
    }

    // All providers failed
    throw new Error(
      `All providers exhausted. Last error: ${lastError?.message || 'Unknown'}`
    );
  }

  /**
   * Get current provider health status
   */
  public getHealthStatus(): Map<ProviderType, ProviderHealth> {
    return new Map(this.healthStatus);
  }

  /**
   * Get current active provider
   */
  public getCurrentProvider(): ProviderType {
    return this.currentProvider;
  }

  /**
   * Resolve provider API version flags for staged rollouts.
   */
  public static resolveApiVersionFlags(): {
    openai: 'v4' | 'v6';
    anthropic: 'v040' | 'v074';
  } {
    const rawOpenAI = (process.env.OPENAI_API_VERSION || 'v6').trim().toLowerCase();
    const rawAnthropic = (process.env.ANTHROPIC_API_VERSION || 'v074').trim().toLowerCase();

    const openai = rawOpenAI === 'v4' ? 'v4' : 'v6';
    const anthropic = rawAnthropic === 'v040' ? 'v040' : 'v074';

    return { openai, anthropic };
  }

  /**
   * Discover environment variables for provider configuration
   */
  public static discoverEnvironmentVariables(): Record<ProviderType, { 
    apiKey?: string; 
    endpoint?: string; 
    apiVersion?: string;
    configured: boolean 
  }> {
    const apiVersions = ProviderRegistry.resolveApiVersionFlags();

    const envVars: Record<
      ProviderType,
      { apiKey?: string; endpoint?: string; apiVersion?: string; configured: boolean }
    > = {
      // Tier 0 — Local
      local: {
        endpoint: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11973/v1',
        configured: true, // Always available; falls back to MLX default endpoint
      },
      ollama: {
        endpoint: process.env.OLLAMA_HOST || 'http://localhost:11434',
        configured: true, // No API key required
      },
      // Tier 1 — Workbench
      workbench: {
        endpoint: process.env.WORKBENCH_BASE_URL,
        configured: !!process.env.WORKBENCH_BASE_URL,
      },
      // Tier 2 — GitHub Models
      'github-models': {
        apiKey: process.env.GITHUB_TOKEN,
        endpoint: 'https://models.inference.ai.azure.com',
        configured: !!process.env.GITHUB_TOKEN,
      },
      // Tier 3 — Anthropic
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        endpoint: process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com',
        apiVersion: apiVersions.anthropic,
        configured: !!process.env.ANTHROPIC_API_KEY,
      },
    };

    return envVars;
  }

  /**
   * Validate provider configuration and availability
   */
  public async validate(): Promise<{
    configured: ProviderType[];
    available: ProviderType[];
    missing: ProviderType[];
    errors: Array<{ provider: ProviderType; error: string }>;
  }> {
    const envVars = ProviderRegistry.discoverEnvironmentVariables();
    const configured: ProviderType[] = [];
    const available: ProviderType[] = [];
    const missing: ProviderType[] = [];
    const errors: Array<{ provider: ProviderType; error: string }> = [];

    // Check all supported providers
    for (const [provider] of this.providerConfigs.entries()) {
      const envConfig = envVars[provider];
      
      if (envConfig?.configured) {
        configured.push(provider);
        
        // Check if provider is actually available
        try {
          const health = await this.checkProviderHealth(provider);
          if (health.available) {
            available.push(provider);
          } else {
            errors.push({
              provider,
              error: health.error || 'Provider health check failed'
            });
          }
        } catch (error) {
          errors.push({
            provider,
            error: error instanceof Error ? error.message : 'Unknown validation error'
          });
        }
      } else {
        missing.push(provider);
      }
    }

    return {
      configured,
      available,
      missing,
      errors
    };
  }

  /**
   * Get provider setup instructions
   */
  public static getProviderSetupInstructions(): Record<ProviderType, {
    description: string;
    environmentVariables: string[];
    instructions: string[];
  }> {
    return {
      // Tier 0 — Local (private, low perf)
      local: {
        description: 'Local inference servers (MLX :11973, LLaMA.cpp :11454)',
        environmentVariables: ['LOCAL_LLM_BASE_URL', 'LOCAL_LLM_MODEL', 'LOCAL_LLM_API_KEY (optional)'],
        instructions: [
          '1. Start MLX server: mlx_lm.server --host 127.0.0.1 --port 11973',
          '   Or LLaMA.cpp: llama-server --host 127.0.0.1 --port 11454 -m <model>',
          '2. Set: export LOCAL_LLM_BASE_URL=http://127.0.0.1:11973/v1',
          '3. Set: export LOCAL_LLM_MODEL=mlx-community/Phi-3.5-mini-instruct-4bit',
          '4. No auth required (LOCAL_LLM_API_KEY defaults to "local")'
        ]
      },
      ollama: {
        description: 'Local Ollama models (OpenAI-compatible, :11434)',
        environmentVariables: ['OLLAMA_HOST (optional)'],
        instructions: [
          '1. Install Ollama: https://ollama.ai/',
          '2. Start: ollama serve',
          '3. Pull a model: ollama pull qwen2.5-coder:14b',
          '4. Default endpoint: http://localhost:11434',
          '5. Optional: export OLLAMA_HOST=http://localhost:11434'
        ]
      },
      // Tier 1 — Workbench (networked, private, medium perf)
      workbench: {
        description: 'RTX 3060 GPU node via Tailscale running Ollama',
        environmentVariables: ['WORKBENCH_BASE_URL', 'WORKBENCH_MODEL (optional)', 'WORKBENCH_API_KEY (optional)'],
        instructions: [
          '1. Ensure Tailscale is connected to the workbench node',
          '2. Set: export WORKBENCH_BASE_URL=http://<tailscale-ip>:11434',
          '3. Optional: export WORKBENCH_MODEL=qwen2.5-coder:14b',
          '4. Optional: export WORKBENCH_API_KEY=<key> (if auth is enabled on the node)'
        ]
      },
      // Tier 2 — GitHub Models (remote, included, limited daily use)
      'github-models': {
        description: 'GitHub Models API — GPT-4o, Llama, Mistral (requires Copilot/Pro)',
        environmentVariables: ['GITHUB_TOKEN'],
        instructions: [
          '1. Requires GitHub Pro or Copilot subscription',
          '2. Use your existing GITHUB_TOKEN (needs models:read scope)',
          '3. Endpoint: https://models.inference.ai.azure.com',
          '4. Available models: gpt-4o, gpt-4o-mini, text-embedding-3-small',
          '5. Daily rate limits apply — use for dev/triage, not production throughput'
        ]
      },
      // Tier 3 — Anthropic (remote, high perf, high cost)
      anthropic: {
        description: 'Anthropic Claude models (Sonnet, Opus, Haiku) — high cost, use sparingly',
        environmentVariables: ['ANTHROPIC_API_KEY'],
        instructions: [
          '1. Create an account at https://console.anthropic.com/',
          '2. Generate an API key in the API Keys section',
          '3. Set: export ANTHROPIC_API_KEY=your_api_key_here',
          '4. Use native @anthropic-ai/sdk — does NOT support OpenAI compat shim',
          '5. Reserve for complex multi-step tasks; prefer Tier 0–2 for automation'
        ]
      }
    };
  }

  /**
   * Manually trigger fallback to next provider
   */
  public async fallbackToNext(): Promise<void> {
    const currentIndex = this.config.fallbackChain.indexOf(this.currentProvider);
    const nextProvider =
      this.config.fallbackChain[currentIndex + 1] || this.config.fallbackChain[0];

    await this.switchProvider(nextProvider);
  }

  /**
   * Manually return to primary provider
   */
  public async returnToPrimary(): Promise<void> {
    await this.switchProvider(this.config.primaryProvider);
  }

  /**
   * Update provider configuration
   */
  public updateProviderConfig(provider: ProviderType, config: Partial<ProviderConfig>): void {
    const existing = this.providerConfigs.get(provider);
    if (!existing) {
      throw new Error(`Provider not found: ${provider}`);
    }

    this.providerConfigs.set(provider, { ...existing, ...config });
  }

  /**
   * Stop health monitoring and cleanup
   */
  public destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}
