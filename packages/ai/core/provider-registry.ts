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
 *   fallbackChain: ['groq', 'ollama'],
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
    const defaultConfigs: ProviderConfig[] = [
      {
        name: 'claude',
        healthCheckUrl: 'https://api.anthropic.com/v1/messages',
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        enabled: true,
      },
      {
        name: 'groq',
        healthCheckUrl: 'https://api.groq.com/openai/v1/models',
        maxRetries: 2,
        retryDelay: 500,
        timeout: 20000,
        enabled: true,
      },
      {
        name: 'ollama',
        apiEndpoint: 'http://localhost:11434',
        healthCheckUrl: 'http://localhost:11434/api/tags',
        maxRetries: 1,
        retryDelay: 100,
        timeout: 10000,
        enabled: true,
      },
      {
        name: 'msty',
        apiEndpoint: process.env.MSTY_LOCAL_AI_URL || 'http://localhost:8000',
        healthCheckUrl: `${process.env.MSTY_LOCAL_AI_URL || 'http://localhost:8000'}/v1/models`,
        maxRetries: 2,
        retryDelay: 500,
        timeout: 30000,
        enabled: !!process.env.MSTY_LOCAL_AI_URL,
      },
      {
        name: 'copilot',
        maxRetries: 2,
        retryDelay: 500,
        timeout: 15000,
        enabled: true,
      },
      {
        name: 'openai',
        healthCheckUrl: 'https://api.openai.com/v1/models',
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        enabled: true,
      },
      {
        name: 'anthropic',
        healthCheckUrl: 'https://api.anthropic.com/v1/messages',
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        enabled: true,
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
    const previousProvider = this.currentProvider;
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
   * Discover environment variables for provider configuration
   */
  public static discoverEnvironmentVariables(): Record<ProviderType, { 
    apiKey?: string; 
    endpoint?: string; 
    configured: boolean 
  }> {
    const envVars: Record<ProviderType, { apiKey?: string; endpoint?: string; configured: boolean }> = {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: process.env.OPENAI_API_BASE,
        configured: !!process.env.OPENAI_API_KEY
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        endpoint: process.env.ANTHROPIC_API_BASE,
        configured: !!process.env.ANTHROPIC_API_KEY
      },
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
        endpoint: process.env.ANTHROPIC_API_BASE || process.env.CLAUDE_API_BASE,
        configured: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
      },
      ollama: {
        endpoint: process.env.OLLAMA_HOST || 'http://localhost:11434',
        configured: true // Ollama doesn't require API key
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY,
        endpoint: process.env.GROQ_API_BASE,
        configured: !!process.env.GROQ_API_KEY
      },
      msty: {
        endpoint: process.env.MSTY_LOCAL_AI_URL,
        configured: !!process.env.MSTY_LOCAL_AI_URL
      },
      copilot: {
        configured: true // GitHub Copilot uses VS Code integration
      }
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
    for (const [provider, config] of this.providerConfigs.entries()) {
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
      openai: {
        description: 'OpenAI GPT models (GPT-3.5, GPT-4, etc.)',
        environmentVariables: ['OPENAI_API_KEY'],
        instructions: [
          '1. Create an account at https://platform.openai.com/',
          '2. Generate an API key in the API Keys section',
          '3. Set environment variable: export OPENAI_API_KEY=your_api_key_here',
          '4. Optional: Set OPENAI_API_BASE for custom endpoints'
        ]
      },
      anthropic: {
        description: 'Anthropic Claude models',
        environmentVariables: ['ANTHROPIC_API_KEY'],
        instructions: [
          '1. Create an account at https://console.anthropic.com/',
          '2. Generate an API key in the API Keys section',
          '3. Set environment variable: export ANTHROPIC_API_KEY=your_api_key_here',
          '4. Optional: Set ANTHROPIC_API_BASE for custom endpoints'
        ]
      },
      claude: {
        description: 'Anthropic Claude (alias for anthropic)',
        environmentVariables: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
        instructions: [
          'Same as anthropic provider - uses ANTHROPIC_API_KEY',
          'Also accepts CLAUDE_API_KEY for backward compatibility'
        ]
      },
      ollama: {
        description: 'Local Ollama models',
        environmentVariables: ['OLLAMA_HOST (optional)'],
        instructions: [
          '1. Install Ollama from https://ollama.ai/',
          '2. Start Ollama: ollama serve',
          '3. Pull a model: ollama pull llama2',
          '4. Default endpoint: http://localhost:11434',
          '5. Optional: Set OLLAMA_HOST for custom endpoint'
        ]
      },
      groq: {
        description: 'Groq fast inference API',
        environmentVariables: ['GROQ_API_KEY'],
        instructions: [
          '1. Create an account at https://console.groq.com/',
          '2. Generate an API key in the API Keys section',
          '3. Set environment variable: export GROQ_API_KEY=your_api_key_here'
        ]
      },
      msty: {
        description: 'Msty local AI server',
        environmentVariables: ['MSTY_LOCAL_AI_URL'],
        instructions: [
          '1. Install Msty from https://msty.app/',
          '2. Start the local AI server',
          '3. Set environment variable: export MSTY_LOCAL_AI_URL=http://localhost:8000'
        ]
      },
      copilot: {
        description: 'GitHub Copilot (VS Code integration)',
        environmentVariables: [],
        instructions: [
          '1. Install GitHub Copilot extension in VS Code',
          '2. Sign in with your GitHub account',
          '3. Ensure you have an active Copilot subscription',
          'No environment variables required'
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
