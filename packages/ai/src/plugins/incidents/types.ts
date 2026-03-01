/**
 * Plugin Incident Response SLA — Type Definitions
 *
 * Central type registry for the incident response system.
 * Includes SQL DDL for persisting incidents to a relational store.
 *
 * SLA timers (measured from `createdAt`):
 *   critical (CVSS ≥9.0) — 24 hours
 *   high     (CVSS 7.0–8.9) — 48 hours
 *   medium   (CVSS 4.0–6.9) — 7 days
 *   low      (CVSS 0.1–3.9) — 30 days
 *
 * @module plugins/incidents/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Severity & Status enums
// ---------------------------------------------------------------------------

/** Severity aligned with CVSS v3.1 qualitative scale */
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/** Lifecycle status of a plugin security incident */
export type IncidentStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'sla_breached';

// ---------------------------------------------------------------------------
// SLA configuration
// ---------------------------------------------------------------------------

/** SLA response deadlines in milliseconds per severity */
export interface SlaConfig {
  /** Max ms to resolve a critical incident (default 24h) */
  criticalMs: number;
  /** Max ms to resolve a high incident (default 48h) */
  highMs: number;
  /** Max ms to resolve a medium incident (default 7d) */
  mediumMs: number;
  /** Max ms to resolve a low incident (default 30d) */
  lowMs: number;
}

/** Default SLA configuration */
export const DEFAULT_SLA: SlaConfig = {
  criticalMs: 24 * 60 * 60 * 1000,     // 24 hours
  highMs:     48 * 60 * 60 * 1000,     // 48 hours
  mediumMs:   7 * 24 * 60 * 60 * 1000, // 7 days
  lowMs:      30 * 24 * 60 * 60 * 1000,// 30 days
} as const;

// ---------------------------------------------------------------------------
// Core incident model
// ---------------------------------------------------------------------------

