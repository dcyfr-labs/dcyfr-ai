/**
 * LocalDockerBackend
 * TLP:CLEAR
 *
 * ContainerExecutionBackend implementation backed by the local Docker daemon.
 * Designed for workbench development and CI; production scale-out uses
 * RemoteDockerBackend or KubernetesBackend (Phase 4).
 *
 * Concurrency: max 3 simultaneous containers (configurable via constructor).
 * Each container gets an ephemeral name (dcyfr-agent-<uuid8>) so multiple
 * concurrent runs never collide.
 *
 * @module container/local-docker-backend
 * @version 1.0.0
 * @date 2026-03-01
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_CONTAINER_RESOURCE_LIMITS,
  ContainerConcurrencyLimitError,
  type AgentContainerConfig,
  type ContainerHandle,
  type ContainerLogEntry,
  type ContainerExecutionResult,
  type BackendHealthResult,
  type TeardownResult,
  type ContainerExecutionBackend,
  type ContainerResourceLimits,
} from './types.js';

const execFileAsync = promisify(execFile);

/** Name prefix for all containers managed by this backend. */
const CONTAINER_PREFIX = 'dcyfr-agent';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LocalDockerBackendOptions {
  /**
   * Maximum number of agent containers running simultaneously.
   * Prevents CPU/memory exhaustion on the workbench.
   * Default: 3.
   */
  maxConcurrent?: number;

  /**
   * Docker image tag to use when AgentContainerConfig.image is not set.
   * Default: "dcyfr/agent:latest".
   */
  defaultImage?: string;

  /**
   * Extra Docker flags appended to every `docker run` invocation.
   * Use sparingly — most flags are derived from AgentContainerConfig.
   */
  extraDockerFlags?: string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class LocalDockerBackend implements ContainerExecutionBackend {
  readonly backendType = 'local-docker' as const;

  private readonly maxConcurrent: number;
  private readonly defaultImage: string;
  private readonly extraDockerFlags: string[];

  /**
   * In-memory tracking of active containers keyed by containerId.
   * This is intentionally simple — a process restart clears it.
   * The delegation contract manager is the authoritative state store.
   */
  private readonly active = new Map<string, ContainerHandle>();
  private readonly secretDirs = new Map<string, string>();

  constructor(options: LocalDockerBackendOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.defaultImage = options.defaultImage ?? 'dcyfr/agent:latest';
    this.extraDockerFlags = options.extraDockerFlags ?? [];
  }

  // ── Health check ───────────────────────────────────────────────────────────

  async healthCheck(): Promise<BackendHealthResult> {
    try {
      const { stdout } = await execFileAsync('docker', [
        'version',
        '--format',
        '{{.Server.Version}}',
      ]);
      return {
        available: true,
        backendType: this.backendType,
        version: stdout.trim(),
        details: { maxConcurrent: this.maxConcurrent, active: this.active.size },
      };
    } catch (error) {
      return {
        available: false,
        backendType: this.backendType,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Provision ──────────────────────────────────────────────────────────────

  async provision(config: AgentContainerConfig): Promise<ContainerHandle> {
    if (this.active.size >= this.maxConcurrent) {
      throw new ContainerConcurrencyLimitError(this.maxConcurrent, this.active.size);
    }

    const limits = this.resolveResourceLimits(config.resourceLimits);
    const containerName = this.generateContainerName();
    const image = config.image || this.defaultImage;
    const tokenSecretPath = this.createGithubTokenSecret(config.githubToken, containerName);

    const runArgs = this.buildRunArgs(containerName, config, limits, image, tokenSecretPath);

    // Spawn detached so provision() returns immediately while the container runs.
    // stdout/stderr are piped — callers consume them via streamLogs() / waitForExit().
    const proc = spawn('docker', runArgs, { stdio: 'pipe', detached: false });

    const handle: ContainerHandle = {
      containerId: containerName, // Use name as ID until we get the real Docker ID
      containerName,
      startedAt: new Date(),
      backendType: this.backendType,
      config: this.redactConfig(config),
    };

    // Fetch the real Docker container ID asynchronously (best-effort)
    this.resolveContainerId(containerName).then((dockerId) => {
      if (dockerId) {
        // Update in-place — callers already hold a reference to the same object
        (handle as { containerId: string }).containerId = dockerId;
      }
    }).catch(() => { /* Docker ID resolution is best-effort */ });

    // Store proc reference on the handle via a side channel so waitForExit() can await it.
    // We use a non-enumerable property to avoid leaking the process into serialized output.
    Object.defineProperty(handle, '_proc', { value: proc, enumerable: false, writable: true });

    this.active.set(containerName, handle);

    // Auto-remove from active map when process exits
    proc.on('exit', () => {
      this.active.delete(containerName);
      this.cleanupSecret(containerName);
    });

    // Throw on immediate spawn errors (e.g., docker binary not found)
    await new Promise<void>((resolve, reject) => {
      proc.on('spawn', resolve);
      proc.on('error', reject);
      // If neither fires within 5 s the process is already running
      setTimeout(resolve, 5_000);
    });

    return handle;
  }

  // ── Log streaming ──────────────────────────────────────────────────────────

  async *streamLogs(handle: ContainerHandle): AsyncIterable<ContainerLogEntry> {
    // Prefer the live process pipe if available (provision() just called)
    const proc = (handle as { _proc?: ReturnType<typeof spawn> })._proc;
    if (proc?.stdout) {
      for await (const chunk of proc.stdout) {
        const text = (chunk as Buffer).toString('utf8');
        for (const line of text.split('\n')) {
          if (line.trim()) {
            yield {
              timestamp: new Date(),
              stream: 'stdout',
              text: line,
              containerId: handle.containerId,
            };
          }
        }
      }
      // Also drain stderr
      if (proc.stderr) {
        for await (const chunk of proc.stderr) {
          const text = (chunk as Buffer).toString('utf8');
          for (const line of text.split('\n')) {
            if (line.trim()) {
              yield {
                timestamp: new Date(),
                stream: 'stderr',
                text: line,
                containerId: handle.containerId,
              };
            }
          }
        }
      }
      return;
    }

    // Fallback: `docker logs --follow` for containers already running
    const logsProc = spawn('docker', ['logs', '--follow', '--timestamps', handle.containerName], {
      stdio: 'pipe',
    });
    for await (const chunk of logsProc.stdout ?? []) {
      const text = (chunk as Buffer).toString('utf8');
      for (const line of text.split('\n')) {
        if (line.trim()) {
          yield {
            timestamp: new Date(),
            stream: 'stdout',
            text: line,
            containerId: handle.containerId,
          };
        }
      }
    }
  }

  // ── Wait for exit ──────────────────────────────────────────────────────────

  async waitForExit(handle: ContainerHandle): Promise<ContainerExecutionResult> {
    const proc = (handle as { _proc?: ReturnType<typeof spawn> })._proc;
    const limits = handle.config.resourceLimits
      ? { ...DEFAULT_CONTAINER_RESOURCE_LIMITS, ...handle.config.resourceLimits }
      : DEFAULT_CONTAINER_RESOURCE_LIMITS;

    const startTimeMs = handle.startedAt.getTime();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    if (!proc) {
      // Container was started externally — wait using `docker wait`
      const { stdout } = await execFileAsync('docker', ['wait', handle.containerName]).catch(() => ({
        stdout: '-1',
      }));
      const exitCode = parseInt(stdout.trim(), 10);
      return {
        success: exitCode === 0,
        exitCode: Number.isNaN(exitCode) ? null : exitCode,
        timedOut: false,
        executionTimeMs: Date.now() - startTimeMs,
        stdout: '',
        stderr: '',
      };
    }

    proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    // Enforce time limit
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      void this.stopContainer(handle.containerName);
    }, limits.maxExecutionTimeMs);

    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', (code: number | null) => resolve(code));
      proc.on('error', () => resolve(null));
    });

    clearTimeout(timeoutTimer);

    const MAX_OUTPUT = 64 * 1024; // 64 KB
    const stdout = Buffer.concat(stdoutChunks).toString('utf8').slice(-MAX_OUTPUT);
    const stderr = Buffer.concat(stderrChunks).toString('utf8').slice(-MAX_OUTPUT);

    // Extract PR URL from stdout if present
    const prMatch = /AGENT_PR_URL=(https:\/\/github\.com\/[^\s]+)/.exec(stdout);
    const pullRequestUrl = prMatch?.[1];

    return {
      success: exitCode === 0,
      exitCode,
      timedOut,
      executionTimeMs: Date.now() - startTimeMs,
      stdout,
      stderr,
      pullRequestUrl,
    };
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  async teardown(handle: ContainerHandle): Promise<TeardownResult> {
    try {
      await execFileAsync('docker', ['rm', '-f', handle.containerName]);
      this.active.delete(handle.containerName);
      this.cleanupSecret(handle.containerName);
      return { success: true, containerId: handle.containerId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // "No such container" is not an error — already cleaned up
      if (msg.includes('No such container')) {
        this.active.delete(handle.containerName);
        this.cleanupSecret(handle.containerName);
        return { success: true, containerId: handle.containerId };
      }
      return { success: false, containerId: handle.containerId, error: msg };
    }
  }

  // ── List active ────────────────────────────────────────────────────────────

  async listActive(): Promise<ContainerHandle[]> {
    return [...this.active.values()];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private generateContainerName(): string {
    return `${CONTAINER_PREFIX}-${randomUUID().slice(0, 8)}`;
  }

  private resolveResourceLimits(
    partial?: Partial<ContainerResourceLimits>,
  ): ContainerResourceLimits {
    return { ...DEFAULT_CONTAINER_RESOURCE_LIMITS, ...partial };
  }

  private buildRunArgs(
    containerName: string,
    config: AgentContainerConfig,
    limits: ContainerResourceLimits,
    image: string,
    tokenSecretPath: string,
  ): string[] {
    const args: string[] = ['run', '--name', containerName];

    // ── Resource limits ──────────────────────────────────────────────────
    args.push(`--memory=${limits.maxMemory}`);
    args.push(`--cpus=${limits.maxCpus}`);

    // ── Security hardening ───────────────────────────────────────────────
    args.push(
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--user=1001:1001',
    );

    // ── Network ─────────────────────────────────────────────────────────
    // Allow outbound internet (needed for github.com + registry.npmjs.org)
    // Network restriction is enforced via Docker network policy or firewall
    // rules applied at the host level, not inside the container.

    // ── GitHub token via mounted secret file (never passed as env) ───────
    args.push('--mount', `type=bind,source=${tokenSecretPath},target=/run/secrets/github_token,readonly`);
    args.push('-e', 'GITHUB_TOKEN_FILE=/run/secrets/github_token');

    // ── Task parameters ──────────────────────────────────────────────────
    args.push('-e', `AGENT_TASK_ID=${config.taskId}`);
    args.push('-e', `AGENT_TASK_DESC=${config.taskDescription}`);
    args.push('-e', `AGENT_REPO=${config.repo}`);
    args.push('-e', `AGENT_CONTRACT_ID=${config.contractId}`);

    if (config.baseBranch) {
      args.push('-e', `AGENT_BASE_BRANCH=${config.baseBranch}`);
    }
    if (config.taskScriptB64) {
      args.push('-e', `AGENT_SCRIPT_B64=${config.taskScriptB64}`);
    }
    if (config.taskPatchB64) {
      args.push('-e', `AGENT_PATCH_B64=${config.taskPatchB64}`);
    }
    if (config.dryRun) {
      args.push('-e', 'AGENT_SKIP_PUSH=1');
    }

    // ── Extra caller-supplied env vars ───────────────────────────────────
    for (const [key, value] of Object.entries(config.env ?? {})) {
      args.push('-e', `${key}=${value}`);
    }

    // ── Extra flags from constructor ─────────────────────────────────────
    args.push(...this.extraDockerFlags);

    // ── Image (must be last before any CMD override) ─────────────────────
    args.push(image);

    return args;
  }

  private createGithubTokenSecret(githubToken: string, containerName: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'dcyfr-agent-secret-'));
    const tokenFile = join(dir, 'github_token');
    writeFileSync(tokenFile, githubToken, { mode: 0o600, encoding: 'utf8' });
    this.secretDirs.set(containerName, dir);
    return tokenFile;
  }

  private cleanupSecret(containerName: string): void {
    const dir = this.secretDirs.get(containerName);
    if (!dir) return;
    try {
      rmSync(dir, { recursive: true, force: true });
    } finally {
      this.secretDirs.delete(containerName);
    }
  }

  /**
   * Gracefully stop a container:
   * 1. `docker stop --time=10` (SIGTERM + 10s grace)
   * 2. `docker kill` if stop fails
   */
  private async stopContainer(containerName: string): Promise<void> {
    try {
      await execFileAsync('docker', ['stop', '--time', '10', containerName]);
    } catch {
      try {
        await execFileAsync('docker', ['kill', containerName]);
      } catch {
        // Already gone
      }
    }
  }

  /**
   * Resolve the real Docker container ID from its name.
   * Docker assigns the ID asynchronously after container creation.
   */
  private async resolveContainerId(containerName: string): Promise<string | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const { stdout } = await execFileAsync('docker', [
          'inspect',
          '--format',
          '{{.Id}}',
          containerName,
        ]);
        const id = stdout.trim();
        if (id) return id;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  /**
   * Return a copy of the config with the githubToken redacted.
   * The redacted copy is stored on ContainerHandle (which may be serialized).
   */
  private redactConfig(
    config: AgentContainerConfig,
  ): Omit<AgentContainerConfig, 'githubToken'> {
    const { githubToken: _token, ...rest } = config;
    return rest;
  }
}
