/**
 * WebAssembly Plugin Runner
 *
 * Executes plugins compiled to WebAssembly using WASI (WebAssembly System Interface).
 * Provides near-native performance with configurable linear memory limits,
 * filesystem preopening, and environment variable injection.
 *
 * Specification: Plugin Runtime Isolation Specification (plugin-runtime-isolation)
 *
 * @module plugins/runtime/wasm-plugin-runner
 * @version 1.0.0
 * @date 2026-03-01
 * @license MIT
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { WASI } from 'node:wasi';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import type {
  SandboxConfig,
  SandboxResult,
  WasmProbeResult,
} from './types.js';

// ---------------------------------------------------------------------------
// WASM-specific types (extended from base types.ts)
// ---------------------------------------------------------------------------

export interface WasmModuleInstance {
  /** Compiled WebAssembly module */
  module: WebAssembly.Module;
  /** Instantiated WASM instance with WASI imports */
  instance: WebAssembly.Instance;
  /** WASI interface for system calls */
  wasi: WASI;
}

/**
 * Configuration for WebAssembly plugin execution
 * Extends the base SandboxConfig with WASM-specific settings
 */
export interface WasmExecutionConfig extends Omit<SandboxConfig, 'image' | 'command'> {
  /** Path to the compiled .wasm file */
  wasmPath: string;
  /** Initial linear memory pages (64KB per page). Default: 256 (16MB) */
  initialMemoryPages?: number;
  /** Maximum linear memory pages (64KB per page). Default: 1024 (64MB) */
  maxMemoryPages?: number;
  /** Filesystem directories to preopen (grant read/write access) */
  preopens?: Record<string, string>;
  /** Arguments passed to the WASM module's main function */
  args?: string[];
}

// ---------------------------------------------------------------------------
// Memory limit parsing
// ---------------------------------------------------------------------------

const MEMORY_REGEX = /^(\d+(?:\.\d+)?)\s*(kb?|mb?|gb?)/i;

/**
 * Convert memory string to WASM linear memory pages (64KB per page)
 * Examples: "16MB" → 256 pages, "64MB" → 1024 pages
 */
function memoryToPages(memoryStr: string): number {
  const match = MEMORY_REGEX.exec(memoryStr.trim());
  if (!match) {
    throw new Error(`Invalid memory value: "${memoryStr}". Expected format: "16MB", "64MB"`);
  }
  
  const amount = Number.parseFloat(match[1] ?? '16');
  const unit = (match[2] ?? 'mb')[0].toLowerCase();
  
  let bytes = 0;
  switch (unit) {
    case 'k': bytes = amount * 1024; break;
    case 'm': bytes = amount * 1024 * 1024; break;
    case 'g': bytes = amount * 1024 * 1024 * 1024; break;
    default: bytes = amount * 1024 * 1024; // default MB
  }
  
  // WASM pages are 64KB (65536 bytes)
  const pages = Math.ceil(bytes / 65536);
  return pages;
}

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

const DURATION_REGEX = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/i;

/**
 * Parse a human-readable duration string to milliseconds.
 * Supports: "30s", "5m", "1h", "500ms"
 */
function parseDurationMs(value: string): number {
  const match = DURATION_REGEX.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}". Expected format: "5m", "30s", "1h", "500ms"`);
  }
  const amount = Number.parseFloat(match[1] ?? '0');
  const unit = (match[2] ?? 's').toLowerCase();
  switch (unit) {
    case 'ms': return Math.ceil(amount);
    case 's':  return Math.ceil(amount * 1_000);
    case 'm':  return Math.ceil(amount * 60_000);
    case 'h':  return Math.ceil(amount * 3_600_000);
    default:   return Math.ceil(amount * 1_000);
  }
}

// ---------------------------------------------------------------------------
// WebAssembly Plugin Runner
// ---------------------------------------------------------------------------

/**
 * WebAssembly Plugin Runner
 * 
 * Executes plugins compiled to WebAssembly with WASI support.
 * Provides:
 * - Linear memory limits (configurable initial/max pages)
 * - Filesystem access control via preopens
 * - Environment variable injection
 * - Execution time limits with timeout
 * - Isolated execution (no network access by default)
 * 
 * Performance Target: <5% overhead vs native execution
 */
