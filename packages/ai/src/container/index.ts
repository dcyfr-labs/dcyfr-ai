/**
 * Container execution module barrel export.
 * TLP:CLEAR
 *
 * @module container
 */

export {
  LocalDockerBackend,
  type LocalDockerBackendOptions,
} from './local-docker-backend.js';

export {
  RemoteDockerBackend,
  type RemoteDockerBackendOptions,
} from './remote-docker-backend.js';

export { KubernetesBackend } from './kubernetes-backend.js';

export {
  createBackend,
  createBackendFromConfig,
  loadBackendFromConfigFile,
  createBackendWithFailover,
  AgentContainersConfigSchema,
  type BackendOptions,
  type AgentContainersConfigLike,
} from './backend-factory.js';

export {
  AgentContainerDispatcher,
  type AgentContainerDispatcherOptions,
  type IssueDispatchInput,
  type TaskDispatchInput,
  type DispatchOptions,
  type DispatchRecord,
} from './agent-container-dispatcher.js';

export {
  DEFAULT_CONTAINER_RESOURCE_LIMITS,
  ContainerResourceLimitsSchema,
  AgentContainerConfigSchema,
  ContainerHandleSchema,
  ContainerProvisionError,
  ContainerConcurrencyLimitError,
  type ContainerResourceLimits,
  type AgentContainerConfig,
  type ContainerHandle,
  type ContainerLogEntry,
  type ContainerExecutionResult,
  type BackendHealthResult,
  type TeardownResult,
  type ContainerExecutionBackend,
  type ContainerBackendType,
} from './types.js';
