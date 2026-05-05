/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @module memory/file-memory-adapter
 * @description File-first memory adapter that persists memories as human-readable
 * Markdown files with a SQLite hybrid-search index. Implements the DCYFRMemory
 * interface for drop-in compatibility with the existing memory system.
 *
 * Directory layout (per agent):
 *   ~/.dcyfr/memory/{agent-id}/
 *   ├── facts.md              — learned facts, user preferences
 *   ├── conversations/        — summarized conversation history
 *   │   └── {date}-{session}.md
 *   ├── tasks.md              — active/completed task state
 *   └── .index.db             — SQLite: FTS5 + vector embeddings
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  watch,
  type FSWatcher,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

import { atomicWriteFile, safeCreateFile } from '../utils/safe-fs.js';

import type {
  DCYFRMemory,
  Memory,
  MemoryContext,
  MemorySearchResult,
} from './types.js';
import { SQLiteIndex } from './sqlite-index.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FileMemoryAdapterConfig {
  /** Agent identifier — used as the memory namespace. */
  agentId: string;

  /** Root directory for memory files. Default: `~/.dcyfr/memory` */
  rootDir?: string;

  /** Minimum relevance threshold for search results (0-1). Default: 0.7 */
  searchThreshold?: number;

  /** Max search results. Default: 10 */
  searchLimit?: number;

  /**
   * Optional embedding function for vector search.
   * When not provided, falls back to BM25-only search.
   */
  embedFn?: (text: string) => Promise<number[]>;

  /**
   * Optional mem0-backed DCYFRMemory instance for coexist/sync mode.
   * When provided, writes are synced to mem0 asynchronously.
   */
  syncTarget?: DCYFRMemory;

  /** File watcher debounce delay in ms. Default: 1500 */
  watchDebounceMs?: number;
}

export type OwnerType = 'user' | 'agent' | 'session';

interface MarkdownEntry {
  id: string;
  content: string;
  owner: string;
  ownerType: OwnerType;
  timestamp: string;
  topic?: string;
  importance?: number;
  metadata?: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatEntry(entry: MarkdownEntry): string {
  const lines: string[] = [
    `### ${entry.id}`,
    '',
    `- **Owner:** ${entry.owner} (${entry.ownerType})`,
    `- **Timestamp:** ${entry.timestamp}`,
  ];
  if (entry.topic) lines.push(`- **Topic:** ${entry.topic}`);
  if (entry.importance !== undefined)
    lines.push(`- **Importance:** ${entry.importance}`);
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    lines.push(`- **Metadata:** ${JSON.stringify(entry.metadata)}`);
  }
  lines.push('', entry.content, '', '---', '');
  return lines.join('\n');
}

function parseMetadataLine(
  line: string,
): {
  owner?: string;
  ownerType?: OwnerType;
  timestamp?: string;
  topic?: string;
  importance?: number;
  metadata?: Record<string, any>;
} | null {
  const ownerRe = /^- \*\*Owner:\*\* (.+?) \((user|agent|session)\)/;
  const ownerMatch = ownerRe.exec(line);
  if (ownerMatch) {
    return { owner: ownerMatch[1], ownerType: ownerMatch[2] as OwnerType };
  }

  const tsRe = /^- \*\*Timestamp:\*\* (.+)/;
  const tsMatch = tsRe.exec(line);
  if (tsMatch) return { timestamp: tsMatch[1] };

  const topicRe = /^- \*\*Topic:\*\* (.+)/;
  const topicMatch = topicRe.exec(line);
  if (topicMatch) return { topic: topicMatch[1] };

  const impRe = /^- \*\*Importance:\*\* (.+)/;
  const impMatch = impRe.exec(line);
  if (impMatch) return { importance: Number.parseFloat(impMatch[1]) };

  const metaRe = /^- \*\*Metadata:\*\* (.+)/;
  const metaMatch = metaRe.exec(line);
  if (metaMatch) {
    try {
      return { metadata: JSON.parse(metaMatch[1]) };
    } catch {
      return null;
    }
  }

  return null;
}

