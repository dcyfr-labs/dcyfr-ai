/**
 * Plugin Incident Response Manager
 *
 * Manages the full lifecycle of security incidents for marketplace plugins,
 * including SLA enforcement, auto-disable on critical CVEs, and notification
 * dispatch through pluggable adapter interfaces.
 *
 * SLA Timers (measured from incident `createdAt`):
 *   critical  (CVSS ≥9.0)  — 24 hours
 *   high      (CVSS 7.0–8.9) — 48 hours
 *   medium    (CVSS 4.0–6.9) — 7 days
 *   low       (CVSS 0.1–3.9) — 30 days
 *   info      (CVSS 0.0)   — 30 days
 *
 * Auto-disable policy:
 *   Any incident whose CVSS score is ≥9.0 triggers automatic plugin disable.
 *   The `onAutoDisable` hook is called synchronously so callers can update
 *   their plugin registry, disable download links, etc.
 *
 * Integration adapters (all optional — pass in config):
 *   emailNotifier  — notify affected users and plugin author
 *   githubClient   — open GitHub issue + Security Advisory
 *   axiomLogger    — stream SLA-breach events to Axiom dataset
 *
 * @module plugins/incidents/incident-response-manager
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { randomUUID } from 'crypto';
import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  CreateIncidentInput,
  AcknowledgeIncidentInput,
  ResolveIncidentInput,
  ListIncidentsOptions,
  IncidentPage,
  SlaConfig,
  EmailNotifier,
  GithubClient,
  AxiomLogger,
  GithubIssuePayload,
  GithubAdvisoryPayload,
  AxiomAlertPayload,
} from './types.js';
import { DEFAULT_SLA } from './types.js';

// Re-export types for convenience
export type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  CreateIncidentInput,
  AcknowledgeIncidentInput,
  ResolveIncidentInput,
  ListIncidentsOptions,
  IncidentPage,
  SlaConfig,
  EmailNotifier,
  GithubClient,
  AxiomLogger,
  GithubIssuePayload,
  GithubAdvisoryPayload,
  AxiomAlertPayload,
};

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

/** Error thrown by IncidentResponseManager operations */
export class IncidentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'IncidentError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CRITICAL_CVSS_THRESHOLD = 9.0;

/** Derive qualitative severity from a CVSS v3.1 numeric score */
function cvssToSeverity(score: number): IncidentSeverity {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score > 0.0)  return 'low';
  return 'informational';
}

/** Map IncidentSeverity to its SLA deadline in milliseconds */
function slaMs(severity: IncidentSeverity, config: SlaConfig): number {
  switch (severity) {
    case 'critical':      return config.criticalMs;
    case 'high':          return config.highMs;
    case 'medium':        return config.mediumMs;
    case 'low':           return config.lowMs;
    case 'informational': return config.lowMs; // same as low
  }
}

/** Compute ISO-8601 SLA deadline from creation time */
function computeSlaDeadline(createdAt: string, severity: IncidentSeverity, sla: SlaConfig): string {
  const ms = slaMs(severity, sla);
  return new Date(new Date(createdAt).getTime() + ms).toISOString();
}

/** Return true if the incident is past its SLA deadline and not yet resolved/closed */
function isSlaBreached(incident: Incident, now: Date): boolean {
  if (incident.status === 'resolved' || incident.status === 'closed') return false;
  return now > new Date(incident.slaDeadline);
}

