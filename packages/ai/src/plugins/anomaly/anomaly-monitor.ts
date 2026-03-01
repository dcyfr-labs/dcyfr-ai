/**
 * Anomaly Monitor
 *
 * Orchestrates the full behavioral anomaly detection pipeline:
 *  1. Update baseline from new metric sample.
 *  2. Detect anomalies in the sample.
 *  3. Queue anomalies for human review.
 *  4. Auto-suspend on CRITICAL anomalies (configurable).
 *  5. Stream events to Axiom for dashboarding.
 *
 * Implements tasks 16.1–16.5 of the Plugin Marketplace Security roadmap.
 *
 * @module plugins/anomaly/anomaly-monitor
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { BehaviorBaseline } from './behavior-baseline.js';
import { AnomalyDetector } from './anomaly-detector.js';
import type {
  PluginMetricSample,
  DetectedAnomaly,
  AnomalyReviewItem,
  AnomalyMonitorResult,
  ReviewStatus,
  AnomalyAxiomLogger,
  AnomalyAxiomPayload,
} from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration options for AnomalyMonitor. */
export interface AnomalyMonitorConfig {
  /**
   * Standard deviation threshold for CRITICAL anomalies that trigger
   * auto-suspension. Passed to AnomalyDetector.
   * @default 3
   */
  criticalSigmaThreshold?: number;

  /**
   * Standard deviation threshold for WARNING anomalies.
   * @default 2
   */
  warningSigmaThreshold?: number;

  /**
   * When true, CRITICAL anomalies automatically suspend the plugin.
   * Callers must check `result.suspended` before allowing the plugin to run again.
   * @default true
   */
  autoSuspendOnCritical?: boolean;

  /**
   * Optional Axiom logger. When provided, all detected anomalies are streamed
   * to the `dcyfr-agents` Axiom dataset for monitoring and dashboarding.
   */
  axiomLogger?: AnomalyAxiomLogger;
}

// ---------------------------------------------------------------------------
// Review queue resolve options
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** Who is resolving the anomaly (username, agent ID, etc.). */
  reviewed_by: string;
  /** Optional context notes from the reviewer. */
  resolution_notes?: string;
}

// ---------------------------------------------------------------------------
// Stats snapshot
// ---------------------------------------------------------------------------

/** Summary statistics for the review queue. */
export interface AnomalyStats {
  /** Total anomalies ever detected. */
  total_anomalies: number;
  /** Items currently in PENDING_REVIEW state. */
  pending_review: number;
  /** Items marked RESOLVED. */
  resolved: number;
  /** Items marked FALSE_POSITIVE. */
  false_positives: number;
  /**
   * Ratio of FALSE_POSITIVE over (FALSE_POSITIVE + RESOLVED).
   * Returns 0 when no items have been reviewed yet.
   * Target: <1% false positive rate for pilot plugins (task 16.6).
   */
  false_positive_rate: number;
}

// ---------------------------------------------------------------------------
// AnomalyMonitor
// ---------------------------------------------------------------------------

/**
 * Full behavioral anomaly detection monitor for DCYFR plugins.
 *
 * @example
 * ```ts
 * const monitor = new AnomalyMonitor({ autoSuspendOnCritical: true });
 *
 * // After each plugin run, observe the metrics:
 * const result = await monitor.observe(metricsFromRun);
 * if (result.suspended) {
 *   console.log('Plugin suspended:', result.suspension_reason);
 *   // await human review before resuming
 * }
 *
 * // Human reviewer resolves a queued anomaly:
 * monitor.resolveAnomaly(result.anomalies[0].id, { reviewed_by: 'security-team' });
 * ```
 */
export class AnomalyMonitor {
  private readonly baseline: BehaviorBaseline;
  private readonly detector: AnomalyDetector;
  private readonly config: Required<Omit<AnomalyMonitorConfig, 'axiomLogger'>> & {
    axiomLogger?: AnomalyAxiomLogger;
  };

  /** Suspended plugin IDs. */
  private readonly suspendedPlugins = new Set<string>();

