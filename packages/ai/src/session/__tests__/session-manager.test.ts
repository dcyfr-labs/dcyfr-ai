/**
 * Session Manager Tests
 * TLP:AMBER - Internal Use Only
 *
 * Comprehensive tests for:
 *   - Session lifecycle (create, get, suspend, resume, destroy)
 *   - Trust-level tool policies (full/sandboxed/readonly)
 *   - Session metadata and querying
 *   - Security middleware integration (TLP + rate limiter)
 *   - Shared knowledge base overlay
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionManager,
  OverlayMemory,
  TLPSessionMiddleware,
  RateLimiterSessionMiddleware,
  TrustLevelViolation,
  trustLevelToPolicy,
  isToolAllowed,
  type SessionConfig,
  type SessionTool,
  type SessionSecurityMiddleware,
} from '../session-manager.js';
import type { DCYFRMemory, MemorySearchResult, Memory } from '../../../memory/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMockMemory(prefix = 'session'): DCYFRMemory {
  const store = new Map<string, string[]>();
  return {
    addUserMemory: vi.fn(async (userId: string, message: string) => {
      const key = `${prefix}:user:${userId}`;
      const existing = store.get(key) ?? [];
      existing.push(message);
      store.set(key, existing);
      return `${prefix}-mem-${Date.now()}`;
    }),
    searchUserMemories: vi.fn(async (userId: string, query: string, limit = 3): Promise<MemorySearchResult[]> => {
      const key = `${prefix}:user:${userId}`;
      const entries = store.get(key) ?? [];
      return entries
        .filter(e => e.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map((content, i) => ({
          id: `${prefix}-${i}`,
          content,
          owner: userId,
          ownerType: 'user' as const,
          relevance: 0.9 - i * 0.1,
          createdAt: new Date(),
        }));
    }),
    getUserMemories: vi.fn(async (userId: string): Promise<Memory[]> => {
      const key = `${prefix}:user:${userId}`;
      const entries = store.get(key) ?? [];
      return entries.map((content, i) => ({
        id: `${prefix}-${i}`,
        content,
        owner: userId,
        ownerType: 'user' as const,
        createdAt: new Date(),
      }));
    }),
    addAgentMemory: vi.fn(async () => `${prefix}-agent-mem`),
    searchAgentMemories: vi.fn(async (_agentId: string, _query: string, _limit = 3): Promise<MemorySearchResult[]> => []),
    getAgentState: vi.fn(async () => null),
    addSessionMemory: vi.fn(async () => `${prefix}-session-mem`),
    getSessionContext: vi.fn(async (sessionId: string) => `${prefix} context for ${sessionId}`),
    deleteUserMemories: vi.fn(async () => {}),
    deleteSessionMemories: vi.fn(async () => {}),
  };
}

function defaultConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    agentId: 'test-agent',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  // ─── 6.1: Session Lifecycle ───

  describe('create', () => {
    it('creates a session with generated UUID', async () => {
      const session = await manager.create(defaultConfig());
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('creates an active session by default', async () => {
      const session = await manager.create(defaultConfig());
      expect(session.lifecycle).toBe('active');
    });

    it('sets agentId from config', async () => {
      const session = await manager.create(defaultConfig({ agentId: 'my-agent' }));
      expect(session.agentId).toBe('my-agent');
    });

    it('defaults trust level to sandboxed', async () => {
      const session = await manager.create(defaultConfig());
      expect(session.trustLevel).toBe('sandboxed');
    });

    it('respects custom trust level', async () => {
      const session = await manager.create(defaultConfig({ trustLevel: 'full' }));
      expect(session.trustLevel).toBe('full');
    });

    it('creates isolated memory via memoryFactory', async () => {
      const factory = vi.fn((sessionId: string, agentId: string) => createMockMemory(`${agentId}-${sessionId}`));
      const session = await manager.create(defaultConfig({ memoryFactory: factory }));
      expect(factory).toHaveBeenCalledWith(session.id, 'test-agent');
      expect(session.memory).toBeDefined();
    });

    it('initializes messageCount to 0', async () => {
      const session = await manager.create(defaultConfig());
      expect(session.messageCount).toBe(0);
    });

    it('sets createdAt and lastActiveAt timestamps', async () => {
      const before = new Date();
      const session = await manager.create(defaultConfig());
      const after = new Date();
      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session.lastActiveAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('emits session:created event', async () => {
      const handler = vi.fn();
      manager.on('session:created', handler);
      const session = await manager.create(defaultConfig());
      expect(handler).toHaveBeenCalledWith(session);
    });

    it('enforces max sessions limit', async () => {
      manager.dispose();
      manager = new SessionManager({ maxSessions: 2 });
      await manager.create(defaultConfig({ agentId: 'a1' }));
      await manager.create(defaultConfig({ agentId: 'a2' }));
      await expect(manager.create(defaultConfig({ agentId: 'a3' }))).rejects.toThrow(
        /Maximum session limit/
      );
    });

    it('sets expiresAt when ttlMs is specified', async () => {
      const session = await manager.create(defaultConfig({ ttlMs: 60_000 }));
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('expiresAt is null when no ttl', async () => {
      const session = await manager.create(defaultConfig());
      expect(session.expiresAt).toBeNull();
    });
  });

  describe('get', () => {
    it('retrieves session by ID', async () => {
      const session = await manager.create(defaultConfig());
      const retrieved = manager.get(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(session.id);
    });

    it('returns undefined for unknown ID', () => {
      expect(manager.get('nonexistent')).toBeUndefined();
    });
  });

  describe('suspend', () => {
    it('transitions lifecycle to suspended', async () => {
      const session = await manager.create(defaultConfig());
      const suspended = manager.suspend(session.id);
      expect(suspended.lifecycle).toBe('suspended');
    });

    it('emits session:suspended event', async () => {
      const handler = vi.fn();
      manager.on('session:suspended', handler);
      const session = await manager.create(defaultConfig());
      manager.suspend(session.id);
      expect(handler).toHaveBeenCalled();
    });

    it('throws for destroyed sessions', async () => {
      const session = await manager.create(defaultConfig());
      await manager.destroy(session.id);
      expect(() => manager.suspend(session.id)).toThrow(/Session not found/);
    });
  });

  describe('resume', () => {
    it('transitions suspended session back to active', async () => {
      const session = await manager.create(defaultConfig());
      manager.suspend(session.id);
      const resumed = manager.resume(session.id);
      expect(resumed.lifecycle).toBe('active');
    });

    it('throws when resuming an active session', async () => {
      const session = await manager.create(defaultConfig());
      expect(() => manager.resume(session.id)).toThrow(/expected 'suspended'/);
    });

    it('emits session:resumed event', async () => {
      const handler = vi.fn();
      manager.on('session:resumed', handler);
      const session = await manager.create(defaultConfig());
      manager.suspend(session.id);
      manager.resume(session.id);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('removes session from store', async () => {
      const session = await manager.create(defaultConfig());
      await manager.destroy(session.id);
      expect(manager.get(session.id)).toBeUndefined();
    });

    it('cleans up session memory', async () => {
      const mockMemory = createMockMemory();
      const session = await manager.create(defaultConfig({
        memoryFactory: () => mockMemory,
      }));
      await manager.destroy(session.id);
      expect(mockMemory.deleteSessionMemories).toHaveBeenCalledWith(session.id);
    });

    it('is idempotent — destroying nonexistent session is safe', async () => {
      await expect(manager.destroy('nonexistent')).resolves.toBeUndefined();
    });

    it('emits session:destroyed event', async () => {
      const handler = vi.fn();
      manager.on('session:destroyed', handler);
      const session = await manager.create(defaultConfig());
      await manager.destroy(session.id);
      expect(handler).toHaveBeenCalled();
    });

    it('decrements size', async () => {
      const session = await manager.create(defaultConfig());
      expect(manager.size).toBe(1);
      await manager.destroy(session.id);
      expect(manager.size).toBe(0);
    });
  });

  describe('touch', () => {
    it('updates lastActiveAt', async () => {
      const session = await manager.create(defaultConfig());
      const before = session.lastActiveAt;
      // Small delay to ensure different timestamp
      await new Promise(r => setTimeout(r, 5));
      manager.touch(session.id);
      expect(session.lastActiveAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('increments messageCount', async () => {
      const session = await manager.create(defaultConfig());
      expect(session.messageCount).toBe(0);
      manager.touch(session.id);
      expect(session.messageCount).toBe(1);
      manager.touch(session.id);
      expect(session.messageCount).toBe(2);
    });

    it('throws for suspended sessions', async () => {
      const session = await manager.create(defaultConfig());
      manager.suspend(session.id);
      expect(() => manager.touch(session.id)).toThrow(/lifecycle is 'suspended'/);
    });

    it('emits session:active event', async () => {
      const handler = vi.fn();
      manager.on('session:active', handler);
      const session = await manager.create(defaultConfig());
      manager.touch(session.id);
      expect(handler).toHaveBeenCalledWith(session);
    });
  });

  describe('findIdle', () => {
    it('returns sessions idle for specified minutes', async () => {
      const session = await manager.create(defaultConfig());
      // Manually set lastActiveAt to 10 minutes ago
      session.lastActiveAt = new Date(Date.now() - 10 * 60_000);

      const idle = manager.findIdle({ idleMinutes: 5 });
      expect(idle).toHaveLength(1);
      expect(idle[0].id).toBe(session.id);
    });

    it('excludes recently active sessions', async () => {
      await manager.create(defaultConfig());
      const idle = manager.findIdle({ idleMinutes: 5 });
      expect(idle).toHaveLength(0);
    });

    it('filters by lifecycle', async () => {
      const s1 = await manager.create(defaultConfig({ agentId: 'a1' }));
      const s2 = await manager.create(defaultConfig({ agentId: 'a2' }));
      // Suspend s2 first, then backdate lastActiveAt so it appears idle
      manager.suspend(s2.id);
      s1.lastActiveAt = new Date(Date.now() - 10 * 60_000);
      s2.lastActiveAt = new Date(Date.now() - 10 * 60_000);

      const idle = manager.findIdle({ idleMinutes: 5, lifecycle: 'suspended' });
      expect(idle).toHaveLength(1);
      expect(idle[0].id).toBe(s2.id);
    });
  });

  // ─── 6.2: Trust-Level Tool Policies ───

  describe('trust-level tool policies', () => {
    describe('trustLevelToPolicy', () => {
      it('full → allow_all', () => {
        const policy = trustLevelToPolicy('full');
        expect(policy.mode).toBe('allow_all');
      });

      it('sandboxed → allowlist', () => {
        const policy = trustLevelToPolicy('sandboxed', ['file_write']);
        expect(policy.mode).toBe('allowlist');
        expect(policy.allowlist).toContain('file_write');
      });

      it('readonly → readonly', () => {
        const policy = trustLevelToPolicy('readonly');
        expect(policy.mode).toBe('readonly');
      });
    });

    describe('isToolAllowed', () => {
      const readTool: SessionTool = { name: 'file_read', isWrite: false };
      const writeTool: SessionTool = { name: 'file_write', isWrite: true };
      const allowlistedTool: SessionTool = { name: 'db_insert', isWrite: true };

      it('full mode allows all tools', () => {
        const policy = trustLevelToPolicy('full');
        expect(isToolAllowed(readTool, policy)).toBe(true);
        expect(isToolAllowed(writeTool, policy)).toBe(true);
      });

      it('readonly mode blocks write tools', () => {
        const policy = trustLevelToPolicy('readonly');
        expect(isToolAllowed(readTool, policy)).toBe(true);
        expect(isToolAllowed(writeTool, policy)).toBe(false);
      });

      it('sandboxed mode allows reads and allowlisted writes', () => {
        const policy = trustLevelToPolicy('sandboxed', ['db_insert']);
        expect(isToolAllowed(readTool, policy)).toBe(true);
        expect(isToolAllowed(writeTool, policy)).toBe(false);
        expect(isToolAllowed(allowlistedTool, policy)).toBe(true);
      });

      it('denylist always blocks', () => {
        const policy = { ...trustLevelToPolicy('full'), denylist: ['file_read'] };
        expect(isToolAllowed(readTool, policy)).toBe(false);
      });
    });

    describe('enforceToolPolicy', () => {
      it('allows permitted tools', async () => {
        const session = await manager.create(defaultConfig({ trustLevel: 'full' }));
        expect(() =>
          manager.enforceToolPolicy(session.id, { name: 'any_tool', isWrite: true })
        ).not.toThrow();
      });

      it('throws TrustLevelViolation for blocked tools', async () => {
        const session = await manager.create(defaultConfig({ trustLevel: 'readonly' }));
        expect(() =>
          manager.enforceToolPolicy(session.id, { name: 'file_write', isWrite: true })
        ).toThrow(TrustLevelViolation);
      });

      it('TrustLevelViolation has expected properties', async () => {
        const session = await manager.create(defaultConfig({ trustLevel: 'readonly' }));
        try {
          manager.enforceToolPolicy(session.id, { name: 'file_write', isWrite: true });
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(TrustLevelViolation);
          const violation = e as TrustLevelViolation;
          expect(violation.toolName).toBe('file_write');
          expect(violation.trustLevel).toBe('readonly');
          expect(violation.policyMode).toBe('readonly');
        }
      });

      it('emits tool:blocked event on violation', async () => {
        const handler = vi.fn();
        manager.on('tool:blocked', handler);
        const session = await manager.create(defaultConfig({ trustLevel: 'readonly' }));
        try {
          manager.enforceToolPolicy(session.id, { name: 'file_write', isWrite: true });
        } catch { /* expected */ }
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: session.id,
            tool: { name: 'file_write', isWrite: true },
          })
        );
      });
    });

    describe('setTrustLevel', () => {
      it('updates trust level and regenerates policy', async () => {
        const session = await manager.create(defaultConfig({ trustLevel: 'readonly' }));
        expect(session.trustLevel).toBe('readonly');

        manager.setTrustLevel(session.id, 'full');
        expect(session.trustLevel).toBe('full');
        expect(session.toolPolicy.mode).toBe('allow_all');
      });
    });
  });

  // ─── 6.3: Session Metadata ───

  describe('metadata', () => {
    it('stores custom metadata on creation', async () => {
      const session = await manager.create(defaultConfig({
        metadata: { department: 'engineering', priority: 'high' },
      }));
      expect(session.metadata.department).toBe('engineering');
      expect(session.metadata.priority).toBe('high');
    });

    it('stores userId and platform', async () => {
      const session = await manager.create(defaultConfig({
        userId: 'user-123',
        platform: 'telegram',
      }));
      expect(session.userId).toBe('user-123');
      expect(session.platform).toBe('telegram');
    });

    it('updateMetadata merges with existing', async () => {
      const session = await manager.create(defaultConfig({
        metadata: { key1: 'value1' },
      }));
      manager.updateMetadata(session.id, { key2: 'value2' });
      expect(session.metadata.key1).toBe('value1');
      expect(session.metadata.key2).toBe('value2');
    });

    it('getMetadata returns a copy', async () => {
      const session = await manager.create(defaultConfig({
        metadata: { key: 'value' },
      }));
      const meta = manager.getMetadata(session.id);
      meta.key = 'modified';
      expect(session.metadata.key).toBe('value'); // Original unchanged
    });

    it('records createdAt, lastActiveAt, messageCount lifecycle metadata', async () => {
      const session = await manager.create(defaultConfig());
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActiveAt).toBeInstanceOf(Date);
      expect(session.messageCount).toBe(0);

      manager.touch(session.id);
      expect(session.messageCount).toBe(1);
    });
  });

  describe('find (queryable)', () => {
    it('finds by agentId', async () => {
      await manager.create(defaultConfig({ agentId: 'alpha' }));
      await manager.create(defaultConfig({ agentId: 'beta' }));
      const results = manager.find({ agentId: 'alpha' });
      expect(results).toHaveLength(1);
      expect(results[0].agentId).toBe('alpha');
    });

    it('finds by userId', async () => {
      await manager.create(defaultConfig({ userId: 'user-1' }));
      await manager.create(defaultConfig({ userId: 'user-2' }));
      const results = manager.find({ userId: 'user-1' });
      expect(results).toHaveLength(1);
    });

    it('finds by platform', async () => {
      await manager.create(defaultConfig({ platform: 'telegram' }));
      await manager.create(defaultConfig({ platform: 'slack' }));
      const results = manager.find({ platform: 'telegram' });
      expect(results).toHaveLength(1);
    });

    it('finds by lifecycle', async () => {
      const s1 = await manager.create(defaultConfig({ agentId: 'a1' }));
      await manager.create(defaultConfig({ agentId: 'a2' }));
      manager.suspend(s1.id);
      const results = manager.find({ lifecycle: 'suspended' });
      expect(results).toHaveLength(1);
    });

    it('finds by trustLevel', async () => {
      await manager.create(defaultConfig({ trustLevel: 'full' }));
      await manager.create(defaultConfig({ trustLevel: 'readonly' }));
      const results = manager.find({ trustLevel: 'full' });
      expect(results).toHaveLength(1);
    });

    it('finds by custom metadata key/value', async () => {
      await manager.create(defaultConfig({ metadata: { env: 'prod' } }));
      await manager.create(defaultConfig({ metadata: { env: 'staging' } }));
      const results = manager.find({ metadata: { env: 'prod' } });
      expect(results).toHaveLength(1);
    });

    it('combines multiple filters', async () => {
      await manager.create(defaultConfig({ agentId: 'a1', platform: 'telegram' }));
      await manager.create(defaultConfig({ agentId: 'a1', platform: 'slack' }));
      await manager.create(defaultConfig({ agentId: 'a2', platform: 'telegram' }));
      const results = manager.find({ agentId: 'a1', platform: 'telegram' });
      expect(results).toHaveLength(1);
    });
  });

  describe('getActiveSessions and size', () => {
    it('returns only active sessions', async () => {
      const s1 = await manager.create(defaultConfig({ agentId: 'a1' }));
      await manager.create(defaultConfig({ agentId: 'a2' }));
      manager.suspend(s1.id);

      const active = manager.getActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].agentId).toBe('a2');
    });

    it('size tracks all sessions', async () => {
      expect(manager.size).toBe(0);
      await manager.create(defaultConfig());
      expect(manager.size).toBe(1);
      await manager.create(defaultConfig());
      expect(manager.size).toBe(2);
    });
  });

  describe('getSessionsByAgent', () => {
    it('groups sessions by agent', async () => {
      await manager.create(defaultConfig({ agentId: 'a1' }));
      await manager.create(defaultConfig({ agentId: 'a1' }));
      await manager.create(defaultConfig({ agentId: 'a2' }));

      const grouped = manager.getSessionsByAgent();
      expect(grouped.get('a1')).toHaveLength(2);
      expect(grouped.get('a2')).toHaveLength(1);
    });
  });

  // ─── 6.4: Security Middleware Integration ───

  describe('delegation security middleware', () => {
    describe('TLPSessionMiddleware', () => {
      it('allows sessions when agent has sufficient TLP clearance', async () => {
        const tlpMiddleware = new TLPSessionMiddleware({
          'agent-1': 'AMBER',
        });

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [tlpMiddleware] });

        const session = await manager.create(defaultConfig({
          agentId: 'agent-1',
          tlpClassification: 'GREEN',
          trustLevel: 'full',
        }));
        expect(session.trustLevel).toBe('full');
      });

      it('downgrades trust level when clearance is insufficient', async () => {
        const tlpMiddleware = new TLPSessionMiddleware({
          'agent-1': 'GREEN',
        });

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [tlpMiddleware] });

        const session = await manager.create(defaultConfig({
          agentId: 'agent-1',
          tlpClassification: 'RED',
          trustLevel: 'full',
        }));
        // GREEN < RED, so trust should be downgraded
        expect(session.trustLevel).not.toBe('full');
      });

      it('downgrades unknown agents to readonly', async () => {
        const tlpMiddleware = new TLPSessionMiddleware({});

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [tlpMiddleware] });

        const session = await manager.create(defaultConfig({
          agentId: 'unknown-agent',
          tlpClassification: 'AMBER',
          trustLevel: 'full',
        }));
        expect(session.trustLevel).toBe('readonly');
      });

      it('passes through when no TLP classification', async () => {
        const tlpMiddleware = new TLPSessionMiddleware({});

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [tlpMiddleware] });

        const session = await manager.create(defaultConfig({
          trustLevel: 'full',
        }));
        expect(session.trustLevel).toBe('full');
      });
    });

    describe('RateLimiterSessionMiddleware', () => {
      it('allows sessions within rate limit', async () => {
        const rateLimiter = new RateLimiterSessionMiddleware(5, 60_000);

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [rateLimiter] });

        const session = await manager.create(defaultConfig());
        expect(session).toBeDefined();
      });

      it('blocks sessions exceeding rate limit', async () => {
        const rateLimiter = new RateLimiterSessionMiddleware(2, 60_000);

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [rateLimiter] });

        await manager.create(defaultConfig({ agentId: 'a1' }));
        await manager.create(defaultConfig({ agentId: 'a1' }));
        await expect(
          manager.create(defaultConfig({ agentId: 'a1' }))
        ).rejects.toThrow(/Rate limit exceeded/);
      });

      it('tracks different agents independently', async () => {
        const rateLimiter = new RateLimiterSessionMiddleware(1, 60_000);

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [rateLimiter] });

        await manager.create(defaultConfig({ agentId: 'a1' }));
        // Different agent — should work
        const session = await manager.create(defaultConfig({ agentId: 'a2' }));
        expect(session.agentId).toBe('a2');
      });

      it('getWindowCount tracks operations', () => {
        const rateLimiter = new RateLimiterSessionMiddleware(10, 60_000);
        expect(rateLimiter.getWindowCount('a1')).toBe(0);
      });
    });

    describe('middleware chain', () => {
      it('runs multiple middleware in sequence', async () => {
        const calls: string[] = [];
        const mw1: SessionSecurityMiddleware = {
          async evaluate() {
            calls.push('mw1');
            return { allowed: true };
          },
        };
        const mw2: SessionSecurityMiddleware = {
          async evaluate() {
            calls.push('mw2');
            return { allowed: true };
          },
        };

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [mw1, mw2] });

        await manager.create(defaultConfig());
        expect(calls).toEqual(['mw1', 'mw2']);
      });

      it('stops chain and throws on first block', async () => {
        const blockerMw: SessionSecurityMiddleware = {
          async evaluate() {
            return { allowed: false, reason: 'Blocked by test' };
          },
        };
        const neverReachedMw: SessionSecurityMiddleware = {
          async evaluate() {
            throw new Error('Should not reach this middleware');
          },
        };

        manager.dispose();
        manager = new SessionManager({ securityMiddleware: [blockerMw, neverReachedMw] });

        await expect(
          manager.create(defaultConfig())
        ).rejects.toThrow(/Blocked by test/);
      });
    });
  });

  // ─── 6.5: Shared Knowledge Base Overlay ───

  describe('shared knowledge base overlay', () => {
    it('wraps session memory with shared overlay when configured', async () => {
      const sharedMemory = createMockMemory('shared');
      const sessionMemory = createMockMemory('session');

      // Pre-populate shared memory
      await sharedMemory.addUserMemory('shared', 'DCYFR uses Next.js 15');

      manager.dispose();
      manager = new SessionManager({
        sharedKnowledgeBase: { memory: sharedMemory, namespace: 'shared' },
      });

      const session = await manager.create(defaultConfig({
        memoryFactory: () => sessionMemory,
      }));

      expect(session.memory).toBeDefined();
      // Memory should be an OverlayMemory (cast check)
      expect(session.memory).not.toBe(sessionMemory);
    });

    it('returns session memory directly when no shared knowledge', async () => {
      const sessionMemory = createMockMemory('session');

      const session = await manager.create(defaultConfig({
        memoryFactory: () => sessionMemory,
      }));

      expect(session.memory).toBe(sessionMemory);
    });
  });

  describe('OverlayMemory', () => {
    let sessionMemory: DCYFRMemory;
    let sharedMemory: DCYFRMemory;
    let overlay: OverlayMemory;

    beforeEach(() => {
      sessionMemory = createMockMemory('session');
      sharedMemory = createMockMemory('shared');
      overlay = new OverlayMemory(sessionMemory, sharedMemory, 'shared-ns');
    });

    it('merges searchUserMemories from both sources', async () => {
      // Mock session results
      vi.mocked(sessionMemory.searchUserMemories).mockResolvedValueOnce([
        { id: 's1', content: 'session result', owner: 'u1', ownerType: 'user', relevance: 0.9, createdAt: new Date() },
      ]);
      // Mock shared results
      vi.mocked(sharedMemory.searchUserMemories).mockResolvedValueOnce([
        { id: 'sh1', content: 'shared result', owner: 'shared-ns', ownerType: 'user', relevance: 0.8, createdAt: new Date() },
      ]);

      const results = await overlay.searchUserMemories('u1', 'test', 5);
      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('session result');
      expect(results[1].content).toBe('shared result');
      expect(results[1].metadata?.source).toBe('shared');
    });

    it('deduplicates by content — session wins', async () => {
      const duplicateContent = 'same content in both';
      vi.mocked(sessionMemory.searchUserMemories).mockResolvedValueOnce([
        { id: 's1', content: duplicateContent, owner: 'u1', ownerType: 'user', relevance: 0.9, createdAt: new Date() },
      ]);
      vi.mocked(sharedMemory.searchUserMemories).mockResolvedValueOnce([
        { id: 'sh1', content: duplicateContent, owner: 'shared-ns', ownerType: 'user', relevance: 0.7, createdAt: new Date() },
      ]);

      const results = await overlay.searchUserMemories('u1', 'test', 5);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s1'); // Session result kept
    });

    it('respects limit on merged results', async () => {
      vi.mocked(sessionMemory.searchUserMemories).mockResolvedValueOnce([
        { id: 's1', content: 'a', owner: 'u1', ownerType: 'user', relevance: 0.9, createdAt: new Date() },
        { id: 's2', content: 'b', owner: 'u1', ownerType: 'user', relevance: 0.8, createdAt: new Date() },
      ]);
      vi.mocked(sharedMemory.searchUserMemories).mockResolvedValueOnce([
        { id: 'sh1', content: 'c', owner: 'shared-ns', ownerType: 'user', relevance: 0.85, createdAt: new Date() },
        { id: 'sh2', content: 'd', owner: 'shared-ns', ownerType: 'user', relevance: 0.7, createdAt: new Date() },
      ]);

      const results = await overlay.searchUserMemories('u1', 'test', 2);
      expect(results).toHaveLength(2);
    });

    it('merges getSessionContext from both sources', async () => {
      vi.mocked(sessionMemory.getSessionContext).mockResolvedValueOnce('session context');
      vi.mocked(sharedMemory.getSessionContext).mockResolvedValueOnce('shared context');

      const ctx = await overlay.getSessionContext('sess-1');
      expect(ctx).toContain('session context');
      expect(ctx).toContain('[Shared Knowledge]');
      expect(ctx).toContain('shared context');
    });

    it('writes go to session memory only', async () => {
      await overlay.addUserMemory('u1', 'new fact');
      expect(sessionMemory.addUserMemory).toHaveBeenCalledWith('u1', 'new fact', undefined);
      expect(sharedMemory.addUserMemory).not.toHaveBeenCalled();
    });

    it('addSessionMemory goes to session memory', async () => {
      await overlay.addSessionMemory('sess-1', 'temp context');
      expect(sessionMemory.addSessionMemory).toHaveBeenCalledWith('sess-1', 'temp context', undefined);
      expect(sharedMemory.addSessionMemory).not.toHaveBeenCalled();
    });

    it('exposes underlying memories', () => {
      expect(overlay.getSessionMemory()).toBe(sessionMemory);
      expect(overlay.getSharedMemory()).toBe(sharedMemory);
    });
  });

  // ─── Expiry ───

  describe('session expiry', () => {
    it('destroyExpired removes expired sessions', async () => {
      const session = await manager.create(defaultConfig({ ttlMs: 1 }));
      // Wait for expiry
      await new Promise(r => setTimeout(r, 10));
      const destroyed = await manager.destroyExpired();
      expect(destroyed).toBe(1);
      expect(manager.get(session.id)).toBeUndefined();
    });

    it('emits session:expired event', async () => {
      const handler = vi.fn();
      manager.on('session:expired', handler);
      await manager.create(defaultConfig({ ttlMs: 1 }));
      await new Promise(r => setTimeout(r, 10));
      await manager.destroyExpired();
      expect(handler).toHaveBeenCalled();
    });

    it('does not destroy non-expired sessions', async () => {
      await manager.create(defaultConfig({ ttlMs: 3_600_000 }));
      const destroyed = await manager.destroyExpired();
      expect(destroyed).toBe(0);
    });
  });

  // ─── Cleanup ───

  describe('destroyAll', () => {
    it('destroys all sessions', async () => {
      await manager.create(defaultConfig({ agentId: 'a1' }));
      await manager.create(defaultConfig({ agentId: 'a2' }));
      expect(manager.size).toBe(2);
      await manager.destroyAll();
      expect(manager.size).toBe(0);
    });
  });
});
