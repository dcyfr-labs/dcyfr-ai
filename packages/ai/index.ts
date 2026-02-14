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

export type {
  DelegationContract,
  DelegationContractStatus,
  VerificationResult,
  DelegationAgent,
  SuccessCriteria,
  VerificationPolicy,
} from './types/delegation-contracts';

// Reputation system exports
export { ReputationEngine } from './reputation/reputation-engine';
export type {
  ReputationEngineConfig,
  ReputationProfile,
  ReputationUpdate,
  ReputationQuery,
  ReputationDimension,
} from './reputation/reputation-engine';

// Version
export const VERSION = '1.0.0';