/** A single plugin security incident */
export interface Incident {
  /** Unique UUID for this incident */
  id: string;
  /** Canonical plugin identifier (e.g. "author/plugin-name") */
  pluginId: string;
  /** Human-readable title */
  title: string;
  /** Detailed description of the vulnerability or issue */
  description: string;
  /** CVSS v3.1 numeric score (0.0 – 10.0) */
  cvssScore: number;
  /** Qualitative severity derived from cvssScore */
  severity: IncidentSeverity;
  /** CVE identifier(s), if applicable */
  cveIds: string[];
  /** Current lifecycle status */
  status: IncidentStatus;
  /** ISO-8601 timestamp when the incident was reported */
  createdAt: string;
  /** ISO-8601 timestamp when status changed to 'acknowledged' (or null) */
  acknowledgedAt: string | null;
  /** ISO-8601 timestamp when status changed to 'resolved' or 'closed' */
  resolvedAt: string | null;
  /** ISO-8601 deadline computed from createdAt + SLA for this severity */
  slaDeadline: string;
  /** Whether the plugin was automatically disabled due to CVSS ≥9.0 */
  autoDisabled: boolean;
  /** Assigned responder (name or email) */
  assignee: string | null;
  /** Free-text resolution notes populated on close */
  resolution: string | null;
  /** GitHub issue URL if one was created */
  githubIssueUrl: string | null;
  /** GitHub Security Advisory URL if one was created */
  githubAdvisoryUrl: string | null;
  /** Arbitrary metadata (reporter info, affected versions, etc.) */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input / mutation types
// ---------------------------------------------------------------------------

/** Input to create a new incident */
export interface CreateIncidentInput {
  /** Plugin identifier */
  pluginId: string;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** CVSS v3.1 score */
  cvssScore: number;
  /** CVE IDs (optional) */
  cveIds?: string[];
  /** Arbitrary additional metadata */
  metadata?: Record<string, unknown>;
}

/** Input to acknowledge an incident */
export interface AcknowledgeIncidentInput {
  /** Incident UUID */
  id: string;
  /** Person or system acknowledging */
  assignee: string;
}

/** Input to resolve or close an incident */
export interface ResolveIncidentInput {
  /** Incident UUID */
  id: string;
  /** Human-readable resolution summary */
  resolution: string;
  /** 'resolved' = fix deployed; 'closed' = won't fix / false positive */
  finalStatus?: 'resolved' | 'closed';
}

// ---------------------------------------------------------------------------
// Query / listing
// ---------------------------------------------------------------------------

/** Options for listing incidents */
export interface ListIncidentsOptions {
  /** Filter by plugin */
  pluginId?: string;
  /** Filter by status */
  status?: IncidentStatus | IncidentStatus[];
  /** Filter by severity */
  severity?: IncidentSeverity | IncidentSeverity[];
  /** Include only SLA-breached incidents */
  slaBreached?: boolean;
  /** Page number (1-based, default 1) */
  page?: number;
  /** Page size (default 20, max 100) */
  pageSize?: number;
}

/** Paginated incident listing */
export interface IncidentPage {
  items: Incident[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Notification / integration stubs
// ---------------------------------------------------------------------------

/** Payload passed to email notifier */
export interface EmailNotificationPayload {
  incident: Incident;
  /** List of affected user emails to notify */
  affectedUsers: string[];
  /** Email subject */
  subject: string;
  /** Plain-text body */
  body: string;
}

/** Payload passed to GitHub issue creator */
export interface GithubIssuePayload {
  incident: Incident;
  /** Repo where the issue should be filed (e.g. "dcyfr/dcyfr-plugins") */
  repo: string;
  /** GitHub issue title */
  title: string;
  /** Markdown body */
  body: string;
  /** Label names to apply */
  labels: string[];
}

/** Payload passed to GitHub Security Advisory creator */
export interface GithubAdvisoryPayload {
  incident: Incident;
  repo: string;
  /** Advisory summary (≤ 128 chars) */
  summary: string;
  /** Full description in Markdown */
  description: string;
  /** CVSS vector string (optional) */
  cvssVectorString?: string;
  /** GHSA severity mapping */
  ghsaSeverity: 'critical' | 'high' | 'medium' | 'low';
}

/** Payload passed to Axiom alert sender */
export interface AxiomAlertPayload {
  incident: Incident;
  alertType: 'sla_breach' | 'auto_disable' | 'new_critical';
  message: string;
}

// ---------------------------------------------------------------------------
// External integration interfaces (pluggable adapters)
// ---------------------------------------------------------------------------

/** Pluggable email notifier — inject your provider (SendGrid, SES, etc.) */
export interface EmailNotifier {
  send(payload: EmailNotificationPayload): Promise<void>;
}

/** Pluggable GitHub client — inject real Octokit or a test double */
export interface GithubClient {
  createIssue(payload: GithubIssuePayload): Promise<string | null>;
  createSecurityAdvisory(payload: GithubAdvisoryPayload): Promise<string | null>;
}

/** Pluggable Axiom logger — inject real Axiom client or a test double */
export interface AxiomLogger {
  logAlert(payload: AxiomAlertPayload): Promise<void>;
}

// ---------------------------------------------------------------------------
// SQL DDL
// ---------------------------------------------------------------------------

export const PLUGIN_INCIDENTS_SCHEMA_SQL = /* sql */`
CREATE TABLE IF NOT EXISTS plugin_incidents (
  id              TEXT PRIMARY KEY,
  plugin_id       TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  cvss_score      REAL NOT NULL,
  severity        TEXT NOT NULL,
  cve_ids         TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at     TEXT,
  sla_deadline    TEXT NOT NULL,
  auto_disabled   INTEGER NOT NULL DEFAULT 0,
  assignee        TEXT,
  resolution      TEXT,
  github_issue_url      TEXT,
  github_advisory_url   TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_incidents_plugin_id ON plugin_incidents (plugin_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status     ON plugin_incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity   ON plugin_incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_sla        ON plugin_incidents (sla_deadline);
`;
