/**
 * @module memory/sqlite-index.test
 * @description Tests for SQLite hybrid search index.
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SQLiteIndex } from '../sqlite-index.js';

describe('SQLiteIndex', () => {
  let testDir: string;
  let dbPath: string;
  let index: SQLiteIndex;

  beforeEach(() => {
    testDir = join(tmpdir(), `dcyfr-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, '.index.db');
    index = new SQLiteIndex({ dbPath });
  });

  afterEach(() => {
    index.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('initialization', () => {
    it('creates database with correct schema', () => {
      expect(existsSync(dbPath)).toBe(true);
      expect(index.isEmpty()).toBe(true);
    });

    it('creates parent directories if needed', () => {
      const deepPath = join(testDir, 'deep', 'nested', 'path', '.index.db');
      const deepIndex = new SQLiteIndex({ dbPath: deepPath });
      expect(existsSync(deepPath)).toBe(true);
      deepIndex.close();
    });
  });

  describe('chunk operations', () => {
    it('adds and retrieves chunks', () => {
      const id = index.addChunk('test.md', 'section-1', 'Hello world');
      expect(id).toBeGreaterThan(0);
      expect(index.getChunkCount()).toBe(1);
      expect(index.getChunkCount('test.md')).toBe(1);
    });

    it('deduplicates identical content', () => {
      const id1 = index.addChunk('test.md', 'section-1', 'Hello world');
      const id2 = index.addChunk('test.md', 'section-1', 'Hello world');
      expect(id1).toBe(id2);
      expect(index.getChunkCount()).toBe(1);
    });

    it('allows same content in different sources', () => {
      const id1 = index.addChunk('file1.md', 'section-1', 'Hello world');
      const id2 = index.addChunk('file2.md', 'section-1', 'Hello world');
      expect(id1).not.toBe(id2);
      expect(index.getChunkCount()).toBe(2);
    });

    it('removes chunks by source', () => {
      index.addChunk('test.md', 'section-1', 'Content 1');
      index.addChunk('test.md', 'section-2', 'Content 2');
      index.addChunk('other.md', 'section-1', 'Other content');

      expect(index.getChunkCount()).toBe(3);

      index.removeSource('test.md');

      expect(index.getChunkCount()).toBe(1);
      expect(index.getChunkCount('test.md')).toBe(0);
      expect(index.getChunkCount('other.md')).toBe(1);
    });
  });

  describe('BM25 search', () => {
    beforeEach(() => {
      index.addChunk('docs.md', 'intro', 'TypeScript is a typed superset of JavaScript');
      index.addChunk('docs.md', 'features', 'TypeScript adds optional static typing');
      index.addChunk('docs.md', 'benefits', 'Better tooling and editor support');
      index.addChunk('docs.md', 'getting-started', 'Install TypeScript with npm');
    });

    it('finds relevant results by keyword', () => {
      const results = index.searchBM25('TypeScript', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('TypeScript');
    });

    it('ranks results by relevance', () => {
      const results = index.searchBM25('TypeScript typing', 10);
      // The chunk mentioning both should rank higher
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('typing');
    });

    it('returns empty array for no matches', () => {
      const results = index.searchBM25('Python Django Flask', 10);
      expect(results).toEqual([]);
    });

    it('respects limit parameter', () => {
      const results = index.searchBM25('TypeScript', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('vector search', () => {
    it('stores and retrieves embeddings', () => {
      const id = index.addChunk('test.md', 'section-1', 'Test content');
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      index.addEmbedding(id, embedding);

      // Searching with the same embedding should return the chunk
      const results = index.searchVector(embedding, 10);
      expect(results.length).toBe(1);
      expect(results[0].chunkId).toBe(id);
      expect(results[0].score).toBeCloseTo(1, 5); // Identical vector = score ≈ 1
    });

    it('ranks by cosine similarity', () => {
      const id1 = index.addChunk('test.md', 'section-1', 'Content A');
      const id2 = index.addChunk('test.md', 'section-2', 'Content B');

      index.addEmbedding(id1, [1, 0, 0]);
      index.addEmbedding(id2, [0, 1, 0]);

      // Query closer to id1
      const results = index.searchVector([0.9, 0.1, 0], 10);
      expect(results[0].chunkId).toBe(id1);
    });

    it('returns empty array when no embeddings exist', () => {
      index.addChunk('test.md', 'section-1', 'Content without embedding');
      const results = index.searchVector([0.1, 0.2, 0.3], 10);
      expect(results).toEqual([]);
    });
  });

  describe('hybrid search', () => {
    beforeEach(() => {
      const id1 = index.addChunk('docs.md', 'intro', 'Machine learning models');
      const id2 = index.addChunk('docs.md', 'features', 'Deep learning neural networks');
      const id3 = index.addChunk('docs.md', 'benefits', 'AI improves productivity');

      // Similar embeddings for ML content
      index.addEmbedding(id1, [0.8, 0.2, 0.1]);
      index.addEmbedding(id2, [0.7, 0.3, 0.1]);
      index.addEmbedding(id3, [0.3, 0.1, 0.9]);
    });

    it('combines BM25 and vector results via RRF', () => {
      const results = index.searchHybrid('machine learning', [0.75, 0.25, 0.1], 10);
      expect(results.length).toBeGreaterThan(0);
      // The chunk mentioning "machine learning" with similar embedding should rank first
      expect(results[0].content).toContain('Machine learning');
    });

    it('falls back to BM25-only when no embedding provided', () => {
      const results = index.searchHybrid('learning', undefined, 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects relevance threshold', () => {
      // Create index with high threshold
      const strictIndex = new SQLiteIndex({ dbPath, threshold: 0.99 });
      strictIndex.addChunk('test.md', 'section-1', 'Exact match content');

      const results = strictIndex.searchHybrid('completely unrelated query', undefined, 10);
      // High threshold should filter out low-relevance results
      expect(results.length).toBe(0);
      strictIndex.close();
    });
  });

  describe('incremental indexing', () => {
    it('reports hashes for deduplication checks', () => {
      index.addChunk('test.md', 'section-1', 'Content A');
      index.addChunk('test.md', 'section-2', 'Content B');

      const hashes = index.getHashes('test.md');
      expect(hashes.size).toBe(2);
    });

    it('allows checking if content already exists', () => {
      const content = 'Unique content for hash check';
      index.addChunk('test.md', 'section-1', content);

      // Adding same content returns same ID (dedup works)
      const id1 = index.addChunk('test.md', 'section-1', content);
      const id2 = index.addChunk('test.md', 'section-1', content);
      expect(id1).toBe(id2);
    });
  });
});
