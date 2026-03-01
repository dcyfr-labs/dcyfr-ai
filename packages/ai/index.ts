/**
 * DCYFR AI Framework - Main Entry Point
 * 
 * Portable AI agent framework with plugin architecture
 * @module @dcyfr/ai
 */

// Core exports
export { TelemetryEngine, TelemetrySessionManager } from './core/telemetry-engine';
export {
  ProviderRegistry,
  RateLimitError,
  ProviderUnavailableError,
  type ProviderRegistryConfig,
} from './core/provider-registry';

// Type exports
export type {
  ProviderType,
  AgentType,
  TaskType,
  TaskOutcome,
  ValidationStatus,
  ValidationSeverity,
  StorageType,
  Plugin,
  PluginManifest,
  PluginHooks,
  ValidationContext,
  ValidationResult,
  ValidationViolation,
  StorageAdapter,
  FrameworkConfig,
  ProviderConfig,
  ProviderHealth,
  TaskContext,
  ExecutionResult,
  CostEstimate,
} from './types';

// Telemetry types
export type {
  TelemetrySession,
  TelemetryMetrics,
  ViolationRecord,
  HandoffRecord,
  AgentStats,
  ComparisonStats,
  HandoffPatterns,
} from './types/telemetry';

// Plugin system exports
export {
  PluginLoader,
  PluginLoadError,
  PluginValidationError,
  getGlobalPluginLoader,
  resetGlobalPluginLoader,
  type PluginLoaderConfig,
} from './plugins/plugin-loader';

// Validation framework exports
export {
  ValidationFramework,
  type ValidationFrameworkConfig,
  type ValidationGate,
  type ValidationReport,
} from './validation/validation-framework';

// Configuration system exports
export {
  ConfigLoader,
  loadConfig,
  type LoaderOptions,
} from './config/loader';

export {
  FrameworkConfigSchema,
  DesignTokenConfigSchema,
  BarrelExportConfigSchema,
  PageLayoutConfigSchema,
  TestDataConfigSchema,
  PluginConfigSchema,
  ValidationGateConfigSchema,
  TelemetryConfigSchema,
  ProviderConfigSchema,
  // Agent schemas
  AgentCategorySchema,
  AgentTierSchema,
  AgentModelSchema,
  AgentPermissionModeSchema,
  AgentQualityGateSchema,
  AgentProactiveTriggerSchema,
  AgentManifestSchema,
  AgentTierConfigSchema,
  AgentRegistryConfigSchema,
  AgentRoutingRuleSchema,
  AgentRouterConfigSchema,
  // MCP schemas
  MCPTransportSchema,
  MCPServerConfigSchema,
  MCPRegistryConfigSchema,
  DEFAULT_CONFIG,
  type DesignTokenConfig,
  type BarrelExportConfig,
  type PageLayoutConfig,
  type TestDataConfig,
  type Severity,
  type FailureMode,
  // Agent config types
  type AgentCategory as AgentCategoryConfig,
  type AgentTier as AgentTierConfig,
  type AgentModel as AgentModelConfig,
  type AgentPermissionMode as AgentPermissionModeConfig,
  type AgentQualityGateConfig,
  type AgentProactiveTriggerConfig,
  type AgentManifestConfig,
  type AgentRegistryConfig as AgentRegistrySchemaConfig,
  type AgentRoutingRuleConfig,
  type AgentRouterConfig as AgentRouterSchemaConfig,
  // MCP config types
  type MCPTransport as MCPTransportConfig,
  type MCPServerConfig as MCPServerSchemaConfig,
  type MCPRegistryConfig as MCPRegistrySchemaConfig,
} from './config/schema';

// Utility exports
export { createStorageAdapter, MemoryStorageAdapter, FileStorageAdapter } from './utils/storage';

