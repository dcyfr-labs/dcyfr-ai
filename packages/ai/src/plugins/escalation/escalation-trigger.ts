/**
 * Community Plugin Escalation Trigger
 *
 * Monitors community plugin metrics (downloads + ratings) and automatically
 * nominates plugins for DCYFR security audit when thresholds are crossed:
 *
 *   - downloads ≥ 100  AND
 *   - average rating ≥ 4.0 stars
 *
 * When both thresholds are crossed, an EscalationRecord is created and
 * stored. Downstream systems (GitHub issue automation, Axiom alerts, etc.)
 * can poll `getPendingEscalations()` or subscribe via `onEscalation`.
 *
 * @module plugins/escalation/escalation-trigger
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Current metrics for a community plugin */
export interface PluginMetrics {
  /** Plugin identifier, e.g. "author/plugin-name" */
  pluginId: string;
  /** Total all-time download count */
  downloads: number;
  /** Average star rating (0.0 – 5.0) */
  averageRating: number;
  /** Number of individual ratings */
  ratingCount: number;
  /** Current trust score (0–100) */
  trustScore: number;
  /** ISO-8601 timestamp of last metrics update */
  lastUpdated: string;
}

/** Configuration for escalation thresholds */
export interface EscalationThresholds {
  /** Minimum downloads to trigger (default: 100) */
  minDownloads: number;
  /** Minimum average rating to trigger (default: 4.0) */
  minRating: number;
  /** Minimum rating count before rating is considered valid (default: 5) */
  minRatingCount: number;
  /** Minimum trust score to be eligible (default: 85) */
  minTrustScore: number;
}

/** Status of an escalation record */
export type EscalationStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'dismissed';

/** A single escalation record for a plugin */
export interface EscalationRecord {
  /** Unique escalation ID */
  id: string;
  /** Plugin identifier */
  pluginId: string;
  /** Metrics snapshot that triggered the escalation */
  metricsSnapshot: PluginMetrics;
  /** ISO-8601 timestamp when escalation was triggered */
  triggeredAt: string;
  /** Current status */
  status: EscalationStatus;
  /** Optional notes from security team */
  notes?: string;
  /** GitHub issue URL if one was created */
  githubIssueUrl?: string;
}

/** Result of evaluating a plugin against escalation thresholds */
export interface EscalationEvaluation {
  /** Whether the plugin meets all thresholds */
  eligible: boolean;
  /** Plugin being evaluated */
  pluginId: string;
  /** Which checks passed */
  checks: {
    downloadsPass: boolean;
    ratingPass: boolean;
    ratingCountPass: boolean;
    trustScorePass: boolean;
  };
  /** Whether this plugin is already in the escalation queue */
  alreadyEscalated: boolean;
}

// ---------------------------------------------------------------------------
// Default thresholds
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: EscalationThresholds = {
  minDownloads:   100,
  minRating:      4,
  minRatingCount: 5,
  minTrustScore:  85,
};

// ---------------------------------------------------------------------------
// EscalationTrigger
// ---------------------------------------------------------------------------

/**
 * Manages escalation of community plugins to DCYFR security audit.
 *
 * @example
 * ```ts
 * const trigger = new EscalationTrigger();
 * const result = trigger.evaluate({
 *   pluginId: 'alice/my-plugin',
 *   downloads: 150,
 *   averageRating: 4.5,
 *   ratingCount: 20,
 *   trustScore: 92,
 *   lastUpdated: new Date().toISOString(),
 * });
 * if (result.eligible) {
 *   const record = trigger.escalate(metrics);
 *   console.log('Escalated:', record.id);
 * }
 * ```
 */
export class EscalationTrigger {
  private readonly thresholds: EscalationThresholds;
  private records = new Map<string, EscalationRecord>();
  private listeners: Array<(record: EscalationRecord) => void> = [];
  private nextId = 1;

