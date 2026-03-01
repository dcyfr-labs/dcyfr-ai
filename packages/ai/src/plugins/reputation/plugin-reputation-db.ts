/**
 * Plugin Reputation Database
 *
 * SQLite schema initialisation and low-level helpers.
 * Uses better-sqlite3 (already a dependency of @dcyfr/ai).
 *
 * Schema:
 *   plugins   — one row per plugin; stores latest trust score + metadata
 *   incidents — security / compliance incidents (N per plugin)
 *   audits    — append-only event log (N per plugin)
 *
 * @module plugins/reputation/plugin-reputation-db
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Default path
// ---------------------------------------------------------------------------

export const DEFAULT_DB_PATH = resolve(homedir(), '.dcyfr', 'plugin-reputation.db');

// ---------------------------------------------------------------------------
// Schema DDL
// ---------------------------------------------------------------------------

const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── plugins ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plugins (
  plugin_id            TEXT     PRIMARY KEY,
  name                 TEXT     NOT NULL,
  version              TEXT     NOT NULL,
  capabilities_json    TEXT     NOT NULL DEFAULT '[]',
  trust_score          REAL     NOT NULL DEFAULT 0,
  trust_dimensions_json TEXT    NOT NULL DEFAULT '{}',
  last_scanned_at      TEXT     NOT NULL,
  scan_count           INTEGER  NOT NULL DEFAULT 0,
  approved_at          TEXT,
  registry_source      TEXT     NOT NULL DEFAULT 'local'
                       CHECK (registry_source IN ('local', 'registry')),
  created_at           TEXT     NOT NULL,
  updated_at           TEXT     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plugins_trust_score
  ON plugins (trust_score DESC);

CREATE INDEX IF NOT EXISTS idx_plugins_last_scanned
  ON plugins (last_scanned_at);

-- ── incidents ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  plugin_id    TEXT     NOT NULL REFERENCES plugins (plugin_id) ON DELETE CASCADE,
  severity     TEXT     NOT NULL
               CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  description  TEXT     NOT NULL,
  detected_at  TEXT     NOT NULL,
  resolved_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_plugin_id
  ON incidents (plugin_id);

CREATE INDEX IF NOT EXISTS idx_incidents_severity
  ON incidents (severity);

-- ── audits ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audits (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  plugin_id       TEXT     NOT NULL,
  event_type      TEXT     NOT NULL,
  event_data_json TEXT     NOT NULL DEFAULT '{}',
  created_at      TEXT     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audits_plugin_id
  ON audits (plugin_id);

CREATE INDEX IF NOT EXISTS idx_audits_event_type
  ON audits (event_type);

-- ── schema_version ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, applied_at)
  VALUES (1, datetime('now'));
`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Open (or create) the plugin reputation SQLite database.
 * Creates parent directories if they don't exist.
 */
export function openReputationDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(SCHEMA_SQL);
  return db;
}

/**
 * Return the schema version recorded in the DB.
 * Returns 0 if the table is empty (fresh database).
 */
export function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  ).get() as { version: number } | undefined;
  return row?.version ?? 0;
}
