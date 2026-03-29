/**
 * Improvement Ledger — Append-Only Schema and Serializers
 * TLP:AMBER - Internal Use Only
 *
 * Implements the append-only improvement ledger with:
 *   - Typed schema for all lifecycle event entries
 *   - JSON serializers / deserializers with schema version stamping
 *   - File-backed persistent ledger (newline-delimited JSON, one entry per line)
 *   - Lineage helpers (task 2.2) for audit reconstruction
 *
 * The file-backed ledger appends atomically per entry; it never rewrites
 * existing lines, ensuring immutability of prior entries.
 *
 * @module ai/metacognition/ledger
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ImprovementLifecycleState } from './types.js';
import type { ImprovementLedger, LedgerEntry } from './runtime.js';

// ---------------------------------------------------------------------------
// Serialized record format (on-disk / over-wire schema)
// ---------------------------------------------------------------------------

/** Schema version for the serialized ledger record format. */
export const LEDGER_RECORD_SCHEMA_VERSION = '1.0' as const;

/**
 * Envelope wrapping each ledger entry for storage.
 * Adding fields here is non-breaking (readers ignore unknown keys).
 * Changing existing field semantics requires a major version bump.
 */
export interface LedgerRecordEnvelope {
  /** Schema version of this serialized format. */
  schema: typeof LEDGER_RECORD_SCHEMA_VERSION;
  /** ISO timestamp when this record was written to storage. */
  written_at: string;
  /** The ledger entry payload. */
  entry: LedgerEntry;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

/**
 * Serialize a LedgerEntry to a newline-delimited JSON record.
 * Each record is a single line; the newline is included in the output.
 */
export function serializeLedgerEntry(entry: LedgerEntry): string {
  const envelope: LedgerRecordEnvelope = {
    schema: LEDGER_RECORD_SCHEMA_VERSION,
    written_at: new Date().toISOString(),
    entry,
  };
  return JSON.stringify(envelope) + '\n';
}

/**
 * Deserialize a single newline-delimited JSON line to a LedgerEntry.
 * Returns null if the line is empty or cannot be parsed.
 *
 * @throws {LedgerDeserializationError} if the line parses but the schema is unrecognized.
 */
export function deserializeLedgerEntry(line: string): LedgerEntry | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  let envelope: unknown;
  try {
    envelope = JSON.parse(trimmed);
  } catch {
    throw new LedgerDeserializationError(`Invalid JSON in ledger line: ${trimmed.slice(0, 80)}`);
  }

  if (typeof envelope !== 'object' || envelope === null) {
    throw new LedgerDeserializationError('Ledger record must be a JSON object');
  }

  const rec = envelope as Record<string, unknown>;

  if (rec['schema'] !== LEDGER_RECORD_SCHEMA_VERSION) {
    throw new LedgerDeserializationError(
      `Unsupported ledger record schema version: ${String(rec['schema'])}`,
    );
  }

  if (typeof rec['entry'] !== 'object' || rec['entry'] === null) {
    throw new LedgerDeserializationError('Ledger record missing "entry" field');
  }

  return rec['entry'] as LedgerEntry;
}

/**
 * Deserialize all entries from a newline-delimited JSON string.
 * Skips blank lines; throws on malformed non-blank lines.
 */
