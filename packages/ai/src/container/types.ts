/**
 * Autonomous Agent Container Execution — Type Definitions
 * TLP:CLEAR
 *
 * Defines the pluggable ContainerExecutionBackend interface and all supporting
 * types for running DCYFR agents in isolated containers. The LocalDockerBackend
 * is the default v1 implementation; RemoteDockerBackend, KubernetesBackend, and
 * CodespacesBackend are planned for Phase 4.
 *
 * @module container/types
 * @version 1.0.0
 * @date 2026-03-01
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Resource limits
// ---------------------------------------------------------------------------

/**
 * Resource constraints applied to an agent container.
 * Mirrors Docker flags: --memory, --cpus, --storage-opt size, --stop-timeout.
 */
export interface ContainerResourceLimits {
  /** Maximum memory (e.g. "2g", "512m"). Default: "2g". */
  maxMemory: string;
  /** CPU cores available to the container. Default: 2. */
  maxCpus: number;
  /** Maximum execution time in milliseconds. Default: 30 minutes. */
  maxExecutionTimeMs: number;
  /** Maximum disk space (e.g. "10g"). Default: "10g". Applied when backend supports it. */
  maxDiskSpace?: string;
}

/** Zod schema for validating container resource limits. */
export const ContainerResourceLimitsSchema = z
  .object({
    maxMemory: z.string().regex(/^[0-9]+(?:k|m|g)$/i, 'maxMemory must be like 512m or 2g'),
    maxCpus: z.number().positive('maxCpus must be > 0'),
    maxExecutionTimeMs: z.number().int().min(1, 'maxExecutionTimeMs must be >= 1'),
    maxDiskSpace: z
      .string()
      .regex(/^[0-9]+(?:k|m|g)$/i, 'maxDiskSpace must be like 10g')
      .optional(),
  })
  .strict();

export const DEFAULT_CONTAINER_RESOURCE_LIMITS: ContainerResourceLimits = {
  maxMemory: '2g',
  maxCpus: 2,
  maxExecutionTimeMs: 30 * 60 * 1_000, // 30 min
  maxDiskSpace: '10g',
};

// ---------------------------------------------------------------------------
// Container configuration
// ---------------------------------------------------------------------------

/**
 * Full configuration for dispatching an agent container.
 */
export interface AgentContainerConfig {
  /** Docker image to run (e.g. "dcyfr/agent:latest"). */
  image: string;

  /** Target GitHub repository in owner/repo format (e.g. "dcyfr/workspace"). */
  repo: string;

  /** Base branch for the PR. Defaults to "main". */
  baseBranch?: string;

  /** OpenSpec task identifier (e.g. "1.3.1"). */
  taskId: string;

  /** Human-readable task description. */
  taskDescription: string;

  /** Delegation contract ID — passed into the container for status reporting. */
  contractId: string;

  /**
   * Base64-encoded shell script implementing the task.
   * Validated by ContentPolicyMiddleware before injection.
   */
  taskScriptB64?: string;

  /**
   * Base64-encoded unified diff to apply instead of a script.
   * Alternative to taskScriptB64 when a pre-computed patch is available.
   */
  taskPatchB64?: string;

  /** Environment variables injected into the container (excluding secrets). */
  env?: Record<string, string>;

  /** Resource limits. Falls back to DEFAULT_CONTAINER_RESOURCE_LIMITS. */
  resourceLimits?: Partial<ContainerResourceLimits>;

  /** GitHub personal access token. Injected as GITHUB_TOKEN secret. Never logged. */
  githubToken: string;

  /**
   * If true, the container skips git push and PR creation.
   * Useful for local integration tests.
   */
  dryRun?: boolean;

  /**
   * GitHub issue number that triggered this dispatch.
   * Injected as AGENT_ISSUE_NUMBER so the entrypoint can set "Closes #N" in the PR.
   */
  issueNumber?: number;
}

