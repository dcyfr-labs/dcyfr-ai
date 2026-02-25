/**
 * DCYFR Delegation Framework - Barrel Export
 * TLP:AMBER - Internal Use Only
 *
 * Central re-export for all delegation module components.
 *
 * @module delegation/index
 * @version 1.0.0
 */

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
