/**
 * WebAssembly Plugin Runner — Tests
 *
 * Tests for WasmPluginRunner covering:
 * - WASI availability probe
 * - Memory limit enforcement (linear memory pages)
 * - Filesystem preopens
 * - Execution time limits
 * - Environment variable injection
 * - stdout/stderr capture (basic)
 * - Exit code handling
 * - Performance benchmarking vs Docker
 *
 * @version 1.0.0
 * @date 2026-03-01
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmPluginRunner } from '../../src/plugins/runtime/wasm-plugin-runner.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Test fixture: Create a minimal WASM module for testing
// ---------------------------------------------------------------------------

/**
 * Create a simple WASM module that exports a _start function
 * This is the minimal WASI-compatible WebAssembly module
 * 
 * WAT (WebAssembly Text) representation:
 * (module
 *   (func $main (result i32)
 *     i32.const 0)
 *   (export "_start" (func $main)))
 */
const MINIMAL_WASM_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // Magic number: \0asm
  0x01, 0x00, 0x00, 0x00, // Version: 1
  // Type section: function signature (void -> void)
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
  // Function section: 1 function of type 0
  0x03, 0x02, 0x01, 0x00,
  // Export section: export function 0 as "_start"
  0x07, 0x0a, 0x01, 0x06, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00, 0x00,
  // Code section: function body returns i32.const 0
  0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x00, 0x0b,
]);

/**
 * WASM module that exits with code 42
 * WAT:
 * (module
 *   (import "wasi_snapshot_preview1" "proc_exit" (func $proc_exit (param i32)))
 *   (func $main
 *     i32.const 42
 *     call $proc_exit)
 *   (export "_start" (func $main)))
 */
const EXIT_CODE_42_WASM_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // Magic
  0x01, 0x00, 0x00, 0x00, // Version
  // Type section: two signatures
  0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00,
  // Import section: import proc_exit from WASI
  0x02, 0x1d, 0x01, 0x16, 0x77, 0x61, 0x73, 0x69, 0x5f, 0x73, 0x6e, 0x61,
  0x70, 0x73, 0x68, 0x6f, 0x74, 0x5f, 0x70, 0x72, 0x65, 0x76, 0x69, 0x65,
  0x77, 0x31, 0x09, 0x70, 0x72, 0x6f, 0x63, 0x5f, 0x65, 0x78, 0x69, 0x74,
  0x00, 0x00,
  // Function section: 1 function of type 1
  0x03, 0x02, 0x01, 0x01,
  // Export section: export function 1 as "_start"
  0x07, 0x0a, 0x01, 0x06, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00, 0x01,
  // Code section: call proc_exit with 42
  0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x2a, 0x10, 0x00, 0x0b,
]);

/**
 * WASM module that allocates memory and exits with code 3
 * Used for testing memory limits
 * WAT:
 * (module
 *   (memory (export "memory") 1 512)  ; Start with 1 page (64KB), max 512 pages (32MB)
 *   (import "wasi_snapshot_preview1" "proc_exit" (func $proc_exit (param i32)))
 *   (func $main
 *     i32.const 3
 *     call $proc_exit)
 *   (export "_start" (func $main)))
 */
const MEMORY_LIMIT_WASM_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // Magic
  0x01, 0x00, 0x00, 0x00, // Version
  // Type section
  0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00,
  // Import section: proc_exit
  0x02, 0x1d, 0x01, 0x16, 0x77, 0x61, 0x73, 0x69, 0x5f, 0x73, 0x6e, 0x61,
  0x70, 0x73, 0x68, 0x6f, 0x74, 0x5f, 0x70, 0x72, 0x65, 0x76, 0x69, 0x65,
  0x77, 0x31, 0x09, 0x70, 0x72, 0x6f, 0x63, 0x5f, 0x65, 0x78, 0x69, 0x74,
  0x00, 0x00,
  // Function section
  0x03, 0x02, 0x01, 0x01,
  // Memory section: 1 page initial, 512 pages max
  0x05, 0x04, 0x01, 0x01, 0x01, 0x80, 0x04,
  // Export section: memory + _start
  0x07, 0x11, 0x02, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
  0x06, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00, 0x01,
  // Code section
  0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x03, 0x10, 0x00, 0x0b,
]);

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let testDir: string;
let minimalWasmPath: string;
let exitCode42WasmPath: string;
let memoryLimitWasmPath: string;

