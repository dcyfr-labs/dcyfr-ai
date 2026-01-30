/**
 * Agent Module - Exports for the agent framework
 *
 * @module @dcyfr/ai/agents
 */

// Type exports
export type {
  AgentCategory,
  AgentTier,
  AgentModel,
  AgentPermissionMode,
  AgentQualityGate,
  AgentProactiveTrigger,
  AgentSkill,
  AgentManifest,
  AgentHooks,
  Agent,
  LoadedAgent,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentViolation,
  AgentRoutingRule,
  AgentRoutingResult,
  AgentRegistryConfig,
  AgentLoaderConfig,
  AgentRouterConfig,
} from './types';

// Agent Loader exports
export {
  AgentLoader,
  AgentLoadError,
  AgentValidationError,
  getGlobalAgentLoader,
  resetGlobalAgentLoader,
} from './agent-loader';

// Agent Registry exports
export {
  AgentRegistry,
  getGlobalAgentRegistry,
  resetGlobalAgentRegistry,
} from './agent-registry';

// Agent Router exports
export {
  AgentRouter,
  getGlobalAgentRouter,
  resetGlobalAgentRouter,
} from './agent-router';
