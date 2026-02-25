/**
 * Tests for BackgroundSessionQueue
 * Phase 6.2 — delegation-execution-modes
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackgroundSessionQueue, MAX_BACKGROUND_SESSIONS } from '../session-queue.js';

describe('BackgroundSessionQueue', () => {
  let queue: BackgroundSessionQueue;

  beforeEach(() => {
    queue = new BackgroundSessionQueue(3); // Use small limit for tests
  });

  describe('constants', () => {
    it('MAX_BACKGROUND_SESSIONS is 10', () => {
      expect(MAX_BACKGROUND_SESSIONS).toBe(10);
    });
  });

  describe('acquire()', () => {
    it('resolves immediately when capacity is available', async () => {
      await expect(queue.acquire('s1', 'c1')).resolves.toBeUndefined();
      expect(queue.isActive('s1')).toBe(true);
      expect(queue.activeCount).toBe(1);
    });

    it('tracks multiple active sessions', async () => {
      await queue.acquire('s1', 'c1');
      await queue.acquire('s2', 'c2');
      await queue.acquire('s3', 'c3');
      expect(queue.activeCount).toBe(3);
    });

    it('queues sessions when at capacity', async () => {
      // Fill capacity
      await queue.acquire('s1', 'c1');
      await queue.acquire('s2', 'c2');
      await queue.acquire('s3', 'c3');
      expect(queue.hasCapacity()).toBe(false);

      // This should be queued (not immediately resolved)
      let resolved = false;
      const promise = queue.acquire('s4', 'c4').then(() => { resolved = true; });
      await Promise.resolve(); // yield
      expect(resolved).toBe(false);
      expect(queue.isQueued('s4')).toBe(true);
      expect(queue.queueDepth).toBe(1);

      // Release one slot — s4 should now activate
      queue.release('s1');
      await promise;
      expect(resolved).toBe(true);
      expect(queue.isActive('s4')).toBe(true);
    });

    it('emits enqueued event when queued', async () => {
      await queue.acquire('s1', 'c1');
      await queue.acquire('s2', 'c2');
      await queue.acquire('s3', 'c3');

      const enqueuedEvents: any[] = [];
      queue.on('enqueued', (e) => enqueuedEvents.push(e));

      const p = queue.acquire('s4', 'c4');
      queue.release('s1');
      await p;

      expect(enqueuedEvents).toHaveLength(1);
      expect(enqueuedEvents[0].sessionId).toBe('s4');
    });
  });

  describe('release()', () => {
    it('releases a slot', async () => {
      await queue.acquire('s1', 'c1');
      queue.release('s1');
      expect(queue.isActive('s1')).toBe(false);
      expect(queue.activeCount).toBe(0);
    });

    it('is a no-op for unknown sessions', () => {
      expect(() => queue.release('unknown')).not.toThrow();
    });

    it('activates next queued session after release', async () => {
      await queue.acquire('s1', 'c1');
      await queue.acquire('s2', 'c2');
      await queue.acquire('s3', 'c3');

      const p4 = queue.acquire('s4', 'c4');
      const p5 = queue.acquire('s5', 'c5');

      queue.release('s1');
      await p4;

      expect(queue.isActive('s4')).toBe(true);
      expect(queue.isQueued('s5')).toBe(true);

      queue.release('s2');
      await p5;
      expect(queue.isActive('s5')).toBe(true);
    });
  });

  describe('hasCapacity()', () => {
    it('returns true when empty', () => {
      expect(queue.hasCapacity()).toBe(true);
    });

    it('returns false when at max', async () => {
      await queue.acquire('s1', 'c1');
      await queue.acquire('s2', 'c2');
      await queue.acquire('s3', 'c3');
      expect(queue.hasCapacity()).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('returns correct status snapshot', async () => {
      await queue.acquire('s1', 'c1');
      const status = queue.getStatus();
      expect(status.activeCount).toBe(1);
      expect(status.remainingCapacity).toBe(2);
      expect(status.atCapacity).toBe(false);
      expect(status.activeSessionIds).toContain('s1');
      expect(status.queuedSessionIds).toHaveLength(0);
    });

    it('reflects queued sessions', async () => {
      await queue.acquire('s1', 'c1');
      await queue.acquire('s2', 'c2');
      await queue.acquire('s3', 'c3');
      queue.acquire('s4', 'c4'); // queued
      const status = queue.getStatus();
      expect(status.atCapacity).toBe(true);
      expect(status.queuedSessionIds).toContain('s4');
    });
  });

  describe('events', () => {
    it('emits activated event when session gets a slot', async () => {
      const activated: any[] = [];
      queue.on('activated', (e) => activated.push(e));
      await queue.acquire('s1', 'c1');
      expect(activated).toHaveLength(1);
      expect(activated[0].sessionId).toBe('s1');
    });

    it('emits released event on release', async () => {
      const released: any[] = [];
      queue.on('released', (e) => released.push(e));
      await queue.acquire('s1', 'c1');
      queue.release('s1');
      expect(released).toHaveLength(1);
      expect(released[0].sessionId).toBe('s1');
    });
  });
});