// Agent framework exports
export {
  // Types
  type AgentCategory,
  type AgentTier,
  type AgentModel,
  type AgentPermissionMode,
  type AgentQualityGate,
  type AgentProactiveTrigger,
  type AgentSkill,
  type AgentManifest,
  type AgentHooks,
  type Agent,
  type LoadedAgent,
  type AgentExecutionContext,
  type AgentExecutionResult,
  type AgentViolation,
  type AgentRoutingRule,
  type AgentRoutingResult,
  type AgentRegistryConfig,
  type AgentLoaderConfig,
  type AgentRouterConfig,
  // Classes
  AgentLoader,
  AgentLoadError,
  AgentValidationError,
  getGlobalAgentLoader,
  resetGlobalAgentLoader,
  AgentRegistry,
  getGlobalAgentRegistry,
  resetGlobalAgentRegistry,
  AgentRouter,
  getGlobalAgentRouter,
  resetGlobalAgentRouter,
} from './agents';

// MCP integration exports
export {
  // Types
  type MCPTransport,
  type MCPServerStatus,
  type MCPTool,
  type MCPResource,
  type MCPServerConfig,
  type MCPServerManifest,
  type MCPServerCapabilities,
  type LoadedMCPServer,
  type MCPRegistryConfig,
  type MCPHealthCheckResult,
  // Classes
  MCPRegistry,
  getGlobalMCPRegistry,
  resetGlobalMCPRegistry,
} from './mcp';

// Memory module exports
export {
  getMemory,
  resetMemory,
  DCYFRMemoryImpl,
  getMemoryConfig,
  loadMemoryConfig,
  validateMemoryConfig,
  DEFAULT_CONFIG as DEFAULT_MEMORY_CONFIG,
  createMem0Client,
  getMem0Client,
  resetMem0Client,
} from './memory';

export type {
  DCYFRMemory,
  Memory,
  MemorySearchResult,
  MemoryContext,
  AgentMemory,
  SessionMemory,
  MemoryProvider,
  VectorDBProvider,
  VectorDBConfig,
  LLMConfig,
  MemoryConfig,
  Mem0Client,
} from './memory';

// Built-in agents exports
export {
  // Development agents
  fullstackDeveloper,
  frontendDeveloper,
  backendArchitect,
  typescriptPro,
  // Testing agents
  testEngineer,
  debugger,
  // Security agents
  securityEngineer,
  // Architecture agents
  architectureReviewer,
  databaseArchitect,
  cloudArchitect,
  // Performance agents
  performanceProfiler,
  // DevOps agents
  devopsEngineer,
  // Data agents
  dataScientist,
  // Content agents
  technicalWriter,
  // Research agents
  researchOrchestrator,
  // Utility functions
  loadBuiltinAgents,
  getBuiltinAgent,
  listBuiltinAgents,
  builtinAgentsByName,
} from './agents-builtin';

// Runtime exports
export {
  AgentRuntime,
  type RuntimeState,
  type RuntimeConfig,
  type TaskContext as RuntimeTaskContext,
  type AgentExecutionResult as RuntimeAgentExecutionResult,
  type Decision,
  type Observation,
  type ToolExecutionContext,
  type DelegationContext,
} from './runtime';

// Delegation system exports
export { ContractManager } from './delegation/contract-manager';
export type { ContractManagerConfig, ContractQuery, ContractUpdate } from './delegation/contract-manager';
export {
  DelegationHealthMonitor,
  getHealthMonitor,
  startHealthMonitoring,
  stopHealthMonitoring,
} from './delegation/monitoring';
export type {
  SystemHealthMetrics,
  AlertRule,
  AlertCondition,
  AlertChannel,
  Alert,
} from './delegation/monitoring';

// Phase 3: Background/async session infrastructure (v1.1.0)
export { BackgroundSessionQueue, MAX_BACKGROUND_SESSIONS } from './delegation/session-queue';
export type { BackgroundQueueStatus, QueueEntry } from './delegation/session-queue';
export { SessionCheckpoint, CHECKPOINT_MESSAGE_INTERVAL } from './delegation/session-checkpoint';
export type { CheckpointRecord, CheckpointReason } from './delegation/session-checkpoint';
export { SessionManager } from './delegation/session-manager';
export type { ManagedSession, SessionStatus, SessionManagerOptions } from './delegation/session-manager';

