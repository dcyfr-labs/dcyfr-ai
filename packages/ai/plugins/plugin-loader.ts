/**
 * Plugin Loader - Dynamic plugin loading and lifecycle management
 * 
 * Handles loading, validation, and execution of plugins with manifest validation
 * and error isolation.
 * 
 * @module @dcyfr/ai/plugins/plugin-loader
 * @example
 * ```typescript
 * import { PluginLoader } from '@dcyfr/ai/plugins/plugin-loader';
 * 
 * const loader = new PluginLoader();
 * 
 * // Load a plugin
 * await loader.loadPlugin('@dcyfr/agents/design-token-validator');
 * 
 * // Execute plugin validation
 * const result = await loader.validateAll({
 *   projectRoot: '/path/to/project',
 *   files: ['src/app.ts'],
 *   config: {},
 * });
 * ```
 */

import type { Plugin, PluginManifest, ValidationContext, ValidationResult } from '../types';

/**
 * Plugin load error
 */
export class PluginLoadError extends Error {
  constructor(message: string, public pluginName: string, public cause?: Error) {
    super(message);
    this.name = 'PluginLoadError';
  }
}

/**
 * Plugin validation error
 */
export class PluginValidationError extends Error {
  constructor(message: string, public pluginName: string) {
    super(message);
    this.name = 'PluginValidationError';
  }
}

/**
 * Plugin loader configuration
 */
export interface PluginLoaderConfig {
  autoLoad?: boolean;
  failureMode?: 'throw' | 'warn' | 'silent';
  timeout?: number; // ms
}

/**
 * Loaded plugin wrapper
 */
interface LoadedPlugin {
  name: string;
  manifest: PluginManifest;
  plugin: Plugin;
  loaded: Date;
  enabled: boolean;
}

/**
 * Plugin Loader - manages plugin lifecycle
 */