function applyParsedMetadata(
  target: {
    owner: string;
    ownerType: OwnerType;
    timestamp: string;
    topic?: string;
    importance?: number;
    metadata?: Record<string, any>;
  },
  parsed: NonNullable<ReturnType<typeof parseMetadataLine>>,
): void {
  if (parsed.owner !== undefined) target.owner = parsed.owner;
  if (parsed.ownerType !== undefined) target.ownerType = parsed.ownerType;
  if (parsed.timestamp !== undefined) target.timestamp = parsed.timestamp;
  if (parsed.topic !== undefined) target.topic = parsed.topic;
  if (parsed.importance !== undefined) target.importance = parsed.importance;
  if (parsed.metadata !== undefined) target.metadata = parsed.metadata;
}

function extractContentLines(lines: string[], startIndex: number): string[] {
  const contentLines: string[] = [];
  let pastMeta = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') break;

    if (!pastMeta && line.trim() === '') continue;
    pastMeta = true;
    contentLines.push(line);
  }

  return contentLines;
}

function parseSingleSection(section: string): MarkdownEntry | null {
  const lines = section.split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;

  const meta = {
    owner: '',
    ownerType: 'user' as OwnerType,
    timestamp: '',
    topic: undefined as string | undefined,
    importance: undefined as number | undefined,
    metadata: undefined as Record<string, any> | undefined,
  };

  // Parse metadata lines and find where content starts
  // Skip empty lines and track last metadata line position
  let contentStartIndex = 1;
  let foundMetadata = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') break;

    // Skip empty lines in the metadata section
    if (line.trim() === '') {
      if (foundMetadata) {
        // Empty line after metadata marks start of content
        contentStartIndex = i + 1;
        break;
      }
      continue;
    }

    const parsed = parseMetadataLine(line);
    if (parsed) {
      applyParsedMetadata(meta, parsed);
      contentStartIndex = i + 1;
      foundMetadata = true;
    } else if (foundMetadata) {
      // Non-metadata line after metadata marks start of content
      contentStartIndex = i;
      break;
    }
  }

  const contentLines = extractContentLines(lines, contentStartIndex);

  return {
    id,
    content: contentLines.join('\n').trim(),
    ...meta,
  };
}

