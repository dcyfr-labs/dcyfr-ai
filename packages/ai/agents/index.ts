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
  // Agent Persona types (v1.0.0)
  PersonalityTrait,
  PersonalityTraits,
  SituationalTone,
  IntentSignal,
  ProactiveGuidance,
  AgentPersona,
} from './types';

// Agent Persona validation exports
export {
  personalityTraitSchema,
  personalityTraitsSchema,
  situationalToneSchema,
  intentSignalSchema,
  proactiveGuidanceSchema,
  agentPersonaIdentitySchema,
  agentPersonaVoiceSchema,
  agentPersonaSchema,
  validatePersona,
  safeValidatePersona,
} from './schema';

// Agent Persona resolution exports
export { resolvePersona } from './persona-resolver';
export type { BrandVoice, BrandVoiceTraits, ResolvedPersona } from './persona-resolver';

// Instruction template exports
export { generatePersonaInstructions } from './instruction-template';
export type { PersonaInstructionSegments } from './instruction-template';

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
