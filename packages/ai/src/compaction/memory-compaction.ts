/**
 * @module compaction/memory-compaction
 * @description Memory compaction utilities for FileMemoryAdapter.
 *
 * Extends context compaction to:
 * 1. Deduplicate entries across file-based and mem0 backends
 * 2. Use hybrid search (BM25 + vector) for dedup when SQLite index available
 * 3. Consolidate conversation files >N days old into monthly summaries
 * 4. Archive contradicted/stale facts instead of deleting
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MemoryEntry {
  /** Unique ID */
  id: string;
  /** Memory content */
  content: string;
  /** Source backend: 'file' or 'mem0' */
  source: 'file' | 'mem0';
  /** SHA-256 of content */
  hash: string;
  /** Timestamp */
  timestamp: string;
  /** Topic/category */
  topic?: string;
  /** Owner (userId or agentId) */
  owner?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface DeduplicationResult {
  /** Total entries before dedup */
  totalBefore: number;
  /** Total entries after dedup */
  totalAfter: number;
  /** Number of duplicates removed */
  duplicatesRemoved: number;
  /** Entries kept (deduplicated) */
  entries: MemoryEntry[];
  /** Duplicate pairs found */
  duplicatePairs: Array<{ kept: string; removed: string; similarity: number }>;
}

export interface ConversationSummaryResult {
  /** Number of conversation files processed */
  filesProcessed: number;
  /** Number of monthly summaries created */
  summariesCreated: number;
  /** Paths of created summary files */
  summaryPaths: string[];
  /** Paths of archived conversation files */
  archivedPaths: string[];
}

export interface FactArchivalResult {
  /** Number of facts evaluated */
  factsEvaluated: number;
  /** Number of stale facts archived */
  factsArchived: number;
  /** Archived facts with reasons */
  archivedFacts: Array<{ id: string; content: string; reason: string }>;
  /** Path to archive file */
  archivePath: string;
}

export interface MemoryCompactionConfig {
  /** Memory root directory (default: ~/.dcyfr/memory) */
  rootDir: string;
  /** Agent ID for namespacing */
  agentId: string;
  /** BM25 similarity threshold for dedup (0-1). Default: 0.85 */
  dedupThreshold?: number;
  /** Conversation retention period in days. Default: 30 */
  retentionDays?: number;
  /** Optional LLM function for fact contradiction detection */
  llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;
  /** Optional embedding function for vector-based dedup */
  embedFn?: (text: string) => Promise<number[]>;
  /** Enable debug logging */
  debug?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FACT_ARCHIVE_FILENAME = 'facts-archived.md';
const FACTS_FILENAME = 'facts.md';
const CONVERSATIONS_DIR = 'conversations';
const SUMMARIES_DIR = 'summaries';

const CONTRADICTION_SYSTEM_PROMPT = `You are a fact contradiction detector. Given a list of facts, identify pairs that contradict each other.

Return JSON:
{
  "contradictions": [
    {
      "factId1": "id-of-first-fact",
      "factId2": "id-of-second-fact",
      "reason": "brief explanation of contradiction",
      "keepId": "id-of-fact-to-keep (more recent or more accurate)"
    }
  ]
}

Rules:
- Only report genuine contradictions, not complementary facts
- Prefer keeping the more recent fact
- If both are equally valid, keep the one with more detail`;

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer. Given multiple conversation transcripts from a time period, create a concise monthly summary.

Return a Markdown document with:
1. Key topics discussed
2. Decisions made
3. Action items identified
4. Notable facts learned

Be concise. Target 200-500 words.`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Compute BM25-style similarity between two texts.
 * Returns 0-1 where 1 is identical.
 */
function textSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }

  // Jaccard similarity
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Parse a Markdown memory file into entries.
 */
function parseMemoryFile(content: string, source: 'file' | 'mem0'): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const sections = content.split(/^### /m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    const id = lines[0]?.trim() ?? '';
    if (!id) continue;

    // Extract metadata
    let owner: string | undefined;
    let timestamp = new Date().toISOString();
    let topic: string | undefined;

    const contentLines: string[] = [];
    let inContent = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('- **Owner:**')) {
        const match = /- \*\*Owner:\*\* (.+?) \(/.exec(line);
        if (match) owner = match[1];
      } else if (line.startsWith('- **Timestamp:**')) {
        const match = /- \*\*Timestamp:\*\* (.+)/.exec(line);
        if (match) timestamp = match[1].trim();
      } else if (line.startsWith('- **Topic:**')) {
        const match = /- \*\*Topic:\*\* (.+)/.exec(line);
        if (match) topic = match[1].trim();
      } else if (line === '---') {
        break;
      } else if (!line.startsWith('- **') && line.trim() !== '') {
        inContent = true;
        contentLines.push(line);
      } else if (inContent) {
        contentLines.push(line);
      }
    }

    const entryContent = contentLines.join('\n').trim();
    if (entryContent) {
      entries.push({
        id,
        content: entryContent,
        source,
        hash: sha256(entryContent),
        timestamp,
        topic,
        owner,
      });
    }
  }

  return entries;
}

/**
 * Format a MemoryEntry back to Markdown
 */
function formatEntry(entry: MemoryEntry): string {
  const lines: string[] = [
    `### ${entry.id}`,
    '',
  ];
  if (entry.owner) lines.push(`- **Owner:** ${entry.owner} (agent)`);
  lines.push(`- **Timestamp:** ${entry.timestamp}`);
  if (entry.topic) lines.push(`- **Topic:** ${entry.topic}`);
  lines.push('', entry.content, '', '---', '');
  return lines.join('\n');
}

