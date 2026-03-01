/**
 * @module memory/file-memory-adapter.test
 * @description Tests for file-first memory adapter.
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { FileMemoryAdapter } from '../file-memory-adapter.js';

describe('FileMemoryAdapter', () => {
  let testDir: string;
  let adapter: FileMemoryAdapter;

  beforeEach(() => {
    testDir = join(tmpdir(), `dcyfr-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    adapter = new FileMemoryAdapter({
      agentId: 'test-agent',
      rootDir: testDir,
    });
  });

  afterEach(() => {
    adapter.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('initialization', () => {
    it('creates memory directory structure', () => {
      const memDir = adapter.getMemoryDir();
      expect(existsSync(memDir)).toBe(true);
      expect(existsSync(join(memDir, 'facts.md'))).toBe(true);
      expect(existsSync(join(memDir, 'tasks.md'))).toBe(true);
      expect(existsSync(join(memDir, 'conversations'))).toBe(true);
      expect(existsSync(join(memDir, '.index.db'))).toBe(true);
    });

    it('facts.md has proper header', () => {
      const content = readFileSync(join(adapter.getMemoryDir(), 'facts.md'), 'utf8');
      expect(content).toContain('# Facts');
    });

    it('tasks.md has proper header', () => {
      const content = readFileSync(join(adapter.getMemoryDir(), 'tasks.md'), 'utf8');
      expect(content).toContain('# Tasks');
    });
  });

  describe('user memories', () => {
    it('adds user memory and returns id', async () => {
      const id = await adapter.addUserMemory(
        'user-123',
        'User prefers dark mode',
        { topic: 'preferences', importance: 8 },
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('persists user memory to facts.md', async () => {
      await adapter.addUserMemory(
        'user-123',
        'User prefers TypeScript strict mode',
      );

      const content = readFileSync(join(adapter.getMemoryDir(), 'facts.md'), 'utf8');
      expect(content).toContain('User prefers TypeScript strict mode');
      expect(content).toContain('user-123');
      expect(content).toContain('(user)');
    });

    it('retrieves user memories', async () => {
      await adapter.addUserMemory('user-123', 'Memory 1');
      await adapter.addUserMemory('user-123', 'Memory 2');
      await adapter.addUserMemory('user-456', 'Other user memory');

      const memories = await adapter.getUserMemories('user-123');
      expect(memories.length).toBe(2);
      expect(memories.every((m) => m.owner === 'user-123')).toBe(true);
    });

    it('filters user memories by topic', async () => {
      await adapter.addUserMemory('user-123', 'Coding style', { topic: 'code' });
      await adapter.addUserMemory('user-123', 'Favorite color', { topic: 'personal' });

      const memories = await adapter.getUserMemories('user-123', 'code');
      expect(memories.length).toBe(1);
      expect(memories[0].topic).toBe('code');
    });

    it('searches user memories', async () => {
      await adapter.addUserMemory('user-123', 'TypeScript is great for large projects');
      await adapter.addUserMemory('user-123', 'Python is good for data science');
      await adapter.addUserMemory('user-456', 'TypeScript types are useful');

      // BM25-only search (no embedFn configured)
      // Note: FTS5 tokenizes PascalCase words, so search for a term that appears verbatim
      const results = await adapter.searchUserMemories('user-123', 'great projects');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('great');
      expect(results[0].owner).toBe('user-123');
    });

    it('deletes user memories', async () => {
      await adapter.addUserMemory('user-123', 'Memory to delete');
      await adapter.addUserMemory('user-456', 'Keep this memory');

      await adapter.deleteUserMemories('user-123');

      const deleted = await adapter.getUserMemories('user-123');
      const kept = await adapter.getUserMemories('user-456');

      expect(deleted.length).toBe(0);
      expect(kept.length).toBe(1);
    });
  });

  describe('agent memories', () => {
    it('adds agent state memory', async () => {
      const state = { currentTask: 'code-review', progress: 50 };
      const id = await adapter.addAgentMemory('agent-1', 'session-abc', state);

      expect(id).toBeDefined();
    });

    it('retrieves agent state', async () => {
      const state = { currentTask: 'testing', files: ['a.ts', 'b.ts'] };
      await adapter.addAgentMemory('agent-1', 'session-xyz', state);

      const retrieved = await adapter.getAgentState('agent-1', 'session-xyz');

      expect(retrieved).toEqual(state);
    });

    it('returns null for non-existent agent state', async () => {
      const result = await adapter.getAgentState('unknown-agent', 'unknown-session');
      expect(result).toBeNull();
    });

    it('searches agent memories', async () => {
      await adapter.addAgentMemory('agent-1', 'session-1', { task: 'code review' });
      await adapter.addAgentMemory('agent-1', 'session-2', { task: 'documentation' });

      const results = await adapter.searchAgentMemories('agent-1', 'code review');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('session memories', () => {
    it('adds session memory', async () => {
      const id = await adapter.addSessionMemory('session-123', 'User asked about TypeScript');
      expect(id).toBeDefined();
    });

    it('creates conversation file for session', async () => {
      await adapter.addSessionMemory('session-abc', 'First message');

      const convDir = join(adapter.getMemoryDir(), 'conversations');
      const files = (await import('node:fs')).readdirSync(convDir);
      const sessionFile = files.find((f) => f.includes('session-abc'));

      expect(sessionFile).toBeDefined();
    });

    it('retrieves session context', async () => {
      await adapter.addSessionMemory('session-123', 'Message 1');
      await adapter.addSessionMemory('session-123', 'Message 2');

      const context = await adapter.getSessionContext('session-123');

      expect(context).toContain('Message 1');
      expect(context).toContain('Message 2');
    });

    it('deletes session memories', async () => {
      await adapter.addSessionMemory('session-del', 'To be deleted');

      await adapter.deleteSessionMemories('session-del');

      const context = await adapter.getSessionContext('session-del');
      expect(context).toBe('');
    });
  });

  describe('global search', () => {
    it('searches across all memory types', async () => {
      await adapter.addUserMemory('user-1', 'TypeScript best practices');
      await adapter.addAgentMemory('agent-1', 'sess-1', { topic: 'TypeScript setup' });
      await adapter.addSessionMemory('sess-1', 'Discussing TypeScript');

      const results = await adapter.search('TypeScript');

      // Should find results from multiple sources
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.content.includes('TypeScript'))).toBe(true);
    });

    it('respects custom threshold', async () => {
      await adapter.addUserMemory('user-1', 'Some content about JavaScript');

      // Very high threshold should filter most results
      const results = await adapter.search('completely unrelated query xyz', {
        threshold: 0.99,
      });

      expect(results.length).toBe(0);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await adapter.addUserMemory(`user-${i}`, `Content about item ${i}`);
      }

      const results = await adapter.search('Content', { limit: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('file watching', () => {
    it('starts and stops file watcher', () => {
      adapter.startWatching();
      // Should not throw
      adapter.stopWatching();
    });

    it('handles multiple start/stop calls gracefully', () => {
      adapter.startWatching();
      adapter.startWatching(); // Second call should be no-op
      adapter.stopWatching();
      adapter.stopWatching(); // Second call should be no-op
    });
  });

  describe('coexist mode', () => {
    it('accepts sync target configuration', () => {
      // Create a mock sync target
      const mockSyncTarget = {
        addUserMemory: async () => 'mock-id',
        searchUserMemories: async () => [],
        getUserMemories: async () => [],
        addAgentMemory: async () => 'mock-id',
        searchAgentMemories: async () => [],
        getAgentState: async () => null,
        addSessionMemory: async () => 'mock-id',
        getSessionContext: async () => '',
        deleteUserMemories: async () => {},
        deleteSessionMemories: async () => {},
      };

      const coexistAdapter = new FileMemoryAdapter({
        agentId: 'coexist-agent',
        rootDir: testDir,
        syncTarget: mockSyncTarget,
      });

      // Should initialize without errors
      expect(coexistAdapter.getMemoryDir()).toBeDefined();
      coexistAdapter.close();
    });
  });

  describe('embedding function', () => {
    it('accepts custom embedding function', async () => {
      let embedCalled = false;
      const embedFn = async (_text: string): Promise<number[]> => {
        embedCalled = true;
        return [0.1, 0.2, 0.3];
      };

      const embeddingAdapter = new FileMemoryAdapter({
        agentId: 'embed-agent',
        rootDir: testDir,
        embedFn,
      });

      await embeddingAdapter.addUserMemory('user-1', 'Content to embed');

      // Give async embedding time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(embedCalled).toBe(true);
      embeddingAdapter.close();
    });
  });
});
