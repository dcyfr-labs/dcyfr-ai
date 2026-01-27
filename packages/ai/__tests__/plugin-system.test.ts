/**
 * Plugin system tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginLoader, PluginLoadError } from '../plugins/plugin-loader';
import { ValidationFramework } from '../validation/validation-framework';
import type { Plugin, ValidationContext } from '../types';

describe('PluginLoader', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader({ failureMode: 'throw' });
  });

  afterEach(async () => {
    await loader.clearAll();
  });

  it('should load a valid plugin', async () => {
    const mockPlugin: Plugin = {
      manifest: {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
      },
      async onLoad() {
        // Loaded
      },
    };

    await loader.loadPlugin(mockPlugin);

    expect(loader.getPluginCount()).toBe(1);
    expect(loader.getPlugin('test-plugin')).toBeDefined();
  });

  it('should reject invalid manifest', async () => {
    const invalidPlugin = {
      manifest: {
        name: '',
        version: '',
      },
    } as Plugin;

    await expect(loader.loadPlugin(invalidPlugin)).rejects.toThrow();
  });

  it('should reject duplicate plugins', async () => {
    const plugin: Plugin = {
      manifest: {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
      },
    };

    await loader.loadPlugin(plugin);
    await expect(loader.loadPlugin(plugin)).rejects.toThrow('already loaded');
  });

  it('should enable and disable plugins', async () => {
    const plugin: Plugin = {
      manifest: {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
      },
    };

    await loader.loadPlugin(plugin);
    
    loader.disablePlugin('test-plugin');
    const disabled = loader.getPlugin('test-plugin');
    expect(disabled?.enabled).toBe(false);

    loader.enablePlugin('test-plugin');
    const enabled = loader.getPlugin('test-plugin');
    expect(enabled?.enabled).toBe(true);
  });

  it('should call plugin lifecycle hooks', async () => {
    let loadCalled = false;
    let unloadCalled = false;

    const plugin: Plugin = {
      manifest: {
        name: 'lifecycle-plugin',
        version: '1.0.0',
        description: 'Test lifecycle',
      },
      async onLoad() {
        loadCalled = true;
      },
      async onUnload() {
        unloadCalled = true;
      },
    };

    await loader.loadPlugin(plugin);
    expect(loadCalled).toBe(true);

    await loader.unloadPlugin('lifecycle-plugin');
    expect(unloadCalled).toBe(true);
  });

  it('should validate with plugins', async () => {
    const validatorPlugin: Plugin = {
      manifest: {
        name: 'validator',
        version: '1.0.0',
        description: 'Test validator',
      },
      async onValidate(context) {
        return {
          valid: true,
          violations: [],
          warnings: [],
        };
      },
    };

    await loader.loadPlugin(validatorPlugin);

    const context: ValidationContext = {
      projectRoot: '/test',
      files: ['test.ts'],
      config: {},
    };

    const result = await loader.validateAll(context);
    expect(result.valid).toBe(true);
  });

  it('should merge validation results', async () => {
    const plugin1: Plugin = {
      manifest: {
        name: 'plugin1',
        version: '1.0.0',
        description: 'Plugin 1',
      },
      async onValidate() {
        return {
          valid: false,
          violations: [{ type: 'error1', severity: 'error' as const, message: 'Error 1' }],
          warnings: [],
        };
      },
    };

    const plugin2: Plugin = {
      manifest: {
        name: 'plugin2',
        version: '1.0.0',
        description: 'Plugin 2',
      },
      async onValidate() {
        return {
          valid: true,
          violations: [],
          warnings: [{ type: 'warn1', severity: 'warning' as const, message: 'Warning 1' }],
        };
      },
    };

    await loader.loadPlugins([plugin1, plugin2]);

    const context: ValidationContext = {
      projectRoot: '/test',
      files: ['test.ts'],
      config: {},
    };

    const result = await loader.validateAll(context);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('should clear all plugins', async () => {
    const plugin1: Plugin = {
      manifest: { name: 'p1', version: '1.0.0', description: 'P1' },
    };
    const plugin2: Plugin = {
      manifest: { name: 'p2', version: '1.0.0', description: 'P2' },
    };

    await loader.loadPlugins([plugin1, plugin2]);
    expect(loader.getPluginCount()).toBe(2);

    await loader.clearAll();
    expect(loader.getPluginCount()).toBe(0);
  });
});

describe('ValidationFramework', () => {
  let framework: ValidationFramework;

  beforeEach(() => {
    framework = new ValidationFramework({
      gates: [
        {
          name: 'test-gate',
          plugins: ['test-validator'],
          required: true,
          failureMode: 'error',
        },
      ],
    });
  });

  it('should initialize with custom gates', () => {
    const gates = framework.getGates();
    expect(gates).toHaveLength(1);
    expect(gates[0].name).toBe('test-gate');
  });

  it('should add and remove gates', () => {
    framework.addGate({
      name: 'new-gate',
      plugins: ['new-plugin'],
      required: false,
      failureMode: 'warn',
    });

    expect(framework.getGates()).toHaveLength(2);

    framework.removeGate('new-gate');
    expect(framework.getGates()).toHaveLength(1);
  });

  it('should reject duplicate gate names', () => {
    expect(() =>
      framework.addGate({
        name: 'test-gate',
        plugins: ['another'],
        required: false,
        failureMode: 'warn',
      })
    ).toThrow('already exists');
  });

  it('should validate with plugins', async () => {
    const testPlugin: Plugin = {
      manifest: {
        name: 'test-validator',
        version: '1.0.0',
        description: 'Test',
      },
      async onValidate() {
        return {
          valid: true,
          violations: [],
          warnings: [],
        };
      },
    };

    const loader = framework.getLoader();
    await loader.loadPlugin(testPlugin);

    const context: ValidationContext = {
      projectRoot: '/test',
      files: ['test.ts'],
      config: {},
    };

    const report = await framework.validate(context);
    expect(report.valid).toBe(true);
    expect(report.summary.totalGates).toBe(1);
    expect(report.summary.passedGates).toBe(1);
  });

  it('should handle validation failures', async () => {
    const failingPlugin: Plugin = {
      manifest: {
        name: 'test-validator',
        version: '1.0.0',
        description: 'Test',
      },
      async onValidate() {
        return {
          valid: false,
          violations: [{ type: 'test-error', severity: 'error' as const, message: 'Failed' }],
          warnings: [],
        };
      },
    };

    const loader = framework.getLoader();
    await loader.loadPlugin(failingPlugin);

    const context: ValidationContext = {
      projectRoot: '/test',
      files: ['test.ts'],
      config: {},
    };

    const report = await framework.validate(context);
    expect(report.valid).toBe(false);
    expect(report.summary.failedGates).toBe(1);
    expect(report.summary.totalViolations).toBeGreaterThan(0);
  });

  it('should validate specific gates', async () => {
    framework.addGate({
      name: 'gate2',
      plugins: ['plugin2'],
      required: false,
      failureMode: 'warn',
    });

    const context: ValidationContext = {
      projectRoot: '/test',
      files: ['test.ts'],
      config: {},
    };

    const report = await framework.validateGates(['test-gate'], context);
    expect(report.summary.totalGates).toBe(1);
  });
});
