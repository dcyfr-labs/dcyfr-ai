/**
 * Plugin Reputation Types
 *
 * Type definitions for the plugin marketplace reputation database.
 * Distinct from the agent delegation reputation engine —
 * this module tracks plugin-level trust over time.
 *
 * @module plugins/reputation/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Plugin record
// ---------------------------------------------------------------------------

/** A plugin's persisted reputation profile */
export interface PluginReputationRecord {
  /** Unique plugin identifier (e.g. "git-tools") */
  plugin_id: string;

  /** Display name */
  name: string;

  /** Semver version string of the last-scanned release */
  version: string;

  /** Capabilities list as a JSON array string (e.g. '["git","file-read"]') */
  capabilities_json: string;

  /** Overall trust score 0–100 */
  trust_score: number;

  /** Dimension sub-scores as a JSON object string */
  trust_dimensions_json: string;

  /** Last security scan timestamp (ISO-8601) */
  last_scanned_at: string;

  /** Total number of security scans recorded */
  scan_count: number;

  /** When this plugin was first approved (ISO-8601 or NULL) */
  approved_at: string | null;

  /**
   * Source of authoritative reputation data.
   * 'local' = scan only; 'registry' = merged from central registry.
   */
  registry_source: 'local' | 'registry';

  /** Created row timestamp (ISO-8601) */
  created_at: string;

  /** Updated row timestamp (ISO-8601) */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Incident record
// ---------------------------------------------------------------------------

/** Severity level for security incidents */
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A recorded security or compliance incident for a plugin */
export interface PluginIncidentRecord {
  /** Row ID (auto-assigned by SQLite) */
  id: number;

  /** Plugin ID this incident belongs to */
  plugin_id: string;

  /** Severity classification */
  severity: IncidentSeverity;

  /** Human-readable description */
  description: string;

  /** When the incident was detected (ISO-8601) */
  detected_at: string;

  /** When the incident was resolved, or NULL if still open */
  resolved_at: string | null;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/** Types of audit events */
export type AuditEventType =
  | 'scan_completed'
  | 'score_updated'
  | 'incident_recorded'
  | 'incident_resolved'
  | 'decay_applied'
  | 'registry_sync'
  | 'plugin_approved'
  | 'plugin_rejected';

/** A single audit trail entry */
export interface PluginAuditRecord {
  /** Row ID (auto-assigned by SQLite) */
  id: number;

  /** Plugin this event belongs to */
  plugin_id: string;

  /** Event classification */
  event_type: AuditEventType;

  /** JSON-encoded event metadata */
  event_data_json: string;

  /** When the event occurred (ISO-8601) */
  created_at: string;
}

// ---------------------------------------------------------------------------
// Engine API types
// ---------------------------------------------------------------------------

/** Trust score with dimension breakdown (mirrors security types for consistency) */
export interface PluginTrustScore {
  /** Overall score 0–100 */
  overall: number;

  /** Dimension sub-scores */
  dimensions: {
    security: number;
    community: number;
    maintenance: number;
    transparency: number;
  };
}

/** Input when upserting a plugin scan result */
export interface UpsertScanInput {
  plugin_id: string;
  name: string;
  version: string;
  capabilities?: string[];
  trustScore: PluginTrustScore;
  approved?: boolean;
  registrySource?: 'local' | 'registry';
}

/** Row returned by getScore() */
export interface PluginScoreResult {
  plugin_id: string;
  name: string;
  version: string;
  trust_score: number;
  dimensions: PluginTrustScore['dimensions'];
  scan_count: number;
  last_scanned_at: string;
  approved_at: string | null;
}

/** Row returned by getTopPlugins() */
export interface TopPluginResult extends PluginScoreResult {
  capabilities: string[];
}

/** Configuration for PluginReputationEngine */
export interface PluginReputationEngineConfig {
  /**
   * Path to the SQLite database.
   * Defaults to `~/.dcyfr/plugin-reputation.db`.
   */
  databasePath?: string;

  /**
   * Central registry URL for weekly sync.
   * Defaults to `https://registry.dcyfr.ai/reputation.json`.
   */
  registryUrl?: string;

  /**
   * Number of days between decay applications.
   * Defaults to 90.
   */
  decayIntervalDays?: number;

  /**
   * Maintenance score reduction applied per decay interval.
   * Defaults to 5.
   */
  decayAmount?: number;

  /** Minimum maintenance score (floor for decay). Defaults to 0. */
  decayFloor?: number;

  /** Enable verbose debug logging. Defaults to false. */
  debug?: boolean;
}

/** Entry in the central registry reputation.json format */
export interface RegistryReputationEntry {
  plugin_id: string;
  name: string;
  version: string;
  trust_score: number;
  dimensions: PluginTrustScore['dimensions'];
  capabilities?: string[];
  last_updated: string;
}