/**
 * Parse conversation file date from filename.
 * Expected formats: YYYY-MM-DD-session.md, session-{id}.md with date prefix
 */
function parseFileDate(filename: string): Date | null {
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(filename);
  if (dateMatch) {
    const d = new Date(dateMatch[1]);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  MemoryCompaction                                                   */
/* ------------------------------------------------------------------ */

export class MemoryCompaction {
  private readonly rootDir: string;
  private readonly agentId: string;
  private readonly dedupThreshold: number;
  private readonly retentionDays: number;
  private readonly llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;
  private readonly embedFn?: (text: string) => Promise<number[]>;
  private readonly debug: boolean;

  constructor(config: MemoryCompactionConfig) {
    this.rootDir = config.rootDir;
    this.agentId = config.agentId;
    this.dedupThreshold = config.dedupThreshold ?? 0.85;
    this.retentionDays = config.retentionDays ?? 30;
    this.llmCall = config.llmCall;
    this.embedFn = config.embedFn;
    this.debug = config.debug ?? false;
  }

  /* ---- Task 9.1: Cross-backend Deduplication ---------------------- */

  /**
   * Deduplicate memory entries across file and mem0 backends.
   *
   * Algorithm:
   * 1. Collect all entries from file backend
   * 2. Collect all entries from mem0 backend (if provided)
   * 3. Hash-based exact dedup (O(n))
   * 4. Similarity-based fuzzy dedup (O(n²) but typically small n)
   * 5. Keep file-backend entries over mem0 (file is source of truth)
   */
  deduplicateEntries(
    fileEntries: MemoryEntry[],
    mem0Entries: MemoryEntry[] = [],
  ): DeduplicationResult {
    const allEntries = [...fileEntries, ...mem0Entries];
    const totalBefore = allEntries.length;

    // Phase 1: Exact hash dedup
    const seenHashes = new Map<string, MemoryEntry>();
    const afterHashDedup: MemoryEntry[] = [];
    const duplicatePairs: DeduplicationResult['duplicatePairs'] = [];

    for (const entry of allEntries) {
      const existing = seenHashes.get(entry.hash);
      if (existing) {
        // Prefer file over mem0
        const kept = existing.source === 'file' ? existing : entry;
        const removed = existing.source === 'file' ? entry : existing;
        duplicatePairs.push({
          kept: kept.id,
          removed: removed.id,
          similarity: 1.0,
        });
        if (kept !== existing) {
          // Replace in seenHashes
          seenHashes.set(entry.hash, entry);
          const idx = afterHashDedup.indexOf(existing);
          if (idx >= 0) afterHashDedup[idx] = entry;
        }
      } else {
        seenHashes.set(entry.hash, entry);
        afterHashDedup.push(entry);
      }
    }

    // Phase 2: Fuzzy similarity dedup
    const kept = new Set<number>();
    const removed = new Set<number>();

    for (let i = 0; i < afterHashDedup.length; i++) {
      if (removed.has(i)) continue;
      kept.add(i);

      for (let j = i + 1; j < afterHashDedup.length; j++) {
        if (removed.has(j)) continue;

        const similarity = textSimilarity(
          afterHashDedup[i].content,
          afterHashDedup[j].content,
        );

        if (similarity >= this.dedupThreshold) {
          // Prefer file over mem0, then prefer more recent
          const entryI = afterHashDedup[i];
          const entryJ = afterHashDedup[j];

          let keepIdx = i;
          let removeIdx = j;

          if (entryI.source === 'mem0' && entryJ.source === 'file') {
            keepIdx = j;
            removeIdx = i;
          } else if (entryI.timestamp < entryJ.timestamp && entryI.source === entryJ.source) {
            keepIdx = j;
            removeIdx = i;
          }

          removed.add(removeIdx);
          duplicatePairs.push({
            kept: afterHashDedup[keepIdx].id,
            removed: afterHashDedup[removeIdx].id,
            similarity,
          });
        }
      }
    }

    const dedupedEntries = afterHashDedup.filter((_, i) => !removed.has(i));

    if (this.debug) {
      console.log(`[MemoryCompaction] dedup: ${totalBefore} → ${dedupedEntries.length} (removed ${totalBefore - dedupedEntries.length})`);
    }

    return {
      totalBefore,
      totalAfter: dedupedEntries.length,
      duplicatesRemoved: totalBefore - dedupedEntries.length,
      entries: dedupedEntries,
      duplicatePairs,
    };
  }

  /* ---- Task 9.2: Hybrid Search Dedup ------------------------------ */

  /**
   * Enhanced deduplication using vector embeddings when available.
   * Falls back to BM25-only (textSimilarity) when embeddings unavailable.
   */
  async deduplicateWithHybridSearch(
    entries: MemoryEntry[],
  ): Promise<DeduplicationResult> {
    if (!this.embedFn) {
      // Fallback to text-only dedup
      return this.deduplicateEntries(entries);
    }

    const totalBefore = entries.length;
    const duplicatePairs: DeduplicationResult['duplicatePairs'] = [];

    // Phase 1: Hash dedup (same as above)
    const seenHashes = new Map<string, number>();
    const uniqueByHash: MemoryEntry[] = [];

    for (const entry of entries) {
      const existingIdx = seenHashes.get(entry.hash);
      if (existingIdx !== undefined) {
        duplicatePairs.push({
          kept: uniqueByHash[existingIdx].id,
          removed: entry.id,
          similarity: 1.0,
        });
      } else {
        seenHashes.set(entry.hash, uniqueByHash.length);
        uniqueByHash.push(entry);
      }
    }

    // Phase 2: Compute embeddings
    const embeddings: number[][] = [];
    for (const entry of uniqueByHash) {
      try {
        const embedding = await this.embedFn(entry.content);
        embeddings.push(embedding);
      } catch {
        // If embedding fails, use empty vector (will have 0 cosine similarity)
        embeddings.push([]);
      }
    }

    // Phase 3: Hybrid similarity (BM25 + cosine) dedup
    const removed = new Set<number>();

    for (let i = 0; i < uniqueByHash.length; i++) {
      if (removed.has(i)) continue;

      for (let j = i + 1; j < uniqueByHash.length; j++) {
        if (removed.has(j)) continue;

        const bm25Sim = textSimilarity(uniqueByHash[i].content, uniqueByHash[j].content);
        const vectorSim = (embeddings[i].length > 0 && embeddings[j].length > 0)
          ? cosineSimilarity(embeddings[i], embeddings[j])
          : 0;

        // RRF-style combination: weight BM25 at 0.4, vector at 0.6
        const hybridSim = vectorSim > 0
          ? (0.4 * bm25Sim + 0.6 * vectorSim)
          : bm25Sim;

        if (hybridSim >= this.dedupThreshold) {
          // Prefer more recent
          const keepIdx = uniqueByHash[i].timestamp >= uniqueByHash[j].timestamp ? i : j;
          const removeIdx = keepIdx === i ? j : i;

          removed.add(removeIdx);
          duplicatePairs.push({
            kept: uniqueByHash[keepIdx].id,
            removed: uniqueByHash[removeIdx].id,
            similarity: hybridSim,
          });
        }
      }
    }

    const dedupedEntries = uniqueByHash.filter((_, i) => !removed.has(i));

    return {
      totalBefore,
      totalAfter: dedupedEntries.length,
      duplicatesRemoved: totalBefore - dedupedEntries.length,
      entries: dedupedEntries,
      duplicatePairs,
    };
  }

  /* ---- Task 9.3: Conversation Summary Compaction ------------------ */

  /**
   * Consolidate conversation files older than retentionDays into monthly summaries.
   *
   * 1. Scan conversations directory for files older than threshold
   * 2. Group by month
   * 3. Generate summary per month (LLM if available, else concatenate)
   * 4. Write summary to summaries directory
   * 5. Move original files to archive
   */
  async compactConversations(): Promise<ConversationSummaryResult> {
    const conversationsDir = join(this.rootDir, this.agentId, CONVERSATIONS_DIR);
    const summariesDir = join(this.rootDir, this.agentId, SUMMARIES_DIR);
    const archiveDir = join(conversationsDir, 'archive');

    // Ensure directories exist
    for (const dir of [conversationsDir, summariesDir, archiveDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    // Scan for old conversation files
    const files = readdirSync(conversationsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.'));

    // Group by month
    const monthGroups = new Map<string, Array<{ filename: string; content: string; date: Date }>>();

    for (const filename of files) {
      const fileDate = parseFileDate(filename);
      if (!fileDate || fileDate >= cutoffDate) continue;

      // Use UTC methods — parseFileDate parses "YYYY-MM-DD" as UTC midnight,
      // so we must use getUTCFullYear/getUTCMonth to stay consistent across timezones.
      const monthKey = `${fileDate.getUTCFullYear()}-${String(fileDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const filePath = join(conversationsDir, filename);
      const content = readFileSync(filePath, 'utf-8');

      const group = monthGroups.get(monthKey) ?? [];
      group.push({ filename, content, date: fileDate });
      monthGroups.set(monthKey, group);
    }

    const summaryPaths: string[] = [];
    const archivedPaths: string[] = [];

    // Generate summaries per month
    for (const [monthKey, group] of monthGroups) {
      // Sort by date
      group.sort((a, b) => a.date.getTime() - b.date.getTime());

      const combinedContent = group
        .map(g => `## ${g.filename}\n\n${g.content}`)
        .join('\n\n---\n\n');

      let summaryContent: string;

      if (this.llmCall) {
        try {
          summaryContent = await this.llmCall(
            `Summarize these conversations from ${monthKey}:\n\n${combinedContent.slice(0, 50_000)}`,
            SUMMARY_SYSTEM_PROMPT,
          );
        } catch {
          // Fallback: truncated concatenation
          summaryContent = this._fallbackSummary(monthKey, group);
        }
      } else {
        summaryContent = this._fallbackSummary(monthKey, group);
      }

      // Write summary
      const summaryPath = join(summariesDir, `${monthKey}-summary.md`);
      const header = [
        `# Monthly Summary: ${monthKey}`,
        '',
        `Generated: ${new Date().toISOString()}`,
        `Files consolidated: ${group.length}`,
        '',
        '---',
        '',
      ].join('\n');

      writeFileSync(summaryPath, header + summaryContent, 'utf-8');
      summaryPaths.push(summaryPath);

      // Archive originals
      for (const file of group) {
        const srcPath = join(conversationsDir, file.filename);
        const destPath = join(archiveDir, file.filename);
        renameSync(srcPath, destPath);
        archivedPaths.push(destPath);
      }

      if (this.debug) {
        console.log(`[MemoryCompaction] Created summary: ${summaryPath} (${group.length} files)`);
      }
    }

    return {
      filesProcessed: archivedPaths.length,
      summariesCreated: summaryPaths.length,
      summaryPaths,
      archivedPaths,
    };
  }

  /* ---- Task 9.4: Stale Fact Archival ------------------------------ */

  /**
   * Archive stale or contradicted facts to facts-archived.md.
   *
   * Strategy:
   * 1. Read all facts from facts.md
   * 2. Detect contradictions (LLM-powered when available)
   * 3. Move stale/contradicted facts to facts-archived.md
   * 4. Rewrite facts.md without archived entries
   */
  async archiveStaleFacts(): Promise<FactArchivalResult> {
    const agentDir = join(this.rootDir, this.agentId);
    const factsPath = join(agentDir, FACTS_FILENAME);
    const archivePath = join(agentDir, FACT_ARCHIVE_FILENAME);

    if (!existsSync(factsPath)) {
      return {
        factsEvaluated: 0,
        factsArchived: 0,
        archivedFacts: [],
        archivePath,
      };
    }

    const factsContent = readFileSync(factsPath, 'utf-8');
    const entries = parseMemoryFile(factsContent, 'file');

    if (entries.length === 0) {
      return {
        factsEvaluated: 0,
        factsArchived: 0,
        archivedFacts: [],
        archivePath,
      };
    }

    // Detect contradictions
    const contradictions = await this._detectContradictions(entries);

    if (contradictions.length === 0) {
      return {
        factsEvaluated: entries.length,
        factsArchived: 0,
        archivedFacts: [],
        archivePath,
      };
    }

    // Determine which facts to archive
    const archiveIds = new Set(contradictions.map(c => c.removeId));
    const archivedFacts: FactArchivalResult['archivedFacts'] = [];
    const keptEntries: MemoryEntry[] = [];

    for (const entry of entries) {
      if (archiveIds.has(entry.id)) {
        const contradiction = contradictions.find(c => c.removeId === entry.id);
        archivedFacts.push({
          id: entry.id,
          content: entry.content,
          reason: contradiction?.reason ?? 'Contradicted by newer fact',
        });
      } else {
        keptEntries.push(entry);
      }
    }

    // Write archived facts
    const archiveHeader = existsSync(archivePath)
      ? readFileSync(archivePath, 'utf-8')
      : `# Archived Facts\n\nFacts moved here due to contradiction or staleness.\n\n---\n\n`;

    const archiveAdditions = archivedFacts
      .map(af => {
        return [
          `### ${af.id}`,
          '',
          `- **Archived:** ${new Date().toISOString()}`,
          `- **Reason:** ${af.reason}`,
          '',
          af.content,
          '',
          '---',
          '',
        ].join('\n');
      })
      .join('');

    writeFileSync(archivePath, archiveHeader + archiveAdditions, 'utf-8');

    // Rewrite facts.md without archived entries
    const factsHeader = `# Agent Facts\n\nAutomatically maintained fact store.\n\n---\n\n`;
    const remainingContent = keptEntries.map(e => formatEntry(e)).join('');
    writeFileSync(factsPath, factsHeader + remainingContent, 'utf-8');

    if (this.debug) {
      console.log(`[MemoryCompaction] Archived ${archivedFacts.length} stale facts`);
    }

    return {
      factsEvaluated: entries.length,
      factsArchived: archivedFacts.length,
      archivedFacts,
      archivePath,
    };
  }

  /* ---- Private Helpers ------------------------------------------- */

  private _fallbackSummary(
    monthKey: string,
    group: Array<{ filename: string; content: string }>,
  ): string {
    const lines = [
      `Conversations from ${monthKey}:`,
      '',
    ];

    for (const file of group) {
      lines.push(`### ${file.filename}`);
      lines.push('');
      // Take first 500 chars of each conversation
      lines.push(file.content.slice(0, 500));
      if (file.content.length > 500) lines.push('...');
      lines.push('');
    }

    return lines.join('\n');
  }

  private async _detectContradictions(
    entries: MemoryEntry[],
  ): Promise<Array<{ removeId: string; reason: string }>> {
    if (this.llmCall && entries.length >= 2) {
      return this._detectContradictionsWithLLM(entries);
    }
    return this._detectContradictionsHeuristic(entries);
  }

  private async _detectContradictionsWithLLM(
    entries: MemoryEntry[],
  ): Promise<Array<{ removeId: string; reason: string }>> {
    const factsList = entries
      .map(e => `[${e.id}] (${e.timestamp}): ${e.content}`)
      .join('\n');

    try {
      const response = await this.llmCall!(
        `Analyze these facts for contradictions:\n\n${factsList}`,
        CONTRADICTION_SYSTEM_PROMPT,
      );

      const jsonMatch = /\{[\s\S]*\}/.exec(response);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.contradictions)) {
          return parsed.contradictions.map((c: Record<string, string>) => ({
            removeId: c.factId1 === c.keepId ? c.factId2 : c.factId1,
            reason: c.reason ?? 'LLM-detected contradiction',
          }));
        }
      }
    } catch {
      if (this.debug) {
        console.warn('[MemoryCompaction] LLM contradiction detection failed, falling back to heuristic');
      }
    }

    return this._detectContradictionsHeuristic(entries);
  }

  private _detectContradictionsHeuristic(
    entries: MemoryEntry[],
  ): Array<{ removeId: string; reason: string }> {
    const results: Array<{ removeId: string; reason: string }> = [];

    // Heuristic: entries with very high text similarity but different content
    // are likely updated versions of each other. Archive the older one.
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const sim = textSimilarity(entries[i].content, entries[j].content);
        // High similarity (>0.7) but not exact (not 1.0) suggests contradiction/update
        if (sim > 0.7 && sim < 1.0) {
          // Archive the older one
          const older = entries[i].timestamp <= entries[j].timestamp ? entries[i] : entries[j];
          results.push({
            removeId: older.id,
            reason: `Superseded by similar fact (similarity: ${sim.toFixed(2)})`,
          });
        }
      }
    }

    return results;
  }
}
