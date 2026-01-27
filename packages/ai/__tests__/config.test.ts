/**
 * Configuration System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader, loadConfig } from '../config/loader.js';
import { FrameworkConfigSchema, DEFAULT_CONFIG } from '../config/schema.js';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Configuration System', () => {
  let testDir: string;
  
  beforeEach(async () => {
    testDir = join(tmpdir(), `dcyfr-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Cleanup test files
    try {
      const { rm } = await import('fs/promises');
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Schema Validation', () => {
    it('should validate default config', () => {
      const result = FrameworkConfigSchema.safeParse(DEFAULT_CONFIG);
      expect(result.success).toBe(true);
    });

    it('should validate minimal config', () => {
      const minimalConfig = {
        version: '1.0.0',
      };
      const result = FrameworkConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid config', () => {
      const invalidConfig = {
        version: 123, // Should be string
        telemetry: {
          retentionDays: -1, // Should be positive
        },
      };
      const result = FrameworkConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should apply defaults for missing fields', () => {
      const partialConfig = {
        projectName: 'test-app',
      };
      const result = FrameworkConfigSchema.parse(partialConfig);
      expect(result.telemetry.enabled).toBe(true);
      expect(result.providers.primary).toBe('claude');
      expect(result.agents.designTokens.compliance).toBe(0.90);
    });
  });

  describe('ConfigLoader - YAML', () => {
    it('should load YAML config file', async () => {
      const yamlConfig = `
version: '1.0.0'
projectName: yaml-test
telemetry:
  enabled: false
agents:
  designTokens:
    compliance: 0.95
`;
      await writeFile(join(testDir, '.dcyfr.yaml'), yamlConfig, 'utf-8');
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      const config = await loader.load();
      
      expect(config.projectName).toBe('yaml-test');
      expect(config.telemetry.enabled).toBe(false);
      expect(config.agents.designTokens.compliance).toBe(0.95);
    });

    it('should handle .yml extension', async () => {
      const yamlConfig = `
version: '1.0.0'
projectName: yml-test
`;
      await writeFile(join(testDir, '.dcyfr.yml'), yamlConfig, 'utf-8');
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      const config = await loader.load();
      
      expect(config.projectName).toBe('yml-test');
    });
  });

  describe('ConfigLoader - JSON', () => {
    it('should load JSON config file', async () => {
      const jsonConfig = {
        version: '1.0.0',
        projectName: 'json-test',
        providers: {
          primary: 'groq',
        },
      };
      await writeFile(
        join(testDir, '.dcyfr.json'),
        JSON.stringify(jsonConfig),
        'utf-8'
      );
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      const config = await loader.load();
      
      expect(config.projectName).toBe('json-test');
      expect(config.providers.primary).toBe('groq');
    });
  });

  describe('ConfigLoader - package.json', () => {
    it('should load config from package.json', async () => {
      const packageJson = {
        name: 'test-package',
        dcyfr: {
          version: '1.0.0',
          projectName: 'pkg-test',
          validation: {
            enabled: false,
          },
        },
      };
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify(packageJson),
        'utf-8'
      );
      
      const loader = new ConfigLoader({ 
        projectRoot: testDir,
        enablePackageJson: true,
      });
      const config = await loader.load();
      
      expect(config.projectName).toBe('pkg-test');
      expect(config.validation.enabled).toBe(false);
    });

    it('should skip package.json if disabled', async () => {
      const packageJson = {
        name: 'test-package',
        dcyfr: {
          projectName: 'should-not-load',
        },
      };
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify(packageJson),
        'utf-8'
      );
      
      const loader = new ConfigLoader({ 
        projectRoot: testDir,
        enablePackageJson: false,
      });
      const config = await loader.load();
      
      expect(config.projectName).toBeUndefined();
    });
  });

  describe('Three-Layer Merge', () => {
    it('should merge framework defaults with project config', async () => {
      const yamlConfig = `
version: '1.0.0'
projectName: merge-test
telemetry:
  retentionDays: 60
`;
      await writeFile(join(testDir, '.dcyfr.yaml'), yamlConfig, 'utf-8');
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      const config = await loader.load();
      
      // From project config
      expect(config.projectName).toBe('merge-test');
      expect(config.telemetry.retentionDays).toBe(60);
      
      // From defaults
      expect(config.telemetry.enabled).toBe(true);
      expect(config.telemetry.storage).toBe('file');
      expect(config.providers.primary).toBe('claude');
    });

    it('should apply environment variable overrides', async () => {
      const yamlConfig = `
version: '1.0.0'
projectName: env-test
`;
      await writeFile(join(testDir, '.dcyfr.yaml'), yamlConfig, 'utf-8');
      
      // Set environment variable
      process.env.DCYFR_TELEMETRY_ENABLED = 'false';
      process.env.DCYFR_PROVIDERS_PRIMARY = 'groq';
      
      const loader = new ConfigLoader({ 
        projectRoot: testDir,
        enableEnvOverrides: true,
      });
      const config = await loader.load();
      
      // Environment overrides should win
      expect(config.telemetry.enabled).toBe(false);
      expect(config.providers.primary).toBe('groq');
      
      // Cleanup
      delete process.env.DCYFR_TELEMETRY_ENABLED;
      delete process.env.DCYFR_PROVIDERS_PRIMARY;
    });

    it('should deep merge nested objects', async () => {
      const yamlConfig = `
version: '1.0.0'
agents:
  designTokens:
    compliance: 0.95
    patterns:
      spacing:
        - CUSTOM.SPACING
`;
      await writeFile(join(testDir, '.dcyfr.yaml'), yamlConfig, 'utf-8');
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      const config = await loader.load();
      
      // Project override
      expect(config.agents.designTokens.compliance).toBe(0.95);
      
      // Deep merge preserves other defaults
      expect(config.agents.designTokens.enabled).toBe(true);
      expect(config.agents.designTokens.autofix).toBe(false);
    });
  });

  describe('Config File Priority', () => {
    it('should prefer .dcyfr.yaml over .dcyfr.json', async () => {
      await writeFile(
        join(testDir, '.dcyfr.yaml'),
        'projectName: yaml-priority',
        'utf-8'
      );
      await writeFile(
        join(testDir, '.dcyfr.json'),
        JSON.stringify({ projectName: 'json-priority' }),
        'utf-8'
      );
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      const config = await loader.load();
      
      expect(config.projectName).toBe('yaml-priority');
    });

    it('should use custom config file if specified', async () => {
      await writeFile(
        join(testDir, 'custom.yaml'),
        'projectName: custom-config',
        'utf-8'
      );
      
      const loader = new ConfigLoader({ 
        projectRoot: testDir,
        configFile: 'custom.yaml',
      });
      const config = await loader.load();
      
      expect(config.projectName).toBe('custom-config');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid YAML', async () => {
      await writeFile(
        join(testDir, '.dcyfr.yaml'),
        'invalid: yaml: content:',
        'utf-8'
      );
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      await expect(loader.load()).rejects.toThrow();
    });

    it('should throw error for invalid JSON', async () => {
      await writeFile(
        join(testDir, '.dcyfr.json'),
        '{ invalid json }',
        'utf-8'
      );
      
      const loader = new ConfigLoader({ projectRoot: testDir });
      await expect(loader.load()).rejects.toThrow();
    });

    it('should throw error if custom config file not found', async () => {
      const loader = new ConfigLoader({ 
        projectRoot: testDir,
        configFile: 'nonexistent.yaml',
      });
      
      await expect(loader.load()).rejects.toThrow('Config file not found');
    });
  });

  describe('Convenience Function', () => {
    it('should work via loadConfig helper', async () => {
      const yamlConfig = `
version: '1.0.0'
projectName: helper-test
`;
      await writeFile(join(testDir, '.dcyfr.yaml'), yamlConfig, 'utf-8');
      
      const config = await loadConfig({ projectRoot: testDir });
      expect(config.projectName).toBe('helper-test');
    });
  });
});
