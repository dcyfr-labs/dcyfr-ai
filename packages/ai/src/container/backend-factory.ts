/**
 * Backend factory — create ContainerExecutionBackend instances by type.
 * TLP:CLEAR
 *
 * Provides a unified entry-point so callers don't need to import individual
 * backend classes directly. Also exports a failover wrapper that automatically
 * falls back to a secondary backend when the primary is unhealthy.
 *
 * @module container/backend-factory
 * @version 1.0.0
 */

import { LocalDockerBackend, type LocalDockerBackendOptions } from './local-docker-backend.js';
import { RemoteDockerBackend, type RemoteDockerBackendOptions } from './remote-docker-backend.js';
import { KubernetesBackend } from './kubernetes-backend.js';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  ContainerResourceLimitsSchema,
  type ContainerBackendType,
  type ContainerExecutionBackend,
  type ContainerHandle,
  type ContainerLogEntry,
  type ContainerExecutionResult,
  type BackendHealthResult,
  type TeardownResult,
  type AgentContainerConfig,
} from './types.js';

export type BackendOptions = LocalDockerBackendOptions | RemoteDockerBackendOptions | Record<string, never>;

export const AgentContainersConfigSchema = z
  .object({
    backend: z
      .object({
        type: z.enum(['local-docker', 'remote-docker', 'kubernetes', 'codespaces']).optional(),
        defaultBackend: z
          .enum(['local-docker', 'remote-docker', 'kubernetes', 'codespaces'])
          .optional(),
        localDocker: z
          .object({
            maxConcurrent: z.number().int().min(1).optional(),
            defaultImage: z.string().min(1).optional(),
          })
          .passthrough()
          .optional(),
        remoteDocker: z
          .object({
            host: z.string().min(1).optional(),
            tlsCertPath: z.string().optional(),
            maxConcurrent: z.number().int().min(1).optional(),
            defaultImage: z.string().min(1).optional(),
          })
          .passthrough()
          .optional(),
        kubernetes: z
          .object({
            namespace: z.string().min(1).optional(),
            kubeConfigPath: z.string().optional(),
            maxConcurrent: z.number().int().min(1).optional(),
          })
          .passthrough()
          .optional(),
      })
      .partial()
      .optional(),
    defaults: z
      .object({
        agentImage: z.string().min(1).optional(),
        baseBranch: z.string().min(1).optional(),
        resourceLimits: ContainerResourceLimitsSchema.optional(),
      })
      .partial()
      .optional(),
    telemetry: z
      .object({
        enabled: z.boolean().optional(),
        logDir: z.string().min(1).optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

export type AgentContainersConfigLike = z.infer<typeof AgentContainersConfigSchema>;

/**
 * Create a ContainerExecutionBackend of the given type.
 *
 * @param type - The backend variant to instantiate.
 * @param options - Backend-specific constructor options.
 */
export function createBackend(
  type: ContainerBackendType,
  options?: BackendOptions,
): ContainerExecutionBackend {
  switch (type) {
    case 'local-docker':
      return new LocalDockerBackend(options as LocalDockerBackendOptions);
    case 'remote-docker':
      return new RemoteDockerBackend(options as RemoteDockerBackendOptions);
    case 'kubernetes':
      return new KubernetesBackend();
    case 'codespaces':
      throw new Error('CodespacesBackend not yet implemented');
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown backend type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Create backend from parsed agent-containers config object.
 * Supports both `backend.type` and legacy `backend.defaultBackend`.
 */
export function createBackendFromConfig(config: AgentContainersConfigLike): ContainerExecutionBackend {
  const validatedConfig = AgentContainersConfigSchema.parse(config);

  const selected =
    validatedConfig.backend?.defaultBackend ?? validatedConfig.backend?.type ?? 'local-docker';

  if (selected === 'local-docker') {
    const options: LocalDockerBackendOptions = {
      ...(validatedConfig.backend?.localDocker ?? {}),
      defaultImage:
        validatedConfig.backend?.localDocker?.defaultImage ?? validatedConfig.defaults?.agentImage,
    };
    return createBackend('local-docker', options);
  }

  if (selected === 'remote-docker') {
    const options: RemoteDockerBackendOptions = {
      ...(validatedConfig.backend?.remoteDocker ?? {}),
      defaultImage:
        validatedConfig.backend?.remoteDocker?.defaultImage ??
        validatedConfig.defaults?.agentImage,
    };
    return createBackend('remote-docker', options);
  }

  return createBackend(selected);
}

/**
 * Load backend from config JSON file path.
 */
export function loadBackendFromConfigFile(filePath: string): ContainerExecutionBackend {
  const raw = readFileSync(filePath, 'utf8');
  const config = AgentContainersConfigSchema.parse(JSON.parse(raw));
  return createBackendFromConfig(config);
}

/**
 * Wrap a primary backend with an automatic failover to a secondary backend.
 *
 * On each operation, the wrapper first checks the primary backend's health.
 * If unavailable, the operation is transparently delegated to the fallback.
 *
 * @param primary   - The preferred backend.
 * @param fallback  - Used when primary healthCheck returns `available: false`.
 */
export function createBackendWithFailover(
  primary: ContainerExecutionBackend,
  fallback: ContainerExecutionBackend,
): ContainerExecutionBackend {
  return new FailoverBackend(primary, fallback);
}

class FailoverBackend implements ContainerExecutionBackend {
  public readonly backendType: ContainerBackendType;

  constructor(
    private readonly primary: ContainerExecutionBackend,
    private readonly fallback: ContainerExecutionBackend,
  ) {
    this.backendType = primary.backendType;
  }

  private async resolve(): Promise<ContainerExecutionBackend> {
    const health = await this.primary.healthCheck();
    return health.available ? this.primary : this.fallback;
  }

  async healthCheck(): Promise<BackendHealthResult> {
    return this.primary.healthCheck();
  }

  async provision(config: AgentContainerConfig): Promise<ContainerHandle> {
    return (await this.resolve()).provision(config);
  }

  async *streamLogs(handle: ContainerHandle): AsyncIterable<ContainerLogEntry> {
    const backend = await this.resolve();
    yield* backend.streamLogs(handle);
  }

  async waitForExit(handle: ContainerHandle): Promise<ContainerExecutionResult> {
    return (await this.resolve()).waitForExit(handle);
  }

  async teardown(handle: ContainerHandle): Promise<TeardownResult> {
    return (await this.resolve()).teardown(handle);
  }

  async listActive(): Promise<ContainerHandle[]> {
    return (await this.resolve()).listActive();
  }
}
