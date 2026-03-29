/**
 * Improvement Ledger tests — tasks 2.1, 2.2, 2.3
 * TLP:AMBER - Internal Use Only
 *
 * Covers:
 *   2.1 — Serialization round-trip, append-only enforcement, idempotent append
 *   2.2 — Lineage reconstruction: ordered chain, multi-transition, error cases
 *   2.3 — Rollback drill: applied→rolled_back traceability
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  serializeLedgerEntry,
  deserializeLedgerEntry,
  deserializeAllEntries,
  FileLedger,
  LedgerDeserializationError,
  reconstructLineage,
  extractRollbackTrail,
  LedgerLineageError,
  LEDGER_RECORD_SCHEMA_VERSION,
} from '../ledger.js';
import { InMemoryImprovementLedger } from '../runtime.js';
import type { LedgerEntry } from '../runtime.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let seq = 0;
const nextId = () => `ledger-test-${++seq}`;

function makeEntry(
  proposalId: string,
  state: LedgerEntry['state'],
  previousId: string | null = null,
): LedgerEntry {
  return {
    entry_id: nextId(),
    proposal_id: proposalId,
    state,
    actor: 'test-actor',
    timestamp: new Date().toISOString(),
    previous_entry_id: previousId,
    payload:
      state === 'proposed'
        ? {
            kind: 'proposed',
            proposal: {
              proposal_id: proposalId,
              source_snapshot_id: 'snap-src',
              proposed_changes: {
                parameter_changes: [],
                description: 'test',
              },
              rationale: 'test rationale',
              proposed_by: 'test-actor',
              proposed_at: new Date().toISOString(),
              evaluation_criteria: {
                success_threshold: 0.8,
                regression_budget: 0.1,
                benchmark_domains: ['domain-a'],
                required_checks: [],
              },
              context: {
                tlp_classification: 'GREEN',
                scope: 'non_production',
                domain: 'test-domain',
                initiated_by: 'test-actor',
              },
            },
            source_snapshot: {
              snapshot_id: 'snap-src',
              policy_id: 'policy-1',
              schema_version: { major: 1, minor: 0, patch: 0 },
              content: {
                id: 'policy-1',
                schema_version: { major: 1, minor: 0, patch: 0 },
                name: 'Test Policy',
                description: 'desc',
                domain: 'test-domain',
                parameters: {},
                constraints: {
                  min_verification_policy: 'direct_inspection',
                  tlp_classification: 'GREEN',
                  scope: 'non_production',
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              captured_at: new Date().toISOString(),
              captured_by: 'test-actor',
              content_hash: 'hash-abc',
            },
          }
        : state === 'evaluated'
          ? {
              kind: 'evaluated',
              result: {
                proposal_id: proposalId,
                evaluated_at: new Date().toISOString(),
                evaluated_by: 'evaluator',
                passed: true,
                score: 0.9,
                regression_detected: false,
                benchmark_results: [],
                required_verification_policy: 'direct_inspection',
              },
            }
          : state === 'approved'
            ? {
                kind: 'approved',
                verification_result: {
                  verified: true,
                  verified_at: new Date().toISOString(),
                  verified_by: 'approver',
                  verification_method: 'direct_inspection' as const,
                  quality_score: 0.95,
                },
                approved_by: 'approver',
              }
            : state === 'applied'
              ? {
                  kind: 'applied',
                  result_snapshot: {
                    snapshot_id: nextId(),
                    policy_id: 'policy-1',
                    schema_version: { major: 1, minor: 0, patch: 0 },
                    content: {
                      id: 'policy-1',
                      schema_version: { major: 1, minor: 0, patch: 0 },
                      name: 'Test Policy',
                      description: 'desc',
                      domain: 'test-domain',
                      parameters: { threshold: 0.8 },
                      constraints: {
                        min_verification_policy: 'direct_inspection',
                        tlp_classification: 'GREEN',
                        scope: 'non_production',
                      },
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    captured_at: new Date().toISOString(),
                    captured_by: 'applier',
                    content_hash: 'hash-result',
                  },
                }
              : state === 'rolled_back'
                ? {
                    kind: 'rolled_back',
                    reason: 'regression detected',
                    restored_snapshot_id: 'snap-src',
                  }
                : {
                    kind: 'rejected',
                    reason: 'test rejection',
                    at_state: 'proposed' as const,
                  },
  };
}

// ---------------------------------------------------------------------------
// 2.1 — Serializers
// ---------------------------------------------------------------------------

describe('2.1 — serializers', () => {
  it('round-trips a proposed entry through serialize → deserialize', () => {
    const entry = makeEntry('p-1', 'proposed', null);
    const line = serializeLedgerEntry(entry);
    const parsed = deserializeLedgerEntry(line);
    expect(parsed).toEqual(entry);
  });

  it('serialized line ends with newline', () => {
    const entry = makeEntry('p-2', 'evaluated', 'prev-id');
    expect(serializeLedgerEntry(entry)).toMatch(/\n$/);
  });

  it('serialized envelope contains schema version', () => {
    const entry = makeEntry('p-3', 'approved', 'prev-id');
    const parsed = JSON.parse(serializeLedgerEntry(entry).trim());
    expect(parsed.schema).toBe(LEDGER_RECORD_SCHEMA_VERSION);
    expect(parsed.written_at).toBeDefined();
  });

  it('round-trips applied and rolled_back entries', () => {
    for (const state of ['applied', 'rolled_back'] as const) {
      const entry = makeEntry('p-rt', state, 'prev');
      const parsed = deserializeLedgerEntry(serializeLedgerEntry(entry));
      expect(parsed?.state).toBe(state);
      expect(parsed?.payload.kind).toBe(state);
    }
  });

  it('returns null for blank line', () => {
    expect(deserializeLedgerEntry('')).toBeNull();
    expect(deserializeLedgerEntry('   ')).toBeNull();
  });

  it('throws LedgerDeserializationError for invalid JSON', () => {
    expect(() => deserializeLedgerEntry('not-json')).toThrow(LedgerDeserializationError);
  });

  it('throws LedgerDeserializationError for unknown schema version', () => {
    const bad = JSON.stringify({ schema: '99.0', written_at: 'now', entry: {} });
    expect(() => deserializeLedgerEntry(bad)).toThrow(LedgerDeserializationError);
  });

  it('deserializeAllEntries handles multi-entry NDJSON', () => {
    const e1 = makeEntry('p-multi', 'proposed', null);
    const e2 = makeEntry('p-multi', 'evaluated', e1.entry_id);
    const ndjson = serializeLedgerEntry(e1) + serializeLedgerEntry(e2);
    const entries = deserializeAllEntries(ndjson);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.state).toBe('proposed');
    expect(entries[1]!.state).toBe('evaluated');
  });

  it('deserializeAllEntries skips blank lines', () => {
    const e = makeEntry('p-blank', 'proposed', null);
    const ndjson = '\n' + serializeLedgerEntry(e) + '\n\n';
    expect(deserializeAllEntries(ndjson)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2.1 — InMemoryImprovementLedger append-only behaviour
// ---------------------------------------------------------------------------

describe('2.1 — InMemoryImprovementLedger', () => {
  let ledger: InMemoryImprovementLedger;

  beforeEach(() => { ledger = new InMemoryImprovementLedger(); });

  it('appends entries and retrieves them in order', async () => {
    const e1 = makeEntry('p-mem', 'proposed', null);
    const e2 = makeEntry('p-mem', 'evaluated', e1.entry_id);
    await ledger.append(e1);
    await ledger.append(e2);
    const entries = await ledger.getEntriesForProposal('p-mem');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.entry_id).toBe(e1.entry_id);
    expect(entries[1]!.entry_id).toBe(e2.entry_id);
  });

  it('getLatestEntry returns last appended entry', async () => {
    const e1 = makeEntry('p-latest', 'proposed', null);
    const e2 = makeEntry('p-latest', 'evaluated', e1.entry_id);
    await ledger.append(e1);
    await ledger.append(e2);
    const latest = await ledger.getLatestEntry('p-latest');
    expect(latest?.entry_id).toBe(e2.entry_id);
  });

  it('getLatestEntry returns null for unknown proposal', async () => {
    expect(await ledger.getLatestEntry('unknown')).toBeNull();
  });

  it('idempotent: duplicate entry_id is not appended twice', async () => {
    const e = makeEntry('p-idem', 'proposed', null);
    await ledger.append(e);
    await ledger.append(e);
    const entries = await ledger.getEntriesForProposal('p-idem');
    expect(entries).toHaveLength(1);
  });

  it('isolates entries by proposal_id', async () => {
    const a = makeEntry('p-a', 'proposed', null);
    const b = makeEntry('p-b', 'proposed', null);
    await ledger.append(a);
    await ledger.append(b);
    expect(await ledger.getEntriesForProposal('p-a')).toHaveLength(1);
    expect(await ledger.getEntriesForProposal('p-b')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2.1 — FileLedger persistence
// ---------------------------------------------------------------------------

describe('2.1 — FileLedger persistence', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `metacog-test-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`);
  });

  afterEach(() => {
    if (existsSync(tmpFile)) rmSync(tmpFile);
  });

  it('persists entries across instances', async () => {
    const e1 = makeEntry('p-file', 'proposed', null);
    const e2 = makeEntry('p-file', 'evaluated', e1.entry_id);

    const ledger1 = new FileLedger(tmpFile);
    await ledger1.append(e1);
    await ledger1.append(e2);

    // New instance reads from same file
    const ledger2 = new FileLedger(tmpFile);
    const entries = await ledger2.getEntriesForProposal('p-file');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.entry_id).toBe(e1.entry_id);
  });

  it('only appends to file, never overwrites', async () => {
    const e1 = makeEntry('p-append', 'proposed', null);
    const e2 = makeEntry('p-append', 'evaluated', e1.entry_id);
    const ledger = new FileLedger(tmpFile);
    await ledger.append(e1);
    const beforeContent = await readFile(tmpFile, 'utf8');
    await ledger.append(e2);
    const afterContent = await readFile(tmpFile, 'utf8');
    expect(afterContent.startsWith(beforeContent)).toBe(true);
    expect(afterContent.length).toBeGreaterThan(beforeContent.length);
  });

  it('idempotent: duplicate entry not written to file', async () => {
    const e = makeEntry('p-idem-file', 'proposed', null);
    const ledger = new FileLedger(tmpFile);
    await ledger.append(e);
    const before = (await readFile(tmpFile, 'utf8')).split('\n').filter(Boolean).length;
    await ledger.append(e);
    const after = (await readFile(tmpFile, 'utf8')).split('\n').filter(Boolean).length;
    expect(after).toBe(before);
  });

  it('returns empty array when file does not exist', async () => {
    const ledger = new FileLedger(tmpFile + '.nonexistent');
    expect(await ledger.getEntriesForProposal('p-x')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2.2 — Lineage reconstruction
// ---------------------------------------------------------------------------

describe('2.2 — reconstructLineage', () => {
  it('reconstructs ordered lifecycle for a complete chain', () => {
    const e1 = makeEntry('p-lin', 'proposed', null);
    const e2 = makeEntry('p-lin', 'evaluated', e1.entry_id);
    const e3 = makeEntry('p-lin', 'approved', e2.entry_id);
    const e4 = makeEntry('p-lin', 'applied', e3.entry_id);

    // Pass in reverse order to test that chain walk, not insertion order, is used
    const lineage = reconstructLineage('p-lin', [e4, e2, e1, e3]);
    expect(lineage.entries.map((e) => e.state)).toEqual(['proposed', 'evaluated', 'approved', 'applied']);
    expect(lineage.current_state).toBe('applied');
    expect(lineage.is_terminal).toBe(true);
  });

  it('non-terminal lineage reports is_terminal=false', () => {
    const e1 = makeEntry('p-nt', 'proposed', null);
    const e2 = makeEntry('p-nt', 'evaluated', e1.entry_id);
    const lineage = reconstructLineage('p-nt', [e1, e2]);
    expect(lineage.is_terminal).toBe(false);
    expect(lineage.current_state).toBe('evaluated');
  });

  it('single entry lineage works', () => {
    const e1 = makeEntry('p-single', 'proposed', null);
    const lineage = reconstructLineage('p-single', [e1]);
    expect(lineage.entries).toHaveLength(1);
    expect(lineage.current_state).toBe('proposed');
  });

  it('rejected lineage is terminal', () => {
    const e1 = makeEntry('p-rej', 'proposed', null);
    const e2 = makeEntry('p-rej', 'rejected', e1.entry_id);
    const lineage = reconstructLineage('p-rej', [e1, e2]);
    expect(lineage.is_terminal).toBe(true);
  });

  it('throws LedgerLineageError on empty entries', () => {
    expect(() => reconstructLineage('p-empty', [])).toThrow(LedgerLineageError);
  });

  it('throws LedgerLineageError when no root entry exists', () => {
    // Both have previous_entry_id set — no root
    const e1 = makeEntry('p-noroot', 'proposed', 'ghost-id');
    const e2 = makeEntry('p-noroot', 'evaluated', e1.entry_id);
    expect(() => reconstructLineage('p-noroot', [e1, e2])).toThrow(LedgerLineageError);
  });

  it('throws LedgerLineageError on multiple roots', () => {
    const e1 = makeEntry('p-2roots', 'proposed', null);
    const e2 = makeEntry('p-2roots', 'proposed', null);
    expect(() => reconstructLineage('p-2roots', [e1, e2])).toThrow(LedgerLineageError);
  });
});

// ---------------------------------------------------------------------------
// 2.3 — Rollback drill: applied → rolled_back traceability
// ---------------------------------------------------------------------------

describe('2.3 — rollback drill', () => {
  it('extractRollbackTrail returns null when no rollback occurred', () => {
    const e1 = makeEntry('p-no-rb', 'proposed', null);
    const e2 = makeEntry('p-no-rb', 'applied', e1.entry_id);
    const lineage = reconstructLineage('p-no-rb', [e1, e2]);
    expect(extractRollbackTrail(lineage)).toBeNull();
  });

  it('rollback entry references the applied entry and restored snapshot', () => {
    const e1 = makeEntry('p-rb', 'proposed', null);
    const e2 = makeEntry('p-rb', 'evaluated', e1.entry_id);
    const e3 = makeEntry('p-rb', 'approved', e2.entry_id);
    const e4 = makeEntry('p-rb', 'applied', e3.entry_id);
    const e5 = makeEntry('p-rb', 'rolled_back', e4.entry_id);

    const lineage = reconstructLineage('p-rb', [e1, e2, e3, e4, e5]);
    expect(lineage.current_state).toBe('rolled_back');
    expect(lineage.is_terminal).toBe(true);

    const trail = extractRollbackTrail(lineage);
    expect(trail).not.toBeNull();
    expect(trail!.applied.entry_id).toBe(e4.entry_id);
    expect(trail!.rolled_back.entry_id).toBe(e5.entry_id);
    expect(trail!.restored_snapshot_id).toBe('snap-src');
  });

  it('rollback entry appears after applied entry in reconstructed lineage', () => {
    const e1 = makeEntry('p-rb-order', 'proposed', null);
    const e2 = makeEntry('p-rb-order', 'applied', e1.entry_id);
    const e3 = makeEntry('p-rb-order', 'rolled_back', e2.entry_id);

    // Provide in scrambled order
    const lineage = reconstructLineage('p-rb-order', [e3, e1, e2]);
    const states = lineage.entries.map((e) => e.state);
    const appliedIdx = states.indexOf('applied');
    const rolledBackIdx = states.indexOf('rolled_back');
    expect(appliedIdx).toBeLessThan(rolledBackIdx);
  });

  it('rollback payload preserves restored_snapshot_id from the apply payload', () => {
    const e1 = makeEntry('p-rb-snap', 'proposed', null);
    const e2 = makeEntry('p-rb-snap', 'applied', e1.entry_id);
    const e3 = makeEntry('p-rb-snap', 'rolled_back', e2.entry_id);

    const lineage = reconstructLineage('p-rb-snap', [e1, e2, e3]);
    const trail = extractRollbackTrail(lineage);
    expect(trail?.restored_snapshot_id).toBe('snap-src');
  });
});
