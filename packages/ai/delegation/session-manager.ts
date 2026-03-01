/**
 * DCYFR Session Manager
 * TLP:AMBER - Internal Use Only
 *
 * Lifecycle tracking for delegation sessions.
 *
 * Manages:
 *   - In-memory session store with periodic flush to disk
 *   - Session state transitions: active → paused → archived
 *   - Status indicators: unread | in-progress | blocked
 *   - Archived session persistence at `logs/delegation/sessions/YYYY-MM-DD/<session-id>.jsonl`
 *
 * @module delegation/session-manager
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SessionState, ExecutionMode } from '../types/agent-capabilities.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Visibility / workflow status that is user-facing (separate from lifecycle). */
export type SessionStatus = 'unread' | 'in-progress' | 'blocked';

/** Full lifecycle state for a managed session. */
export interface ManagedSession {
  sessionId: string;
  contractId: string;
  executionMode: ExecutionMode;
  /** Lifecycle phase (maps to `SessionState.status`). */
  lifeCycle: 'active' | 'paused' | 'archived';
  /** User-visible workflow indicator. */
  status: SessionStatus;
  state: SessionState;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
  /** ISO 8601 archive timestamp. */
  archivedAt?: string;
  /** Optional block reason when status is 'blocked'. */
  blockReason?: string;
}

/** Options passed to `SessionManager` constructor. */
export interface SessionManagerOptions {
  /** Override base directory for persisted session archives. */
  archiveBaseDir?: string;
  /** Flush interval in milliseconds (default: 60 000 ms / 1 minute). */
  flushIntervalMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks delegation session lifecycle and status indicators.
 *
 * Emits:
 *   - `session:created`   — A new session was registered.
 *   - `session:updated`   — A session's state or status changed.
 *   - `session:paused`    — A session transitioned to paused.
 *   - `session:archived`  — A session was archived (written to disk).
 *   - `session:blocked`   — A session became blocked.
 *   - `session:unblocked` — A blocked session was cleared.
 *   - `flush`             — Periodic background flush completed.
 */
export class SessionManager extends EventEmitter {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly archiveBaseDir: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SessionManagerOptions = {}) {
    super();

    if (options.archiveBaseDir) {
      this.archiveBaseDir = options.archiveBaseDir;
    } else {
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const workspaceRoot = join(thisDir, '..', '..', '..', '..', '..', '..');
      this.archiveBaseDir = join(workspaceRoot, 'logs', 'delegation', 'sessions');
    }

    const flushMs = options.flushIntervalMs ?? 60_000;
    if (flushMs > 0) {
      this.flushTimer = setInterval(() => this._flushArchived(), flushMs);
      // Don't block the process for the background flush timer.
      if (typeof this.flushTimer.unref === 'function') {
        this.flushTimer.unref();
      }
    }
  }

  // ─────────────── Lifecycle ───────────────

  /**
   * Register a new session (initial status: 'unread', lifecycle: 'active').
   */
  register(
    sessionId: string,
    contractId: string,
    executionMode: ExecutionMode,
    initialState: SessionState,
  ): ManagedSession {
    const now = new Date().toISOString();
    const session: ManagedSession = {
      sessionId,
      contractId,
      executionMode,
      lifeCycle: 'active',
      status: 'unread',
      state: { ...initialState },
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, session);
    this.emit('session:created', session);
    return session;
  }

  /**
   * Update the in-memory state for an existing session.
   * Automatically marks lifecycle as 'active' if it was 'paused'.
   */
  updateState(sessionId: string, newState: Partial<SessionState>): ManagedSession {
    const session = this._requireSession(sessionId);
    session.state = { ...session.state, ...newState, lastActivity: new Date().toISOString() };
    session.updatedAt = new Date().toISOString();
    if (session.lifeCycle === 'paused') {
      session.lifeCycle = 'active';
    }
    this.emit('session:updated', session);
    return session;
  }

  /**
   * Pause a session (lifecycle: 'paused').
   */
  pause(sessionId: string): ManagedSession {
    const session = this._requireSession(sessionId);
    if (session.lifeCycle === 'archived') {
      throw new Error(`Cannot pause archived session ${sessionId}`);
    }
    session.lifeCycle = 'paused';
    session.state.status = 'paused';
    session.updatedAt = new Date().toISOString();
    this.emit('session:paused', session);
    return session;
  }