  constructor(thresholds: Partial<EscalationThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluates a plugin's metrics against escalation thresholds.
   * Does NOT create an escalation record — call `escalate()` to do that.
   */
  evaluate(metrics: PluginMetrics): EscalationEvaluation {
    const t = this.thresholds;
    const checks = {
      downloadsPass:   metrics.downloads >= t.minDownloads,
      ratingPass:      metrics.averageRating >= t.minRating,
      ratingCountPass: metrics.ratingCount >= t.minRatingCount,
      trustScorePass:  metrics.trustScore >= t.minTrustScore,
    };
    const eligible = Object.values(checks).every(Boolean);
    const alreadyEscalated = this.hasPendingEscalation(metrics.pluginId);

    return { eligible, pluginId: metrics.pluginId, checks, alreadyEscalated };
  }

  // -------------------------------------------------------------------------
  // Escalation management
  // -------------------------------------------------------------------------

  /**
   * Creates an escalation record for the given plugin metrics.
   * Emits an `onEscalation` event to all registered listeners.
   *
   * @throws {Error} If the plugin already has a pending escalation.
   */
  escalate(metrics: PluginMetrics): EscalationRecord {
    if (this.hasPendingEscalation(metrics.pluginId)) {
      throw new Error(
        `Plugin "${metrics.pluginId}" already has a pending escalation. ` +
        `Call resolveEscalation() first.`,
      );
    }

    const record: EscalationRecord = {
      id:              `esc-${String(this.nextId++).padStart(4, '0')}`,
      pluginId:        metrics.pluginId,
      metricsSnapshot: { ...metrics },
      triggeredAt:     new Date().toISOString(),
      status:          'pending',
    };

    this.records.set(record.id, record);
    this.emit(record);
    return record;
  }

  /**
   * Evaluates and, if eligible and not already escalated, creates an escalation record.
   * Returns the new record or `null` if ineligible / already escalated.
   */
  evaluateAndEscalate(metrics: PluginMetrics): EscalationRecord | null {
    const evaluation = this.evaluate(metrics);
    if (!evaluation.eligible || evaluation.alreadyEscalated) {
      return null;
    }
    return this.escalate(metrics);
  }

  /**
   * Updates the status of an escalation record.
   *
   * @throws {Error} If the record ID does not exist.
   */
  updateStatus(
    escalationId: string,
    status: EscalationStatus,
    notes?: string,
    githubIssueUrl?: string,
  ): EscalationRecord {
    const record = this.records.get(escalationId);
    if (!record) {
      throw new Error(`Escalation record "${escalationId}" not found.`);
    }
    record.status = status;
    if (notes !== undefined)          record.notes          = notes;
    if (githubIssueUrl !== undefined) record.githubIssueUrl = githubIssueUrl;
    return record;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Returns all escalation records with status "pending". */
  getPendingEscalations(): EscalationRecord[] {
    return [...this.records.values()].filter(r => r.status === 'pending');
  }

  /** Returns all escalation records. */
  getAllEscalations(): EscalationRecord[] {
    return [...this.records.values()];
  }

  /** Returns a single escalation record by ID, or undefined. */
  getEscalation(escalationId: string): EscalationRecord | undefined {
    return this.records.get(escalationId);
  }

  /** Returns true if the given plugin has any active (non-terminal) escalation. */
  hasPendingEscalation(pluginId: string): boolean {
    const terminal: EscalationStatus[] = ['completed', 'dismissed'];
    return [...this.records.values()].some(
      r => r.pluginId === pluginId && !terminal.includes(r.status),
    );
  }

  /** Returns the currently configured thresholds. */
  getThresholds(): EscalationThresholds {
    return { ...this.thresholds };
  }

  // -------------------------------------------------------------------------
  // Event subscription
  // -------------------------------------------------------------------------

  /**
   * Registers a callback that fires whenever a new escalation is created.
   * Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * const unsub = trigger.onEscalation(record => {
   *   console.log('New escalation:', record.pluginId);
   * });
   * // later:
   * unsub();
   * ```
   */
  onEscalation(listener: (record: EscalationRecord) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(record: EscalationRecord): void {
    for (const listener of this.listeners) {
      listener(record);
    }
  }
}
