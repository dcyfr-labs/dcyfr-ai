/**
 * RemoteDockerBackend
 * TLP:CLEAR
 *
 * ContainerExecutionBackend backed by a remote Docker daemon.
 * Connects via the DOCKER_HOST environment variable or a configured
 * TCP/SSH endpoint (e.g. `ssh://user@host`, `tcp://host:2376`).
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
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
const CONTAINER_PREFIX = 'dcyfr-agent';

export interface RemoteDockerBackendOptions {
  /** Remote Docker host endpoint. e.g. "ssh://user@host" or "tcp://host:2376" */
  host?: string;
  /** Maximum simultaneous containers. Default: 5. */
  maxConcurrent?: number;
  /** Default image if not in AgentContainerConfig. */
  defaultImage?: string;
}

export class RemoteDockerBackend implements ContainerExecutionBackend {
  public readonly backendType = 'remote-docker' as const;

  private readonly host: string | undefined;
  private readonly maxConcurrent: number;
  private readonly defaultImage: string;
  private readonly active = new Map<string, ContainerHandle>();

  constructor(options: RemoteDockerBackendOptions = {}) {
    this.host = options.host ?? process.env['DOCKER_HOST'];
    this.maxConcurrent = options.maxConcurrent ?? 5;
    this.defaultImage = options.defaultImage ?? 'dcyfr/agent:latest';
  }

  private hostFlag(): string[] {
    return this.host ? ['--host', this.host] : [];
  }

  private generateContainerName(): string {
    return `${CONTAINER_PREFIX}-${randomUUID().slice(0, 8)}`;
  }

  private resolveResourceLimits(
    partial?: Partial<ContainerResourceLimits>,
  ): ContainerResourceLimits {
    return { ...DEFAULT_CONTAINER_RESOURCE_LIMITS, ...partial };
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<BackendHealthResult> {
    try {
      const { stdout } = await execFileAsync(
        'docker',
        [...this.hostFlag(), 'version', '--format', '{{.Server.Version}}'],
        { timeout: 10_000 },
      );
      return {
        available: true,
        backendType: this.backendType,
        version: stdout.trim(),
        details: { host: this.host ?? '(DOCKER_HOST)', active: this.active.size },
      };
    } catch (error) {
      return {
        available: false,
        backendType: this.backendType,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Provision ─────────────────────────────────────────────────────────────

  async provision(config: AgentContainerConfig): Promise<ContainerHandle> {
    if (this.active.size >= this.maxConcurrent) {
      throw new ContainerConcurrencyLimitError(this.maxConcurrent, this.active.size);
    }

    const limits = this.resolveResourceLimits(config.resourceLimits);
    const containerName = this.generateContainerName();
    const image = config.image || this.defaultImage;

    // Ensure image is available on remote host by pulling before run.
    await execFileAsync(
      'docker',
      [...this.hostFlag(), 'pull', image],
      { timeout: 120_000 },
    );

    const args: string[] = [
      ...this.hostFlag(),
      'run',
      '--name', containerName,
      `--memory=${limits.maxMemory}`,
      `--cpus=${limits.maxCpus}`,
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--network=none',
    ];

    args.push(
      '--env', `AGENT_TASK_ID=${config.taskId}`,
      '--env', `AGENT_TASK_DESC=${config.taskDescription}`,
      '--env', `AGENT_REPO=${config.repo}`,
      '--env', `AGENT_CONTRACT_ID=${config.contractId}`,
    );

    for (const [k, v] of Object.entries(config.env ?? {})) {
      args.push('--env', `${k}=${v}`);
    }

    // Inject secrets as environment variables (not logged)
    args.push('--env', `GITHUB_TOKEN=${config.githubToken}`);

    if (config.issueNumber !== undefined) {
      args.push('--env', `AGENT_ISSUE_NUMBER=${config.issueNumber}`);
    }

    args.push(image);

    const proc = spawn('docker', args, { stdio: 'pipe', detached: false });

    const { githubToken: _, ...redactedConfig } = config;

    const handle: ContainerHandle = {
      containerId: containerName,
      containerName,
      startedAt: new Date(),
      backendType: this.backendType,
      config: redactedConfig,
    };

    Object.defineProperty(handle, '_proc', { value: proc, enumerable: false, writable: true });

    this.active.set(containerName, handle);
    proc.on('exit', () => { this.active.delete(containerName); });

    await new Promise<void>((resolve, reject) => {
      proc.on('spawn', resolve);
      proc.on('error', reject);
      setTimeout(resolve, 5_000);
    });

    return handle;
  }

  // ── Log streaming ──────────────────────────────────────────────────────────

  async *streamLogs(handle: ContainerHandle): AsyncIterable<ContainerLogEntry> {
    const logsProc = spawn(
      'docker',
      [...this.hostFlag(), 'logs', '--follow', handle.containerName],
      { stdio: 'pipe' },
    );

    for await (const chunk of (logsProc.stdout ?? [])) {
      const text = (chunk as Buffer).toString('utf8');
      for (const line of text.split('\n')) {
        if (line.trim()) {
          yield {
            timestamp: new Date(),
            stream: 'stdout' as const,
            text: line,
            containerId: handle.containerId,
          };
        }
      }
    }
  }

  // ── Wait for exit ──────────────────────────────────────────────────────────

  async waitForExit(handle: ContainerHandle): Promise<ContainerExecutionResult> {
    const proc = (handle as unknown as { _proc?: ReturnType<typeof spawn> })._proc;
    const limits = handle.config.resourceLimits
      ? { ...DEFAULT_CONTAINER_RESOURCE_LIMITS, ...handle.config.resourceLimits }
      : DEFAULT_CONTAINER_RESOURCE_LIMITS;

    const startTimeMs = handle.startedAt.getTime();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    if (!proc) {
      const result = await execFileAsync(
        'docker',
        [...this.hostFlag(), 'wait', handle.containerName],
        { timeout: limits.maxExecutionTimeMs + 30_000 },
      ).catch(() => ({ stdout: '-1', stderr: '' }));
      const exitCode = parseInt(result.stdout.trim(), 10);
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

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      void execFileAsync('docker', [...this.hostFlag(), 'stop', handle.containerName])
        .catch(() => undefined);
    }, limits.maxExecutionTimeMs);

    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', (code: number | null) => resolve(code));
      proc.on('error', () => resolve(null));
    });

    clearTimeout(timeoutTimer);

    const MAX_OUTPUT = 64 * 1024;
    const stdout = Buffer.concat(stdoutChunks).toString('utf8').slice(-MAX_OUTPUT);
    const stderr = Buffer.concat(stderrChunks).toString('utf8').slice(-MAX_OUTPUT);
    const prMatch = /AGENT_PR_URL=(https:\/\/github\.com\/[^\s]+)/.exec(stdout);

    return {
      success: exitCode === 0,
      exitCode,
      timedOut,
      executionTimeMs: Date.now() - startTimeMs,
      stdout,
      stderr,
      pullRequestUrl: prMatch?.[1],
    };
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  async teardown(handle: ContainerHandle): Promise<TeardownResult> {
    try {
      await execFileAsync('docker', [...this.hostFlag(), 'rm', '-f', handle.containerName]);
      this.active.delete(handle.containerName);
      return { success: true, containerId: handle.containerId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('No such container')) {
        this.active.delete(handle.containerName);
        return { success: true, containerId: handle.containerId };
      }
      return { success: false, containerId: handle.containerId, error: msg };
    }
  }

  // ── List active ────────────────────────────────────────────────────────────

  async listActive(): Promise<ContainerHandle[]> {
    return [...this.active.values()];
  }
}
