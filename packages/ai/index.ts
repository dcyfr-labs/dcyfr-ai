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
  DEFAULT_CONFIG,
  type DesignTokenConfig,
  type BarrelExportConfig,
  type PageLayoutConfig,
  type TestDataConfig,
  type Severity,
  type FailureMode,
} from './config/schema';

// Utility exports
export { createStorageAdapter, MemoryStorageAdapter, FileStorageAdapter } from './utils/storage';

// Version
export const VERSION = '1.0.0';