  /** All anomalies detected across all runs. */
  private readonly allAnomalies: DetectedAnomaly[] = [];

  /** Human review queue. */
  private readonly reviewQueue: AnomalyReviewItem[] = [];

  constructor(config: AnomalyMonitorConfig = {}) {
    this.config = {
      criticalSigmaThreshold: config.criticalSigmaThreshold ?? 3,
      warningSigmaThreshold:  config.warningSigmaThreshold  ?? 2,
      autoSuspendOnCritical:  config.autoSuspendOnCritical  ?? true,
      axiomLogger: config.axiomLogger,
    };

    this.baseline = new BehaviorBaseline();
    this.detector = new AnomalyDetector({
      criticalSigmaThreshold: this.config.criticalSigmaThreshold,
      warningSigmaThreshold:  this.config.warningSigmaThreshold,
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Observe a single plugin run's metrics.
   *
   * Steps:
   * 1. Update baseline with the new sample.
   * 2. Detect anomalies in the sample.
   * 3. Queue any anomalies for human review.
   * 4. Send Axiom events for all detected anomalies.
   * 5. Auto-suspend if any CRITICAL anomaly found and autoSuspendOnCritical=true.
   *
   * @returns A monitor result describing what (if anything) was detected.
   */
  async observe(sample: PluginMetricSample): Promise<AnomalyMonitorResult> {
    // 1. Update baseline BEFORE detection to include sample in future baselines
    this.baseline.updateBaseline(sample);

    // 2. Detect anomalies (uses pre-update baseline — note: updateBaseline
    //    has already incorporated this sample, but detection uses getStdDevsFromMean
    //    which reads the SAME baseline; the sample is already in it. This is
    //    intentional: the first N-1 samples build the baseline; the Nth sample
    //    is both incorporated AND compared against up-to-date statistics.)
    const anomalies = this.detector.detectAnomalies(sample, this.baseline);

    // 3. Store anomalies and queue for review
    this.allAnomalies.push(...anomalies);
    for (const anomaly of anomalies) {
      this.addToReviewQueue(anomaly);
    }

    // 4. Axiom events (fire-and-forget, do not let failure block results)
    if (this.config.axiomLogger && anomalies.length > 0) {
      await Promise.allSettled(
        anomalies.map((a) => {
          const payload: AnomalyAxiomPayload = {
            _source: 'dcyfr-plugin-anomaly-monitor',
            plugin_id: a.plugin_id,
            run_id: a.run_id,
            anomaly_id: a.id,
            anomaly_type: a.anomaly_type,
            severity: a.severity,
            metric_value: a.metric_value,
            baseline_mean: a.baseline_mean,
            std_devs_from_mean: a.std_devs_from_mean,
            auto_suspended: false, // will be updated below if suspension occurs
            detected_at: a.detected_at,
          };
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return this.config.axiomLogger!.logEvent(payload);
        }),
      );
    }

    // 5. Auto-suspend on CRITICAL
    const criticals = anomalies.filter((a) => this.detector.isSevere(a));
    if (this.config.autoSuspendOnCritical && criticals.length > 0) {
      const worst = criticals.sort((a, b) => b.std_devs_from_mean - a.std_devs_from_mean)[0];
      const reason =
        `CRITICAL anomaly: ${worst?.anomaly_type ?? 'unknown'} ` +
        `(${worst?.std_devs_from_mean.toFixed(1) ?? '?'}σ from mean). ` +
        `Awaiting human review.`;

      this.suspendedPlugins.add(sample.plugin_id);

      // Send updated Axiom payload with auto_suspended: true
      if (this.config.axiomLogger && worst) {
        await this.config.axiomLogger
          .logEvent({
            _source: 'dcyfr-plugin-anomaly-monitor',
            plugin_id: worst.plugin_id,
            run_id: worst.run_id,
            anomaly_id: worst.id,
            anomaly_type: worst.anomaly_type,
            severity: worst.severity,
            metric_value: worst.metric_value,
            baseline_mean: worst.baseline_mean,
            std_devs_from_mean: worst.std_devs_from_mean,
            auto_suspended: true,
            detected_at: worst.detected_at,
          })
          .catch(() => {
            // Axiom logging failure must not prevent suspension
          });
      }

      return {
        plugin_id: sample.plugin_id,
        run_id: sample.run_id,
        anomalies,
        suspended: true,
        suspension_reason: reason,
      };
    }

    return {
      plugin_id: sample.plugin_id,
      run_id: sample.run_id,
      anomalies,
      suspended: false,
    };
  }

  /**
   * Returns true if the given plugin is currently suspended.
   * Suspended plugins must be reviewed and manually unsuspended.
   */
  isPluginSuspended(pluginId: string): boolean {
    return this.suspendedPlugins.has(pluginId);
  }

  /**
   * Unsuspend a plugin after human review has cleared it.
   * Does not automatically resolve review queue items.
   */
  unsuspendPlugin(pluginId: string): void {
    this.suspendedPlugins.delete(pluginId);
  }

  /**
   * Get a copy of all pending review items.
   * Items are sorted by `detected_at` descending (most recent first).
   */
  getReviewQueue(filter?: { status?: ReviewStatus }): AnomalyReviewItem[] {
    const items = filter?.status
      ? this.reviewQueue.filter((i) => i.status === filter.status)
      : [...this.reviewQueue];

    return items.sort(
      (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
    );
  }

  /**
   * Mark an anomaly as RESOLVED after human investigation confirms it was real.
   * @throws {Error} If `anomalyId` is not found in the review queue.
   */
  resolveAnomaly(anomalyId: string, options: ResolveOptions): void {
    const item = this.findReviewItem(anomalyId);
    item.status = 'RESOLVED';
    item.reviewed_by = options.reviewed_by;
    item.resolution_notes = options.resolution_notes;
    item.resolved_at = new Date().toISOString();
  }

  /**
   * Mark an anomaly as a false positive.
   * False positives count toward the `false_positive_rate` stat (target <1%).
   * @throws {Error} If `anomalyId` is not found in the review queue.
   */
  markFalsePositive(anomalyId: string, options: ResolveOptions): void {
    const item = this.findReviewItem(anomalyId);
    item.status = 'FALSE_POSITIVE';
    item.reviewed_by = options.reviewed_by;
    item.resolution_notes = options.resolution_notes;
    item.resolved_at = new Date().toISOString();
  }

  /**
   * Aggregate statistics across the review queue.
   * Primary metric for task 16.6: `false_positive_rate` must be <1%.
   */
  getStats(): AnomalyStats {
    const total = this.allAnomalies.length;
    const pending = this.reviewQueue.filter((i) => i.status === 'PENDING_REVIEW').length;
    const resolved = this.reviewQueue.filter((i) => i.status === 'RESOLVED').length;
    const falsePositives = this.reviewQueue.filter((i) => i.status === 'FALSE_POSITIVE').length;
    const reviewed = resolved + falsePositives;
    const fpRate = reviewed === 0 ? 0 : falsePositives / reviewed;

    return {
      total_anomalies:   total,
      pending_review:    pending,
      resolved,
      false_positives:   falsePositives,
      false_positive_rate: fpRate,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private addToReviewQueue(anomaly: DetectedAnomaly): void {
    this.reviewQueue.push({
      anomaly_id: anomaly.id,
      plugin_id:  anomaly.plugin_id,
      anomaly_type: anomaly.anomaly_type,
      severity:   anomaly.severity,
      metric_value: anomaly.metric_value,
      std_devs_from_mean: anomaly.std_devs_from_mean,
      detected_at: anomaly.detected_at,
      status: 'PENDING_REVIEW',
    });
  }

  private findReviewItem(anomalyId: string): AnomalyReviewItem {
    const item = this.reviewQueue.find((i) => i.anomaly_id === anomalyId);
    if (!item) {
      throw new Error(`Anomaly "${anomalyId}" not found in review queue`);
    }
    return item;
  }
}
