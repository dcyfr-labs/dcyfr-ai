/**
 * @module memory/working-memory-persistence
 * @description Persist working memory `Map<string, unknown>` to human-readable
 *              Markdown files on disk.
 *
 * File layout:
 *   {rootDir}/{agentId}/working/{YYYY-MM-DD}-{taskId}.md
 *
 * Each key-value pair is formatted as a labeled section with timestamp and type.
 *
 * @license MIT
 * @copyright DCYFR Labs (https://www.dcyfr.ai)
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { atomicWriteFile } from '../utils/safe-fs.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WorkingMemoryPersistConfig {
  /** Memory root directory (default: ~/.dcyfr/memory) */
  rootDir: string;
  /** Agent ID for namespacing */
  agentId: string;
  /** Task ID for the file name */
  taskId: string;
  /** Custom date string (default: today YYYY-MM-DD) */
  date?: string;
  /** Include metadata header */
  includeMetadata?: boolean;
}

export interface FlushResult {
  /** Path of the persisted file */
  filePath: string;
  /** Number of entries written */
  entriesWritten: number;
  /** Total bytes written */
  bytesWritten: number;
  /** Whether file was created (vs updated) */
  created: boolean;
}

export interface WorkingMemoryEntry {
  /** Entry key */
  key: string;
  /** Entry value (serialized) */
  value: string;
  /** JavaScript type of the original value */
  type: string;
  /** SHA-256 hash of the serialized value */
  hash: string;
}

export interface LoadResult {
  /** Path of the loaded file */
  filePath: string;
  /** Number of entries loaded */
  entriesLoaded: number;
  /** Loaded entries */
  entries: WorkingMemoryEntry[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Determine JavaScript type string for a value.
 */
function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value instanceof Map) return 'map';
  if (value instanceof Set) return 'set';
  if (value instanceof RegExp) return 'regexp';
  return typeof value;
}

/**
 * Serialize a value to a human-readable string.
 */
function serializeValue(value: unknown): string {
  const type = typeOf(value);

  switch (type) {
    case 'string':
      return value as string;
    case 'number':
    case 'boolean':
      return String(value);
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'date':
      return (value as Date).toISOString();
    case 'regexp':
      return (value as RegExp).toString();
    case 'map': {
      const obj: Record<string, unknown> = {};
      (value as Map<string, unknown>).forEach((v, k) => { obj[k] = v; });
      return JSON.stringify(obj, null, 2);
    }
    case 'set':
      return JSON.stringify([...(value as Set<unknown>)], null, 2);
    case 'array':
    case 'object':
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    case 'function':
      return `[Function: ${(value as (...args: unknown[]) => unknown).name || 'anonymous'}]`;
    default:
      return String(value);
  }
}

/**
 * Format a working memory entry as Markdown.
 */
function formatEntry(key: string, value: unknown, timestamp: string): string {
  const type = typeOf(value);
  const serialized = serializeValue(value);
  const hash = createHash('sha256').update(serialized).digest('hex').slice(0, 12);

  const lines: string[] = [
    `### ${key}`,
    '',
    `- **Type:** \`${type}\``,
    `- **Timestamp:** ${timestamp}`,
    `- **Hash:** \`${hash}\``,
    '',
  ];

  // For multi-line values, use a fenced code block
  if (serialized.includes('\n') || type === 'object' || type === 'array' || type === 'map' || type === 'set') {
    const lang = (type === 'object' || type === 'array' || type === 'map' || type === 'set') ? 'json' : '';
    lines.push(`\`\`\`${lang}`);
    lines.push(serialized);
    lines.push('```');
  } else {
    lines.push(serialized);
  }

  lines.push('', '---', '');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Flush a working memory Map to a Markdown file on disk.
 *
 * @param memory - The working memory Map from RuntimeState
 * @param config - Persistence configuration
 * @returns Flush result with file path and stats
 */
export function flushWorkingMemory(
  memory: Map<string, unknown>,
  config: WorkingMemoryPersistConfig,
): FlushResult {
  const date = config.date ?? new Date().toISOString().slice(0, 10);
  const safeTaskId = config.taskId.replace(/[^\w-]/g, '_');
  const workingDir = join(config.rootDir, config.agentId, 'working');

  if (!existsSync(workingDir)) {
    mkdirSync(workingDir, { recursive: true });
  }

  const filename = `${date}-${safeTaskId}.md`;
  const filePath = join(workingDir, filename);
  const created = !existsSync(filePath);

  const timestamp = new Date().toISOString();

  // Build Markdown content
  const lines: string[] = [];

  if (config.includeMetadata !== false) {
    lines.push(
      `# Working Memory: ${config.taskId}`,
      '',
      `- **Agent:** ${config.agentId}`,
      `- **Date:** ${date}`,
      `- **Flushed:** ${timestamp}`,
      `- **Entries:** ${memory.size}`,
      '',
      '---',
      '',
    );
  }

  let entriesWritten = 0;
  memory.forEach((value, key) => {
    lines.push(formatEntry(key, value, timestamp));
    entriesWritten++;
  });

  const content = lines.join('\n');
  // Atomic rewrite — closes CodeQL js/insecure-temporary-file.
  atomicWriteFile(filePath, content);

  return {
    filePath,
    entriesWritten,
    bytesWritten: Buffer.byteLength(content, 'utf-8'),
    created,
  };
}

/**
 * Load working memory entries from a persisted Markdown file.
 *
 * Note: Values are returned as strings — callers must parse as needed.
 *
 * @param filePath - Path to the working memory file
 * @returns Loaded entries
 */
export function loadWorkingMemory(filePath: string): LoadResult {
  if (!existsSync(filePath)) {
    return { filePath, entriesLoaded: 0, entries: [] };
  }

  const content = readFileSync(filePath, 'utf-8');
  const sections = content.split(/^### /m).filter(s => s.trim());

  const entries: WorkingMemoryEntry[] = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const key = lines[0]?.trim() ?? '';
    if (!key || key.startsWith('Working Memory:') || key.startsWith('#')) continue;

    let type = 'unknown';
    let hash = '';
    const valueLines: string[] = [];
    let inCodeBlock = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('- **Type:**')) {
        const match = /`([^`]+)`/.exec(line);
        if (match) type = match[1];
      } else if (line.startsWith('- **Hash:**')) {
        const match = /`([^`]+)`/.exec(line);
        if (match) hash = match[1];
      } else if (line.startsWith('- **Timestamp:**') || line.startsWith('- **Agent:**') || line.startsWith('- **Date:**') || line.startsWith('- **Flushed:**') || line.startsWith('- **Entries:**')) {
        continue;
      } else if (line === '---') {
        break;
      } else if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      } else if (inCodeBlock || (!line.startsWith('- **') && line.trim() !== '' && !line.startsWith('#'))) {
        valueLines.push(line);
      }
    }

    const value = valueLines.join('\n').trim();
    if (key && value) {
      entries.push({ key, value, type, hash });
    }
  }

  return { filePath, entriesLoaded: entries.length, entries };
}

/**
 * List all working memory files for an agent.
 *
 * @param rootDir - Memory root directory
 * @param agentId - Agent ID
 * @returns Array of file paths
 */
export function listWorkingMemoryFiles(rootDir: string, agentId: string): string[] {
  const workingDir = join(rootDir, agentId, 'working');
  if (!existsSync(workingDir)) return [];

  return readdirSync(workingDir)
    .filter(f => f.endsWith('.md'))
    // Code-unit comparator: locale-independent, so ordering is stable across
    // hosts (filenames are ASCII timestamps).
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map(f => join(workingDir, f));
}