function parseEntries(markdown: string): MarkdownEntry[] {
  const sections = markdown.split(/^### /m).filter((s) => s.trim());
  const entries: MarkdownEntry[] = [];

  for (const section of sections) {
    const entry = parseSingleSection(section);
    if (entry) entries.push(entry);
  }

  return entries;
}

function entryToMemory(entry: MarkdownEntry): Memory {
  return {
    id: entry.id,
    content: entry.content,
    owner: entry.owner,
    ownerType: entry.ownerType,
    createdAt: new Date(entry.timestamp),
    topic: entry.topic,
    importance: entry.importance,
    metadata: entry.metadata,
  };
}

/* ------------------------------------------------------------------ */
/*  FileMemoryAdapter                                                  */
/* ------------------------------------------------------------------ */

export class FileMemoryAdapter implements DCYFRMemory {
  private readonly agentId: string;
  private readonly memoryDir: string;
  private readonly factsPath: string;
  private readonly tasksPath: string;
  private readonly conversationsDir: string;
  private readonly index: SQLiteIndex;
  private readonly embedFn?: (text: string) => Promise<number[]>;
  private readonly syncTarget?: DCYFRMemory;
  private readonly searchThreshold: number;
  private readonly searchLimit: number;
  private readonly watchDebounceMs: number;

  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: FileMemoryAdapterConfig) {
    this.agentId = config.agentId;
    this.searchThreshold = config.searchThreshold ?? 0.7;
    this.searchLimit = config.searchLimit ?? 10;
    this.embedFn = config.embedFn;
    this.syncTarget = config.syncTarget;
    this.watchDebounceMs = config.watchDebounceMs ?? 1500;

    const rootDir = config.rootDir ?? join(homedir(), '.dcyfr', 'memory');
    this.memoryDir = resolve(rootDir, this.agentId);
    this.factsPath = join(this.memoryDir, 'facts.md');
    this.tasksPath = join(this.memoryDir, 'tasks.md');
    this.conversationsDir = join(this.memoryDir, 'conversations');

    this._ensureDirectoryStructure();

    this.index = new SQLiteIndex({
      dbPath: join(this.memoryDir, '.index.db'),
      threshold: this.searchThreshold,
    });

    // Initial indexing of existing files
    this._indexFile(this.factsPath);
    this._indexFile(this.tasksPath);
  }

  /* ---- Directory setup ------------------------------------------- */

  private _ensureDirectoryStructure(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
    if (!existsSync(this.conversationsDir)) {
      mkdirSync(this.conversationsDir, { recursive: true });
    }
    // Atomic create-if-not-exists via flag:'wx'; mode 0o600 restricts to owner.
    // Closes CodeQL js/insecure-temporary-file + js/file-system-race (TOCTOU).
    safeCreateFile(
      this.factsPath,
      '# Facts\n\nLearned facts, user preferences, and domain knowledge.\n\n---\n\n',
    );
    safeCreateFile(
      this.tasksPath,
      '# Tasks\n\nActive and completed task state.\n\n---\n\n',
    );
  }

  /* ---- Indexing -------------------------------------------------- */

  private _indexFile(filePath: string): void {
    if (!existsSync(filePath)) return;

    const content = readFileSync(filePath, 'utf8');
    const entries = parseEntries(content);

    for (const entry of entries) {
      // addChunk handles SHA-256 dedup — skips if identical content exists
      const chunkId = this.index.addChunk(filePath, entry.id, entry.content);

      // Generate embedding if embedFn is available
      if (this.embedFn) {
        this.embedFn(entry.content)
          .then((embedding) => {
            this.index.addEmbedding(chunkId, embedding);
          })
          .catch(() => {
            /* embedding generation failure is non-fatal */
          });
      }
    }
  }

  /* ---- File watching --------------------------------------------- */

  /**
   * Start watching the memory directory for changes.
   * Changes are debounced and trigger re-indexing.
   */
  startWatching(): void {
    if (this.watcher) return;

    this.watcher = watch(
      this.memoryDir,
      { recursive: true },
      (_event, filename) => {
        if (!filename?.endsWith('.md')) return;

        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          const fullPath = join(this.memoryDir, filename);
          this.index.removeSource(fullPath);
          this._indexFile(fullPath);
        }, this.watchDebounceMs);
      },
    );
  }

  /**
   * Stop watching the memory directory.
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /* ---- DCYFRMemory: User memories -------------------------------- */

  async addUserMemory(
    userId: string,
    message: string,
    context?: MemoryContext,
  ): Promise<string> {
    const entry: MarkdownEntry = {
      id: randomUUID(),
      content: message,
      owner: userId,
      ownerType: 'user',
      timestamp: new Date().toISOString(),
      topic: context?.topic,
      importance: context?.importance,
      metadata: context?.metadata,
    };

    appendFileSync(this.factsPath, formatEntry(entry), 'utf8');

    const chunkId = this.index.addChunk(this.factsPath, entry.id, message);
    if (this.embedFn) {
      const embedding = await this.embedFn(message);
      this.index.addEmbedding(chunkId, embedding);
    }

    // Async sync to mem0 if configured
    if (this.syncTarget) {
      this.syncTarget.addUserMemory(userId, message, context).catch(() => {
        /* sync failure is non-fatal */
      });
    }

    return entry.id;
  }

  async searchUserMemories(
    userId: string,
    query: string,
    limit?: number,
  ): Promise<MemorySearchResult[]> {
    const maxResults = limit ?? this.searchLimit;
    let queryEmbedding: number[] | undefined;
    if (this.embedFn) {
      queryEmbedding = await this.embedFn(query);
    }

    const results = this.index.searchHybrid(query, queryEmbedding, maxResults * 2);

    // Filter to user-owned entries and convert to MemorySearchResult
    const allEntries = this._loadAllEntries();
    const userEntries = new Map<string, MarkdownEntry>();
    for (const entry of allEntries) {
      if (entry.owner === userId) {
        userEntries.set(entry.id, entry);
      }
    }

    const searchResults: MemorySearchResult[] = [];
    for (const result of results) {
      // Match result.section to entry ID
      const entry = userEntries.get(result.section);
      if (entry) {
        searchResults.push({
          ...entryToMemory(entry),
          relevance: result.score,
        });
      }
    }

    return searchResults.slice(0, maxResults);
  }

  async getUserMemories(userId: string, topic?: string): Promise<Memory[]> {
    const allEntries = this._loadAllEntries();
    return allEntries
      .filter(
        (e) =>
          e.owner === userId &&
          e.ownerType === 'user' &&
          (!topic || e.topic === topic),
      )
      .map(entryToMemory);
  }

  /* ---- DCYFRMemory: Agent memories ------------------------------- */

  async addAgentMemory(
    agentId: string,
    sessionId: string,
    state: Record<string, any>,
  ): Promise<string> {
    const content = JSON.stringify(state, null, 2);
    const entry: MarkdownEntry = {
      id: randomUUID(),
      content: `Session: ${sessionId}\n\n\`\`\`json\n${content}\n\`\`\``,
      owner: agentId,
      ownerType: 'agent',
      timestamp: new Date().toISOString(),
      metadata: { sessionId },
    };

    appendFileSync(this.tasksPath, formatEntry(entry), 'utf8');

    const chunkId = this.index.addChunk(
      this.tasksPath,
      entry.id,
      entry.content,
    );
    if (this.embedFn) {
      const embedding = await this.embedFn(entry.content);
      this.index.addEmbedding(chunkId, embedding);
    }

    if (this.syncTarget) {
      this.syncTarget.addAgentMemory(agentId, sessionId, state).catch(() => {});
    }

    return entry.id;
  }

  async searchAgentMemories(
    agentId: string,
    query: string,
    limit?: number,
  ): Promise<MemorySearchResult[]> {
    const maxResults = limit ?? this.searchLimit;
    let queryEmbedding: number[] | undefined;
    if (this.embedFn) {
      queryEmbedding = await this.embedFn(query);
    }

    const results = this.index.searchHybrid(query, queryEmbedding, maxResults * 2);
    const allEntries = this._loadAllEntries();
    const agentEntries = new Map<string, MarkdownEntry>();
    for (const entry of allEntries) {
      if (entry.owner === agentId && entry.ownerType === 'agent') {
        agentEntries.set(entry.id, entry);
      }
    }

    const searchResults: MemorySearchResult[] = [];
    for (const result of results) {
      const entry = agentEntries.get(result.section);
      if (entry) {
        searchResults.push({
          ...entryToMemory(entry),
          relevance: result.score,
        });
      }
    }

    return searchResults.slice(0, maxResults);
  }

  async getAgentState(
    agentId: string,
    sessionId: string,
  ): Promise<Record<string, any> | null> {
    const allEntries = this._loadAllEntries();
    const agentEntry = allEntries.find(
      (e) =>
        e.owner === agentId &&
        e.ownerType === 'agent' &&
        e.metadata?.sessionId === sessionId,
    );

    if (!agentEntry) return null;

    // Extract JSON from code block
    const jsonRe = /```json\n([\s\S]*?)\n```/;
    const jsonMatch = jsonRe.exec(agentEntry.content);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        return null;
      }
    }

    return null;
  }

  /* ---- DCYFRMemory: Session memories ----------------------------- */

  async addSessionMemory(
    sessionId: string,
    message: string,
    _ttl?: number,
  ): Promise<string> {
    const convPath = join(
      this.conversationsDir,
      `${new Date().toISOString().split('T')[0]}-${sessionId}.md`,
    );

    safeCreateFile(
      convPath,
      `# Session ${sessionId}\n\n**Started:** ${new Date().toISOString()}\n\n---\n\n`,
    );

    const entry: MarkdownEntry = {
      id: randomUUID(),
      content: message,
      owner: sessionId,
      ownerType: 'session',
      timestamp: new Date().toISOString(),
    };

    appendFileSync(convPath, formatEntry(entry), 'utf8');

    const chunkId = this.index.addChunk(convPath, entry.id, message);
    if (this.embedFn) {
      const embedding = await this.embedFn(message);
      this.index.addEmbedding(chunkId, embedding);
    }

    if (this.syncTarget) {
      this.syncTarget.addSessionMemory(sessionId, message, _ttl).catch(() => {});
    }

    return entry.id;
  }

  async getSessionContext(sessionId: string): Promise<string> {
    const allEntries = this._loadAllEntries();
    const sessionEntries = allEntries.filter(
      (e) => e.owner === sessionId && e.ownerType === 'session',
    );

    return sessionEntries.map((e) => e.content).join('\n\n');
  }

  /* ---- DCYFRMemory: Delete operations ---------------------------- */

  async deleteUserMemories(userId: string): Promise<void> {
    this._removeEntriesFromFile(this.factsPath, (e) => e.owner === userId);
    this.index.removeSource(this.factsPath);
    this._indexFile(this.factsPath);

    if (this.syncTarget) {
      this.syncTarget.deleteUserMemories(userId).catch(() => {});
    }
  }

  async deleteSessionMemories(sessionId: string): Promise<void> {
    const convPath = join(
      this.conversationsDir,
      `${new Date().toISOString().split('T')[0]}-${sessionId}.md`,
    );

    if (existsSync(convPath)) {
      this.index.removeSource(convPath);
      // Atomic rewrite — closes CodeQL js/insecure-temporary-file.
      atomicWriteFile(
        convPath,
        `# Session ${sessionId}\n\n**Cleared:** ${new Date().toISOString()}\n\n---\n\n`,
      );
    }

    if (this.syncTarget) {
      this.syncTarget.deleteSessionMemories(sessionId).catch(() => {});
    }
  }

  /* ---- Extended search API --------------------------------------- */

  /**
   * Search all memories (across all owners) using hybrid search.
   * Returns results with source file and section attribution.
   */
  async search(
    query: string,
    options?: { threshold?: number; limit?: number },
  ): Promise<
    Array<{
      source: string;
      section: string;
      content: string;
      score: number;
      timestamp: string;
    }>
  > {
    const threshold = options?.threshold ?? this.searchThreshold;
    const limit = options?.limit ?? this.searchLimit;

    let queryEmbedding: number[] | undefined;
    if (this.embedFn) {
      queryEmbedding = await this.embedFn(query);
    }

    // Temporarily override threshold
    const results = this.index.searchHybrid(query, queryEmbedding, limit);
    return results
      .filter((r) => r.score >= threshold)
      .map((r) => ({
        source: r.source,
        section: r.section,
        content: r.content,
        score: r.score,
        timestamp: r.createdAt,
      }));
  }

  /* ---- Lifecycle ------------------------------------------------- */

  /**
   * Get the directory path for this adapter's memory files.
   */
  getMemoryDir(): string {
    return this.memoryDir;
  }

  /**
   * Close the adapter and release resources.
   */
  close(): void {
    this.stopWatching();
    this.index.close();
  }

  /* ---- Private helpers ------------------------------------------- */

  private _loadAllEntries(): MarkdownEntry[] {
    const entries: MarkdownEntry[] = [];

    if (existsSync(this.factsPath)) {
      entries.push(...parseEntries(readFileSync(this.factsPath, 'utf8')));
    }
    if (existsSync(this.tasksPath)) {
      entries.push(...parseEntries(readFileSync(this.tasksPath, 'utf8')));
    }

    // Load conversation files
    if (existsSync(this.conversationsDir)) {
      const files = readdirSync(this.conversationsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const fullPath = join(this.conversationsDir, file);
          entries.push(...parseEntries(readFileSync(fullPath, 'utf8')));
        }
      }
    }

    return entries;
  }

  private _removeEntriesFromFile(
    filePath: string,
    predicate: (entry: MarkdownEntry) => boolean,
  ): void {
    if (!existsSync(filePath)) return;

    const content = readFileSync(filePath, 'utf8');
    const entries = parseEntries(content);
    const remaining = entries.filter((e) => !predicate(e));

    // Extract header (everything before the first ### entry)
    const headerRe = /^([\s\S]*?)(?=### )/;
    const headerMatch = headerRe.exec(content);
    const header = headerMatch ? headerMatch[1] : '';

    const newContent = header + remaining.map(formatEntry).join('');
    // Atomic rewrite — closes CodeQL js/insecure-temporary-file.
    atomicWriteFile(filePath, newContent);
  }
}
