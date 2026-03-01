/**
 * Docker Plugin Runner
 *
 * Executes plugins inside isolated Docker containers with configurable
 * resource limits, network restrictions, read-only filesystems, and
 * Linux capability dropping.
 *
 * Specification: Plugin Runtime Isolation Specification (plugin-runtime-isolation)
 *
 * @module plugins/runtime/docker-plugin-runner
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type {
  SandboxConfig,
  SandboxResourceLimits,
  SandboxResult,
  DockerProbeResult,
  GVisorProbeResult,
} from './types.js';
import { DEFAULT_RESOURCE_LIMITS } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Duration / memory parsing helpers
// ---------------------------------------------------------------------------

const DURATION_REGEX = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/i;

/**
 * Parse a human-readable duration string to milliseconds.
 * Supports: "30s", "5m", "1h", "500ms"
 */
export function parseDurationMs(value: string): number {
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

const MEMORY_REGEX = /^(\d+(?:\.\d+)?)\s*(kb?|mb?|gb?|tb?)/i;

/**
 * Normalize a memory string to Docker's short format ("k", "m", "g").
 * Accepts "512MB", "512M", "512mb", "1GB", "1g", "1024k".
 */
export function normalizeMemory(value: string): string {
  const match = MEMORY_REGEX.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid memory value: "${value}". Expected format: "512MB", "1GB"`);
  }
  const amount = match[1] ?? '512';
  const unit = (match[2] ?? 'm')[0].toLowerCase();
  return `${amount}${unit}`;
}

// ---------------------------------------------------------------------------
// Argument builder helpers
// ---------------------------------------------------------------------------

function applyResourceFlags(args: string[], limits: SandboxResourceLimits): void {
  args.push(`--memory=${normalizeMemory(limits.maxMemory)}`, `--cpus=${limits.maxCpu}`);
}

function applyNetworkFlags(args: string[], networkPermitted: boolean): void {
  if (!networkPermitted) {
    args.push('--network=none');
  }
}

function applyFilesystemFlags(
  args: string[],
  config: SandboxConfig,
  tmpfsSize: string,
): void {
  if (!config.writePermitted) {
    args.push('--read-only');
  }
  // Always provide a writable /tmp via tmpfs
  args.push(`--tmpfs=/tmp:rw,noexec,nosuid,size=${normalizeMemory(tmpfsSize)}`);

  // Explicit writable bind-mounts (only useful when writePermitted=true)
  if (config.writePermitted && config.writableMounts) {
    for (const mount of config.writableMounts) {
      args.push('-v', mount);
    }
  }
}

function applyEnvFlags(args: string[], env?: Record<string, string>): void {
  if (!env) return;
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Runs plugins in isolated Docker containers.
 *
 * @example
 * ```ts
 * const runner = new DockerPluginRunner();
 * const result = await runner.run({
 *   image: 'dcyfr-plugin-sandbox:latest',
 *   command: ['node', 'dist/index.js'],
 *   resourceLimits: { maxMemory: '256MB', maxExecutionTime: '2m' },
 * });
 * console.log(result.stdout);
 * ```
 */
export class DockerPluginRunner {
  private readonly containerPrefix: string;

  constructor(containerPrefix = 'dcyfr-plugin') {
    this.containerPrefix = containerPrefix;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Execute a plugin inside a sandboxed Docker container.
   * Returns after the container exits or is killed due to timeout.
   */
  async run(config: SandboxConfig): Promise<SandboxResult> {
    const containerName = this.generateContainerName();
    const limits = this.resolveResourceLimits(config.resourceLimits);
    const limitMs = parseDurationMs(limits.maxExecutionTime);
    const runArgs = this.buildRunArgs(containerName, config, limits);
    const startTime = Date.now();

    const result = await this.spawnWithTimeout(runArgs, containerName, limitMs);

    return {
      ...result,
      containerName,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Force-remove a container by name (idempotent — ignores "no such container").
   */
  async cleanup(containerName: string): Promise<void> {
    try {
      await execFileAsync('docker', ['rm', '-f', containerName]);
    } catch {
      // Container already removed or never existed — not an error
    }
  }

  /**
   * Probe whether Docker is installed and the daemon is running.
   */
  async isDockerAvailable(): Promise<DockerProbeResult> {
    try {
      const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
      return { available: true, version: stdout.trim() };
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_);
      return { available: false, error: msg };
    }
  }

  /**
   * Probe whether the gVisor runtime (runsc) is registered with Docker.
   */
  async isGVisorAvailable(): Promise<GVisorProbeResult> {
    try {
      await execFileAsync('docker', ['run', '--rm', '--runtime=runsc', 'hello-world']);
      return { available: true };
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_);
      return { available: false, error: msg };
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private generateContainerName(): string {
    return `${this.containerPrefix}-${randomUUID().slice(0, 8)}`;
  }

  private resolveResourceLimits(
    partial?: Partial<SandboxResourceLimits>,
  ): SandboxResourceLimits {
    return { ...DEFAULT_RESOURCE_LIMITS, ...partial };
  }

  /**
   * Build the complete `docker run` argument array.
   * Does NOT include the `docker` binary itself.
   */
  private buildRunArgs(
    containerName: string,
    config: SandboxConfig,
    limits: SandboxResourceLimits,
  ): string[] {
    const args: string[] = ['run', '--rm', '--name', containerName];

    // Resource limits
    applyResourceFlags(args, limits);

    // Network
    applyNetworkFlags(args, config.networkPermitted ?? false);

    // Filesystem isolation
    applyFilesystemFlags(args, config, limits.maxDiskSpace);

    // Security hardening
    args.push('--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534');

    // gVisor runtime (best-effort — falls through to standard if unavailable)
    if (config.useGVisor) {
      args.push('--runtime=runsc');
    }

    // Working directory
    args.push('-w', config.workDir ?? '/plugin');

    // Environment variables
    applyEnvFlags(args, config.env);

    // Image + command
    args.push(config.image, ...config.command);

    return args;
  }

  /**
   * Spawn `docker run [args]`, enforce time limit, return stdout/stderr/exit code.
   */
  private async spawnWithTimeout(
    args: string[],
    containerName: string,
    limitMs: number,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    const proc = spawn('docker', args, { stdio: 'pipe' });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      void this.stopContainer(containerName);
    }, limitMs);

    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', (code) => resolve(code));
      proc.on('error', () => resolve(null));
    });

    clearTimeout(timer);

    return {
      exitCode,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      timedOut,
    };
  }

  /**
   * Gracefully stop then forcefully remove a running container.
   * First sends SIGTERM (via `docker stop --time=10`), then ensures removal.
   */
  private async stopContainer(containerName: string): Promise<void> {
    try {
      // 10-second grace period before Docker sends SIGKILL
      await execFileAsync('docker', ['stop', '--time', '10', containerName]);
    } catch {
      // Container may have already exited — attempt force kill
      try {
        await execFileAsync('docker', ['kill', containerName]);
      } catch {
        // Already gone — ignore
      }
    }
  }
}
