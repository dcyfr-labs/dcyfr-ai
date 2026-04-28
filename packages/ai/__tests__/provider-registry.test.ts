/**
 * Provider Registry Tests
 *
 * Validates provider configuration, environment variable discovery,
 * and setup instructions for the 4-tier provider architecture:
 *   Tier 0 — local, ollama (private, low perf)
 *   Tier 1 — workbench (private, medium perf)
 *   Tier 2 — github-models (included, limited daily use)
 *   Tier 3 — anthropic (high cost, high perf)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../core/provider-registry.js';

describe('ProviderRegistry', () => {
  describe('Provider Configurations', () => {
    it('should initialize with anthropic as primary provider', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'anthropic',
        fallbackChain: ['github-models', 'ollama'],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      expect(registry.getCurrentProvider()).toBe('anthropic');
      registry.destroy();
    });

    it('should initialize with github-models as primary provider', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'github-models',
        fallbackChain: ['ollama'],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      expect(registry.getCurrentProvider()).toBe('github-models');
      registry.destroy();
    });
  });

  describe('discoverEnvironmentVariables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return local as always configured', () => {
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.local.configured).toBe(true);
    });

    it('should return correct local default endpoint', () => {
      delete process.env.LOCAL_LLM_BASE_URL;
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.local.endpoint).toBe('http://localhost:11973/v1');
    });

    it('should respect LOCAL_LLM_BASE_URL override', () => {
      process.env.LOCAL_LLM_BASE_URL = 'http://custom-host:9999/v1';
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.local.endpoint).toBe('http://custom-host:9999/v1');
    });

    it('should return correct github-models endpoint', () => {
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars['github-models'].endpoint).toBe('https://models.inference.ai.azure.com');
    });

    it('should detect github-models as configured when GITHUB_TOKEN is set', () => {
      process.env.GITHUB_TOKEN = 'ghp_test_token';
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars['github-models'].configured).toBe(true);
      expect(envVars['github-models'].apiKey).toBe('ghp_test_token');
    });

    it('should detect github-models as not configured without GITHUB_TOKEN', () => {
      delete process.env.GITHUB_TOKEN;
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars['github-models'].configured).toBe(false);
    });

    it('should detect anthropic as configured when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.anthropic.configured).toBe(true);
      expect(envVars.anthropic.apiKey).toBe('sk-ant-test');
    });

    it('should detect anthropic as not configured without ANTHROPIC_API_KEY', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.anthropic.configured).toBe(false);
    });

    it('should detect workbench as configured when WORKBENCH_BASE_URL is set', () => {
      process.env.WORKBENCH_BASE_URL = 'http://workbench.local:11434';
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.workbench.configured).toBe(true);
    });

    it('should return correct ollama default endpoint', () => {
      delete process.env.OLLAMA_HOST;
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.ollama.endpoint).toBe('http://localhost:11434');
    });

    it('should include all 5 supported providers', () => {
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      const providers = Object.keys(envVars);
      expect(providers).toContain('local');
      expect(providers).toContain('ollama');
      expect(providers).toContain('workbench');
      expect(providers).toContain('github-models');
      expect(providers).toContain('anthropic');
    });
  });

  describe('getProviderSetupInstructions', () => {
    it('should describe local as MLX/LLaMA.cpp inference servers', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.local.description).toContain('Local inference');
    });

    it('should list LOCAL_LLM_BASE_URL for local', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.local.environmentVariables).toContain('LOCAL_LLM_BASE_URL');
    });

    it('should mention port 11973 in local instructions', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      const allInstructions = instructions.local.instructions.join(' ');
      expect(allInstructions).toContain('11973');
    });

    it('should describe github-models as requiring Copilot/Pro subscription', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions['github-models'].description).toContain('Copilot');
    });

    it('should list GITHUB_TOKEN for github-models', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions['github-models'].environmentVariables).toContain('GITHUB_TOKEN');
    });

    it('should describe anthropic as Claude models', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.anthropic.description).toContain('Claude');
    });

    it('should list ANTHROPIC_API_KEY for anthropic', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.anthropic.environmentVariables).toContain('ANTHROPIC_API_KEY');
    });

    it('should describe workbench as Tailscale GPU node', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.workbench.description).toContain('Tailscale');
    });

    it('should describe ollama as Local Ollama models', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.ollama.description).toContain('Ollama');
    });

    it('should include all 5 supported providers', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      const providers = Object.keys(instructions);
      expect(providers).toContain('local');
      expect(providers).toContain('ollama');
      expect(providers).toContain('workbench');
      expect(providers).toContain('github-models');
      expect(providers).toContain('anthropic');
    });
  });

  describe('Health Status', () => {
    it('should initialize all providers with available health status', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'anthropic',
        fallbackChain: ['github-models', 'ollama'],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      const healthStatus = registry.getHealthStatus();
      expect(healthStatus.get('anthropic')?.available).toBe(true);
      expect(healthStatus.get('github-models')?.available).toBe(true);
      expect(healthStatus.get('ollama')?.available).toBe(true);

      registry.destroy();
    });
  });

  describe('Provider Config Updates', () => {
    it('should allow updating github-models configuration', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'anthropic',
        fallbackChain: ['github-models'],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      // Should not throw
      expect(() => {
        registry.updateProviderConfig('github-models', {
          timeout: 60000,
          maxRetries: 5,
        });
      }).not.toThrow();

      registry.destroy();
    });

    it('should throw for unknown provider', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'anthropic',
        fallbackChain: [],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      expect(() => {
        registry.updateProviderConfig('nonexistent' as any, {});
      }).toThrow('Provider not found');

      registry.destroy();
    });
  });
});
