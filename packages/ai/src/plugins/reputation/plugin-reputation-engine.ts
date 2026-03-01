/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Plugin Reputation Engine
 *
 * Manages plugin trust scores with SQLite persistence, weekly registry sync,
 * and maintenance-score decay.
 *
 * Key features:
 *   • CRUD: upsert scan results, record incidents, query scores
 *   • Trust score storage & retrieval (task 7.3)
 *   • Weekly sync from central registry (task 7.4)
 *   • Decay algorithm: maintenance -5 per 90d without a new scan (task 7.5)
 *   • Query API: getScore(), getTopPlugins() (task 7.6)
 *
 * @module plugins/reputation/plugin-reputation-engine
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import Database from 'better-sqlite3';
import { openReputationDb, DEFAULT_DB_PATH } from './plugin-reputation-db.js';
import type {
  PluginReputationEngineConfig,
  PluginReputationRecord,
  PluginIncidentRecord,
  PluginAuditRecord,
  PluginScoreResult,
  TopPluginResult,
  UpsertScanInput,
  AuditEventType,
  IncidentSeverity,
  RegistryReputationEntry,
  PluginTrustScore,
} from './types.js';

// Re-export types for convenience
export type {
  PluginReputationEngineConfig,
  PluginReputationRecord,
  PluginIncidentRecord,
  PluginAuditRecord,
  PluginScoreResult,
  TopPluginResult,
  UpsertScanInput,
  AuditEventType,
  IncidentSeverity,
  RegistryReputationEntry,
  PluginTrustScore,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY_URL = 'https://registry.dcyfr.ai/reputation.json';
const DEFAULT_DECAY_INTERVAL_DAYS = 90;
const DEFAULT_DECAY_AMOUNT = 5;
const DEFAULT_DECAY_FLOOR = 0;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Plugin Reputation Engine
 *
 * Single-instance, synchronous (except for the async `syncFromRegistry()`).
 * Uses better-sqlite3's synchronous API for all DB operations.
 */
export class PluginReputationEngine {
  private db: Database.Database;
  private registryUrl: string;
  private decayIntervalDays: number;
  private decayAmount: number;
  private decayFloor: number;
  private debug: boolean;

  constructor(config: PluginReputationEngineConfig = {}) {
    const dbPath = config.databasePath ?? DEFAULT_DB_PATH;
    this.db = openReputationDb(dbPath);
    this.registryUrl = config.registryUrl ?? DEFAULT_REGISTRY_URL;
    this.decayIntervalDays = config.decayIntervalDays ?? DEFAULT_DECAY_INTERVAL_DAYS;
    this.decayAmount = config.decayAmount ?? DEFAULT_DECAY_AMOUNT;
    this.decayFloor = config.decayFloor ?? DEFAULT_DECAY_FLOOR;
    this.debug = config.debug ?? false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Close the database connection. Call when the engine is no longer needed. */
  close(): void {
    this.db.close();
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /**
   * Upsert a plugin scan result.
   * Creates a new row on first scan; updates existing row on re-scan.
   * Increments `scan_count` and writes an audit entry.
   */
  upsertScan(input: UpsertScanInput): void {
    const now = new Date().toISOString();
    const capabilitiesJson = JSON.stringify(input.capabilities ?? []);
    const dimensionsJson = JSON.stringify(input.trustScore.dimensions);
    const approvedAt = input.approved ? now : null;
    const registrySource = input.registrySource ?? 'local';

    this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT scan_count, created_at, approved_at FROM plugins WHERE plugin_id = ?')
        .get(input.plugin_id) as
        | { scan_count: number; created_at: string; approved_at: string | null }
        | undefined;

      if (existing) {
        this.db
          .prepare(/* sql */ `
            UPDATE plugins SET
              name                  = @name,
              version               = @version,
              capabilities_json     = @capabilitiesJson,
              trust_score           = @trustScore,
              trust_dimensions_json = @dimensionsJson,
              last_scanned_at       = @now,
              scan_count            = @scanCount,
              approved_at           = COALESCE(@approvedAt, approved_at),
              registry_source       = @registrySource,
              updated_at            = @now
            WHERE plugin_id = @pluginId
          `)
          .run({
            name: input.name,
            version: input.version,
            capabilitiesJson,
            trustScore: input.trustScore.overall,
            dimensionsJson,
            now,
            scanCount: existing.scan_count + 1,
            approvedAt: approvedAt ?? null,
            registrySource,
            pluginId: input.plugin_id,
          });
      } else {
        this.db
          .prepare(/* sql */ `
            INSERT INTO plugins (
              plugin_id, name, version, capabilities_json,
              trust_score, trust_dimensions_json, last_scanned_at,
              scan_count, approved_at, registry_source,
              created_at, updated_at
            ) VALUES (
              @pluginId, @name, @version, @capabilitiesJson,
              @trustScore, @dimensionsJson, @now,
              1, @approvedAt, @registrySource,
              @now, @now
            )
          `)
          .run({
            pluginId: input.plugin_id,
            name: input.name,
            version: input.version,
            capabilitiesJson,
            trustScore: input.trustScore.overall,
            dimensionsJson,
            now,
            approvedAt: approvedAt ?? null,
            registrySource,
          });
      }

      this._appendAudit(input.plugin_id, 'scan_completed', {
        version: input.version,
        trust_score: input.trustScore.overall,
        recommendation: this._scoreToRecommendation(input.trustScore.overall),
      });

      if (input.approved) {
        this._appendAudit(input.plugin_id, 'plugin_approved', {
          trust_score: input.trustScore.overall,
        });
      }
    })();

    this._log(`upsertScan: ${input.plugin_id} → score=${input.trustScore.overall}`);
  }

  /**
   * Delete a plugin and all its associated incidents / audits.
   * Foreign-key cascade handles child rows.
   */
  deletePlugin(pluginId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM plugins WHERE plugin_id = ?')
      .run(pluginId);
    
    if (result.changes > 0) {
      // Audits for deleted plugins are kept (no FK ref) — just orphaned
      // Clean them up manually
      this.db.prepare('DELETE FROM audits WHERE plugin_id = ?').run(pluginId);
      this._log(`deletePlugin: removed ${pluginId}`);
      return true;
    }
    return false;
  }

  // ── Trust score ────────────────────────────────────────────────────────────

  /**
   * Store / update a trust score for a plugin that already exists.
   * Use `upsertScan` for new scans; this is for score-only patches
   * (e.g. after a registry merge).
   */
  updateScore(pluginId: string, trustScore: PluginTrustScore): void {
    const now = new Date().toISOString();
    const dimensionsJson = JSON.stringify(trustScore.dimensions);

    const result = this.db
      .prepare(/* sql */ `
        UPDATE plugins SET
          trust_score           = @score,
          trust_dimensions_json = @dimensionsJson,
          updated_at            = @now
        WHERE plugin_id = @pluginId
      `)
      .run({ score: trustScore.overall, dimensionsJson, now, pluginId });

    if (result.changes === 0) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    this._appendAudit(pluginId, 'score_updated', { trust_score: trustScore.overall });
    this._log(`updateScore: ${pluginId} → ${trustScore.overall}`);
  }

  /**
   * Retrieve the trust score for a plugin.
   * Returns null if the plugin is not in the database.
   */
  getScore(pluginId: string): PluginScoreResult | null {
    const row = this.db
      .prepare(/* sql */ `
        SELECT
          plugin_id, name, version, trust_score,
          trust_dimensions_json, scan_count, last_scanned_at, approved_at
        FROM plugins
        WHERE plugin_id = ?
      `)
      .get(pluginId) as
      | (Omit<PluginScoreResult, 'dimensions'> & { trust_dimensions_json: string })
      | undefined;

    if (!row) return null;

    return {
      plugin_id: row.plugin_id,
      name: row.name,
      version: row.version,
      trust_score: row.trust_score,
      dimensions: JSON.parse(row.trust_dimensions_json) as PluginTrustScore['dimensions'],
      scan_count: row.scan_count,
      last_scanned_at: row.last_scanned_at,
      approved_at: row.approved_at,
    };
  }

  // ── Incidents ──────────────────────────────────────────────────────────────

  /**
   * Record a security or compliance incident for a plugin.
   * Returns the newly created incident's row ID.
   */
  recordIncident(
    pluginId: string,
    severity: IncidentSeverity,
    description: string,
  ): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(/* sql */ `
        INSERT INTO incidents (plugin_id, severity, description, detected_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(pluginId, severity, description, now);

    this._appendAudit(pluginId, 'incident_recorded', { severity, description });
    this._log(`recordIncident: ${pluginId} [${severity}] — ${description}`);

    return result.lastInsertRowid as number;
  }

  /**
   * Mark an existing incident as resolved.
   * Returns `true` if a row was updated.
   */
  resolveIncident(incidentId: number): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        'UPDATE incidents SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL'
      )
      .run(now, incidentId);

    if (result.changes > 0) {
      // Look up plugin_id for the audit entry
      const inc = this.db
        .prepare('SELECT plugin_id, severity FROM incidents WHERE id = ?')
        .get(incidentId) as { plugin_id: string; severity: string } | undefined;
      if (inc) {
        this._appendAudit(inc.plugin_id, 'incident_resolved', { incident_id: incidentId });
      }
      return true;
    }
    return false;
  }

  /** List all incidents for a plugin, newest first. */
  listIncidents(pluginId: string, includeResolved = true): PluginIncidentRecord[] {
    const sql = includeResolved
      ? 'SELECT * FROM incidents WHERE plugin_id = ? ORDER BY detected_at DESC'
      : 'SELECT * FROM incidents WHERE plugin_id = ? AND resolved_at IS NULL ORDER BY detected_at DESC';
    return this.db.prepare(sql).all(pluginId) as PluginIncidentRecord[];
  }

  // ── Query API (task 7.6) ──────────────────────────────────────────────────

  /**
   * Return the top-N plugins by trust score.
   *
   * @param capability - Optional capability filter (e.g. `"git"`).
   *   Matches plugins whose capabilities_json array contains the given string.
   * @param limit - Maximum number of results to return (default 10).
   */
  getTopPlugins(capability?: string, limit = 10): TopPluginResult[] {
    const allRows = this.db
      .prepare(/* sql */ `
        SELECT
          plugin_id, name, version, trust_score,
          trust_dimensions_json, capabilities_json,
          scan_count, last_scanned_at, approved_at
        FROM plugins
        ORDER BY trust_score DESC
      `)
      .all() as any[];

    const matched = capability
      ? allRows.filter((r) => {
          const caps: string[] = JSON.parse(r.capabilities_json);
          return caps.includes(capability);
        })
      : allRows;

    return matched.slice(0, limit).map((r) => ({
      plugin_id: r.plugin_id,
      name: r.name,
      version: r.version,
      trust_score: r.trust_score,
      dimensions: JSON.parse(r.trust_dimensions_json) as PluginTrustScore['dimensions'],
      capabilities: JSON.parse(r.capabilities_json) as string[],
      scan_count: r.scan_count,
      last_scanned_at: r.last_scanned_at,
      approved_at: r.approved_at as string | null,
    }));
  }

  /** List all plugins, ordered by trust_score descending. */
  listAll(): PluginScoreResult[] {
    const rows = this.db
      .prepare(/* sql */ `
        SELECT
          plugin_id, name, version, trust_score,
          trust_dimensions_json, scan_count, last_scanned_at, approved_at
        FROM plugins
        ORDER BY trust_score DESC
      `)
      .all() as any[];

    return rows.map((r) => ({
      plugin_id: r.plugin_id,
      name: r.name,
      version: r.version,
      trust_score: r.trust_score,
      dimensions: JSON.parse(r.trust_dimensions_json) as PluginTrustScore['dimensions'],
      scan_count: r.scan_count,
      last_scanned_at: r.last_scanned_at,
      approved_at: r.approved_at as string | null,
    }));
  }

  // ── Decay algorithm (task 7.5) ─────────────────────────────────────────────

  /**
   * Apply maintenance-score decay to plugins that haven't been scanned
   * within the configured `decayIntervalDays`.
   *
   * For each qualifying plugin, `maintenance` dimension is decreased by
   * `decayAmount` (default 5), clamped at `decayFloor` (default 0),
   * and the overall trust score is recalculated proportionally.
   *
   * Returns the number of plugins that had decay applied.
   */
  applyDecay(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.decayIntervalDays);
    const cutoffIso = cutoff.toISOString();

    const stale = this.db
      .prepare(/* sql */ `
        SELECT plugin_id, trust_score, trust_dimensions_json
        FROM plugins
        WHERE last_scanned_at < ?
      `)
      .all(cutoffIso) as Array<{
      plugin_id: string;
      trust_score: number;
      trust_dimensions_json: string;
    }>;

    let count = 0;
    const now = new Date().toISOString();

    for (const row of stale) {
      const dims = JSON.parse(row.trust_dimensions_json) as PluginTrustScore['dimensions'];

      const oldMaintenance = dims.maintenance;
      const newMaintenance = Math.max(this.decayFloor, oldMaintenance - this.decayAmount);

      if (newMaintenance === oldMaintenance) continue; // already at floor

      const decayedDims = { ...dims, maintenance: newMaintenance };
      // Recalculate overall score with same weights as TrustScore calculation
      // (security 40%, community 30%, maintenance 20%, transparency 10%)
      const newOverall = Math.round(
        decayedDims.security * 0.4 +
        decayedDims.community * 0.3 +
        decayedDims.maintenance * 0.2 +
        decayedDims.transparency * 0.1
      );

      this.db
        .prepare(/* sql */ `
          UPDATE plugins SET
            trust_score           = @overall,
            trust_dimensions_json = @dimensionsJson,
            updated_at            = @now
          WHERE plugin_id = @pluginId
        `)
        .run({
          overall: newOverall,
          dimensionsJson: JSON.stringify(decayedDims),
          now,
          pluginId: row.plugin_id,
        });

      this._appendAudit(row.plugin_id, 'decay_applied', {
        old_maintenance: oldMaintenance,
        new_maintenance: newMaintenance,
        old_score: row.trust_score,
        new_score: newOverall,
        decay_amount: this.decayAmount,
      });

      count++;
      this._log(
        `applyDecay: ${row.plugin_id} maintenance ${oldMaintenance}→${newMaintenance}, score ${row.trust_score}→${newOverall}`,
      );
    }

    return count;
  }

  // ── Registry sync (task 7.4) ──────────────────────────────────────────────

  /**
   * Download the central registry's `reputation.json` and merge entries
   * into the local database.
   *
   * Registry data takes precedence over local scores for `approved_at` and
   * `trust_score`, but local scans preserve their `scan_count`.
   *
   * Returns `{ added, updated, skipped }` counts.
   */
  async syncFromRegistry(
    overrideUrl?: string,
    fetchFn: typeof fetch = globalThis.fetch,
  ): Promise<{ added: number; updated: number; skipped: number }> {
    const url = overrideUrl ?? this.registryUrl;
    let entries: RegistryReputationEntry[];

    try {
      const response = await fetchFn(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': '@dcyfr/ai plugin-reputation-engine' },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const json = await response.json() as unknown;
      entries = this._parseRegistryPayload(json);
    } catch (err) {
      this._log(`syncFromRegistry error: ${(err as Error).message}`);
      throw err;
    }

    let added = 0;
    let updated = 0;
    const skipped = 0;
    const now = new Date().toISOString();

    for (const entry of entries) {
      const existing = this.db
        .prepare('SELECT scan_count, approved_at FROM plugins WHERE plugin_id = ?')
        .get(entry.plugin_id) as
        | { scan_count: number; approved_at: string | null }
        | undefined;

      const dimensionsJson = JSON.stringify(entry.dimensions);
      const capabilitiesJson = JSON.stringify(entry.capabilities ?? []);

      if (existing) {
        this.db
          .prepare(/* sql */ `
            UPDATE plugins SET
              name                  = @name,
              version               = @version,
              capabilities_json     = @capabilitiesJson,
              trust_score           = @trustScore,
              trust_dimensions_json = @dimensionsJson,
              last_scanned_at       = @lastUpdated,
              registry_source       = 'registry',
              updated_at            = @now
            WHERE plugin_id = @pluginId
          `)
          .run({
            name: entry.name,
            version: entry.version,
            capabilitiesJson,
            trustScore: entry.trust_score,
            dimensionsJson,
            lastUpdated: entry.last_updated,
            now,
            pluginId: entry.plugin_id,
          });
        updated++;
      } else {
        this.db
          .prepare(/* sql */ `
            INSERT INTO plugins (
              plugin_id, name, version, capabilities_json,
              trust_score, trust_dimensions_json,
              last_scanned_at, scan_count,
              approved_at, registry_source,
              created_at, updated_at
            ) VALUES (
              @pluginId, @name, @version, @capabilitiesJson,
              @trustScore, @dimensionsJson,
              @lastUpdated, 0,
              NULL, 'registry',
              @now, @now
            )
          `)
          .run({
            pluginId: entry.plugin_id,
            name: entry.name,
            version: entry.version,
            capabilitiesJson,
            trustScore: entry.trust_score,
            dimensionsJson,
            lastUpdated: entry.last_updated,
            now,
          });
        added++;
      }

      this._appendAudit(entry.plugin_id, 'registry_sync', {
        version: entry.version,
        trust_score: entry.trust_score,
        action: existing ? 'updated' : 'added',
      });
    }

    this._log(`syncFromRegistry: added=${added} updated=${updated} skipped=${skipped}`);
    return { added, updated, skipped };
  }

  // ── Audit log ──────────────────────────────────────────────────────────────

  /** List audit events for a plugin, newest first. */
  listAudits(pluginId: string, limit = 50): PluginAuditRecord[] {
    return this.db
      .prepare(
        'SELECT * FROM audits WHERE plugin_id = ? ORDER BY created_at DESC LIMIT ?'
      )
      .all(pluginId, limit) as PluginAuditRecord[];
  }

  /** Return total plugin count in the database. */
  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM plugins')
      .get() as { n: number };
    return row.n;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _appendAudit(
    pluginId: string,
    eventType: AuditEventType,
    data: Record<string, unknown> = {},
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(/* sql */ `
        INSERT INTO audits (plugin_id, event_type, event_data_json, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(pluginId, eventType, JSON.stringify(data), now);
  }

  private _scoreToRecommendation(
    score: number,
  ): 'approve' | 'approve-with-warnings' | 'require-review' | 'reject' {
    if (score >= 80) return 'approve';
    if (score >= 65) return 'approve-with-warnings';
    if (score >= 50) return 'require-review';
    return 'reject';
  }

  private _parseRegistryPayload(json: unknown): RegistryReputationEntry[] {
    // Registry payload may be `{ plugins: [...] }` or a bare array
    if (Array.isArray(json)) return json as RegistryReputationEntry[];
    if (json && typeof json === 'object' && 'plugins' in json) {
      return (json as { plugins: RegistryReputationEntry[] }).plugins;
    }
    throw new Error('Unrecognised registry payload format');
  }

  private _log(msg: string): void {
    if (this.debug) {
      console.debug(`[PluginReputationEngine] ${msg}`);
    }
  }
}
