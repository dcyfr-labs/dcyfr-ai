/**
 * KubernetesBackend — stub implementation
 * TLP:CLEAR
 *
 * Future backend for running agent containers as Kubernetes Jobs.
 * All methods throw a NotImplementedError until activated.
 *
 * Activation guide: docs/guides/kubernetes-backend-activation.md
 *
 * @module container/kubernetes-backend
 * @version 1.0.0
 */

import {
  type ContainerHandle,
  type ContainerLogEntry,
  type ContainerExecutionResult,
  type BackendHealthResult,
  type TeardownResult,
  type ContainerExecutionBackend,
  type AgentContainerConfig,
} from './types.js';

const NOT_IMPLEMENTED_MSG =
  'KubernetesBackend not yet implemented — see docs/guides/kubernetes-backend-activation.md';

export class KubernetesBackend implements ContainerExecutionBackend {
  public readonly backendType = 'kubernetes' as const;

  async healthCheck(): Promise<BackendHealthResult> {
    return {
      available: false,
      backendType: this.backendType,
      error: 'KubernetesBackend is a stub — not yet activated',
    };
  }

  async provision(_config: AgentContainerConfig): Promise<ContainerHandle> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  }

  // Not a generator: the stub throws at call time instead of on first
  // iteration, which `yield*` in BackendFactory surfaces identically.
  streamLogs(_handle: ContainerHandle): AsyncIterable<ContainerLogEntry> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  }

  async waitForExit(_handle: ContainerHandle): Promise<ContainerExecutionResult> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  }

  async teardown(_handle: ContainerHandle): Promise<TeardownResult> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  }

  async listActive(): Promise<ContainerHandle[]> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  }
}