export class WasmPluginRunner {
  /** Check if WebAssembly support is available in the current Node.js version */
  static async probe(): Promise<WasmProbeResult> {
    try {
      // Check if WASI is available
      if (typeof WASI === 'undefined') {
        return {
          available: false,
          error: 'WASI not available. Node.js 18+ required.',
        };
      }

      // Check if WebAssembly is available
      if (typeof WebAssembly === 'undefined') {
        return {
          available: false,
          error: 'WebAssembly not available in this environment.',
        };
      }

      // Verify we can create a WASI instance
      const testWasi = new WASI({
        version: 'preview1',
        args: [],
        env: {},
      });

      if (!testWasi) {
        throw new Error('WASI initialization failed');
      }

      return {
        available: true,
        version: `Node.js ${process.version} with WASI preview1`,
      };
    } catch (err) {
      return {
        available: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Load and compile a WebAssembly module from disk
   * 
   * @param config - WASM execution configuration
   * @returns Compiled module instance with WASI
   */
  private static async loadModule(config: WasmExecutionConfig): Promise<WasmModuleInstance> {
    // Read WASM file
    const wasmBuffer = await readFile(config.wasmPath);
    
    // Configure WASI with preopens and env
    const wasi = new WASI({
      version: 'preview1',
      args: config.args ?? [],
      env: config.env ?? {},
      preopens: config.preopens ?? {},
      returnOnExit: true, // Return instead of process.exit()
    });

    // Compile the module
    const module = await WebAssembly.compile(wasmBuffer);
    
    // Calculate memory limits
    const initialPages = config.initialMemoryPages ?? 
      memoryToPages(config.resourceLimits?.maxMemory ?? '16MB');
    const maxPages = config.maxMemoryPages ?? 
      memoryToPages(config.resourceLimits?.maxMemory ?? '64MB');

    // Create linear memory with limits
    const memory = new WebAssembly.Memory({
      initial: initialPages,
      maximum: maxPages,
      shared: false,
    });

    // Instantiate with WASI imports and memory
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: { memory },
    });

    return { module, instance, wasi };
  }

  /**
   * Execute a WebAssembly plugin with resource limits and timeout
   * 
   * @param config - WASM execution configuration
   * @returns Execution result with stdout, stderr, exit code, and timing
   */
  static async run(config: WasmExecutionConfig): Promise<SandboxResult> {
    const startTime = performance.now();
    let timedOut = false;
    let exitCode: number | null = null;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    try {
      // Load and compile module
      const { instance, wasi } = await this.loadModule(config);

      // Parse execution time limit
      const timeoutMs = parseDurationMs(
        config.resourceLimits?.maxExecutionTime ?? '5m'
      );

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          timedOut = true;
          reject(new Error('Execution time limit exceeded'));
        }, timeoutMs);
      });

      // Capture WASI stdout/stderr
      // Note: WASI writes to process.stdout/stderr by default
      // For full capture, we'd need to override fd_write in imports
      // For now, we'll use the return code from WASI.start()

      // Execute the WASM module with timeout
      const executionPromise = new Promise<number>((resolve, reject) => {
        try {
          // Start the WASI instance (calls _start export)
          // wasi.start() throws WASIExitError on non-zero exit
          exitCode = wasi.start(instance);
          resolve(exitCode);
        } catch (err: unknown) {
          // Check if this is a WASI exit error
          if (err && typeof err === 'object' && 'code' in err) {
            // WASI exit with non-zero code
            exitCode = (err as { code: number }).code;
            resolve(exitCode);
          } else {
            // Real error (not a clean exit)
            reject(err);
          }
        }
      });

      // Race between execution and timeout
      exitCode = await Promise.race([executionPromise, timeoutPromise]);

    } catch (err) {
      // Execution failed or timed out
      if (timedOut) {
        exitCode = null; // Killed by timeout
        stderrChunks.push('Error: Execution time limit exceeded\n');
      } else {
        exitCode = 1;
        stderrChunks.push(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }

    const endTime = performance.now();
    const executionTimeMs = Math.ceil(endTime - startTime);

    return {
      exitCode,
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
      timedOut,
      containerName: `wasm-${Date.now()}`, // Not a real container, but kept for API consistency
      executionTimeMs,
    };
  }

  /**
   * Create a WASM execution config from a standard SandboxConfig
   * 
   * This adapter allows using WasmPluginRunner with the same config
   * interface as DockerPluginRunner.
   * 
   * @param config - Standard sandbox config
   * @param wasmPath - Path to the compiled .wasm file
   * @returns WASM-specific execution config
   */
  static fromSandboxConfig(
    config: SandboxConfig,
    wasmPath: string,
  ): WasmExecutionConfig {
    return {
      wasmPath,
      env: config.env,
      resourceLimits: config.resourceLimits,
      preopens: config.writableMounts?.reduce((acc, mount) => {
        // Parse "host:container" format into preopens
        const [host, container] = mount.split(':');
        if (host && container) {
          acc[container] = host;
        }
        return acc;
      }, {} as Record<string, string>),
      args: config.command, // Use command array as WASM args
      // WASM-specific settings
      initialMemoryPages: undefined, // Will use maxMemory from resourceLimits
      maxMemoryPages: undefined, // Will use maxMemory from resourceLimits
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// Re-export types from ./types.js
export type { WasmProbeResult, WasmSandboxConfig } from './types.js';
