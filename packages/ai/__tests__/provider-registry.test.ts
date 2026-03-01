/**
 * Provider Registry Tests
 *
 * Validates provider configuration, environment variable discovery,
 * and setup instructions for copilot, github-models, and msty providers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../core/provider-registry.js';

describe('ProviderRegistry', () => {
  describe('Provider Configurations', () => {
    it('should initialize with correct copilot defaults', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'copilot',
        fallbackChain: ['ollama'],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      // Copilot should be the current provider
      expect(registry.getCurrentProvider()).toBe('copilot');
      registry.destroy();
    });

    it('should initialize with correct github-models defaults', () => {
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

    it('should return copilot as always configured', () => {
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.copilot.configured).toBe(true);
    });

    it('should return correct copilot default endpoint', () => {
      delete process.env.MSTY_VIBE_PROXY_URL;
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.copilot.endpoint).toBe('http://localhost:8317');
    });

    it('should respect MSTY_VIBE_PROXY_URL override for copilot', () => {
      process.env.MSTY_VIBE_PROXY_URL = 'http://custom-host:9999';
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.copilot.endpoint).toBe('http://custom-host:9999');
    });

    it('should return correct github-models endpoint', () => {
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars['github-models'].endpoint).toBe('https://models.github.ai/inference');
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

    it('should return correct msty default endpoint', () => {
      delete process.env.MSTY_LOCAL_AI_URL;
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.msty.endpoint).toBe('http://localhost:11964');
    });

    it('should detect msty as configured when MSTY_LOCAL_AI_URL is set', () => {
      process.env.MSTY_LOCAL_AI_URL = 'http://localhost:11964';
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.msty.configured).toBe(true);
    });

    it('should return correct ollama default endpoint', () => {
      delete process.env.OLLAMA_HOST;
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      expect(envVars.ollama.endpoint).toBe('http://localhost:11434');
    });

    it('should include all expected providers', () => {
      const envVars = ProviderRegistry.discoverEnvironmentVariables();
      const providers = Object.keys(envVars);
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('claude');
      expect(providers).toContain('ollama');
      expect(providers).toContain('groq');
      expect(providers).toContain('msty');
      expect(providers).toContain('copilot');
      expect(providers).toContain('github-models');
    });
  });

  describe('getProviderSetupInstructions', () => {
    it('should describe copilot as using Msty Vibe CLI Proxy', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.copilot.description).toContain('Msty Vibe CLI Proxy');
      expect(instructions.copilot.description).toContain('Claude');
    });

    it('should list MSTY_VIBE_PROXY_URL for copilot', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.copilot.environmentVariables).toContain('MSTY_VIBE_PROXY_URL');
    });

    it('should mention port 8317 in copilot instructions', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      const allInstructions = instructions.copilot.instructions.join(' ');
      expect(allInstructions).toContain('8317');
    });

    it('should mention copilot is free with subscription', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      const allInstructions = instructions.copilot.instructions.join(' ');
      expect(allInstructions).toContain('FREE');
    });

    it('should clarify github-models has no Claude', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions['github-models'].description).toContain('no Claude');
    });

    it('should show correct github-models endpoint', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      const allInstructions = instructions['github-models'].instructions.join(' ');
      expect(allInstructions).toContain('models.github.ai');
    });

    it('should describe msty as Local AI server', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      expect(instructions.msty.description).toContain('Local AI');
    });

    it('should show correct msty port in instructions', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      const allInstructions = instructions.msty.instructions.join(' ');
      expect(allInstructions).toContain('11964');
    });

    it('should include all expected providers', () => {
      const instructions = ProviderRegistry.getProviderSetupInstructions();
      const providers = Object.keys(instructions);
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('claude');
      expect(providers).toContain('ollama');
      expect(providers).toContain('groq');
      expect(providers).toContain('msty');
      expect(providers).toContain('copilot');
      expect(providers).toContain('github-models');
    });
  });

  describe('Health Status', () => {
    it('should initialize all providers with available health status', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'claude',
        fallbackChain: ['copilot', 'github-models', 'ollama'],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      const healthStatus = registry.getHealthStatus();
      expect(healthStatus.get('copilot')?.available).toBe(true);
      expect(healthStatus.get('github-models')?.available).toBe(true);
      expect(healthStatus.get('ollama')?.available).toBe(true);
      registry.destroy();
    });
  });

  describe('Provider Config Updates', () => {
    it('should allow updating copilot configuration', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'claude',
        fallbackChain: ['copilot'],
        autoReturn: false,
        healthCheckInterval: 60000,
      });

      // Should not throw
      expect(() => {
        registry.updateProviderConfig('copilot', {
          timeout: 60000,
          maxRetries: 5,
        });
      }).not.toThrow();

      registry.destroy();
    });

    it('should throw for unknown provider', () => {
      const registry = new ProviderRegistry({
        primaryProvider: 'claude',
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
