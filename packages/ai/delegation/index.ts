/**
 * DCYFR Delegation Framework - Barrel Export
 * TLP:AMBER - Internal Use Only
 *
 * Central re-export for all delegation module components.
 *
 * @module delegation/index
 * @version 1.0.0
 */

export { DelegationManager, FailureCategory, delegationManager } from './delegation-manager.js';
export type { ContractResult, FailureAnalysis, RewriteTask, RewriteResult, RetryOptions, RetryAttempt, RetryResult, PromptPattern, PatternLearningOptions, TokenBudgetInfo } from './delegation-manager.js';
export { CapabilityRegistry } from './capability-registry.js';
export { bootstrapCapabilityManifest, parseAgentDefinition } from './capability-bootstrap.js';
export { DelegationContractManager } from './contract-manager.js';
export { DelegationChainTracker } from './chain-tracker.js';
export { FeatureFlagManager, getFeatureFlagManager, isDelegationEnabled, isFeatureEnabled } from './feature-flags.js';
export { DelegationHealthMonitor, getHealthMonitor, startHealthMonitoring, stopHealthMonitoring } from './monitoring.js';
export { BackgroundSessionQueue, MAX_BACKGROUND_SESSIONS } from './session-queue.js';
export type { BackgroundQueueStatus, QueueEntry } from './session-queue.js';
export { SessionCheckpoint, CHECKPOINT_MESSAGE_INTERVAL } from './session-checkpoint.js';
export type { CheckpointRecord, CheckpointReason } from './session-checkpoint.js';
export { SessionManager } from './session-manager.js';
export type { ManagedSession, SessionStatus, SessionManagerOptions } from './session-manager.js';
export { EXECUTION_MODE_EVENTS, makeSessionCreatedEvent, makeSessionArchivedEvent, makeModeQueueStatusEvent } from './event-schemas.js';
export type { ExecutionModeEvent, ExecutionModeEventName, SessionCreatedEvent, SessionHandoffEvent, SessionArchivedEvent, ModeQueueStatusEvent, BackgroundQueueFullEvent } from './event-schemas.js';
export { ExecutionModeDashboard } from './execution-mode-dashboard.js';
export type { PerModeStats, TopAgentEntry, ExecutionModeDashboardReport, DashboardInput } from './execution-mode-dashboard.js';

// ── Phase 1-6: Security hardening exports ─────────────────────────────────
export { SecurityMiddlewareChain } from './security-middleware-chain.js';
export { AgentRegistry } from './agent-registry.js';
export type { AgentKey, AgentRegistryEntry } from './agent-registry.js';
export { CircuitBreaker, CircuitBreakerMiddleware } from './circuit-breaker.js';
export type { CircuitBreakerConfig, CircuitState } from './circuit-breaker.js';
export { ContractTimeoutWatchdog } from './timeout-watchdog.js';
export type { WatchdogConfig, WatchdogContract, TimeoutEvent } from './timeout-watchdog.js';
export { BlastRadiusTracker } from './blast-radius-tracker.js';
export type { BlastRadiusTrackerConfig, BlastRadiusCheckResult } from './blast-radius-tracker.js';
export { IdentityMiddleware } from './middleware/identity-middleware.js';
export { TLPMiddleware } from './middleware/tlp-middleware.js';
export { ThreatValidatorMiddleware } from './middleware/threat-validator-middleware.js';
export { RateLimiterMiddleware } from './middleware/rate-limiter-middleware.js';
export { ChainDepthMiddleware } from './middleware/chain-depth-middleware.js';
export { ContentPolicyMiddleware } from './middleware/content-policy-middleware.js';
export { PermissionsMiddleware } from './middleware/permissions-middleware.js';
export type { SimplifiedPermissionToken } from './middleware/permissions-middleware.js';
export { ReputationMiddleware } from './middleware/reputation-middleware.js';
export { FeatureFlagMiddleware, DelegationDisabledError } from './middleware/feature-flag-middleware.js';
export { ChainTrackerMiddleware } from './middleware/chain-tracker-middleware.js';
export type { ChainContractProvider } from './middleware/chain-tracker-middleware.js';
export { ResourceLimiterMiddleware } from './middleware/resource-limiter-middleware.js';
export type { ContractResources, ResourceThresholds } from './middleware/resource-limiter-middleware.js';