/** Zod schema for validating container dispatch configuration. */
export const AgentContainerConfigSchema = z
  .object({
    image: z.string().min(1),
    repo: z.string().min(3),
    baseBranch: z.string().min(1).optional(),
    taskId: z.string().min(1),
    taskDescription: z.string().min(1),
    contractId: z.string().min(1),
    taskScriptB64: z.string().min(1).optional(),
    taskPatchB64: z.string().min(1).optional(),
    env: z.record(z.string(), z.string()).optional(),
    resourceLimits: ContainerResourceLimitsSchema.partial().optional(),
    githubToken: z.string().min(1),
    dryRun: z.boolean().optional(),
    issueNumber: z.number().int().positive().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Container handle (opaque reference returned by provision())
// ---------------------------------------------------------------------------

/**
 * Opaque handle returned by {@link ContainerExecutionBackend.provision}.
 * Callers use this to stream logs, check status, and tear down containers.
 */
export interface ContainerHandle {
  /** Unique container ID assigned by the Docker daemon. */
  containerId: string;

  /** Human-readable container name (e.g., "dcyfr-agent-8f3a2b1c"). */
  containerName: string;

  /** Timestamp when the container was started. */
  startedAt: Date;

  /** The config used to start this container (secrets redacted). */
  config: Omit<AgentContainerConfig, 'githubToken'>;

  /** Which backend provisioned this container. */
  backendType: ContainerBackendType;
}

/** Zod schema for runtime container handle objects. */
export const ContainerHandleSchema = z
  .object({
    containerId: z.string().min(1),
    containerName: z.string().min(1),
    startedAt: z.date(),
    config: AgentContainerConfigSchema.omit({ githubToken: true }),
    backendType: z.enum(['local-docker', 'remote-docker', 'kubernetes', 'codespaces']),
  })
  .strict();

// ---------------------------------------------------------------------------
// Log streaming
// ---------------------------------------------------------------------------

/** A single log line emitted by a running container. */
export interface ContainerLogEntry {
  /** Monotonic timestamp of the log line. */
  timestamp: Date;
  /** Log stream: "stdout" or "stderr". */
  stream: 'stdout' | 'stderr';
  /** Raw log text (may be JSON). */
  text: string;
  /** Container ID for multiplexed log streams. */
  containerId: string;
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------

/** Outcome of a container run returned when the container exits. */
export interface ContainerExecutionResult {
  /** Whether the container exited successfully (exit code 0). */
  success: boolean;
  /** Raw exit code from the container process. */
    exitCode: number | null;
  /** True if the container was killed due to exceeding maxExecutionTimeMs. */
  timedOut: boolean;
  /** Wall-clock execution time in milliseconds. */
  executionTimeMs: number;
  /** URL of the pull request created by the agent, if any. */
  pullRequestUrl?: string;
  /** Captured stdout (may be truncated for large outputs). */
  stdout: string;
  /** Captured stderr (may be truncated for large outputs). */
  stderr: string;
}

// ---------------------------------------------------------------------------
// Backend health
// ---------------------------------------------------------------------------

/** Health check result returned by {@link ContainerExecutionBackend.healthCheck}. */
export interface BackendHealthResult {
  /** Whether the backend is available and ready to accept containers. */
  available: boolean;
  /** Backend implementation type. */
  backendType: ContainerBackendType;
  /** Detected runtime version (e.g. Docker daemon version). */
  version?: string;
  /** Human-readable error if unavailable. */
  error?: string;
  /** Additional backend-specific details. */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/** Result of tearing down a container. */
export interface TeardownResult {
  /** Whether teardown completed without error. */
  success: boolean;
  /** Container ID that was torn down. */
  containerId: string;
  /** Error message if teardown failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Backend type discriminant
// ---------------------------------------------------------------------------

/**
 * Identifies which container backend is in use.
 * Used in ContainerHandle and telemetry for routing context.
 */
export type ContainerBackendType =
  | 'local-docker'
  | 'remote-docker'
  | 'kubernetes'
  | 'codespaces';

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

/**
 * Pluggable container execution backend.
 *
 * All backends must implement this interface. The active backend is selected
 * at runtime from `config/agent-containers.json` → `backend.type`.
 *
 * @example
 * ```typescript
 * const backend: ContainerExecutionBackend = new LocalDockerBackend();
 * const health = await backend.healthCheck();
 * if (!health.available) throw new Error(health.error);
 * const handle = await backend.provision(config);
 * for await (const entry of backend.streamLogs(handle)) {
 *   console.log(entry.text);
 * }
 * const result = await backend.waitForExit(handle);
 * await backend.teardown(handle);
 * ```
 */
export interface ContainerExecutionBackend {
  /** The type tag for this backend implementation. */
  readonly backendType: ContainerBackendType;

  /**
   * Check whether the backend is available and healthy.
   * Called before dispatch to gate container creation.
   */
  healthCheck(): Promise<BackendHealthResult>;

  /**
   * Start an agent container and return an opaque handle.
   * The container begins executing immediately upon return.
   *
   * @throws {ContainerProvisionError} if the backend cannot start the container.
   */
  provision(config: AgentContainerConfig): Promise<ContainerHandle>;

  /**
   * Yield log lines from a running container.
   * Implementations must stop yielding after the container exits.
   */
  streamLogs(handle: ContainerHandle): AsyncIterable<ContainerLogEntry>;

  /**
   * Wait for the container to exit and return the execution result.
   * Blocks until the container stops or the resource limit timeout fires.
   */
  waitForExit(handle: ContainerHandle): Promise<ContainerExecutionResult>;

  /**
   * Force-remove the container and clean up associated resources.
   * Idempotent — safe to call even if the container has already exited.
   */
  teardown(handle: ContainerHandle): Promise<TeardownResult>;

  /**
   * List all active containers managed by this backend.
   * Returns an empty array if none are running.
   */
  listActive(): Promise<ContainerHandle[]>;
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

/** Thrown when a backend fails to start a container. */
export class ContainerProvisionError extends Error {
  constructor(
    message: string,
    public readonly backendType: ContainerBackendType,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ContainerProvisionError';
  }
}

/** Thrown when the concurrency limit is reached and no slots are available. */
export class ContainerConcurrencyLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly active: number,
  ) {
    super(`Container concurrency limit reached (${active}/${limit} active)`);
    this.name = 'ContainerConcurrencyLimitError';
  }
}