export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private config: PluginLoaderConfig;

  constructor(config: PluginLoaderConfig = {}) {
    this.config = {
      autoLoad: false,
      failureMode: 'throw',
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Load a plugin by module path or object
   */
  async loadPlugin(pluginPath: string | Plugin): Promise<void> {
    try {
      let plugin: Plugin;

      if (typeof pluginPath === 'string') {
        // Dynamic import
        const module = await import(pluginPath);
        plugin = module.default || module;
      } else {
        plugin = pluginPath;
      }

      // Validate manifest
      this.validateManifest(plugin.manifest);

      // Check for duplicates
      if (this.plugins.has(plugin.manifest.name)) {
        throw new PluginValidationError(
          `Plugin '${plugin.manifest.name}' is already loaded`,
          plugin.manifest.name
        );
      }

      // Call onLoad hook if present
      if (plugin.onLoad) {
        await this.executeWithTimeout(
          () => plugin.onLoad!(),
          this.config.timeout!,
          `onLoad hook for ${plugin.manifest.name}`
        );
      }

      // Store plugin
      this.plugins.set(plugin.manifest.name, {
        name: plugin.manifest.name,
        manifest: plugin.manifest,
        plugin,
        loaded: new Date(),
        enabled: true,
      });

      console.log(`✅ Loaded plugin: ${plugin.manifest.name} v${plugin.manifest.version}`);
    } catch (error) {
      const pluginName = typeof pluginPath === 'string' ? pluginPath : 'unknown';
      
      if (this.config.failureMode === 'throw') {
        throw new PluginLoadError(
          `Failed to load plugin: ${error instanceof Error ? error.message : String(error)}`,
          pluginName,
          error instanceof Error ? error : undefined
        );
      } else if (this.config.failureMode === 'warn') {
        console.warn(`⚠️  Failed to load plugin ${pluginName}:`, error);
      }
      // silent mode: do nothing
    }
  }

  /**
   * Load multiple plugins
   */
  async loadPlugins(plugins: (string | Plugin)[]): Promise<void> {
    await Promise.all(plugins.map(p => this.loadPlugin(p)));
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginName: string): Promise<void> {
    const loaded = this.plugins.get(pluginName);
    if (!loaded) {
      throw new Error(`Plugin '${pluginName}' is not loaded`);
    }

    // Call onUnload hook if present
    if (loaded.plugin.onUnload) {
      await this.executeWithTimeout(
        () => loaded.plugin.onUnload!(),
        this.config.timeout!,
        `onUnload hook for ${pluginName}`
      );
    }

    this.plugins.delete(pluginName);
    console.log(`🗑️  Unloaded plugin: ${pluginName}`);
  }

  /**
   * Enable a plugin
   */
  enablePlugin(pluginName: string): void {
    const loaded = this.plugins.get(pluginName);
    if (!loaded) {
      throw new Error(`Plugin '${pluginName}' is not loaded`);
    }
    loaded.enabled = true;
  }

  /**
   * Disable a plugin
   */
  disablePlugin(pluginName: string): void {
    const loaded = this.plugins.get(pluginName);
    if (!loaded) {
      throw new Error(`Plugin '${pluginName}' is not loaded`);
    }
    loaded.enabled = false;
  }

  /**
   * Validate all enabled plugins
   */
  async validateAll(context: ValidationContext): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    for (const [name, loaded] of this.plugins.entries()) {
      if (!loaded.enabled) continue;

      if (loaded.plugin.onValidate) {
        try {
          const result = await this.executeWithTimeout(
            () => loaded.plugin.onValidate!(context),
            this.config.timeout!,
            `onValidate for ${name}`
          );
          results.push(result);
        } catch (error) {
          console.error(`❌ Plugin ${name} validation failed:`, error);
          results.push({
            valid: false,
            violations: [
              {
                type: 'plugin-error',
                severity: 'error',
                message: `Plugin validation failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            warnings: [],
          });
        }
      }
    }

    // Merge all results
    return this.mergeResults(results);
  }

  /**
   * Validate with specific plugins
   */
  async validateWith(
    pluginNames: string[],
    context: ValidationContext
  ): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    for (const name of pluginNames) {
      const loaded = this.plugins.get(name);
      if (!loaded) {
        console.warn(`⚠️  Plugin '${name}' not found, skipping`);
        continue;
      }

      if (!loaded.enabled) {
        console.warn(`⚠️  Plugin '${name}' is disabled, skipping`);
        continue;
      }

      if (loaded.plugin.onValidate) {
        try {
          const result = await this.executeWithTimeout(
            () => loaded.plugin.onValidate!(context),
            this.config.timeout!,
            `onValidate for ${name}`
          );
          results.push(result);
        } catch (error) {
          console.error(`❌ Plugin ${name} validation failed:`, error);
          results.push({
            valid: false,
            violations: [
              {
                type: 'plugin-error',
                severity: 'error',
                message: `Plugin validation failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            warnings: [],
          });
        }
      }
    }

    return this.mergeResults(results);
  }

  /**
   * Get loaded plugin info
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin count
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Clear all plugins
   */
  async clearAll(): Promise<void> {
    const names = Array.from(this.plugins.keys());
    await Promise.all(names.map(name => this.unloadPlugin(name)));
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name) {
      throw new PluginValidationError('Plugin manifest missing required field: name', 'unknown');
    }

    if (!manifest.version) {
      throw new PluginValidationError(
        `Plugin manifest missing required field: version`,
        manifest.name
      );
    }

    // Validate version format (semver-like)
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new PluginValidationError(
        `Invalid version format: ${manifest.version} (expected x.y.z)`,
        manifest.name
      );
    }

    if (!manifest.description) {
      console.warn(`⚠️  Plugin ${manifest.name} missing description`);
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => T | Promise<T>,
    timeout: number,
    taskName: string
  ): Promise<T> {
    return Promise.race([
      Promise.resolve(fn()),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout executing ${taskName}`)), timeout)
      ),
    ]);
  }

  /**
   * Merge multiple validation results
   */
  private mergeResults(results: ValidationResult[]): ValidationResult {
    if (results.length === 0) {
      return {
        valid: true,
        violations: [],
        warnings: [],
      };
    }

    const allViolations = results.flatMap(r => r.violations);
    const allWarnings = results.flatMap(r => r.warnings);
    const allValid = results.every(r => r.valid);

    return {
      valid: allValid && allViolations.length === 0,
      violations: allViolations,
      warnings: allWarnings,
      metadata: {
        pluginCount: results.length,
        totalViolations: allViolations.length,
        totalWarnings: allWarnings.length,
      },
    };
  }
}

/**
 * Global plugin loader instance
 */
let globalLoader: PluginLoader | null = null;

/**
 * Get or create global plugin loader
 */
export function getGlobalPluginLoader(config?: PluginLoaderConfig): PluginLoader {
  if (!globalLoader) {
    globalLoader = new PluginLoader(config);
  }
  return globalLoader;
}

/**
 * Reset global plugin loader
 */
export function resetGlobalPluginLoader(): void {
  globalLoader = null;
}
