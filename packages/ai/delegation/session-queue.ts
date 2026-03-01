/**
 * DCYFR Background Session Queue
 * TLP:AMBER - Internal Use Only
 *
 * FIFO queue managing the 10-slot background session concurrency limit.
 * Prevents resource exhaustion while providing observability into queue state.
 *
 * @module delegation/session-queue
 * @version 1.0.0
 */

import { EventEmitter } from 'events';

/** Maximum concurrent background sessions. */
export const MAX_BACKGROUND_SESSIONS = 10;

/** Status of the background session queue. */
export interface BackgroundQueueStatus {
  /** Number of active background sessions. */
  activeCount: number;
  /** Remaining capacity for new background sessions. */
  remainingCapacity: number;
  /** Whether the queue is at maximum capacity. */
  atCapacity: boolean;
  /** List of currently active session IDs. */
  activeSessionIds: string[];
  /** List of session IDs waiting to be processed (queue depth). */
  queuedSessionIds: string[];
}

/** Entry stored in the queue. */
export interface QueueEntry {
  sessionId: string;
  contractId: string;
  /** ISO 8601 timestamp when the entry was enqueued. */
  enqueuedAt: string;
  /** Optional resolve function called when a slot opens. */
  resolve?: () => void;
}

/**
 * FIFO queue managing concurrent background delegation sessions.
 *
 * Emits the following events:
 * - `enqueued`   — A new session entered the queue (waiting for slot).
 * - `activated`  — A session moved from queue to active set.
 * - `released`   — A session slot was released.
 * - `status`     — Queue status changed (active/queued counts changed).
 */
export class BackgroundSessionQueue extends EventEmitter {
  /** Set of session IDs currently occupying an active slot. */
  private readonly activeSessions = new Set<string>();

  /** FIFO queue of sessions waiting for a slot. */
  private readonly waitQueue: QueueEntry[] = [];

  /** Map of sessionId → QueueEntry for active sessions. */
  private readonly activeEntries = new Map<string, QueueEntry>();

  constructor(private readonly maxSlots: number = MAX_BACKGROUND_SESSIONS) {
    super();
  }

  // ───────────── Public API ─────────────

  /**
   * Attempt to acquire a background slot for the given session.
   *
   * - If capacity is available, resolves immediately and marks the slot active.
   * - If at capacity, enqueues the session and resolves when a slot opens.
   *
   * @returns A promise that resolves when the session has an active slot.
   */
  acquire(sessionId: string, contractId: string): Promise<void> {
    if (this.activeSessions.size < this.maxSlots) {
      this._activate({ sessionId, contractId, enqueuedAt: new Date().toISOString() });
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const entry: QueueEntry = {
        sessionId,
        contractId,
        enqueuedAt: new Date().toISOString(),
        resolve,
      };
      this.waitQueue.push(entry);
      this.emit('enqueued', { sessionId, contractId, queuePosition: this.waitQueue.length });
      this._emitStatus();
    });
  }

  /**
   * Release a background slot previously acquired for `sessionId`.
   * If there are queued sessions, the next one is activated immediately.
   */
  release(sessionId: string): void {
    if (!this.activeSessions.has(sessionId)) return;

    this.activeSessions.delete(sessionId);
    this.activeEntries.delete(sessionId);
    this.emit('released', { sessionId });

    // Promote next waiting session
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      this._activate(next);
      next.resolve?.();
    }

    this._emitStatus();
  }

  /**
   * Returns `true` if there is at least one free background slot.
   */
  hasCapacity(): boolean {
    return this.activeSessions.size < this.maxSlots;
  }

  /**
   * Number of active background sessions.
   */
  get activeCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Number of sessions waiting for a slot.
   */
  get queueDepth(): number {
    return this.waitQueue.length;
  }

  /**
   * Current queue snapshot for observability.
   */
  getStatus(): BackgroundQueueStatus {
    return {
      activeCount: this.activeSessions.size,
      remainingCapacity: this.maxSlots - this.activeSessions.size,
      atCapacity: this.activeSessions.size >= this.maxSlots,
      activeSessionIds: Array.from(this.activeSessions),
      queuedSessionIds: this.waitQueue.map((e) => e.sessionId),
    };
  }

  /**
   * Whether a given sessionId currently holds an active slot.
   */
  isActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Whether a given sessionId is waiting in the queue.
   */
  isQueued(sessionId: string): boolean {
    return this.waitQueue.some((e) => e.sessionId === sessionId);
  }

  // ───────────── Private helpers ─────────────

  private _activate(entry: QueueEntry): void {
    this.activeSessions.add(entry.sessionId);
    this.activeEntries.set(entry.sessionId, entry);
    this.emit('activated', {
      sessionId: entry.sessionId,
      contractId: entry.contractId,
      activatedAt: new Date().toISOString(),
    });
    this._emitStatus();
  }

  private _emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
