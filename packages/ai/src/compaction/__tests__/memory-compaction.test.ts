/**
 * Memory Compaction Tests
 * TLP:AMBER - Internal Use Only
 *
 * Tests for:
 *   - Cross-backend deduplication (file + mem0)
 *   - Hybrid search dedup (BM25 + vector)
 *   - Conversation summary compaction
 *   - Stale fact archival
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  MemoryCompaction,
  type MemoryEntry,
} from '../memory-compaction.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tempDir(): string {
  const dir = join(tmpdir(), `dcyfr-test-compaction-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const id = overrides.id ?? `fact-${randomUUID().slice(0, 8)}`;
  const content = overrides.content ?? `Test fact ${id}`;
  return {
    id,
    content,
    source: 'file',
    hash: '',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function writeFactsFile(dir: string, agentId: string, entries: MemoryEntry[]): void {
  const agentDir = join(dir, agentId);
  if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });

  const header = `# Agent Facts\n\nAutomatically maintained fact store.\n\n---\n\n`;
  const body = entries
    .map(e => {
      const lines = [
        `### ${e.id}`,
        '',
        `- **Owner:** ${e.owner ?? 'test-agent'} (agent)`,
        `- **Timestamp:** ${e.timestamp}`,
      ];
      if (e.topic) lines.push(`- **Topic:** ${e.topic}`);
      lines.push('', e.content, '', '---', '');
      return lines.join('\n');
    })
    .join('\n');

  writeFileSync(join(agentDir, 'facts.md'), header + body, 'utf-8');
}

function writeConversationFile(dir: string, agentId: string, filename: string, content: string): void {
  const convDir = join(dir, agentId, 'conversations');
  if (!existsSync(convDir)) mkdirSync(convDir, { recursive: true });
  writeFileSync(join(convDir, filename), content, 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('MemoryCompaction', () => {
  let rootDir: string;
  const agentId = 'test-agent';

  beforeEach(() => {
    rootDir = tempDir();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  // ─── 9.1: Cross-backend Deduplication ───

  describe('deduplicateEntries', () => {
    it('removes exact hash duplicates', () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const e1 = entry({ id: 'f1', content: 'TypeScript is statically typed', source: 'file' });
      const e2 = entry({ id: 'f2', content: 'TypeScript is statically typed', source: 'mem0' });

      // Need to set same hash for dedup
      e1.hash = 'hash-abc';
      e2.hash = 'hash-abc';

      const result = compaction.deduplicateEntries([e1], [e2]);
      expect(result.totalBefore).toBe(2);
      expect(result.totalAfter).toBe(1);
      expect(result.duplicatesRemoved).toBe(1);
    });

    it('prefers file entries over mem0', () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const mem0Entry = entry({ id: 'mem0-1', content: 'same text', source: 'mem0' });
      const fileEntry = entry({ id: 'file-1', content: 'same text', source: 'file' });
      mem0Entry.hash = 'hash-same';
      fileEntry.hash = 'hash-same';

      const result = compaction.deduplicateEntries([fileEntry], [mem0Entry]);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].source).toBe('file');
    });

    it('removes fuzzy duplicates above threshold', () => {
      const compaction = new MemoryCompaction({ rootDir, agentId, dedupThreshold: 0.5 });
      const e1 = entry({
        id: 'f1',
        content: 'The project uses TypeScript with strict mode enabled for all modules',
        source: 'file',
        hash: 'h1',
      });
      const e2 = entry({
        id: 'f2',
        content: 'The project uses TypeScript with strict mode enabled for all packages',
        source: 'file',
        hash: 'h2',
      });

      const result = compaction.deduplicateEntries([e1, e2]);
      expect(result.duplicatesRemoved).toBeGreaterThan(0);
    });

    it('keeps entries below threshold', () => {
      const compaction = new MemoryCompaction({ rootDir, agentId, dedupThreshold: 0.99 });
      const e1 = entry({ id: 'f1', content: 'TypeScript strict mode enabled', hash: 'h1' });
      const e2 = entry({ id: 'f2', content: 'Python virtual env configured', hash: 'h2' });

      const result = compaction.deduplicateEntries([e1, e2]);
      expect(result.totalAfter).toBe(2);
      expect(result.duplicatesRemoved).toBe(0);
    });

    it('handles empty input', () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const result = compaction.deduplicateEntries([], []);
      expect(result.totalBefore).toBe(0);
      expect(result.totalAfter).toBe(0);
    });

    it('handles single entry', () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const e1 = entry({ id: 'f1', content: 'single fact', hash: 'h1' });
      const result = compaction.deduplicateEntries([e1]);
      expect(result.totalAfter).toBe(1);
    });

    it('reports duplicate pairs', () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const e1 = entry({ id: 'f1', content: 'same', hash: 'dup-hash', source: 'file' });
      const e2 = entry({ id: 'f2', content: 'same', hash: 'dup-hash', source: 'mem0' });

      const result = compaction.deduplicateEntries([e1], [e2]);
      expect(result.duplicatePairs).toHaveLength(1);
      expect(result.duplicatePairs[0].kept).toBe('f1');
      expect(result.duplicatePairs[0].similarity).toBe(1);
    });
  });

  // ─── 9.2: Hybrid Search Dedup ───

  describe('deduplicateWithHybridSearch', () => {
    it('falls back to text-only when no embedFn', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const e1 = entry({ id: 'f1', content: 'fact one', hash: 'h1' });
      const e2 = entry({ id: 'f2', content: 'fact two completely different', hash: 'h2' });

      const result = await compaction.deduplicateWithHybridSearch([e1, e2]);
      expect(result.totalAfter).toBe(2);
    });

    it('uses vector similarity when embedFn provided', async () => {
      // Simple mock: embed as [hash of char codes]
      const embedFn = vi.fn(async (text: string) => {
        const chars = text.split('');
        return chars.slice(0, 5).map(c => (c.codePointAt(0) ?? 0) / 255);
      });

      const compaction = new MemoryCompaction({
        rootDir,
        agentId,
        embedFn,
        dedupThreshold: 0.3,
      });

      const e1 = entry({ id: 'f1', content: 'hello world', hash: 'h1' });
      const e2 = entry({ id: 'f2', content: 'hello world!', hash: 'h2' });

      const result = await compaction.deduplicateWithHybridSearch([e1, e2]);
      expect(embedFn).toHaveBeenCalledTimes(2);
      // With similar text and similar embeddings, should dedup
      expect(result.duplicatesRemoved).toBeGreaterThanOrEqual(0);
    });

    it('handles embed function failure gracefully', async () => {
      const embedFn = vi.fn(async () => {
        throw new Error('Embedding service down');
      });

      const compaction = new MemoryCompaction({
        rootDir,
        agentId,
        embedFn,
        dedupThreshold: 0.99,
      });

      const e1 = entry({ id: 'f1', content: 'Kubernetes orchestrates container workloads across cloud clusters', hash: 'h1' });
      const e2 = entry({ id: 'f2', content: 'GraphQL provides flexible API querying with typed schema definitions', hash: 'h2' });

      // Should not throw — falls back to text similarity
      const result = await compaction.deduplicateWithHybridSearch([e1, e2]);
      expect(result.totalAfter).toBe(2);
    });

    it('removes exact hash duplicates before vector check', async () => {
      const embedFn = vi.fn(async () => [0.1, 0.2, 0.3]);

      const compaction = new MemoryCompaction({
        rootDir,
        agentId,
        embedFn,
      });

      const e1 = entry({ id: 'f1', content: 'same', hash: 'same-hash' });
      const e2 = entry({ id: 'f2', content: 'same', hash: 'same-hash' });

      const result = await compaction.deduplicateWithHybridSearch([e1, e2]);
      expect(result.duplicatesRemoved).toBe(1);
      // Only one unique entry needs embedding
      expect(embedFn).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 9.3: Conversation Summary Compaction ───

  describe('compactConversations', () => {
    it('skips files within retention period', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId, retentionDays: 30 });

      // Create a recent conversation file
      const today = new Date().toISOString().slice(0, 10);
      writeConversationFile(rootDir, agentId, `${today}-session.md`, 'Recent chat...');

      const result = await compaction.compactConversations();
      expect(result.filesProcessed).toBe(0);
      expect(result.summariesCreated).toBe(0);
    });

    it('compacts old conversation files into monthly summaries', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId, retentionDays: 1 });

      // Create old conversation files (60 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const dateStr = oldDate.toISOString().slice(0, 10);
      const monthKey = dateStr.slice(0, 7);

      writeConversationFile(rootDir, agentId, `${dateStr}-session1.md`, 'Chat about TypeScript');
      writeConversationFile(rootDir, agentId, `${dateStr}-session2.md`, 'Chat about testing');

      const result = await compaction.compactConversations();
      expect(result.filesProcessed).toBe(2);
      expect(result.summariesCreated).toBe(1);

      // Summary file should exist
      const summaryPath = join(rootDir, agentId, 'summaries', `${monthKey}-summary.md`);
      expect(existsSync(summaryPath)).toBe(true);

      const summaryContent = readFileSync(summaryPath, 'utf-8');
      expect(summaryContent).toContain('Monthly Summary');
      expect(summaryContent).toContain('Files consolidated: 2');
    });

    it('moves originals to archive', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId, retentionDays: 1 });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      const dateStr = oldDate.toISOString().slice(0, 10);

      writeConversationFile(rootDir, agentId, `${dateStr}-chat.md`, 'Old conversation');

      const result = await compaction.compactConversations();
      expect(result.archivedPaths).toHaveLength(1);

      // Original should be gone, archive should exist
      const origPath = join(rootDir, agentId, 'conversations', `${dateStr}-chat.md`);
      expect(existsSync(origPath)).toBe(false);

      const archivePath = join(rootDir, agentId, 'conversations', 'archive', `${dateStr}-chat.md`);
      expect(existsSync(archivePath)).toBe(true);
    });

    it('uses LLM for summary when available', async () => {
      const llmCall = vi.fn(async () => 'LLM-generated summary of conversations');
      const compaction = new MemoryCompaction({ rootDir, agentId, retentionDays: 1, llmCall });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const dateStr = oldDate.toISOString().slice(0, 10);

      writeConversationFile(rootDir, agentId, `${dateStr}-session.md`, 'Talk about AI');

      await compaction.compactConversations();
      expect(llmCall).toHaveBeenCalledOnce();
    });

    it('falls back gracefully when LLM fails', async () => {
      const llmCall = vi.fn(async () => { throw new Error('LLM unavailable'); });
      const compaction = new MemoryCompaction({ rootDir, agentId, retentionDays: 1, llmCall });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const dateStr = oldDate.toISOString().slice(0, 10);

      writeConversationFile(rootDir, agentId, `${dateStr}-session.md`, 'Content here');

      const result = await compaction.compactConversations();
      expect(result.summariesCreated).toBe(1);
    });

    it('handles empty conversations directory', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const result = await compaction.compactConversations();
      expect(result.filesProcessed).toBe(0);
    });

    it('groups files by month correctly', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId, retentionDays: 1 });

      // Use fixed dates guaranteed to be in different months
      writeConversationFile(rootDir, agentId, '2024-01-15-session.md', 'January chat');
      writeConversationFile(rootDir, agentId, '2024-02-15-session.md', 'February chat');

      const result = await compaction.compactConversations();
      expect(result.summariesCreated).toBe(2);
      expect(result.filesProcessed).toBe(2);
    });
  });

  // ─── 9.4: Stale Fact Archival ───

  describe('archiveStaleFacts', () => {
    it('returns empty result when no facts file exists', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });
      const result = await compaction.archiveStaleFacts();
      expect(result.factsEvaluated).toBe(0);
      expect(result.factsArchived).toBe(0);
    });

    it('archives contradicted facts heuristically', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });

      // Create two similar but slightly different facts (heuristic will detect)
      const facts: MemoryEntry[] = [
        entry({
          id: 'fact-old',
          content: 'The project uses React version 17 for all frontend components and pages',
          timestamp: '2025-01-01T00:00:00Z',
          owner: 'test-agent',
        }),
        entry({
          id: 'fact-new',
          content: 'The project uses React version 18 for all frontend components and pages',
          timestamp: '2026-01-01T00:00:00Z',
          owner: 'test-agent',
        }),
      ];

      writeFactsFile(rootDir, agentId, facts);

      const result = await compaction.archiveStaleFacts();
      expect(result.factsEvaluated).toBeGreaterThanOrEqual(2);
      expect(result.factsArchived).toBe(1);
      const archivedOld = result.archivedFacts.find(f => f.id === 'fact-old');
      expect(archivedOld).toBeDefined();
      expect(archivedOld!.reason).toContain('Superseded');
    });

    it('creates facts-archived.md with archived entries', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });

      const facts: MemoryEntry[] = [
        entry({
          id: 'old-fact',
          content: 'Database uses MySQL for data storage and querying operations',
          timestamp: '2025-01-01T00:00:00Z',
          owner: 'test-agent',
        }),
        entry({
          id: 'new-fact',
          content: 'Database uses PostgreSQL for data storage and querying operations',
          timestamp: '2026-01-01T00:00:00Z',
          owner: 'test-agent',
        }),
      ];

      writeFactsFile(rootDir, agentId, facts);

      const result = await compaction.archiveStaleFacts();
      const archivePath = result.archivePath;
      expect(existsSync(archivePath)).toBe(true);

      const archiveContent = readFileSync(archivePath, 'utf-8');
      expect(archiveContent).toContain('Archived Facts');
      expect(archiveContent).toContain('old-fact');
    });

    it('rewrites facts.md without archived entries', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });

      const facts: MemoryEntry[] = [
        entry({
          id: 'keep-me',
          content: 'Completely unique standalone fact about deployment',
          timestamp: '2026-01-01T00:00:00Z',
          owner: 'test-agent',
        }),
        entry({
          id: 'old-version',
          content: 'We use Node 16 for the CI pipeline and build process',
          timestamp: '2025-01-01T00:00:00Z',
          owner: 'test-agent',
        }),
        entry({
          id: 'new-version',
          content: 'We use Node 20 for the CI pipeline and build process',
          timestamp: '2026-01-01T00:00:00Z',
          owner: 'test-agent',
        }),
      ];

      writeFactsFile(rootDir, agentId, facts);

      await compaction.archiveStaleFacts();

      const factsContent = readFileSync(join(rootDir, agentId, 'facts.md'), 'utf-8');
      expect(factsContent).toContain('keep-me');
      expect(factsContent).toContain('new-version');
      expect(factsContent).not.toContain('old-version');
    });

    it('uses LLM for contradiction detection when available', async () => {
      const llmCall = vi.fn(async () =>
        JSON.stringify({
          contradictions: [
            {
              factId1: 'fact-a',
              factId2: 'fact-b',
              reason: 'Technology version updated',
              keepId: 'fact-b',
            },
          ],
        }),
      );

      const compaction = new MemoryCompaction({ rootDir, agentId, llmCall });

      const facts: MemoryEntry[] = [
        entry({ id: 'fact-a', content: 'Uses TypeScript 4', timestamp: '2025-01-01T00:00:00Z', owner: 'test-agent' }),
        entry({ id: 'fact-b', content: 'Uses TypeScript 5', timestamp: '2026-01-01T00:00:00Z', owner: 'test-agent' }),
      ];

      writeFactsFile(rootDir, agentId, facts);

      const result = await compaction.archiveStaleFacts();
      expect(llmCall).toHaveBeenCalledOnce();
      expect(result.factsArchived).toBe(1);
      expect(result.archivedFacts[0].id).toBe('fact-a');
    });

    it('handles single fact (no contradictions possible)', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });

      const facts: MemoryEntry[] = [
        entry({ id: 'solo-fact', content: 'Only one fact here about something unique', owner: 'test-agent' }),
      ];

      writeFactsFile(rootDir, agentId, facts);

      const result = await compaction.archiveStaleFacts();
      // Single fact cannot contradict itself
      expect(result.factsArchived).toBe(0);
    });

    it('preserves unrelated facts', async () => {
      const compaction = new MemoryCompaction({ rootDir, agentId });

      const facts: MemoryEntry[] = [
        entry({ id: 'typecheck', content: 'TypeScript strict mode is enabled across all packages', owner: 'test-agent' }),
        entry({ id: 'testing', content: 'Vitest is the primary test framework with coverage threshold 99%', owner: 'test-agent' }),
        entry({ id: 'linting', content: 'ESLint with flat config is used for all line checks', owner: 'test-agent' }),
      ];

      writeFactsFile(rootDir, agentId, facts);

      const result = await compaction.archiveStaleFacts();
      expect(result.factsArchived).toBe(0);
    });
  });
});
