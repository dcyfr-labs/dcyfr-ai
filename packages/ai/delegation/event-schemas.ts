/**
 * Delegation Execution Mode Event Schemas
 * TLP:AMBER - Internal Use Only
 *
 * Type definitions for events emitted during execution mode lifecycle:
 *   - session.created   — A new delegation session started
 *   - session.handoff   — An execution mode transition occurred
 *   - session.archived  — A session completed and was archived
 *   - mode.queue_status — Background queue capacity changed
 *
 * These events are emitted on `DelegationContractManager` (which extends EventEmitter)
 * and can be consumed by MCP observability integrations, telemetry pipelines, etc.
 *
 * @module delegation/event-schemas
 * @version 1.0.0
 */

import type { ExecutionMode } from '../types/agent-capabilities.js';

// ─────────────────────────────────────────────────────────────────────────────
// session.created
// ─────────────────────────────────────────────────────────────────────────────

/** Emitted when a delegation session is registered for the first time. */
export interface SessionCreatedEvent {
  readonly type: 'session.created';
  sessionId: string;
  contractId: string;
  mode: ExecutionMode;
  /** Populated when mode === ExecutionMode.BACKGROUND */
  worktreePath?: string;
  /** Populated when mode === ExecutionMode.ASYNC */
  branchName?: string;
  /** ISO 8601 */
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// session.handoff
// ─────────────────────────────────────────────────────────────────────────────

/** Emitted when a session transitions from one execution mode to another. */
export interface SessionHandoffEvent {
  readonly type: 'session.handoff';
  fromContractId: string;
  toContractId: string;
  fromMode: ExecutionMode;
  toMode: ExecutionMode;
  handoffReason: string;
  /** ISO 8601 */
  handoffAt: string;
  contextSnapshot: {
    conversationHistory: unknown[];
    artifacts: unknown[];
    checkpointId?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// session.archived
// ─────────────────────────────────────────────────────────────────────────────

/** Emitted when a session is archived (contracted completed or handed off). */
export interface SessionArchivedEvent {
  readonly type: 'session.archived';
  sessionId: string;
  contractId: string;
  mode: ExecutionMode;
  /** Populated when mode === ASYNC and a PR was created. */
  prNumber?: number;
  /** ISO 8601 */
  archivedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// mode.queue_status
// ─────────────────────────────────────────────────────────────────────────────

/** Emitted when the background session queue capacity changes. */
export interface ModeQueueStatusEvent {
  readonly type: 'mode.queue_status';
  activeCount: number;
  remainingCapacity: number;
  atCapacity: boolean;
  activeSessionIds: string[];
  queuedSessionIds: string[];
  /** ISO 8601 */
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// background_queue_full
// ─────────────────────────────────────────────────────────────────────────────

/** Emitted when background mode was requested but the queue is at capacity. */
export interface BackgroundQueueFullEvent {
  readonly type: 'background_queue_full';
  activeCount: number;
  remainingCapacity: number;
  atCapacity: boolean;
  activeSessionIds: string[];
  queuedSessionIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Union type
// ─────────────────────────────────────────────────────────────────────────────

/** Union of all execution-mode-related events. */
export type ExecutionModeEvent =
  | SessionCreatedEvent
  | SessionHandoffEvent
  | SessionArchivedEvent
  | ModeQueueStatusEvent
  | BackgroundQueueFullEvent;

// ─────────────────────────────────────────────────────────────────────────────
// Event name constants
// ─────────────────────────────────────────────────────────────────────────────

export const EXECUTION_MODE_EVENTS = {
  SESSION_CREATED: 'session.created',
  SESSION_HANDOFF: 'session.handoff',
  SESSION_ARCHIVED: 'session.archived',
  MODE_QUEUE_STATUS: 'mode.queue_status',
  BACKGROUND_QUEUE_STATUS: 'background_queue_status',
  BACKGROUND_QUEUE_FULL: 'background_queue_full',
} as const;

export type ExecutionModeEventName = typeof EXECUTION_MODE_EVENTS[keyof typeof EXECUTION_MODE_EVENTS];

// ─────────────────────────────────────────────────────────────────────────────
// Event factory helpers
// ─────────────────────────────────────────────────────────────────────────────

export function makeSessionCreatedEvent(
  sessionId: string,
  contractId: string,
  mode: ExecutionMode,
  extras?: { worktreePath?: string; branchName?: string },
): SessionCreatedEvent {
  return {
    type: 'session.created',
    sessionId,
    contractId,
    mode,
    worktreePath: extras?.worktreePath,
    branchName: extras?.branchName,
    createdAt: new Date().toISOString(),
  };
}

export function makeSessionArchivedEvent(
  sessionId: string,
  contractId: string,
  mode: ExecutionMode,
  prNumber?: number,
): SessionArchivedEvent {
  return {
    type: 'session.archived',
    sessionId,
    contractId,
    mode,
    prNumber,
    archivedAt: new Date().toISOString(),
  };
}

export function makeModeQueueStatusEvent(status: {
  activeCount: number;
  remainingCapacity: number;
  atCapacity: boolean;
  activeSessionIds: string[];
  queuedSessionIds: string[];
}): ModeQueueStatusEvent {
  return {
    type: 'mode.queue_status',
    ...status,
    timestamp: new Date().toISOString(),
  };
}
