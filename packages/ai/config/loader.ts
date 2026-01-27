/**
 * Configuration Loader - Three-layer config merge system
 * 
 * Loads and merges configuration from multiple sources:
 * 1. Framework defaults (from schema.ts)
 * 2. Project config (.dcyfr.yaml, .dcyfr.json, package.json)
 * 3. User overrides (environment variables, CLI flags)
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';
import { FrameworkConfigSchema, DEFAULT_CONFIG, type FrameworkConfig } from './schema.js';

/**
 * Configuration file names to search for (in priority order)
 */
const CONFIG_FILES = [
  '.dcyfr.yaml',
  '.dcyfr.yml',
  '.dcyfr.json',
  'dcyfr.config.json',
  'dcyfr.config.yaml',
  'dcyfr.config.yml',
];

/**
 * Environment variable prefix
 */
const ENV_PREFIX = 'DCYFR_';

/**
 * Configuration loader options
 */
export interface LoaderOptions {
  /**
   * Project root directory (default: process.cwd())
   */
  projectRoot?: string;
  
  /**
   * Override configuration file path
   */
  configFile?: string;
  
  /**
   * Enable environment variable overrides
   */
  enableEnvOverrides?: boolean;
  
  /**
   * Enable package.json config section
   */
  enablePackageJson?: boolean;
  
  /**
   * Validation mode
   */
  validate?: boolean;
}

/**
 * Configuration loader with three-layer merge
 */
export class ConfigLoader {
  private projectRoot: string;
  private options: LoaderOptions;
  
  constructor(options: LoaderOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.options = {
      enableEnvOverrides: true,
      enablePackageJson: true,
      validate: true,
      ...options,
    };
  }
  
  /**
   * Load complete configuration with three-layer merge
   */
  async load(): Promise<FrameworkConfig> {
    // Layer 1: Framework defaults
    const defaults = { ...DEFAULT_CONFIG };
    
    // Layer 2: Project configuration
    const projectConfig = await this.loadProjectConfig();
    
    // Layer 3: User overrides
    const userOverrides = this.loadUserOverrides();
    
    // Merge all layers (deep merge)
    const merged = this.deepMerge(defaults, projectConfig, userOverrides);
    
    // Validate final configuration
    if (this.options.validate) {
      return this.validate(merged);
    }
    
    return merged;
  }
  
  /**
   * Load project configuration from files
   */
  private async loadProjectConfig(): Promise<Partial<FrameworkConfig>> {
    // Try custom config file first
    if (this.options.configFile) {
      const customPath = join(this.projectRoot, this.options.configFile);
      if (existsSync(customPath)) {
        return await this.loadConfigFile(customPath);
      }
      throw new Error(`Config file not found: ${this.options.configFile}`);
    }
    
    // Search for config files in priority order
    for (const filename of CONFIG_FILES) {
      const filepath = join(this.projectRoot, filename);
      if (existsSync(filepath)) {
        console.log(`📝 Loading config from ${filename}`);
        return await this.loadConfigFile(filepath);
      }
    }
    
    // Try package.json
    if (this.options.enablePackageJson) {
      const pkgConfig = await this.loadPackageJsonConfig();
      if (pkgConfig) {
        return pkgConfig;
      }
    }
    
    // No project config found, use defaults
    console.log('ℹ️  No config file found, using defaults');
    return {};
  }
  
  /**
   * Load configuration from a specific file
   */
  private async loadConfigFile(filepath: string): Promise<Partial<FrameworkConfig>> {
    try {
      const content = await readFile(filepath, 'utf-8');
      
      if (filepath.endsWith('.json')) {
        return JSON.parse(content);
      }
      
      if (filepath.endsWith('.yaml') || filepath.endsWith('.yml')) {
        return parseYaml(content);
      }
      
      throw new Error(`Unsupported config file format: ${filepath}`);
    } catch (error) {
      throw new Error(`Failed to load config file ${filepath}: ${error}`);
    }
  }
  
  /**
   * Load configuration from package.json
   */
  private async loadPackageJsonConfig(): Promise<Partial<FrameworkConfig> | null> {
    const pkgPath = join(this.projectRoot, 'package.json');
    
    if (!existsSync(pkgPath)) {
      return null;
    }
    
    try {
      const content = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      
      if (pkg.dcyfr) {
        console.log('📦 Loading config from package.json');
        return pkg.dcyfr;
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️  Failed to load package.json: ${error}`);
      return null;
    }
  }
  
  /**
   * Load user overrides from environment variables
   */
  private loadUserOverrides(): Partial<FrameworkConfig> {
    if (!this.options.enableEnvOverrides) {
      return {};
    }
    
    const overrides: Record<string, unknown> = {};
    
    // Parse environment variables with DCYFR_ prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(ENV_PREFIX)) {
        const configKey = key
          .substring(ENV_PREFIX.length)
          .toLowerCase()
          .replace(/_/g, '.');
        
        this.setNestedValue(overrides, configKey, this.parseEnvValue(value));
      }
    }
    
    return overrides as Partial<FrameworkConfig>;
  }
  
  /**
   * Parse environment variable value to appropriate type
   */
  private parseEnvValue(value: string | undefined): unknown {
    if (!value) return undefined;
    
    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Number
    if (/^\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    // JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    
    return value;
  }
  
  /**
   * Set nested object value using dot notation
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    
    current[keys[keys.length - 1]] = value;
  }
  
  /**
   * Deep merge multiple objects
   */
  private deepMerge(...objects: Array<Partial<FrameworkConfig>>): FrameworkConfig {
    const result: Record<string, unknown> = {};
    
    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) continue;
        
        if (this.isPlainObject(value) && this.isPlainObject(result[key])) {
          result[key] = this.deepMerge(
            result[key] as Partial<FrameworkConfig>,
            value as Partial<FrameworkConfig>
          );
        } else {
          result[key] = value;
        }
      }
    }
    
    return result as FrameworkConfig;
  }
  
  /**
   * Check if value is a plain object
   */
  private isPlainObject(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    );
  }
  
  /**
   * Validate configuration against schema
   */
  validate(config: unknown): FrameworkConfig {
    try {
      return FrameworkConfigSchema.parse(config);
    } catch (error) {
      console.error('❌ Configuration validation failed:');
      console.error(error);
      throw new Error('Invalid configuration');
    }
  }
  
  /**
   * Get configuration file path (if exists)
   */
  async getConfigFilePath(): Promise<string | null> {
    if (this.options.configFile) {
      const customPath = join(this.projectRoot, this.options.configFile);
      return existsSync(customPath) ? customPath : null;
    }
    
    for (const filename of CONFIG_FILES) {
      const filepath = join(this.projectRoot, filename);
      if (existsSync(filepath)) {
        return filepath;
      }
    }
    
    return null;
  }
}

/**
 * Convenience function to load configuration
 */
export async function loadConfig(options?: LoaderOptions): Promise<FrameworkConfig> {
  const loader = new ConfigLoader(options);
  return await loader.load();
}
