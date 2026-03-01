/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for SessionManager
 * Phase 6.5 — delegation-execution-modes
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../session-manager.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { SessionState } from '../../types/agent-capabilities.js';

const makeState = (): SessionState => ({
  status: 'active',
  conversationMessages: [],
  lastActivity: new Date().toISOString(),
});

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    // Disable auto-flush and use in-memory (no archive persistence in tests)
    manager = new SessionManager({ flushIntervalMs: 0 });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('register()', () => {
    it('registers a new session with unread/active state', () => {
      const session = manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      expect(session.sessionId).toBe('s1');
      expect(session.contractId).toBe('c1');
      expect(session.lifeCycle).toBe('active');
      expect(session.status).toBe('unread');
      expect(session.executionMode).toBe(ExecutionMode.INTERACTIVE);
    });

    it('emits session:created event', () => {
      const events: any[] = [];
      manager.on('session:created', (e) => events.push(e));
      manager.register('s2', 'c2', ExecutionMode.BACKGROUND, makeState());
      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe('s2');
    });

    it('increases size', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.register('s2', 'c2', ExecutionMode.BACKGROUND, makeState());
      expect(manager.size).toBe(2);
    });
  });

  describe('updateState()', () => {
    it('updates session state', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      const updated = manager.updateState('s1', { conversationMessages: ['hello'] });
      expect(updated.state.conversationMessages).toEqual(['hello']);
    });

    it('reactivates paused session', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.pause('s1');
      expect(manager.get('s1')!.lifeCycle).toBe('paused');
      manager.updateState('s1', {});
      expect(manager.get('s1')!.lifeCycle).toBe('active');
    });

    it('throws for unknown session', () => {
      expect(() => manager.updateState('unknown', {})).toThrow('Session not found');
    });
  });

  describe('pause()', () => {
    it('transitions to paused lifecycle', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.pause('s1');
      expect(manager.get('s1')!.lifeCycle).toBe('paused');
    });

    it('emits session:paused event', () => {
      const events: any[] = [];
      manager.on('session:paused', (e) => events.push(e));
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.pause('s1');
      expect(events).toHaveLength(1);
    });

    it('throws for archived session', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.archive('s1');
      expect(() => manager.pause('s1')).toThrow();
    });
  });

  describe('archive()', () => {
    it('removes session from memory', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.archive('s1');
      expect(manager.get('s1')).toBeUndefined();
      expect(manager.size).toBe(0);
    });

    it('emits session:archived event', () => {
      const events: any[] = [];
      manager.on('session:archived', (e) => events.push(e));
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.archive('s1');
      expect(events).toHaveLength(1);
    });
  });

  describe('status indicators', () => {
    it('markInProgress transitions to in-progress', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.markInProgress('s1');
      expect(manager.get('s1')!.status).toBe('in-progress');
    });

    it('block transitions to blocked', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.block('s1', 'waiting for approval');
      const s = manager.get('s1')!;
      expect(s.status).toBe('blocked');
      expect(s.blockReason).toBe('waiting for approval');
    });

    it('unblock clears blocked status', () => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.block('s1');
      manager.unblock('s1');
      expect(manager.get('s1')!.status).toBe('in-progress');
    });

    it('emits session:blocked event', () => {
      const events: any[] = [];
      manager.on('session:blocked', (e) => events.push(e));
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.block('s1');
      expect(events).toHaveLength(1);
    });
  });

  describe('queries', () => {
    beforeEach(() => {
      manager.register('s1', 'c1', ExecutionMode.INTERACTIVE, makeState());
      manager.register('s2', 'c2', ExecutionMode.BACKGROUND, makeState());
      manager.register('s3', 'c3', ExecutionMode.ASYNC, makeState());
      manager.markInProgress('s2');
      manager.block('s3');
    });

    it('getUnread() returns unread sessions', () => {
      const unread = manager.getUnread();
      expect(unread.map((s) => s.sessionId)).toContain('s1');
      expect(unread).toHaveLength(1);
    });

    it('getInProgress() returns in-progress sessions', () => {
      const inProgress = manager.getInProgress();
      expect(inProgress.map((s) => s.sessionId)).toContain('s2');
    });

    it('getBlocked() returns blocked sessions', () => {
      const blocked = manager.getBlocked();
      expect(blocked.map((s) => s.sessionId)).toContain('s3');
    });

    it('getByMode() filters by execution mode', () => {
      const background = manager.getByMode(ExecutionMode.BACKGROUND);
      expect(background.map((s) => s.sessionId)).toContain('s2');
      expect(background).toHaveLength(1);
    });

    it('getAll() returns all sessions', () => {
      expect(manager.getAll()).toHaveLength(3);
    });

    it('getByLifeCycle() filters by lifecycle', () => {
      manager.pause('s1');
      const paused = manager.getByLifeCycle('paused');
      expect(paused.map((s) => s.sessionId)).toContain('s1');
    });
  });
});