/** Map IncidentSeverity to GHSA severity string */
function toGhsaSeverity(severity: IncidentSeverity): GithubAdvisoryPayload['ghsaSeverity'] {
  if (severity === 'informational') return 'low';
  return severity;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface IncidentResponseManagerConfig {
  /** SLA overrides — defaults to DEFAULT_SLA */
  sla?: Partial<SlaConfig>;
  /**
   * Called synchronously when a plugin is automatically disabled.
   * @param pluginId  Plugin that was disabled
   * @param incident  The triggering incident
   */
  onAutoDisable?: (pluginId: string, incident: Incident) => void;
  /** Pluggable email notifier */
  emailNotifier?: EmailNotifier;
  /** Pluggable GitHub client */
  githubClient?: GithubClient;
  /** Pluggable Axiom logger */
  axiomLogger?: AxiomLogger;
  /**
   * GitHub repo where issues and advisories will be created
   * (e.g. "dcyfr/dcyfr-plugins"). Required to use githubClient.
   */
  githubRepo?: string;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/**
 * Manages security incidents for marketplace plugins.
 *
 * @example
 * ```typescript
 * const manager = new IncidentResponseManager({ githubRepo: 'dcyfr/dcyfr-plugins' });
 * const incident = await manager.createIncident({
 *   pluginId: 'author/my-plugin',
 *   title: 'Remote code execution via crafted input',
 *   description: 'Long description...',
 *   cvssScore: 9.8,
 *   cveIds: ['CVE-2026-12345'],
 * });
 * ```
 */
export class IncidentResponseManager {
  private readonly incidents = new Map<string, Incident>();
  private readonly sla: SlaConfig;
  private readonly config: IncidentResponseManagerConfig;

  constructor(config: IncidentResponseManagerConfig = {}) {
    this.config = config;
    this.sla = { ...DEFAULT_SLA, ...(config.sla ?? {}) };
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Create a new security incident.
   *
   * Side-effects:
   *   • If cvssScore ≥9.0 → plugin is auto-disabled via `onAutoDisable` hook.
   *   • GitHub issue + Security Advisory are created if `githubClient` is configured.
   *   • Axiom alert is fired for critical incidents if `axiomLogger` is configured.
   *
   * @throws {IncidentError} code `INVALID_CVSS` if cvssScore is out of [0, 10] range.
   */
  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    if (input.cvssScore < 0 || input.cvssScore > 10) {
      throw new IncidentError(
        `cvssScore must be between 0 and 10, got ${input.cvssScore}`,
        'INVALID_CVSS',
      );
    }

    const now = new Date().toISOString();
    const severity = cvssToSeverity(input.cvssScore);
    const autoDisabled = input.cvssScore >= CRITICAL_CVSS_THRESHOLD;

    const incident: Incident = {
      id: randomUUID(),
      pluginId: input.pluginId,
      title: input.title,
      description: input.description,
      cvssScore: input.cvssScore,
      severity,
      cveIds: input.cveIds ?? [],
      status: 'open',
      createdAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      slaDeadline: computeSlaDeadline(now, severity, this.sla),
      autoDisabled,
      assignee: null,
      resolution: null,
      githubIssueUrl: null,
      githubAdvisoryUrl: null,
      metadata: input.metadata ?? {},
    };

    this.incidents.set(incident.id, incident);

    // Auto-disable critical plugins synchronously before async side-effects
    if (autoDisabled && this.config.onAutoDisable) {
      this.config.onAutoDisable(incident.pluginId, incident);
    }

    // Dispatch async side-effects (fire-and-forget with error isolation)
    await this.dispatchNewIncidentNotifications(incident);

    return incident;
  }

  // -------------------------------------------------------------------------
  // Acknowledge
  // -------------------------------------------------------------------------

  /**
   * Acknowledge an incident — transitions status from `open` → `acknowledged`.
   *
   * @throws {IncidentError} code `NOT_FOUND` if incident doesn't exist.
   * @throws {IncidentError} code `ALREADY_ACKNOWLEDGED` if already past open state.
   */
  acknowledgeIncident(input: AcknowledgeIncidentInput): Incident {
    const incident = this.requireIncident(input.id);

    if (incident.status !== 'open') {
      throw new IncidentError(
        `Incident ${input.id} is in status '${incident.status}', cannot acknowledge`,
        'ALREADY_ACKNOWLEDGED',
      );
    }

    const updated: Incident = {
      ...incident,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
      assignee: input.assignee,
    };

    this.incidents.set(updated.id, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Progress
  // -------------------------------------------------------------------------

  /**
   * Move an incident to `in_progress` — transitions from `open` or `acknowledged`.
   *
   * @throws {IncidentError} code `NOT_FOUND` | `INVALID_TRANSITION`
   */
  markInProgress(id: string, assignee?: string): Incident {
    const incident = this.requireIncident(id);
    const allowed: IncidentStatus[] = ['open', 'acknowledged'];

    if (!allowed.includes(incident.status)) {
      throw new IncidentError(
        `Cannot mark incident ${id} as in_progress from status '${incident.status}'`,
        'INVALID_TRANSITION',
      );
    }

    const updated: Incident = {
      ...incident,
      status: 'in_progress',
      assignee: assignee ?? incident.assignee,
    };

    this.incidents.set(updated.id, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Resolve / Close
  // -------------------------------------------------------------------------

  /**
   * Resolve or close an incident.
   *
   * @throws {IncidentError} code `NOT_FOUND` | `ALREADY_RESOLVED`
   */
  resolveIncident(input: ResolveIncidentInput): Incident {
    const incident = this.requireIncident(input.id);
    const terminal: IncidentStatus[] = ['resolved', 'closed'];

    if (terminal.includes(incident.status)) {
      throw new IncidentError(
        `Incident ${input.id} is already in terminal status '${incident.status}'`,
        'ALREADY_RESOLVED',
      );
    }

    const now = new Date().toISOString();
    const updated: Incident = {
      ...incident,
      status: input.finalStatus ?? 'resolved',
      resolvedAt: now,
      resolution: input.resolution,
    };

    this.incidents.set(updated.id, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // SLA breach detection
  // -------------------------------------------------------------------------

  /**
   * Check all incidents for SLA breaches.
   * Mutates affected incidents to status `sla_breached` and fires Axiom alerts.
   *
   * @returns Array of newly breached incidents
   */
  async checkSlaBreaches(): Promise<Incident[]> {
    const now = new Date();
    const breached: Incident[] = [];

    for (const incident of this.incidents.values()) {
      if (incident.status === 'sla_breached') continue; // already flagged
      if (isSlaBreached(incident, now)) {
        const updated: Incident = { ...incident, status: 'sla_breached' };
        this.incidents.set(updated.id, updated);
        breached.push(updated);

        if (this.config.axiomLogger) {
          await this.sendAxiomAlert(updated, 'sla_breach');
        }
      }
    }

    return breached;
  }

  /**
   * Return incidents whose SLA deadline has passed and are not terminal.
   * Does NOT mutate status — use `checkSlaBreaches()` to update statuses.
   */
  getOverdueIncidents(): Incident[] {
    const now = new Date();
    return Array.from(this.incidents.values()).filter(i => isSlaBreached(i, now));
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * Get a single incident by ID.
   * @throws {IncidentError} code `NOT_FOUND` if not found.
   */
  getIncident(id: string): Incident {
    return this.requireIncident(id);
  }

  /**
   * List incidents with optional filtering and pagination.
   */
  listIncidents(options: ListIncidentsOptions = {}): IncidentPage {
    const { pluginId, status, severity, slaBreached, page = 1, pageSize = 20 } = options;
    const now = new Date();

    const statusSet = status
      ? new Set(Array.isArray(status) ? status : [status])
      : null;
    const severitySet = severity
      ? new Set(Array.isArray(severity) ? severity : [severity])
      : null;

    const filtered = Array.from(this.incidents.values()).filter(inc => {
      if (pluginId && inc.pluginId !== pluginId) return false;
      if (statusSet && !statusSet.has(inc.status)) return false;
      if (severitySet && !severitySet.has(inc.severity)) return false;
      if (slaBreached !== undefined && isSlaBreached(inc, now) !== slaBreached) return false;
      return true;
    });

    // Sort by createdAt descending (newest first)
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const clampedSize = Math.min(Math.max(pageSize, 1), 100);
    const offset = (page - 1) * clampedSize;
    const items = filtered.slice(offset, offset + clampedSize);

    return {
      items,
      total: filtered.length,
      page,
      pageSize: clampedSize,
      hasMore: offset + clampedSize < filtered.length,
    };
  }

  /**
   * Count of all stored incidents.
   */
  get size(): number {
    return this.incidents.size;
  }

  // -------------------------------------------------------------------------
  // Hydration / export (for persistence adapters)
  // -------------------------------------------------------------------------

  /**
   * Bulk-load incidents from an external store (replaces in-memory state).
   */
  hydrate(incidents: Incident[]): void {
    this.incidents.clear();
    for (const incident of incidents) {
      this.incidents.set(incident.id, incident);
    }
  }

  /**
   * Export all incidents as a plain array (for persisting to an external store).
   */
  export(): Incident[] {
    return Array.from(this.incidents.values());
  }

  // -------------------------------------------------------------------------
  // External notification helpers (public for testing / direct use)
  // -------------------------------------------------------------------------

  /**
   * Create a GitHub issue for an incident.
   * Requires `githubClient` and `githubRepo` to be configured.
   *
   * @returns The GitHub issue URL, or null if no client is configured.
   */
  async createGithubIssue(incident: Incident): Promise<string | null> {
    if (!this.config.githubClient || !this.config.githubRepo) return null;

    const cveList = incident.cveIds.length > 0 ? incident.cveIds.join(', ') : 'N/A';
    const payload: GithubIssuePayload = {
      incident,
      repo: this.config.githubRepo,
      title: `[SECURITY] ${incident.severity.toUpperCase()}: ${incident.title} (${incident.pluginId})`,
      body: [
        `## Security Incident — ${incident.severity.toUpperCase()}`,
        '',
        `**Plugin:** \`${incident.pluginId}\``,
        `**CVSS Score:** ${incident.cvssScore}`,
        `**CVE(s):** ${cveList}`,
        `**SLA Deadline:** ${incident.slaDeadline}`,
        `**Auto-Disabled:** ${incident.autoDisabled ? 'Yes' : 'No'}`,
        '',
        '### Description',
        incident.description,
        '',
        '### Resolution',
        '_Pending investigation_',
      ].join('\n'),
      labels: ['security', `severity:${incident.severity}`, 'plugin-incident'],
    };

    return this.config.githubClient.createIssue(payload);
  }

  /**
   * Create a GitHub Security Advisory for an incident.
   * Requires `githubClient` and `githubRepo` to be configured.
   *
   * @returns The advisory URL, or null if no client is configured.
   */
  async createSecurityAdvisory(incident: Incident): Promise<string | null> {
    if (!this.config.githubClient || !this.config.githubRepo) return null;

    const payload: GithubAdvisoryPayload = {
      incident,
      repo: this.config.githubRepo,
      summary: `[${incident.severity.toUpperCase()}] ${incident.title}`.slice(0, 128),
      description: [
        `**Plugin:** \`${incident.pluginId}\``,
        `**CVE(s):** ${incident.cveIds.join(', ') || 'N/A'}`,
        `**CVSS Score:** ${incident.cvssScore}`,
        '',
        incident.description,
      ].join('\n'),
      ghsaSeverity: toGhsaSeverity(incident.severity),
    };

    return this.config.githubClient.createSecurityAdvisory(payload);
  }

  /**
   * Send an Axiom alert for an incident.
   *
   * @param incident The incident to alert on.
   * @param alertType The type of alert event.
   */
  async sendAxiomAlert(
    incident: Incident,
    alertType: AxiomAlertPayload['alertType'],
  ): Promise<void> {
    if (!this.config.axiomLogger) return;

    const messages: Record<AxiomAlertPayload['alertType'], string> = {
      sla_breach:   `SLA BREACH: Incident for plugin '${incident.pluginId}' exceeded ${incident.severity} SLA`,
      auto_disable: `AUTO-DISABLE: Plugin '${incident.pluginId}' disabled (CVSS ${incident.cvssScore})`,
      new_critical: `NEW CRITICAL: Plugin '${incident.pluginId}' has CVSS ${incident.cvssScore}`,
    };

    const payload: AxiomAlertPayload = {
      incident,
      alertType,
      message: messages[alertType],
    };

    await this.config.axiomLogger.logAlert(payload);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireIncident(id: string): Incident {
    const incident = this.incidents.get(id);
    if (!incident) {
      throw new IncidentError(`Incident '${id}' not found`, 'NOT_FOUND');
    }
    return incident;
  }

  private async dispatchNewIncidentNotifications(incident: Incident): Promise<void> {
    // Fire-and-forget with per-integration error isolation
    const tasks: Array<Promise<void>> = [];

    if (this.config.githubClient && this.config.githubRepo) {
      tasks.push(
        this.createGithubIssue(incident)
          .then(url => {
            if (url) {
              const updated = this.incidents.get(incident.id);
              if (updated) {
                this.incidents.set(incident.id, { ...updated, githubIssueUrl: url });
              }
            }
          })
          .catch(() => { /* non-fatal */ }),
      );

      if (incident.severity === 'critical' || incident.severity === 'high') {
        tasks.push(
          this.createSecurityAdvisory(incident)
            .then(url => {
              if (url) {
                const updated = this.incidents.get(incident.id);
                if (updated) {
                  this.incidents.set(incident.id, { ...updated, githubAdvisoryUrl: url });
                }
              }
            })
            .catch(() => { /* non-fatal */ }),
        );
      }
    }

    if (this.config.axiomLogger && incident.severity === 'critical') {
      tasks.push(this.sendAxiomAlert(incident, 'new_critical').catch(() => { /* non-fatal */ }));
    }

    if (this.config.axiomLogger && incident.autoDisabled) {
      tasks.push(this.sendAxiomAlert(incident, 'auto_disable').catch(() => { /* non-fatal */ }));
    }

    await Promise.all(tasks);
  }
}
