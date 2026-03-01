/**
 * @module memory/sqlite-index
 * @description SQLite-based hybrid search index for file-first memory.
 * Uses FTS5 for BM25 full-text search and a vectors table for cosine similarity.
 * Results are fused via Reciprocal Rank Fusion (RRF).
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChunkRecord {
  id: number;
  source: string;
  section: string;
  content: string;
  hashSha256: string;
  createdAt: string;
}

export interface SearchResult {
  chunkId: number;
  source: string;
  section: string;
  content: string;
  score: number;
  createdAt: string;
}

export interface SQLiteIndexConfig {
  /** Absolute path to the .index.db file */
  dbPath: string;
  /** Minimum relevance threshold for search results (0-1). Default: 0.7 */
  threshold?: number;
  /** RRF constant k. Default: 60 */
  rrfK?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Cosine similarity between two Float64 vectors stored as Buffers.
 * Returns value in [0, 1] (clamped).
 */
function cosineSimilarity(a: Buffer, b: Buffer): number {
  const vecA = new Float64Array(a.buffer, a.byteOffset, a.byteLength / 8);
  const vecB = new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8);
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return Math.max(0, Math.min(1, dot / denom));
}

/* ------------------------------------------------------------------ */
/*  SQLiteIndex                                                        */
/* ------------------------------------------------------------------ */

export class SQLiteIndex {
  private readonly db: Database.Database;
  private readonly threshold: number;
  private readonly rrfK: number;

  constructor(config: SQLiteIndexConfig) {
    this.threshold = config.threshold ?? 0.7;
    this.rrfK = config.rrfK ?? 60;

    // Ensure parent directory exists
    const dir = dirname(config.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(config.dbPath);

    // Enable WAL mode for concurrent reads + single writer
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this._createSchema();
  }

  /* ---- Schema ---------------------------------------------------- */

  private _createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        source      TEXT    NOT NULL,
        section     TEXT    NOT NULL DEFAULT '',
        content     TEXT    NOT NULL,
        hash_sha256 TEXT    NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
      CREATE INDEX IF NOT EXISTS idx_chunks_hash   ON chunks(hash_sha256);

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        content_rowid='id'
      );

