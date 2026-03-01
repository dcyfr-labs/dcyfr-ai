/**
 * Behavioral Anomaly Detection — Types
 *
 * All type definitions for the plugin behavioral anomaly detection system.
 * Implements Phase 16 (Behavioral Anomaly Detection) of the Plugin Marketplace
 * Security roadmap.
 *
 * @module plugins/anomaly/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Metric observations
// ---------------------------------------------------------------------------

/** Metrics captured from a single plugin execution run. */
export interface PluginMetricSample {
  /** Stable plugin identifier (e.g. "my-plugin@1.0.0"). */
  plugin_id: string;
  /** Unique UUID for this execution run. */
  run_id: string;
  /** ISO 8601 timestamp of when the sample was captured. */
  measured_at: string;
  /** Total filesystem system calls (reads + writes + stats). */
  filesystem_ops: number;
  /** Total outbound HTTP/HTTPS requests made during the run. */
  network_requests: number;
  /** Average CPU utilisation as a percentage (0–100). */
  cpu_percent: number;
  /** Peak resident set size in megabytes. */
  memory_mb: number;
}

/** The four trackable behavioral metrics. */
export type BehaviorMetric = 'filesystem_ops' | 'network_requests' | 'cpu_percent' | 'memory_mb';

/** All trackable metric names. */
export const BEHAVIOR_METRICS: readonly BehaviorMetric[] = [
  'filesystem_ops',
  'network_requests',
  'cpu_percent',
  'memory_mb',
] as const;

// ---------------------------------------------------------------------------
// Baseline statistics
// ---------------------------------------------------------------------------

/**
 * Rolling statistical baseline for a single plugin + metric pair.
 * Updated via Welford's online algorithm to avoid storing raw samples.
 */
export interface PluginBaseline {
  /** Stable plugin identifier. */
  plugin_id: string;
  /** The metric this baseline applies to. */
  metric: BehaviorMetric;
  /** Current rolling mean. */
  mean: number;
  /** Current rolling standard deviation (population). */
  std_dev: number;
  /** Number of samples incorporated so far. */
  sample_count: number;
  /** ISO 8601 timestamp of the most recent update. */
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

/** Category of anomalous behaviour detected. */
export type AnomalyType =
  | 'filesystem_spike'
  | 'network_spike'
  | 'cpu_spike'
  | 'memory_spike';

/**
 * Anomaly severity levels.
 * - WARNING  → 2–3 standard deviations above mean (investigate)
 * - CRITICAL → >3 standard deviations above mean (auto-suspend eligible)
 */
export type AnomalySeverity = 'WARNING' | 'CRITICAL';

/** A point-in-time anomaly detected during plugin monitoring. */
export interface DetectedAnomaly {
  /** UUID for this anomaly event. */
  id: string;
  /** Plugin that produced the anomaly. */
  plugin_id: string;
  /** Run ID that triggered detection. */
  run_id: string;
  /** Category matching the affected metric. */
  anomaly_type: AnomalyType;
  /** Observed value that exceeded the baseline. */
  metric_value: number;
  /** Baseline mean at detection time. */
  baseline_mean: number;
  /** Baseline std deviation at detection time. */
  baseline_std_dev: number;
  /** How many std deviations the observed value is from the mean. */
  std_devs_from_mean: number;
  /** Severity classification. */
  severity: AnomalySeverity;
  /** ISO 8601 detection timestamp. */
  detected_at: string;
}

// ---------------------------------------------------------------------------
// Human review
// ---------------------------------------------------------------------------

/** Status of an anomaly in the human review queue. */
export type ReviewStatus = 'PENDING_REVIEW' | 'RESOLVED' | 'FALSE_POSITIVE';

/** An anomaly queued for human review. */
export interface AnomalyReviewItem {
  /** UUID matching DetectedAnomaly.id. */
  anomaly_id: string;
  /** Plugin under review. */
  plugin_id: string;
  /** Anomaly category. */
  anomaly_type: AnomalyType;
  /** Severity at time of detection. */
  severity: AnomalySeverity;
  /** Observed metric value. */
  metric_value: number;
  /** Standard deviations from mean. */
  std_devs_from_mean: number;
  /** ISO 8601 detection timestamp. */
  detected_at: string;
  /** Current review status. */
  status: ReviewStatus;
  /** Username / agent ID that reviewed this item. */
  reviewed_by?: string;
  /** ISO 8601 timestamp of resolution. */
  resolved_at?: string;
  /** Free-text notes from the reviewer. */
  resolution_notes?: string;
}

// ---------------------------------------------------------------------------
// Monitor result
// ---------------------------------------------------------------------------

/** Result returned after a full observe-detect-alert cycle. */
export interface AnomalyMonitorResult {
  /** Observed plugin ID. */
  plugin_id: string;
  /** Run ID being monitored. */
  run_id: string;
  /** All anomalies detected in this run. Empty array when clean. */
  anomalies: DetectedAnomaly[];
  /**
   * True when auto-suspend was triggered.
   * Callers should halt execution and await human review before restarting.
   */
  suspended: boolean;
  /** Human-readable reason if `suspended` is true. */
  suspension_reason?: string;
}

// ---------------------------------------------------------------------------
// Axiom integration
// ---------------------------------------------------------------------------

/** Payload sent to Axiom for each anomaly event. */
export interface AnomalyAxiomPayload {
  /** Event source identifier. */
  _source: 'dcyfr-plugin-anomaly-monitor';
  plugin_id: string;
  run_id: string;
  anomaly_id: string;
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  metric_value: number;
  baseline_mean: number;
  std_devs_from_mean: number;
  auto_suspended: boolean;
  detected_at: string;
}

/**
 * Pluggable Axiom logger interface.
 * Inject the real Axiom client in production; use a test double in tests.
 */
export interface AnomalyAxiomLogger {
  logEvent(payload: AnomalyAxiomPayload): Promise<void>;
}

// ---------------------------------------------------------------------------
// SQL schema
// ---------------------------------------------------------------------------

/** DDL for persisting baselines and anomaly records. */
export const ANOMALY_SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS plugin_baselines (
  plugin_id    TEXT NOT NULL,
  metric       TEXT NOT NULL,
  mean         REAL NOT NULL DEFAULT 0,
  std_dev      REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL,
  PRIMARY KEY (plugin_id, metric)
);

CREATE TABLE IF NOT EXISTS plugin_anomalies (
  id                  TEXT PRIMARY KEY,
  plugin_id           TEXT NOT NULL,
  run_id              TEXT NOT NULL,
  anomaly_type        TEXT NOT NULL,
  metric_value        REAL NOT NULL,
  baseline_mean       REAL NOT NULL,
  baseline_std_dev    REAL NOT NULL,
  std_devs_from_mean  REAL NOT NULL,
  severity            TEXT NOT NULL,
  detected_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anomaly_review_queue (
  anomaly_id         TEXT PRIMARY KEY,
  plugin_id          TEXT NOT NULL,
  anomaly_type       TEXT NOT NULL,
  severity           TEXT NOT NULL,
  metric_value       REAL NOT NULL,
  std_devs_from_mean REAL NOT NULL,
  detected_at        TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by        TEXT,
  resolved_at        TEXT,
  resolution_notes   TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomalies_plugin
  ON plugin_anomalies (plugin_id, detected_at);

CREATE INDEX IF NOT EXISTS idx_review_queue_status
  ON anomaly_review_queue (status, detected_at);
`;