export type {
  DelegationContract,
  DelegationContractStatus,
  VerificationResult,
  DelegationAgent,
  SuccessCriteria,
  VerificationPolicy,
} from './types/delegation-contracts';

// Execution mode and session types (v1.1.0)
export { ExecutionMode } from './types/agent-capabilities';
export type {
  SessionState,
  SessionHandoff,
  SessionHandoffRequest,
  ModeTransitionPolicy,
} from './types/agent-capabilities';

// Reputation system exports
export { ReputationEngine } from './reputation/reputation-engine';
export type {
  ReputationEngineConfig,
  AgentReputation,
  ReputationTaskOutcome,
  ReputationQuery,
  AuditLogEntry,
} from './reputation/reputation-engine';

// Execution mode reputation exports (Phase 3)
export { ExecutionModeReputationAdjuster, MODE_DIMENSION_WEIGHTS, SCORE_DECAY_PER_30_DAYS } from './reputation/execution-mode-reputation';
export type { ModeAdjustedScore, ReputationGetter } from './reputation/execution-mode-reputation';

// Capability system exports
export {
  CapabilityRegistry,
  defaultCapabilityRegistry,
  createCapabilityRegistry,
} from './src/capability-registry';

export {
  generateCapabilityManifest,
  // NOTE: generateDcyfrCapabilityManifests is NOT exported - it's workspace-specific
  // and causes build failures when @dcyfr/ai is installed as an npm package
  validateCapabilityManifest,
} from './src/capability-manifest-generator';

export {
  CapabilityBootstrap,
  AgentAnalyzer,
  CapabilityDetector,
  ConfidenceInitializer,
  defaultBootstrap,
  bootstrapAgent,
  bootstrapAgents,
} from './src/capability-bootstrap';

export type {
  AgentCapabilityManifest,
  AgentCapability,
  ResourceRequirements,
  TaskCapabilityMatch,
  CapabilityQuery,
  ICapabilityRegistry,
} from './src/types/agent-capabilities';

export type {
  AgentSource,
  CapabilityDetectionConfig,
  ConfidenceInitConfig,
  BootstrapResult,
} from './src/capability-bootstrap';

// Personas and brand voice exports
export type {
  ToneProfile,
  PersonalityTraits,
  SituationalTone,
  BrandIdentity,
  CoreVoice,
  ToneSpectrum,
  BrandVoice,
  AgentPersona,
  VoiceResolverOptions,
  ResolvedVoice,
  PersonaLoaderOptions,
  PersonaLoadResult,
  BeforeLLMCallInput,
  BeforeLLMCallOutput,
  BeforeLLMCallHookConfig,
  BeforeLLMCallHook,
} from './src/personas';
export {
  resolveVoice,
  renderPersonaBlock,
  applyToneGuidelines,
  loadBrandVoice,
  clearBrandVoiceCache,
  loadPersona,
  getPersona,
  validatePersona,
  clearPersonaCache,
  BrandVoiceHook,
  createBrandVoiceHook,
} from './src/personas';

// Plugin marketplace: Rating & Review System exports (Phase 12)
export { PluginRatingAggregator, ReviewError } from './src/plugins/reviews/plugin-rating-aggregator.js';
export type {
  PluginRatingAggregatorConfig,
  StarRating,
  ReviewStatus,
  PluginReview,
  CreateReviewInput,
  FlagReviewInput,
  PluginRatingStats,
  ReviewPage,
  ReviewQueryOptions,
  RatingDistribution,
} from './src/plugins/reviews/plugin-rating-aggregator.js';
export { PLUGIN_REVIEWS_SCHEMA_SQL } from './src/plugins/reviews/types.js';

// Version
export const VERSION = '1.0.0';
