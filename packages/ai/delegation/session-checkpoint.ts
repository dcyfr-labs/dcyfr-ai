/**
 * DCYFR Session Checkpoint System
 * TLP:AMBER - Internal Use Only
 *
 * Manages point-in-time snapshots of delegation session state.
 * Checkpoints are persisted to disk for crash recovery and handoff.
 *
 * Checkpoint triggers:
 *   - Every 5 conversation messages (automatic rolling checkpoint)
 *   - Immediately before a session handoff
 *   - Immediately before verification begins
 *
 * Storage path: `logs/delegation/checkpoints/<session-id>-<timestamp>.json`
 *
 * @module delegation/session-checkpoint
 * @version 1.0.0
 */

import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SessionState } from '../types/agent-capabilities.js';

/** Auto-checkpoint every N messages. */
export const CHECKPOINT_MESSAGE_INTERVAL = 5;

/** Reasons a checkpoint can be created. */
export type CheckpointReason = 'automatic' | 'pre-handoff' | 'pre-verification' | 'manual';

/** Serialised checkpoint written to disk. */
export interface CheckpointRecord {
  /** Unique checkpoint identifier: `<sessionId>-<timestamp>` */
  id: string;
  sessionId: string;
  contractId: string;
  reason: CheckpointReason;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Message index at the time of the checkpoint. */
  messageIndex: number;
  /** Full session state snapshot. */
  sessionState: SessionState;
  /** Arbitrary key/value metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Manages session checkpoints for crash recovery and handoff.
 */
export class SessionCheckpoint {
  private readonly checkpointDir: string;

  /**
   * @param checkpointBaseDir - Base directory for checkpoints.
   *   Defaults to `<workspace-root>/logs/delegation/checkpoints`.
   */
  constructor(checkpointBaseDir?: string) {
    if (checkpointBaseDir) {
      this.checkpointDir = checkpointBaseDir;
    } else {
      // Resolve workspace root relative to this file (packages/ai/delegation/)
      const thisDir = dirname(fileURLToPath(import.meta.url));
      // packages/ai/ → ../../.. → workspace root
      const workspaceRoot = join(thisDir, '..', '..', '..', '..', '..', '..');
      this.checkpointDir = join(workspaceRoot, 'logs', 'delegation', 'checkpoints');
    }
  }

  // ───────────── Public API ─────────────

  /**
   * Create and persist a checkpoint for a session.
   *
   * @returns The persisted checkpoint record.
   */
  create(
    sessionId: string,
    contractId: string,
    sessionState: SessionState,
    reason: CheckpointReason,
    messageIndex: number,
    metadata?: Record<string, unknown>,
  ): CheckpointRecord {
    const now = new Date().toISOString();
    // Use compact timestamp for filename compatibility (replace colons)
    const safeTimestamp = now.replace(/[:.]/g, '-');
    const id = `${sessionId}-${safeTimestamp}`;

    const record: CheckpointRecord = {
      id,
      sessionId,
      contractId,
      reason,
      createdAt: now,
      messageIndex,
      sessionState,
      ...(metadata !== undefined && { metadata }),
    };

    this._persist(id, record);
    return record;
  }

  /**
   * Determine whether a checkpoint should be created based on the current
   * message index (automatic rolling checkpoints every 5 messages).
   */
  shouldCheckpoint(messageIndex: number): boolean {
    return messageIndex > 0 && messageIndex % CHECKPOINT_MESSAGE_INTERVAL === 0;
  }

  /**
   * Load the most recent checkpoint for a given session.
   * Returns `undefined` if no checkpoints exist.
   */
  loadLatest(sessionId: string): CheckpointRecord | undefined {
    const files = this._listSessionCheckpoints(sessionId);
    if (files.length === 0) return undefined;

    // Files are named `<sessionId>-<timestamp>.json`; sort descending by name
    files.sort((a, b) => b.localeCompare(a));
    const latest = files[0];
    return this._load(latest);
  }

  /**
   * List all checkpoint records for a given session, ordered oldest-first.
   */
  listAll(sessionId: string): CheckpointRecord[] {
    const files = this._listSessionCheckpoints(sessionId);
    files.sort((a, b) => a.localeCompare(b));
    return files.map((f) => this._load(f)).filter(Boolean) as CheckpointRecord[];
  }

  /**
   * Return the absolute path of a checkpoint file given its ID.
   */
  checkpointPath(id: string): string {
    return join(this.checkpointDir, `${id}.json`);
  }

  // ───────────── Private helpers ─────────────

  private _persist(id: string, record: CheckpointRecord): void {
    mkdirSync(this.checkpointDir, { recursive: true });
    const path = this.checkpointPath(id);
    writeFileSync(path, JSON.stringify(record, null, 2), 'utf8');
  }

  private _listSessionCheckpoints(sessionId: string): string[] {
    if (!existsSync(this.checkpointDir)) return [];
    try {
      return readdirSync(this.checkpointDir)
        .filter((f) => f.startsWith(`${sessionId}-`) && f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  private _load(id: string): CheckpointRecord | undefined {
    const path = this.checkpointPath(id);
    try {
      const raw = readFileSync(path, 'utf8');
      return JSON.parse(raw) as CheckpointRecord;
    } catch {
      return undefined;
    }
  }
}
