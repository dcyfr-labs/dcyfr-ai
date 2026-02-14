/**
 * Core type definitions for DCYFR AI Framework
 * 
 * Shared types used across the framework for agents, providers, sessions, and telemetry.
 * @module @dcyfr/ai/types
 */

/**
 * Supported AI provider types
 */
export type ProviderType = "claude" | "groq" | "ollama" | "copilot" | "openai" | "anthropic" | "msty";

/**
 * Agent types - typically maps to primary providers
 */
export type AgentType = "claude" | "copilot" | "groq" | "ollama";

/**
 * Task classification types
 */
export type TaskType =
  | "feature"
  | "bug"
  | "refactor"
  | "quick-fix"
  | "research"
  | "documentation"
  | "testing";

/**
 * Task execution outcomes
 */
export type TaskOutcome = "success" | "escalated" | "failed" | "partial";

/**
 * Validation status for quality gates
 */
export type ValidationStatus = "pass" | "fail" | "pending" | "skipped";

/**
 * Validation severity levels
 */
export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Storage adapter types
 */
export type StorageType = "memory" | "file" | "redis" | "database";

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  onValidate?: (context: ValidationContext) => Promise<ValidationResult>;
  onComplete?: () => void | Promise<void>;
}

/**
 * Plugin manifest structure
 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  dependencies?: Record<string, string>;
  configSchema?: Record<string, unknown>;
}

/**
 * Plugin interface that all plugins must implement
 */
export interface Plugin extends PluginHooks {
  manifest: PluginManifest;
}

/**
 * Validation context passed to plugins
 */
export interface ValidationContext {
  projectRoot: string;
  files: string[];
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Validation result from plugins
 */
export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
  warnings: ValidationViolation[];
  metadata?: Record<string, unknown>;
}

/**
 * Individual validation violation
 */
export interface ValidationViolation {
  type: string;
  severity: ValidationSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  fixed?: boolean;
}

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  type: StorageType;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

/**
 * Framework configuration
 */
export interface FrameworkConfig {
  version: string;
  minNodeVersion?: string;
  storage?: StorageType;
  telemetry?: {
    enabled: boolean;
    retention?: string;
  };
  validation?: {
    failureMode: "warn" | "error" | "block";
  };
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  name: ProviderType;
  apiEndpoint?: string;
  healthCheckUrl?: string;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  enabled?: boolean;
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  provider: ProviderType;
  available: boolean;
  responseTime?: number;
  lastChecked: Date;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
  error?: string;
}

/**
 * Task context for execution
 */
export interface TaskContext {
  description: string;
  phase: "planning" | "implementation" | "validation" | "complete";
  estimatedTime?: string;
  filesInProgress: string[];
  validationStatus?: Record<string, ValidationStatus>;
}

/**
 * Execution result wrapper
 */
export interface ExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  provider: ProviderType;
  fallbackUsed: boolean;
  error?: Error;
  executionTime: number;
  validationsPassed: string[];
  validationsFailed: string[];
}

/**
 * Cost estimate for provider usage
 */
export interface CostEstimate {
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  currency: "USD" | "EUR" | "GBP";
}

/**
 * Re-export all types as a namespace
 */
export * from './telemetry';
export * from './delegation-contracts';
export * from './agent-capabilities';
export * from './permission-tokens';
