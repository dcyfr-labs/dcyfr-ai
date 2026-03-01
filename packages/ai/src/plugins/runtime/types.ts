/**
 * Docker Sandbox Runner — Types
 *
 * Type definitions for the plugin runtime isolation layer.
 * Matches the Plugin Runtime Isolation Specification.
 *
 * @module plugins/runtime/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Resource limits
// ---------------------------------------------------------------------------

/** Resource constraints declared by a plugin (or applied as defaults). */
export interface SandboxResourceLimits {
  /**
   * Maximum memory allocation. Docker `--memory` format.
   * Examples: "512MB", "1GB", "256m"
   * @default "512MB"
   */
  maxMemory: string;

  /**
   * Maximum CPU share as a fraction of a single core (0.0–∞).
   * Mapped to Docker `--cpus`.
   * @default 0.5
   */
  maxCpu: number;

  /**
   * Wall-clock execution time limit. Supports "5m", "30s", "1h".
   * Plugin receives SIGTERM at this limit; SIGKILL after 10 seconds more.
   * @default "5m"
   */
  maxExecutionTime: string;

  /**
   * Maximum temporary disk space for the writable `/tmp` tmpfs mount.
   * Examples: "64MB", "1GB"
   * @default "1GB"
   */
  maxDiskSpace: string;
}

/** Defaults applied when a plugin omits `resourceLimits` fields. */
export const DEFAULT_RESOURCE_LIMITS: Readonly<SandboxResourceLimits> = {
  maxMemory: '512MB',
  maxCpu: 0.5,
  maxExecutionTime: '5m',
  maxDiskSpace: '1GB',
};

// ---------------------------------------------------------------------------
// Sandbox configuration
// ---------------------------------------------------------------------------

/** Configuration for a single plugin sandbox execution. */
export interface SandboxConfig {
  /**
   * Docker image to use. Must exist locally or be pullable.
   * Typically `dcyfr-plugin-sandbox:latest` for untrusted plugins.
   */
  image: string;

  /**
   * Command + arguments to run inside the container.
   * E.g. `["node", "dist/index.js"]`
   */
  command: string[];

  /**
   * Environment variables injected into the container.
   * Keys/values must not contain secrets unless the plugin
   * has been granted `data.allowSecretAccess`.
   */
  env?: Record<string, string>;

  /**
   * Whether to permit outbound network access.
   * When false (default), runs with `--network=none`.
   */
  networkPermitted?: boolean;

  /**
   * Whether to permit writes to the plugin work directory.
   * When false (default), runs with `--read-only`.
   * A writable `/tmp` tmpfs is always provided.
   */
  writePermitted?: boolean;

  /**
   * Host paths to bind-mount as writable volumes inside the container.
   * Only meaningful when `writePermitted` is true.
   * Format: `["/host/path:/container/path"]`
   */
  writableMounts?: string[];

  /** Resource limits merged over `DEFAULT_RESOURCE_LIMITS`. */
  resourceLimits?: Partial<SandboxResourceLimits>;

  /** Working directory inside the container. Defaults to `/plugin`. */
  workDir?: string;

  /**
   * Use gVisor (runsc) runtime for enhanced isolation.
   * Required for TLP:AMBER/RED plugins. Falls back to standard Docker
   * if gVisor is unavailable.
   */
  useGVisor?: boolean;
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------

/** Result returned once a sandboxed plugin finishes (or is killed). */
export interface SandboxResult {
  /** Process exit code. null if killed before exit. */
  exitCode: number | null;
  /** Captured stdout (UTF-8). */
  stdout: string;
  /** Captured stderr (UTF-8). */
  stderr: string;
  /** True if the container was killed due to the execution time limit. */
  timedOut: boolean;
  /** Auto-generated name used for this container run. */
  containerName: string;
  /** Wall-clock milliseconds from `docker run` spawn to process exit. */
  executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// Docker availability
// ---------------------------------------------------------------------------

/** Result of a Docker availability probe. */
export interface DockerProbeResult {
  available: boolean;
  /** Docker version string, e.g. "Docker version 27.x.y" */
  version?: string;
  /** Human-readable error if Docker is unavailable. */
  error?: string;
}

/** Result of a gVisor availability probe. */
export interface GVisorProbeResult {
  available: boolean;
  error?: string;
}
// ---------------------------------------------------------------------------
// WebAssembly runtime
// ---------------------------------------------------------------------------

/** Result of a WebAssembly availability probe. */
export interface WasmProbeResult {
  available: boolean;
  /** Node.js version with WASI support info */
  version?: string;
  /** Human-readable error if WASM/WASI is unavailable */
  error?: string;
}

/**
 * WebAssembly-specific sandbox configuration
 * Extends base SandboxConfig with WASM linear memory and preopen settings
 */
export interface WasmSandboxConfig {
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
  /** Environment variables injected into WASI */
  env?: Record<string, string>;
  /** Resource limits (memory/CPU/time) */
  resourceLimits?: Partial<SandboxResourceLimits>;
}