  /**
   * Archive a session — transitions to 'archived' and queues disk write.
   * Archived sessions are dropped from the in-memory store after the next flush.
   */
  archive(sessionId: string): ManagedSession {
    const session = this._requireSession(sessionId);
    session.lifeCycle = 'archived';
    session.state.status = 'archived';
    session.archivedAt = new Date().toISOString();
    session.updatedAt = session.archivedAt;
    this._writeArchivedSession(session);
    this.sessions.delete(sessionId);
    this.emit('session:archived', session);
    return session;
  }

  // ─────────────── Status indicators ───────────────

  /**
   * Mark a session as 'in-progress' (user has read it and work is active).
   */
  markInProgress(sessionId: string): ManagedSession {
    const session = this._requireSession(sessionId);
    session.status = 'in-progress';
    session.updatedAt = new Date().toISOString();
    this.emit('session:updated', session);
    return session;
  }

  /**
   * Mark a session as 'blocked' with an optional reason.
   */
  block(sessionId: string, reason?: string): ManagedSession {
    const session = this._requireSession(sessionId);
    session.status = 'blocked';
    session.blockReason = reason;
    session.updatedAt = new Date().toISOString();
    this.emit('session:blocked', session);
    return session;
  }

  /**
   * Clear a 'blocked' status — transitions back to 'in-progress'.
   */
  unblock(sessionId: string): ManagedSession {
    const session = this._requireSession(sessionId);
    if (session.status !== 'blocked') return session;
    session.status = 'in-progress';
    delete session.blockReason;
    session.updatedAt = new Date().toISOString();
    this.emit('session:unblocked', session);
    return session;
  }

  // ─────────────── Queries ───────────────

  /** Retrieve a session by ID. Returns `undefined` if not found. */
  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Return all in-memory sessions. */
  getAll(): ManagedSession[] {
    return Array.from(this.sessions.values());
  }

  /** Return sessions filtered by lifecycle. */
  getByLifeCycle(lifeCycle: ManagedSession['lifeCycle']): ManagedSession[] {
    return this.getAll().filter((s) => s.lifeCycle === lifeCycle);
  }

  /** Return sessions filtered by workflow status. */
  getByStatus(status: SessionStatus): ManagedSession[] {
    return this.getAll().filter((s) => s.status === status);
  }

  /** Return all unread sessions. */
  getUnread(): ManagedSession[] {
    return this.getByStatus('unread');
  }

  /** Return all in-progress sessions. */
  getInProgress(): ManagedSession[] {
    return this.getByStatus('in-progress');
  }

  /** Return all blocked sessions. */
  getBlocked(): ManagedSession[] {
    return this.getByStatus('blocked');
  }

  /** Return sessions by execution mode. */
  getByMode(mode: ExecutionMode): ManagedSession[] {
    return this.getAll().filter((s) => s.executionMode === mode);
  }

  /** Return all active sessions associated with a given contract ID. */
  getByContractId(contractId: string): ManagedSession[] {
    return this.getAll().filter((s) => s.contractId === contractId);
  }

  /** Return the first active session for a contract, or undefined if none found. */
  getActiveSessionForContract(contractId: string): ManagedSession | undefined {
    return this.getByContractId(contractId).find((s) => s.lifeCycle === 'active');
  }

  /** Total count of in-memory sessions. */
  get size(): number {
    return this.sessions.size;
  }

  // ─────────────── Cleanup ───────────────

  /**
   * Stop the background flush timer and release resources.
   */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.removeAllListeners();
  }

  // ─────────────── Private ───────────────

  private _requireSession(sessionId: string): ManagedSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Session not found: ${sessionId}`);
    return s;
  }

  /**
   * Write an archived session as a JSONL line to the date-based archive file.
   * Path: `<archiveBaseDir>/YYYY-MM-DD/<session-id>.jsonl`
   */
  private _writeArchivedSession(session: ManagedSession): void {
    try {
      const date = (session.archivedAt ?? new Date().toISOString()).slice(0, 10);
      const dayDir = join(this.archiveBaseDir, date);
      mkdirSync(dayDir, { recursive: true });
      const filePath = join(dayDir, `${session.sessionId}.jsonl`);
      appendFileSync(filePath, JSON.stringify(session) + '\n', 'utf8');
    } catch {
      // Non-fatal — session is removed from memory regardless
    }
  }

  /**
   * Periodic flush: nothing to flush for in-memory only — the archive write
   * happens inline in `archive()`. This hook is reserved for future batching.
   */
  private _flushArchived(): void {
    this.emit('flush', { timestamp: new Date().toISOString(), activeSessions: this.sessions.size });
  }
}
