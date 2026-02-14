/**
 * DCYFR Delegation Telemetry System
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive telemetry system for monitoring delegation contracts,
 * chain correlation, performance metrics, and event streaming.
 * 
 * @module telemetry
 * @version 1.0.0
 * @date 2026-02-13
 */

// Core telemetry engine and types
export {
  DelegationTelemetryEngine,
  ConsoleTelemetrySink,
  InMemoryTelemetrySink,
} from './delegation-telemetry';

export type {
  DelegationTelemetryEventType,
  DelegationTelemetryEvent,
  DelegationPerformanceMetrics,
  DelegationChainCorrelation,
  ContractCreatedEventData,
  ContractProgressEventData,
  ContractCompletionEventData,
  FirebreakTriggeredEventData,
  TelemetrySink,
  TelemetryQueryFilter,
  DelegationTelemetryConfig,
} from './delegation-telemetry';

// Runtime integration
export {
  RuntimeTelemetryIntegration,
  createDefaultTelemetryIntegration,
} from './runtime-telemetry-integration';

export type {
  RuntimeTelemetryIntegrationConfig,
} from './runtime-telemetry-integration';

// Utilities and helpers
export {
  analyzeDelegationChain,
  generatePerformanceSummary,
  findChainAnomalies,
  createTelemetryFilter,
} from './telemetry-utils';

export type {
  DelegationChainAnalysis,
  PerformanceSummary,
} from './telemetry-utils';

/**
 * Default telemetry configuration for development
 */
export const DEFAULT_DEV_TELEMETRY_CONFIG = {
  enabled: true,
  buffer_size: 20,
  flush_interval_ms: 2000,
  sampling_rate: 1.0,
  min_severity: 'debug' as const,
  max_events_in_memory: 500,
  enable_performance_tracking: true,
  enable_chain_correlation: true,
};

/**
 * Default telemetry configuration for production
 */
export const DEFAULT_PROD_TELEMETRY_CONFIG = {
  enabled: true,
  buffer_size: 100,
  flush_interval_ms: 5000,
  sampling_rate: 0.1, // Sample 10% of events
  min_severity: 'info' as const,
  max_events_in_memory: 2000,
  enable_performance_tracking: true,
  enable_chain_correlation: true,
};

/**
 * Version information
 */
export const TELEMETRY_VERSION = '1.0.0';