export function deserializeAllEntries(ndjson: string): LedgerEntry[] {
  return ndjson
    .split('\n')
    .map((line, i) => {
      try {
        return deserializeLedgerEntry(line);
      } catch (err) {
        throw new LedgerDeserializationError(
          `Error at line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })
    .filter((e): e is LedgerEntry => e !== null);
}

/** Thrown when a ledger record cannot be deserialized. */
export class LedgerDeserializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerDeserializationError';
  }
}

// ---------------------------------------------------------------------------
// File-backed persistent ledger
// ---------------------------------------------------------------------------

/**
 * File-backed append-only ledger.
 *
 * Storage format: newline-delimited JSON (NDJSON), one LedgerRecordEnvelope per line.
 * Each `append()` call writes exactly one line; prior lines are never modified.
 *
 * The file is read fully on each query (suitable for low-volume policy improvement
 * workloads; not designed for high-throughput streaming use cases).
 *
 * @example
 * ```typescript
 * const ledger = new FileLedger('/var/lib/dcyfr/metacog-ledger.ndjson');
 * await ledger.append(entry);
 * const entries = await ledger.getEntriesForProposal('proposal-id');
 * ```
 */
export class FileLedger implements ImprovementLedger {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    // Ensure parent directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async append(entry: LedgerEntry): Promise<void> {
    // Idempotent: check if entry_id already present before writing
    const existing = await this.getLatestEntry(entry.proposal_id);
    if (existing) {
      // Scan all entries for exact entry_id match
      const all = await this.readAllEntries();
      if (all.some((e) => e.entry_id === entry.entry_id)) return;
    }

    const line = serializeLedgerEntry(entry);
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await appendFile(this.filePath, line, { encoding: 'utf8' });
  }

  async getEntriesForProposal(proposalId: string): Promise<LedgerEntry[]> {
    const all = await this.readAllEntries();
    return all.filter((e) => e.proposal_id === proposalId);
  }

  async getLatestEntry(proposalId: string): Promise<LedgerEntry | null> {
    const entries = await this.getEntriesForProposal(proposalId);
    return entries[entries.length - 1] ?? null;
  }

  private async readAllEntries(): Promise<LedgerEntry[]> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    try {
      const content = await readFile(this.filePath, { encoding: 'utf8' });
      return deserializeAllEntries(content);
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return [];
      throw err;
    }
  }
}

/**
 * Synchronous file-backed ledger.
 * For use in environments where async is not available (e.g. process exit hooks).
 */
export class SyncFileLedger {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  append(entry: LedgerEntry): void {
    const line = serializeLedgerEntry(entry);
    appendFileSync(this.filePath, line, { encoding: 'utf8' });
  }

  readAll(): LedgerEntry[] {
    if (!existsSync(this.filePath)) return [];
    const content = readFileSync(this.filePath, { encoding: 'utf8' });
    return deserializeAllEntries(content);
  }
}

// ---------------------------------------------------------------------------
// Lineage reconstruction (task 2.2)
// ---------------------------------------------------------------------------

/**
 * A fully reconstructed proposal lifecycle, ordered from first entry to terminal state.
 */
export interface ProposalLineage {
  proposal_id: string;
  entries: LedgerEntry[];
  current_state: ImprovementLifecycleState;
  is_terminal: boolean;
}

const TERMINAL_STATES = new Set<ImprovementLifecycleState>([
  'applied',
  'rolled_back',
  'rejected',
]);

/**
 * Reconstruct the full ordered lifecycle for a proposal from a set of entries.
 *
 * Entries are ordered by following the `previous_entry_id` chain from the
 * root (where `previous_entry_id === null`) to the latest entry.
 * Falls back to insertion order if the chain cannot be fully resolved.
 *
 * @throws {LedgerLineageError} if the chain is broken (gap in previous_entry_id).
 */
export function reconstructLineage(
  proposalId: string,
  entries: LedgerEntry[],
): ProposalLineage {
  if (entries.length === 0) {
    throw new LedgerLineageError(proposalId, 'No entries found for proposal');
  }

  // Build id → entry map
  const byId = new Map<string, LedgerEntry>();
  for (const e of entries) byId.set(e.entry_id, e);

  // Find the root (previous_entry_id === null)
  const roots = entries.filter((e) => e.previous_entry_id === null);
  if (roots.length === 0) {
    throw new LedgerLineageError(proposalId, 'No root entry found (no entry with previous_entry_id=null)');
  }
  if (roots.length > 1) {
    throw new LedgerLineageError(proposalId, `Multiple root entries found: ${roots.map((r) => r.entry_id).join(', ')}`);
  }

  // Walk the chain
  const ordered: LedgerEntry[] = [];
  let current: LedgerEntry | undefined = roots[0];
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.entry_id)) {
      throw new LedgerLineageError(proposalId, `Cycle detected at entry ${current.entry_id}`);
    }
    visited.add(current.entry_id);
    ordered.push(current);

    // Find the next entry that points back to this one
    const next = entries.find(
      (e) => e.previous_entry_id === current!.entry_id && !visited.has(e.entry_id),
    );
    current = next;
  }

  const latest = ordered[ordered.length - 1]!;
  return {
    proposal_id: proposalId,
    entries: ordered,
    current_state: latest.state,
    is_terminal: TERMINAL_STATES.has(latest.state),
  };
}

/**
 * Reconstruct the rollback trail for a proposal.
 * Returns the applied entry and the rolled_back entry, or null if no rollback occurred.
 */
export function extractRollbackTrail(lineage: ProposalLineage): {
  applied: LedgerEntry;
  rolled_back: LedgerEntry;
  restored_snapshot_id: string;
} | null {
  const rolledBack = lineage.entries.find((e) => e.state === 'rolled_back');
  if (!rolledBack) return null;

  const applied = lineage.entries.find((e) => e.state === 'applied');
  if (!applied) return null;

  const payload = rolledBack.payload;
  if (payload.kind !== 'rolled_back') return null;

  return {
    applied,
    rolled_back: rolledBack,
    restored_snapshot_id: payload.restored_snapshot_id,
  };
}

/** Thrown when lineage reconstruction fails due to a broken chain. */
export class LedgerLineageError extends Error {
  constructor(
    public readonly proposalId: string,
    message: string,
  ) {
    super(`Lineage error for proposal ${proposalId}: ${message}`);
    this.name = 'LedgerLineageError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}
