/**
 * Tests for SessionCheckpoint
 * Phase 6.4 — delegation-execution-modes
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionCheckpoint, CHECKPOINT_MESSAGE_INTERVAL } from '../session-checkpoint.js';
import type { SessionState } from '../../types/agent-capabilities.js';

const makeState = (override: Partial<SessionState> = {}): SessionState => ({
  status: 'active',
  conversationMessages: [],
  lastActivity: new Date().toISOString(),
  ...override,
});

describe('SessionCheckpoint', () => {
  let tmpDir: string;
  let checkpoint: SessionCheckpoint;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dcyfr-checkpoint-test-'));
    checkpoint = new SessionCheckpoint(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constants', () => {
    it('CHECKPOINT_MESSAGE_INTERVAL is 5', () => {
      expect(CHECKPOINT_MESSAGE_INTERVAL).toBe(5);
    });
  });

  describe('create()', () => {
    it('creates and persists a checkpoint', () => {
      const state = makeState();
      const record = checkpoint.create('sess-1', 'contract-1', state, 'automatic', 5);
      expect(record.sessionId).toBe('sess-1');
      expect(record.contractId).toBe('contract-1');
      expect(record.reason).toBe('automatic');
      expect(record.messageIndex).toBe(5);
      expect(record.id).toContain('sess-1');
    });

    it('includes optional metadata', () => {
      const state = makeState();
      const record = checkpoint.create(
        'sess-2', 'c-2', state, 'pre-handoff', 10, { toMode: 'background' }
      );
      expect(record.metadata).toEqual({ toMode: 'background' });
    });

    it('persists to disk (loadLatest returns it)', () => {
      const state = makeState({ conversationMessages: ['msg1'] });
      checkpoint.create('sess-3', 'c-3', state, 'manual', 3);
      const loaded = checkpoint.loadLatest('sess-3');
      expect(loaded).toBeDefined();
      expect(loaded!.sessionId).toBe('sess-3');
      expect(loaded!.sessionState.conversationMessages).toEqual(['msg1']);
    });
  });

  describe('shouldCheckpoint()', () => {
    it('returns false at 0', () => {
      expect(checkpoint.shouldCheckpoint(0)).toBe(false);
    });

    it('returns true at multiples of 5', () => {
      expect(checkpoint.shouldCheckpoint(5)).toBe(true);
      expect(checkpoint.shouldCheckpoint(10)).toBe(true);
      expect(checkpoint.shouldCheckpoint(15)).toBe(true);
    });

    it('returns false for non-multiples', () => {
      expect(checkpoint.shouldCheckpoint(1)).toBe(false);
      expect(checkpoint.shouldCheckpoint(3)).toBe(false);
      expect(checkpoint.shouldCheckpoint(7)).toBe(false);
    });
  });

  describe('loadLatest()', () => {
    it('returns undefined if no checkpoints exist', () => {
      expect(checkpoint.loadLatest('unknown-session')).toBeUndefined();
    });

    it('returns the most recent checkpoint when multiple exist', async () => {
      const state = makeState();
      checkpoint.create('sess-x', 'c-1', state, 'automatic', 5);
      // Small delay to ensure different timestamp in ID
      await new Promise(r => setTimeout(r, 5));
      const second = checkpoint.create('sess-x', 'c-1', state, 'automatic', 10);
      const latest = checkpoint.loadLatest('sess-x');
      expect(latest!.id).toBe(second.id);
    });
  });

  describe('listAll()', () => {
    it('returns empty array for unknown session', () => {
      expect(checkpoint.listAll('no-such-session')).toHaveLength(0);
    });

    it('returns all checkpoints in order', async () => {
      checkpoint.create('sess-y', 'c-1', makeState(), 'automatic', 5);
      await new Promise(r => setTimeout(r, 5));
      checkpoint.create('sess-y', 'c-1', makeState(), 'pre-handoff', 7);
      const all = checkpoint.listAll('sess-y');
      expect(all).toHaveLength(2);
      expect(all[0].reason).toBe('automatic');
      expect(all[1].reason).toBe('pre-handoff');
    });
  });
});
