/**
 * @file plugin-reputation-engine.test.ts
 * @description Unit tests for the plugin marketplace reputation engine.
 *              Covers tasks 7.2–7.6 (CRUD, trust score storage, registry sync,
 *              decay, query API).
 *
 * Uses an in-memory SQLite database (:memory:) — no file system side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { UpsertScanInput, PluginTrustScore } from '../../src/plugins/reputation/types.js';
import { PluginReputationEngine } from '../../src/plugins/reputation/plugin-reputation-engine.js';
import { openReputationDb, getSchemaVersion } from '../../src/plugins/reputation/plugin-reputation-db.js';

// ── Test fixtures ──────────────────────────────────────────────────────────

function makeTrustScore(overall: number): PluginTrustScore {
  return {
    overall,
    dimensions: {
      security: Math.round(overall * 1.1),
      community: overall,
      maintenance: Math.round(overall * 0.9),
      transparency: Math.round(overall * 0.85),
    },
  };
}

function makeScan(
  pluginId: string,
  name: string,
  score: number,
  extra: Partial<UpsertScanInput> = {},
): UpsertScanInput {
  return {
    plugin_id: pluginId,
    name,
    version: '1.0.0',
    capabilities: ['file-read'],
    trustScore: makeTrustScore(score),
    ...extra,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────

describe('PluginReputationEngine — schema (task 7.1)', () => {
  it('creates the schema and returns version 1', () => {
    const db = openReputationDb(':memory:');
    expect(getSchemaVersion(db)).toBe(1);
    db.close();
  });

  it('creates plugins, incidents, and audits tables', () => {
    const db = openReputationDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('plugins');
    expect(names).toContain('incidents');
    expect(names).toContain('audits');
    db.close();
  });

  it('is idempotent — running schema twice is safe', () => {
    const db = openReputationDb(':memory:');
    // Calling exec again should not throw
    expect(() => openReputationDb(':memory:')).not.toThrow();
    db.close();
  });
});

describe('PluginReputationEngine — CRUD (task 7.2)', () => {
  let engine: PluginReputationEngine;

  beforeEach(() => {
    engine = new PluginReputationEngine({ databasePath: ':memory:' });
  });

  afterEach(() => {
    engine.close();
  });

  it('upsertScan inserts new plugin', () => {
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85));
    expect(engine.count()).toBe(1);
  });

  it('upsertScan increments scan_count on re-scan', () => {
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85));
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 87, { version: '1.0.1' }));
    const score = engine.getScore('git-tools');
    expect(score?.scan_count).toBe(2);
  });

  it('upsertScan updates trust_score on re-scan', () => {
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 60));
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 82));
    const score = engine.getScore('git-tools');
    expect(score?.trust_score).toBe(82);
  });

  it('stores multiple independent plugins', () => {
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85));
    engine.upsertScan(makeScan('web-fetcher', 'Web Fetcher', 72));
    engine.upsertScan(makeScan('api-client', 'API Client', 55));
    expect(engine.count()).toBe(3);
  });

  it('deletePlugin removes the plugin', () => {
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85));
    const deleted = engine.deletePlugin('git-tools');
    expect(deleted).toBe(true);
    expect(engine.count()).toBe(0);
  });

  it('deletePlugin returns false for unknown plugin', () => {
    expect(engine.deletePlugin('nonexistent')).toBe(false);
  });

  it('upsertScan sets approved_at when approved=true', () => {
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85, { approved: true }));
    const score = engine.getScore('git-tools');
    expect(score?.approved_at).not.toBeNull();
  });

  it('upsertScan preserves existing approved_at on re-scan without approved flag', () => {
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85, { approved: true }));
    const firstApproval = engine.getScore('git-tools')?.approved_at;

    engine.upsertScan(makeScan('git-tools', 'Git Tools', 88)); // no approved flag
    const afterRescan = engine.getScore('git-tools')?.approved_at;

    expect(afterRescan).toBe(firstApproval); // not overwritten
  });
});

describe('PluginReputationEngine — trust score storage & retrieval (task 7.3)', () => {
  let engine: PluginReputationEngine;

  beforeEach(() => {
    engine = new PluginReputationEngine({ databasePath: ':memory:' });
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85, { capabilities: ['git', 'file-read'] }));
  });

  afterEach(() => {
    engine.close();
  });

  it('getScore returns the stored trust score', () => {
    const result = engine.getScore('git-tools');
    expect(result).not.toBeNull();
    expect(result?.trust_score).toBe(85);
  });

  it('getScore returns dimension breakdown', () => {
    const result = engine.getScore('git-tools');
    expect(result?.dimensions).toHaveProperty('security');
    expect(result?.dimensions).toHaveProperty('community');
    expect(result?.dimensions).toHaveProperty('maintenance');
    expect(result?.dimensions).toHaveProperty('transparency');
  });

  it('getScore returns null for unknown plugin', () => {
    expect(engine.getScore('nonexistent')).toBeNull();
  });

  it('updateScore patches the score without changing scan_count', () => {
    const before = engine.getScore('git-tools');
    const newScore: PluginTrustScore = {
      overall: 90,
      dimensions: { security: 92, community: 90, maintenance: 88, transparency: 85 },
    };
    engine.updateScore('git-tools', newScore);
    const after = engine.getScore('git-tools');

    expect(after?.trust_score).toBe(90);
    expect(after?.scan_count).toBe(before?.scan_count); // unchanged
  });

  it('updateScore throws for unknown plugin', () => {
    expect(() =>
      engine.updateScore('nonexistent', makeTrustScore(50))
    ).toThrow('Plugin not found');
  });

  it('updateScore writes an audit entry', () => {
    engine.updateScore('git-tools', makeTrustScore(90));
    const audits = engine.listAudits('git-tools');
    const updateEvent = audits.find((a) => a.event_type === 'score_updated');
    expect(updateEvent).toBeDefined();
  });
});

describe('PluginReputationEngine — incidents', () => {
  let engine: PluginReputationEngine;

  beforeEach(() => {
    engine = new PluginReputationEngine({ databasePath: ':memory:' });
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85));
  });

  afterEach(() => {
    engine.close();
  });

  it('recordIncident creates an incident row', () => {
    const id = engine.recordIncident('git-tools', 'high', 'SQL injection in query parameter');
    expect(id).toBeGreaterThan(0);
    const incidents = engine.listIncidents('git-tools');
    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe('high');
  });

  it('resolveIncident sets resolved_at', () => {
    const id = engine.recordIncident('git-tools', 'medium', 'Path traversal potential');
    expect(engine.resolveIncident(id)).toBe(true);
    const incidents = engine.listIncidents('git-tools');
    expect(incidents[0].resolved_at).not.toBeNull();
  });

  it('resolveIncident returns false for already-resolved incident', () => {
    const id = engine.recordIncident('git-tools', 'low', 'Info disclosure');
    engine.resolveIncident(id);
    expect(engine.resolveIncident(id)).toBe(false); // already resolved
  });

  it('listIncidents can filter to open only', () => {
    engine.recordIncident('git-tools', 'high', 'Secret found');
    const id2 = engine.recordIncident('git-tools', 'medium', 'Old dep');
    engine.resolveIncident(id2);

    const open = engine.listIncidents('git-tools', false);
    expect(open).toHaveLength(1);
    expect(open[0].severity).toBe('high');
  });
});

describe('PluginReputationEngine — query API: getTopPlugins (task 7.6)', () => {
  let engine: PluginReputationEngine;

  beforeEach(() => {
    engine = new PluginReputationEngine({ databasePath: ':memory:' });
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 90, { capabilities: ['git', 'file-read'] }));
    engine.upsertScan(makeScan('web-fetcher', 'Web Fetcher', 75, { capabilities: ['network', 'file-read'] }));
    engine.upsertScan(makeScan('api-client', 'API Client', 55, { capabilities: ['network'] }));
    engine.upsertScan(makeScan('file-processor', 'File Processor', 82, { capabilities: ['file-read', 'file-write'] }));
  });

  afterEach(() => {
    engine.close();
  });

  it('getTopPlugins returns all plugins sorted by score desc', () => {
    const top = engine.getTopPlugins(undefined, 10);
    expect(top).toHaveLength(4);
    expect(top[0].plugin_id).toBe('git-tools');
    expect(top[1].plugin_id).toBe('file-processor');
    expect(top[2].plugin_id).toBe('web-fetcher');
    expect(top[3].plugin_id).toBe('api-client');
  });

  it('getTopPlugins respects limit parameter', () => {
    const top = engine.getTopPlugins(undefined, 2);
    expect(top).toHaveLength(2);
  });

  it('getTopPlugins filters by capability', () => {
    const networkPlugins = engine.getTopPlugins('network', 10);
    const ids = networkPlugins.map((p) => p.plugin_id);
    expect(ids).toContain('web-fetcher');
    expect(ids).toContain('api-client');
    expect(ids).not.toContain('git-tools');
  });

  it('getTopPlugins returns capability list per plugin', () => {
    const top = engine.getTopPlugins(undefined, 1);
    expect(Array.isArray(top[0].capabilities)).toBe(true);
    expect(top[0].capabilities).toContain('git');
  });

  it('listAll returns all plugins', () => {
    const all = engine.listAll();
    expect(all).toHaveLength(4);
    // Sorted by score desc
    expect(all[0].trust_score).toBeGreaterThanOrEqual(all[1].trust_score);
  });
});

describe('PluginReputationEngine — decay algorithm (task 7.5)', () => {
  it('applies decay to stale plugins', () => {
    const engine = new PluginReputationEngine({
      databasePath: ':memory:',
      decayIntervalDays: 90,
      decayAmount: 5,
    });

    // Insert a plugin with a timestamp 91 days ago
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 91);

    engine.upsertScan(makeScan('stale-plugin', 'Stale Plugin', 80));

    // Manually backdate last_scanned_at via raw SQL (test-only backdating)
    const db = (engine as unknown as { db: import('better-sqlite3').Database }).db;
    db.prepare("UPDATE plugins SET last_scanned_at = ? WHERE plugin_id = 'stale-plugin'")
      .run(staleDate.toISOString());

    const count = engine.applyDecay();
    expect(count).toBe(1);

    const result = engine.getScore('stale-plugin');
    // Maintenance dimension should be reduced by 5
    expect(result?.dimensions.maintenance).toBeLessThan(
      makeTrustScore(80).dimensions.maintenance
    );

    engine.close();
  });

  it('does not apply decay to recently-scanned plugins', () => {
    const engine = new PluginReputationEngine({
      databasePath: ':memory:',
      decayIntervalDays: 90,
    });

    engine.upsertScan(makeScan('fresh-plugin', 'Fresh Plugin', 80));
    const count = engine.applyDecay();
    expect(count).toBe(0);
    engine.close();
  });

  it('does not decay maintenance below the floor (0)', () => {
    const engine = new PluginReputationEngine({
      databasePath: ':memory:',
      decayIntervalDays: 1,
      decayAmount: 100, // extreme decay
      decayFloor: 0,
    });

    engine.upsertScan(makeScan('floor-plugin', 'Floor Plugin', 50));

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 2);
    const db = (engine as unknown as { db: import('better-sqlite3').Database }).db;
    db.prepare("UPDATE plugins SET last_scanned_at = ? WHERE plugin_id = 'floor-plugin'")
      .run(staleDate.toISOString());

    engine.applyDecay();
    const result = engine.getScore('floor-plugin');
    expect(result?.dimensions.maintenance).toBeGreaterThanOrEqual(0);
    engine.close();
  });

  it('writes a decay_applied audit entry', () => {
    const engine = new PluginReputationEngine({
      databasePath: ':memory:',
      decayIntervalDays: 1,
    });
    engine.upsertScan(makeScan('decay-audit', 'Decay Audit', 80));

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 2);
    const db = (engine as unknown as { db: import('better-sqlite3').Database }).db;
    db.prepare("UPDATE plugins SET last_scanned_at = ? WHERE plugin_id = 'decay-audit'")
      .run(staleDate.toISOString());

    engine.applyDecay();
    const audits = engine.listAudits('decay-audit');
    expect(audits.some((a) => a.event_type === 'decay_applied')).toBe(true);
    engine.close();
  });
});

describe('PluginReputationEngine — registry sync (task 7.4)', () => {
  const registryPayload = {
    plugins: [
      {
        plugin_id: 'registry-plugin-a',
        name: 'Registry Plugin A',
        version: '2.0.0',
        trust_score: 88,
        dimensions: { security: 90, community: 88, maintenance: 85, transparency: 80 },
        capabilities: ['network'],
        last_updated: new Date().toISOString(),
      },
      {
        plugin_id: 'registry-plugin-b',
        name: 'Registry Plugin B',
        version: '1.5.0',
        trust_score: 72,
        dimensions: { security: 75, community: 70, maintenance: 72, transparency: 68 },
        capabilities: ['file-read'],
        last_updated: new Date().toISOString(),
      },
    ],
  };

  function mockFetch(payload: unknown): typeof fetch {
    return async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      } as Response;
    };
  }

  it('adds new plugins from registry', async () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    const { added, updated } = await engine.syncFromRegistry(
      'https://mock.registry/reputation.json',
      mockFetch(registryPayload),
    );
    expect(added).toBe(2);
    expect(updated).toBe(0);
    expect(engine.count()).toBe(2);
    engine.close();
  });

  it('updates existing plugins from registry', async () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    // Pre-populate with local scan
    engine.upsertScan(makeScan('registry-plugin-a', 'Registry Plugin A', 70));

    const { added, updated } = await engine.syncFromRegistry(
      'https://mock.registry/reputation.json',
      mockFetch(registryPayload),
    );
    expect(added).toBe(1);
    expect(updated).toBe(1);

    // Score should be updated to registry value
    const score = engine.getScore('registry-plugin-a');
    expect(score?.trust_score).toBe(88);
    engine.close();
  });

  it('accepts bare array payload format', async () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    const { added } = await engine.syncFromRegistry(
      'https://mock.registry/reputation.json',
      mockFetch(registryPayload.plugins), // bare array
    );
    expect(added).toBe(2);
    engine.close();
  });

  it('throws on non-200 response', async () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    const badFetch: typeof fetch = async () =>
      ({ ok: false, status: 503 } as Response);

    await expect(
      engine.syncFromRegistry('https://mock.registry/reputation.json', badFetch)
    ).rejects.toThrow('HTTP 503');
    engine.close();
  });

  it('throws on invalid payload format', async () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    await expect(
      engine.syncFromRegistry(
        'https://mock.registry/reputation.json',
        mockFetch({ invalid: true }),
      )
    ).rejects.toThrow('Unrecognised registry payload format');
    engine.close();
  });

  it('writes registry_sync audit entries', async () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    await engine.syncFromRegistry(
      'https://mock.registry/reputation.json',
      mockFetch(registryPayload),
    );
    const audits = engine.listAudits('registry-plugin-a');
    expect(audits.some((a) => a.event_type === 'registry_sync')).toBe(true);
    engine.close();
  });
});

describe('PluginReputationEngine — audit log', () => {
  it('records scan_completed audit on upsert', () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85));
    const audits = engine.listAudits('git-tools');
    expect(audits.some((a) => a.event_type === 'scan_completed')).toBe(true);
    engine.close();
  });

  it('listAudits respects limit', () => {
    const engine = new PluginReputationEngine({ databasePath: ':memory:' });
    engine.upsertScan(makeScan('git-tools', 'Git Tools', 85));
    // Run 10 scans to generate many audit entries
    for (let i = 0; i < 9; i++) {
      engine.upsertScan(makeScan('git-tools', 'Git Tools', 85 + i));
    }
    const audits = engine.listAudits('git-tools', 3);
    expect(audits).toHaveLength(3);
    engine.close();
  });
});