      CREATE TABLE IF NOT EXISTS vectors (
        chunk_id  INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        embedding BLOB    NOT NULL
      );
    `);
  }

  /* ---- Write operations ------------------------------------------ */

  /**
   * Insert a chunk. Returns the chunk ID.
   * If a chunk with the same hash already exists for the same source, it is skipped (dedup).
   */
  addChunk(source: string, section: string, content: string): number {
    const hash = sha256(content);

    // Dedup: skip if identical hash for same source
    const existing = this.db
      .prepare('SELECT id FROM chunks WHERE source = ? AND hash_sha256 = ?')
      .get(source, hash) as { id: number } | undefined;

    if (existing) return existing.id;

    const insertChunk = this.db.prepare(
      'INSERT INTO chunks (source, section, content, hash_sha256) VALUES (?, ?, ?, ?)',
    );
    const insertFts = this.db.prepare(
      'INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)',
    );

    const txn = this.db.transaction(() => {
      const info = insertChunk.run(source, section, content, hash);
      const chunkId = Number(info.lastInsertRowid);
      insertFts.run(chunkId, content);
      return chunkId;
    });

    return txn();
  }

  /**
   * Store a vector embedding for a chunk.
   * Embedding is a Float64Array stored as raw bytes in a BLOB.
   */
  addEmbedding(chunkId: number, embedding: number[]): void {
    const buffer = Buffer.from(new Float64Array(embedding).buffer);
    this.db
      .prepare(
        'INSERT OR REPLACE INTO vectors (chunk_id, embedding) VALUES (?, ?)',
      )
      .run(chunkId, buffer);
  }

  /**
   * Remove all chunks (and their FTS/vector entries) for a given source file.
   */
  removeSource(source: string): void {
    const ids = this.db
      .prepare('SELECT id FROM chunks WHERE source = ?')
      .all(source) as { id: number }[];

    if (ids.length === 0) return;

    const txn = this.db.transaction(() => {
      for (const { id } of ids) {
        this.db.prepare('DELETE FROM chunks_fts WHERE rowid = ?').run(id);
        this.db.prepare('DELETE FROM vectors WHERE chunk_id = ?').run(id);
      }
      this.db.prepare('DELETE FROM chunks WHERE source = ?').run(source);
    });

    txn();
  }

  /**
   * Get all SHA-256 hashes for a given source. Useful for incremental indexing.
   */
  getHashes(source: string): Map<string, number> {
    const rows = this.db
      .prepare('SELECT id, hash_sha256 FROM chunks WHERE source = ?')
      .all(source) as { id: number; hash_sha256: string }[];

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.hash_sha256, row.id);
    }
    return map;
  }

  /* ---- Search operations ----------------------------------------- */

  /**
   * BM25 full-text search via FTS5.
   * Returns chunks ranked by BM25 score (lower rank = better match).
   */
  searchBM25(query: string, limit = 20): SearchResult[] {
    // FTS5 rank is negative (more negative = better). We negate it for a positive score.
    const rows = this.db
      .prepare(
        `SELECT c.id, c.source, c.section, c.content, c.created_at AS createdAt,
                -rank AS bm25_score
         FROM chunks_fts fts
         JOIN chunks c ON c.id = fts.rowid
         WHERE chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit) as (ChunkRecord & { bm25_score: number })[];

    // Normalize BM25 scores to [0, 1]
    if (rows.length === 0) return [];
    const maxScore = Math.max(...rows.map((r) => r.bm25_score));
    const minScore = Math.min(...rows.map((r) => r.bm25_score));
    const range = maxScore - minScore;

    return rows.map((r) => ({
      chunkId: r.id,
      source: r.source,
      section: r.section,
      content: r.content,
      // When all scores are equal, assign 1 (best possible)
      score: range === 0 ? 1 : (r.bm25_score - minScore) / range,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Vector similarity search via cosine similarity.
   * Requires query embedding. Brute-force scan over vectors table.
   */
  searchVector(queryEmbedding: number[], limit = 20): SearchResult[] {
    const queryBuf = Buffer.from(new Float64Array(queryEmbedding).buffer);

    const rows = this.db
      .prepare(
        `SELECT c.id, c.source, c.section, c.content, c.created_at AS createdAt, v.embedding
         FROM vectors v
         JOIN chunks c ON c.id = v.chunk_id`,
      )
      .all() as (ChunkRecord & { embedding: Buffer })[];

    const scored = rows
      .map((r) => ({
        chunkId: r.id,
        source: r.source,
        section: r.section,
        content: r.content,
        score: cosineSimilarity(queryBuf, r.embedding),
        createdAt: r.createdAt,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  /**
   * Hybrid search: combines BM25 and vector results via Reciprocal Rank Fusion.
   *
   * RRF score = 1/(k + rank_bm25) + 1/(k + rank_vector)
   *
   * If no query embedding is provided, falls back to BM25-only.
   */
  searchHybrid(
    query: string,
    queryEmbedding?: number[],
    limit = 10,
  ): SearchResult[] {
    const bm25Results = this.searchBM25(query, 50);

    // BM25-only fallback when no embeddings available
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return bm25Results
        .filter((r) => r.score >= this.threshold)
        .slice(0, limit);
    }

    const vectorResults = this.searchVector(queryEmbedding, 50);

    // Build rank maps (1-indexed)
    const bm25Ranks = new Map<number, number>();
    bm25Results.forEach((r, i) => bm25Ranks.set(r.chunkId, i + 1));

    const vectorRanks = new Map<number, number>();
    vectorResults.forEach((r, i) => vectorRanks.set(r.chunkId, i + 1));

    // Collect all unique chunk IDs
    const allChunkIds = new Set([...bm25Ranks.keys(), ...vectorRanks.keys()]);

    // Build a content lookup
    const contentMap = new Map<number, SearchResult>();
    for (const r of [...bm25Results, ...vectorResults]) {
      if (!contentMap.has(r.chunkId)) {
        contentMap.set(r.chunkId, r);
      }
    }

    // Calculate RRF scores
    const k = this.rrfK;
    const fallbackRank = 1000; // penalty for items appearing in only one result set

    const fused: SearchResult[] = [];
    for (const chunkId of allChunkIds) {
      const bm25Rank = bm25Ranks.get(chunkId) ?? fallbackRank;
      const vectorRank = vectorRanks.get(chunkId) ?? fallbackRank;
      const rrfScore = 1 / (k + bm25Rank) + 1 / (k + vectorRank);

      const original = contentMap.get(chunkId)!;
      fused.push({ ...original, score: rrfScore });
    }

    // Normalize RRF scores to [0, 1]
    const maxRRF = Math.max(...fused.map((r) => r.score));
    const minRRF = Math.min(...fused.map((r) => r.score));
    const rrfRange = maxRRF - minRRF;
    for (const r of fused) {
      // When all scores are equal, assign 1 (best possible)
      r.score = rrfRange === 0 ? 1 : (r.score - minRRF) / rrfRange;
    }

    return fused
      .filter((r) => r.score >= this.threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /* ---- Lifecycle ------------------------------------------------- */

  /**
   * Check if the database has any chunks.
   */
  isEmpty(): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM chunks')
      .get() as { count: number };
    return row.count === 0;
  }

  /**
   * Get chunk count for a specific source.
   */
  getChunkCount(source?: string): number {
    if (source) {
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE source = ?')
        .get(source) as { count: number };
      return row.count;
    }
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM chunks')
      .get() as { count: number };
    return row.count;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
