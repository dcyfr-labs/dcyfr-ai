/**
 * Working Memory Persistence Tests
 * TLP:AMBER - Internal Use Only
 *
 * Tests for:
 *   - Flushing Map<string, unknown> to Markdown files
 *   - Human-readable formatting with type labels
 *   - Loading entries back from persisted files
 *   - Listing working memory files
 *   - Edge cases (empty maps, special characters, large values)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  flushWorkingMemory,
  loadWorkingMemory,
  listWorkingMemoryFiles,
} from '../working-memory-persistence.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tempDir(): string {
  const dir = join(tmpdir(), `dcyfr-test-wm-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Working Memory Persistence', () => {
  let rootDir: string;
  const agentId = 'test-agent';
  const taskId = 'task-123';

  beforeEach(() => {
    rootDir = tempDir();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  // ─── flushWorkingMemory ───

  describe('flushWorkingMemory', () => {
    it('creates working directory and file', () => {
      const memory = new Map<string, unknown>([
        ['key1', 'value1'],
      ]);

      const result = flushWorkingMemory(memory, {
        rootDir,
        agentId,
        taskId,
        date: '2026-03-01',
      });

      expect(result.created).toBe(true);
      expect(result.entriesWritten).toBe(1);
      expect(result.bytesWritten).toBeGreaterThan(0);
      expect(existsSync(result.filePath)).toBe(true);
    });

    it('names file with date and taskId', () => {
      const memory = new Map<string, unknown>([['k', 'v']]);
      const result = flushWorkingMemory(memory, {
        rootDir,
        agentId,
        taskId: 'my-task',
        date: '2026-01-15',
      });

      expect(result.filePath).toContain('2026-01-15-my-task.md');
    });

    it('sanitizes taskId for filename safety', () => {
      const memory = new Map<string, unknown>([['k', 'v']]);
      const result = flushWorkingMemory(memory, {
        rootDir,
        agentId,
        taskId: 'task/with:special chars!',
        date: '2026-01-15',
      });

      expect(result.filePath).not.toContain('/with:');
      expect(result.filePath).toContain('task_with_special_chars_');
    });

    it('includes metadata header', () => {
      const memory = new Map<string, unknown>([['key1', 'value1']]);
      const result = flushWorkingMemory(memory, {
        rootDir,
        agentId,
        taskId,
        date: '2026-03-01',
      });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain(`# Working Memory: ${taskId}`);
      expect(content).toContain(`**Agent:** ${agentId}`);
      expect(content).toContain('**Entries:** 1');
    });

    it('omits metadata header when disabled', () => {
      const memory = new Map<string, unknown>([['key1', 'value1']]);
      const result = flushWorkingMemory(memory, {
        rootDir,
        agentId,
        taskId,
        date: '2026-03-01',
        includeMetadata: false,
      });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).not.toContain('# Working Memory:');
    });

    it('formats string values inline', () => {
      const memory = new Map<string, unknown>([['greeting', 'Hello, world!']]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('### greeting');
      expect(content).toContain('**Type:** `string`');
      expect(content).toContain('Hello, world!');
    });

    it('formats number values', () => {
      const memory = new Map<string, unknown>([['count', 42]]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('**Type:** `number`');
      expect(content).toContain('42');
    });

    it('formats boolean values', () => {
      const memory = new Map<string, unknown>([['flag', true]]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('**Type:** `boolean`');
      expect(content).toContain('true');
    });

    it('formats object values in JSON code blocks', () => {
      const memory = new Map<string, unknown>([
        ['config', { host: 'localhost', port: 3000, debug: true }],
      ]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('**Type:** `object`');
      expect(content).toContain('```json');
      expect(content).toContain('"host": "localhost"');
    });

    it('formats array values in JSON code blocks', () => {
      const memory = new Map<string, unknown>([
        ['items', ['apple', 'banana', 'cherry']],
      ]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('**Type:** `array`');
      expect(content).toContain('```json');
    });

    it('formats null and undefined', () => {
      const memory = new Map<string, unknown>([
        ['nothing', null],
        ['missing', undefined],
      ]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('**Type:** `null`');
      expect(content).toContain('**Type:** `undefined`');
    });

    it('formats Date values', () => {
      const memory = new Map<string, unknown>([
        ['timestamp', new Date('2026-03-01T12:00:00Z')],
      ]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('**Type:** `date`');
      expect(content).toContain('2026-03-01T12:00:00.000Z');
    });

    it('handles empty map', () => {
      const memory = new Map<string, unknown>();
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      expect(result.entriesWritten).toBe(0);
      expect(existsSync(result.filePath)).toBe(true);

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('**Entries:** 0');
    });

    it('preserves multiple entries', () => {
      const memory = new Map<string, unknown>([
        ['step1', 'initialized'],
        ['step2', 'processing'],
        ['step3', 'completed'],
      ]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      expect(result.entriesWritten).toBe(3);
      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('### step1');
      expect(content).toContain('### step2');
      expect(content).toContain('### step3');
    });

    it('includes SHA-256 hash for each entry', () => {
      const memory = new Map<string, unknown>([['key', 'value']]);
      const result = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toMatch(/\*\*Hash:\*\* `[a-f0-9]{12}`/);
    });

    it('overwrites existing file', () => {
      const memory1 = new Map<string, unknown>([['key1', 'v1']]);
      const result1 = flushWorkingMemory(memory1, { rootDir, agentId, taskId, date: '2026-03-01' });
      expect(result1.created).toBe(true);

      const memory2 = new Map<string, unknown>([['key2', 'v2']]);
      const result2 = flushWorkingMemory(memory2, { rootDir, agentId, taskId, date: '2026-03-01' });
      expect(result2.created).toBe(false);

      const content = readFileSync(result2.filePath, 'utf-8');
      expect(content).toContain('### key2');
      expect(content).not.toContain('### key1');
    });
  });

  // ─── loadWorkingMemory ───

  describe('loadWorkingMemory', () => {
    it('returns empty result for non-existent file', () => {
      const result = loadWorkingMemory('/non/existent/path.md');
      expect(result.entriesLoaded).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('round-trips string values', () => {
      const memory = new Map<string, unknown>([['greeting', 'Hello, world!']]);
      const flushed = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const loaded = loadWorkingMemory(flushed.filePath);
      expect(loaded.entriesLoaded).toBe(1);
      expect(loaded.entries[0].key).toBe('greeting');
      expect(loaded.entries[0].value).toBe('Hello, world!');
      expect(loaded.entries[0].type).toBe('string');
    });

    it('round-trips object values', () => {
      const memory = new Map<string, unknown>([
        ['config', { host: 'localhost', port: 3000 }],
      ]);
      const flushed = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const loaded = loadWorkingMemory(flushed.filePath);
      expect(loaded.entriesLoaded).toBe(1);
      expect(loaded.entries[0].key).toBe('config');
      expect(loaded.entries[0].type).toBe('object');

      const parsed = JSON.parse(loaded.entries[0].value);
      expect(parsed.host).toBe('localhost');
      expect(parsed.port).toBe(3000);
    });

    it('round-trips multiple entries', () => {
      const memory = new Map<string, unknown>([
        ['step1', 'done'],
        ['step2', 42],
        ['step3', { status: 'ok' }],
      ]);
      const flushed = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const loaded = loadWorkingMemory(flushed.filePath);
      expect(loaded.entriesLoaded).toBe(3);
      expect(loaded.entries.map(e => e.key)).toEqual(['step1', 'step2', 'step3']);
    });

    it('preserves hash values', () => {
      const memory = new Map<string, unknown>([['key', 'value']]);
      const flushed = flushWorkingMemory(memory, { rootDir, agentId, taskId });

      const loaded = loadWorkingMemory(flushed.filePath);
      expect(loaded.entries[0].hash).toMatch(/^[a-f0-9]{12}$/);
    });
  });

  // ─── listWorkingMemoryFiles ───

  describe('listWorkingMemoryFiles', () => {
    it('returns empty array when no files exist', () => {
      const files = listWorkingMemoryFiles(rootDir, agentId);
      expect(files).toHaveLength(0);
    });

    it('returns sorted file paths', () => {
      const memory = new Map<string, unknown>([['k', 'v']]);

      flushWorkingMemory(memory, { rootDir, agentId, taskId: 'task-b', date: '2026-03-02' });
      flushWorkingMemory(memory, { rootDir, agentId, taskId: 'task-a', date: '2026-03-01' });

      const files = listWorkingMemoryFiles(rootDir, agentId);
      expect(files).toHaveLength(2);
      // Should be sorted alphabetically (date order)
      expect(files[0]).toContain('2026-03-01');
      expect(files[1]).toContain('2026-03-02');
    });

    it('only returns .md files', () => {
      const memory = new Map<string, unknown>([['k', 'v']]);
      flushWorkingMemory(memory, { rootDir, agentId, taskId, date: '2026-03-01' });

      const files = listWorkingMemoryFiles(rootDir, agentId);
      expect(files.every(f => f.endsWith('.md'))).toBe(true);
    });
  });
});
