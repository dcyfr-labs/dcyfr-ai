/**
 * Validation Framework - Orchestrates quality gates and validation plugins
 * 
 * Provides a high-level API for running validation checks across a project
 * using loaded plugins.
 * 
 * @module @dcyfr/ai/validation/validation-framework
 * @example
 * ```typescript
 * import { ValidationFramework } from '@dcyfr/ai/validation/validation-framework';
 * 
 * const framework = new ValidationFramework();
 * await framework.loadPlugins(['@dcyfr/agents/design-token-validator']);
 * 
 * const result = await framework.validate({
 *   projectRoot: process.cwd(),
 *   files: ['src/**\/*.ts'],
 *   config: { strict: true },
 * });
 * 
 * if (!result.valid) {
 *   console.error('Validation failed:', result.violations);
 * }
 * ```
 */

import { PluginLoader } from '../plugins/plugin-loader';
import type { ValidationContext, ValidationResult, ValidationViolation } from '../types';

/**
 * Validation gate configuration
 */
export interface ValidationGate {
  name: string;
  plugins: string[];
  required: boolean;
  failureMode: 'error' | 'warn' | 'skip';
}

/**
 * Validation framework configuration
 */
export interface ValidationFrameworkConfig {
  gates?: ValidationGate[];
  failureMode?: 'error' | 'warn' | 'block';
  parallel?: boolean;
  timeout?: number;
}

/**
 * Validation report
 */
export interface ValidationReport {
  valid: boolean;
  gates: {
    name: string;
    passed: boolean;
    violations: ValidationViolation[];
    warnings: ValidationViolation[];
    executionTime: number;
  }[];
  summary: {
    totalGates: number;
    passedGates: number;
    failedGates: number;
    totalViolations: number;
    totalWarnings: number;
    executionTime: number;
  };
}

/**
 * Validation Framework - high-level validation orchestrator
 */
export class ValidationFramework {
  private loader: PluginLoader;
  private config: ValidationFrameworkConfig;
  private gates: ValidationGate[];

  constructor(config: ValidationFrameworkConfig = {}) {
    this.config = {
      failureMode: 'error',
      parallel: true,
      timeout: 30000,
      ...config,
    };

    this.loader = new PluginLoader({
      failureMode: 'throw',
      timeout: this.config.timeout,
    });

    this.gates = config.gates || this.getDefaultGates();
  }

  /**
   * Load validation plugins
   */
  async loadPlugins(plugins: string[]): Promise<void> {
    await this.loader.loadPlugins(plugins);
  }

  /**
   * Validate project using all configured gates
   */
  async validate(context: ValidationContext): Promise<ValidationReport> {
    const startTime = Date.now();
    const gateResults: ValidationReport['gates'] = [];

    // Run gates in parallel or serial based on config
    if (this.config.parallel) {
      const results = await Promise.all(
        this.gates.map(gate => this.runGate(gate, context))
      );
      gateResults.push(...results);
    } else {
      for (const gate of this.gates) {
        const result = await this.runGate(gate, context);
        gateResults.push(result);
      }
    }

    const totalExecutionTime = Date.now() - startTime;

    // Calculate summary
    const passedGates = gateResults.filter(g => g.passed).length;
    const failedGates = gateResults.length - passedGates;
    const totalViolations = gateResults.reduce((sum, g) => sum + g.violations.length, 0);
    const totalWarnings = gateResults.reduce((sum, g) => sum + g.warnings.length, 0);

    const valid = failedGates === 0 && totalViolations === 0;

    return {
      valid,
      gates: gateResults,
      summary: {
        totalGates: gateResults.length,
        passedGates,
        failedGates,
        totalViolations,
        totalWarnings,
        executionTime: totalExecutionTime,
      },
    };
  }

  /**
   * Validate with specific gates
   */
  async validateGates(gateNames: string[], context: ValidationContext): Promise<ValidationReport> {
    const selectedGates = this.gates.filter(g => gateNames.includes(g.name));
    
    if (selectedGates.length === 0) {
      throw new Error(`No gates found matching: ${gateNames.join(', ')}`);
    }

    // Temporarily swap gates
    const originalGates = this.gates;
    this.gates = selectedGates;

    try {
      return await this.validate(context);
    } finally {
      this.gates = originalGates;
    }
  }

  /**
   * Add a custom gate
   */
  addGate(gate: ValidationGate): void {
    // Check for duplicate names
    if (this.gates.some(g => g.name === gate.name)) {
      throw new Error(`Gate '${gate.name}' already exists`);
    }
    this.gates.push(gate);
  }

  /**
   * Remove a gate
   */
  removeGate(gateName: string): void {
    const index = this.gates.findIndex(g => g.name === gateName);
    if (index === -1) {
      throw new Error(`Gate '${gateName}' not found`);
    }
    this.gates.splice(index, 1);
  }

  /**
   * Get all gates
   */
  getGates(): ValidationGate[] {
    return [...this.gates];
  }

  /**
   * Get plugin loader
   */
  getLoader(): PluginLoader {
    return this.loader;
  }

  /**
   * Run a single gate
   */
  private async runGate(
    gate: ValidationGate,
    context: ValidationContext
  ): Promise<ValidationReport['gates'][0]> {
    const startTime = Date.now();

    try {
      const result = await this.loader.validateWith(gate.plugins, context);
      const executionTime = Date.now() - startTime;

      const passed = result.valid && result.violations.length === 0;

      return {
        name: gate.name,
        passed,
        violations: result.violations,
        warnings: result.warnings,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (gate.failureMode === 'skip') {
        console.warn(`⚠️  Gate '${gate.name}' skipped due to error:`, error);
        return {
          name: gate.name,
          passed: true,
          violations: [],
          warnings: [
            {
              type: 'gate-error',
              severity: 'warning',
              message: `Gate skipped: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          executionTime,
        };
      }

      const errorViolation: ValidationViolation = {
        type: 'gate-error',
        severity: 'error',
        message: `Gate execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };

      return {
        name: gate.name,
        passed: false,
        violations: [errorViolation],
        warnings: [],
        executionTime,
      };
    }
  }

  /**
   * Get default validation gates
   */
  private getDefaultGates(): ValidationGate[] {
    return [
      {
        name: 'typescript',
        plugins: ['typescript-validator'],
        required: true,
        failureMode: 'error',
      },
      {
        name: 'eslint',
        plugins: ['eslint-validator'],
        required: true,
        failureMode: 'error',
      },
      {
        name: 'tests',
        plugins: ['test-coverage-validator'],
        required: true,
        failureMode: 'error',
      },
      {
        name: 'security',
        plugins: ['security-validator'],
        required: false,
        failureMode: 'warn',
      },
    ];
  }
}