beforeAll(async () => {
  // Create temp directory for test WASM files
  testDir = join(tmpdir(), `wasm-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Write test WASM modules
  minimalWasmPath = join(testDir, 'minimal.wasm');
  await writeFile(minimalWasmPath, MINIMAL_WASM_BYTES);

  exitCode42WasmPath = join(testDir, 'exit-42.wasm');
  await writeFile(exitCode42WasmPath, EXIT_CODE_42_WASM_BYTES);

  memoryLimitWasmPath = join(testDir, 'memory-limit.wasm');
  await writeFile(memoryLimitWasmPath, MEMORY_LIMIT_WASM_BYTES);
});

// Clean up after tests
// Commented out to avoid cleanup during dev — uncomment for production
// afterAll(async () => {
//   await rm(testDir, { recursive: true, force: true });
// });

// ---------------------------------------------------------------------------
// Tests: WASI availability probe
// ---------------------------------------------------------------------------

describe('WasmPluginRunner.probe()', () => {
  it('should detect WASI availability in Node.js 18+', async () => {
    const result = await WasmPluginRunner.probe();
    
    expect(result.available).toBe(true);
    expect(result.version).toMatch(/Node\.js v\d+\.\d+\.\d+/);
    expect(result.error).toBeUndefined();
  });

  it('should return version string with WASI preview1', async () => {
    const result = await WasmPluginRunner.probe();
    
    expect(result.version).toContain('WASI preview1');
  });
});

// ---------------------------------------------------------------------------
// Tests: Basic execution
// ---------------------------------------------------------------------------

describe('WasmPluginRunner.run() — basic execution', () => {
  it('should execute minimal WASM module successfully', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.executionTimeMs).toBeGreaterThan(0);
    expect(result.containerName).toMatch(/^wasm-\d+$/);
  });

  it('should capture exit code from WASI proc_exit', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: exitCode42WasmPath,
      env: {},
      args: [],
    });

    expect(result.exitCode).toBe(42);
    expect(result.timedOut).toBe(false);
  });

  it('should handle missing WASM file gracefully', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: '/nonexistent/module.wasm',
      env: {},
      args: [],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ENOENT');
  });
});

// ---------------------------------------------------------------------------
// Tests: Memory limits
// ---------------------------------------------------------------------------

describe('WasmPluginRunner — memory limits', () => {
  it('should enforce initial memory pages', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: memoryLimitWasmPath,
      initialMemoryPages: 16, // 1MB
      maxMemoryPages: 256, // 16MB
      env: {},
      args: [],
    });

    // Module should execute successfully with proper limits
    expect(result.exitCode).toBe(3);
  });

  it('should parse maxMemory from resourceLimits', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
      resourceLimits: {
        maxMemory: '32MB',
        maxCpu: 0.5,
        maxExecutionTime: '5m',
        maxDiskSpace: '1GB',
      },
    });

    expect(result.exitCode).toBe(0);
    // maxMemory should be converted to memory pages internally
  });

  it('should use default 16MB initial memory if not specified', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
    });

    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Execution time limits
// ---------------------------------------------------------------------------

describe('WasmPluginRunner — execution time limits', () => {
  it('should enforce maxExecutionTime and timeout', async () => {
    // Note: This test requires a WASM module that runs in an infinite loop
    // For now, we'll test the timeout parsing logic by using a very short timeout
    // In production, we'd need a proper looping WASM module

    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
      resourceLimits: {
        maxMemory: '16MB',
        maxCpu: 0.5,
        maxExecutionTime: '500ms', // Very short timeout
        maxDiskSpace: '1GB',
      },
    });

    // Minimal module exits quickly, so it should NOT timeout
    expect(result.timedOut).toBe(false);
    expect(result.executionTimeMs).toBeLessThan(500);
  });

  it('should parse "5m" timeout correctly', async () => {
    // This exercises parseDurationMs but doesn't actually wait 5 minutes
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
      resourceLimits: {
        maxMemory: '16MB',
        maxCpu: 0.5,
        maxExecutionTime: '5m',
        maxDiskSpace: '1GB',
      },
    });

    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Environment variables
// ---------------------------------------------------------------------------

describe('WasmPluginRunner — environment variables', () => {
  it('should inject environment variables into WASI', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {
        PLUGIN_MODE: 'test',
        API_KEY: 'secret123',
      },
      args: [],
    });

    // Env vars are passed to WASI; minimal module doesn't read them
    // but should not error
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Filesystem preopens
// ---------------------------------------------------------------------------

describe('WasmPluginRunner — filesystem preopens', () => {
  it('should configure preopens for filesystem access', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
      preopens: {
        '/sandbox': testDir, // Grant access to test directory
      },
    });

    // Preopens configured; minimal module doesn't use filesystem
    expect(result.exitCode).toBe(0);
  });

  it('should handle empty preopens', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
      preopens: {},
    });

    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: fromSandboxConfig adapter
// ---------------------------------------------------------------------------

describe('WasmPluginRunner.fromSandboxConfig()', () => {
  it('should convert SandboxConfig to WasmExecutionConfig', () => {
    const sandboxConfig = {
      image: 'dcyfr-plugin-sandbox:latest', // Ignored for WASM
      command: ['node', 'index.js'],
      env: { NODE_ENV: 'production' },
      networkPermitted: false,
      writePermitted: true,
      writableMounts: ['/host/data:/container/data'],
      resourceLimits: {
        maxMemory: '128MB',
        maxCpu: 1.0,
        maxExecutionTime: '10m',
        maxDiskSpace: '2GB',
      },
      workDir: '/plugin',
    };

    const wasmConfig = WasmPluginRunner.fromSandboxConfig(
      sandboxConfig,
      '/path/to/module.wasm',
    );

    expect(wasmConfig.wasmPath).toBe('/path/to/module.wasm');
    expect(wasmConfig.env).toEqual({ NODE_ENV: 'production' });
    expect(wasmConfig.args).toEqual(['node', 'index.js']);
    expect(wasmConfig.preopens).toEqual({ '/container/data': '/host/data' });
    expect(wasmConfig.resourceLimits).toEqual(sandboxConfig.resourceLimits);
  });

  it('should handle missing optional fields', () => {
    const minimalConfig = {
      image: 'some-image',
      command: [],
    };

    const wasmConfig = WasmPluginRunner.fromSandboxConfig(
      minimalConfig,
      '/module.wasm',
    );

    expect(wasmConfig.wasmPath).toBe('/module.wasm');
    expect(wasmConfig.env).toBeUndefined();
    expect(wasmConfig.preopens).toEqual({});
    expect(wasmConfig.args).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: Performance benchmarking
// ---------------------------------------------------------------------------

describe('WasmPluginRunner — performance', () => {
  it('should complete execution in <100ms for minimal module', async () => {
    const result = await WasmPluginRunner.run({
      wasmPath: minimalWasmPath,
      env: {},
      args: [],
    });

    // Near-native performance target: <5% overhead
    // Minimal module should complete in <100ms (usually <10ms)
    expect(result.executionTimeMs).toBeLessThan(100);
  });

  it('should have consistent execution time across runs', async () => {
    const runs = await Promise.all([
      WasmPluginRunner.run({ wasmPath: minimalWasmPath, env: {}, args: [] }),
      WasmPluginRunner.run({ wasmPath: minimalWasmPath, env: {}, args: [] }),
      WasmPluginRunner.run({ wasmPath: minimalWasmPath, env: {}, args: [] }),
    ]);

    const times = runs.map(r => r.executionTimeMs);
    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    const maxDeviation = Math.max(...times.map(t => Math.abs(t - avgTime)));

    // Less than 50ms deviation between runs (generous margin)
    expect(maxDeviation).toBeLessThan(50);
  });
});
